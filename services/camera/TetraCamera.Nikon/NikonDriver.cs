using System.Runtime.InteropServices;
using TetraCamera.Canon;
using TetraCamera.HotFolder;
using static TetraCamera.Nikon.Maid;

namespace TetraCamera.Nikon;

/// <summary>
/// Nikon lewat SDK MAID3 (modul Type00xx.md3, DECISIONS #216), dijalankan <see cref="CanonCamera"/> dengan
/// <see cref="NikonProps.Kind"/>. Semua modul + satu NkdPTP.dll ada di satu folder (seperti Camera Control Pro). Modul
/// dipilih dari nama perangkat WPD (<paramref name="device"/>, tabel <see cref="NikonProps.Modules"/>); nama yang tidak
/// dikenal = bukan kamera untuk driver ini (Z baru lewat <see cref="NikonZDriver"/>). Semua panggilan
/// MAID di thread SDK; event, data, dan completion dipanggil modul di dalam panggilan Async thread yang sama.
/// Urutan jepret mengikuti "Usage of TypeXXXX Module" 5.5/5.6: Capture → item baru → buka Item → buka Image → DataProc →
/// Acquire → tutup (item harus segera ditutup, kalau tidak jepret berikutnya gagal).
/// </summary>
public sealed class NikonDriver : ICanonDriver
{
    private static readonly TimeSpan CallTimeout = TimeSpan.FromSeconds(10);

    private readonly string _dir;
    private readonly Func<string?> _device;
    private readonly Dictionary<string, EntryProc> _loaded = [];
    // Delegate disimpan di field supaya tidak di-GC selama modul memegang pointer-nya.
    private readonly CompletionProc _onComplete;
    private readonly EventProc _onModuleEvent, _onSourceEvent;
    private readonly DataProc _onData;
    private readonly UIRequestProc _onUi;
    private readonly IntPtr _completePtr;
    private readonly Dictionary<long, int> _done = [];
    private long _seq;
    private EntryProc? _entry;
    private IntPtr _mod, _src;
    private uint _srcId;
    private bool _lost, _live;
    private readonly HashSet<uint> _sources = [];
    private readonly Queue<uint> _items = new();
    private MemoryStream? _file;
    private uint _fileType;
    private long _nextPump;
    private IntPtr _lvBuf;
    private int _lvSize;

    /// <param name="dir">Folder berisi Type00xx.md3 + NkdPTP.dll, NkRoyalmile.dll, dnssd.dll (mis. %APPDATA%\TetraBooth\nikon).</param>
    /// <param name="device">Nama perangkat Nikon yang tercolok (WPD), null = tidak ada.</param>
    public NikonDriver(string dir, Func<string?> device)
    {
        if (!Directory.EnumerateFiles(dir, "Type*.md3").Any())
            throw new CameraFailure("nikon_missing", $"modul Nikon (Type*.md3) tidak ada di {dir}");
        _dir = dir;
        _device = device;
        _onComplete = (_, _, _, _, _, refComplete, result) => _done[refComplete] = result;
        _onModuleEvent = (_, ev, data) =>
        {
            if (ev == EventAddChild) _sources.Add((uint)data);
            else if (ev == EventRemoveChild && (uint)data == _srcId) _lost = true;
        };
        _onSourceEvent = (_, ev, data) =>
        {
            if (ev == EventAddChild) _items.Enqueue((uint)data);
        };
        _onData = OnData;
        _onUi = (_, req) => (uint)Marshal.ReadInt32(req, 4); // ulDefault: jawab dialog modul dengan pilihan bawaan
        _completePtr = Marshal.GetFunctionPointerForDelegate(_onComplete);
    }

    public bool IsOpen => _src != IntPtr.Zero && !_lost;

    private static void Check(int r, string what)
    {
        if (Ok(r)) return;
        throw r switch
        {
            OutOfFocus => new CameraFailure("focus_failed", "kamera Nikon gagal fokus; dekatkan subjek atau pakai fokus manual"),
            DeviceBusy => new CameraFailure("camera_busy", $"kamera Nikon sibuk ({what}), coba lagi"),
            NotLiveView => new CameraFailure("nikon_error", $"Nikon {what}: live view belum menyala"),
            _ => new CameraFailure("nikon_error", $"Nikon {what} gagal (kode MAID {r})"),
        };
    }

    /// <summary>Panggil MAID dan tunggu completion sambil memompa Async objek yang sama (pola IdleLoop contoh Nikon).</summary>
    private int Call(IntPtr obj, uint cmd, uint param, uint type, ulong data, TimeSpan? timeout = null)
    {
        var id = ++_seq;
        var r = _entry!(obj, cmd, param, type, data, _completePtr, (IntPtr)id);
        if (!Ok(r)) return r;
        var end = DateTime.UtcNow + (timeout ?? CallTimeout);
        while (true)
        {
            if (_done.Remove(id, out var res)) return res;
            if (DateTime.UtcNow > end) throw new CameraFailure("camera_stuck", "kamera Nikon tidak menjawab");
            Async(obj);
            Thread.Sleep(5);
        }
    }

    private void Async(IntPtr obj) => _entry!(obj, CmdAsync, 0, TypeNull, 0, IntPtr.Zero, IntPtr.Zero);

    /// <summary>Struct sementara di memori native selama satu panggilan.</summary>
    private int WithStruct<T>(ref T value, Func<IntPtr, int> call) where T : struct
    {
        var p = Marshal.AllocHGlobal(Marshal.SizeOf<T>());
        try
        {
            Marshal.StructureToPtr(value, p, false);
            var r = call(p);
            value = Marshal.PtrToStructure<T>(p);
            return r;
        }
        finally { Marshal.FreeHGlobal(p); }
    }

    private IntPtr NewObject()
    {
        var p = Marshal.AllocHGlobal(Marshal.SizeOf<Maid.Object>());
        Marshal.StructureToPtr(new Maid.Object(), p, false);
        return p;
    }

    private int SetCallback(IntPtr obj, uint cap, Delegate? proc)
    {
        if (proc is null) return Call(obj, CmdCapSet, cap, TypeNull, 0);
        var cb = new Maid.Callback { Proc = Marshal.GetFunctionPointerForDelegate(proc) };
        return WithStruct(ref cb, p => Call(obj, CmdCapSet, cap, TypeCallbackPtr, (ulong)p));
    }

    private int SetUnsigned(IntPtr obj, uint cap, uint value) => Call(obj, CmdCapSet, cap, TypeUnsigned, value);

    public (string Model, string Serial)? Open()
    {
        if (_device() is not { } name || NikonProps.ModuleFor(name) is not { } module) return null;
        if (!File.Exists(Path.Combine(_dir, module + ".md3")))
            throw new CameraFailure("nikon_missing", $"modul {module} untuk {name} tidak ada di {_dir}");
        return TryModule(module);
    }

    private (string, string)? TryModule(string module)
    {
        if (!_loaded.TryGetValue(module, out var entry))
        {
            // Dependensi (NkdPTP.dll dll.) dicari di folder modul.
            var h = Load(Path.Combine(_dir, module + ".md3"));
            entry = Marshal.GetDelegateForFunctionPointer<EntryProc>(NativeLibrary.GetExport(h, "MAIDEntryPoint"));
            _loaded[module] = entry;
        }
        _entry = entry;
        _sources.Clear();
        _items.Clear();
        _lost = false;
        _mod = NewObject();
        try
        {
            Check(Call(IntPtr.Zero, CmdOpen, 0, TypeObjectPtr, (ulong)_mod), "buka modul");
            Check(SetCallback(_mod, CapEventProc, _onModuleEvent), "event modul");
            SetCallback(_mod, CapUIRequestProc, _onUi);
            SetUnsigned(_mod, CapModuleMode, ModuleModeController);
            // Kamera diumumkan lewat AddChild setelah Async (Usage §7).
            var end = DateTime.UtcNow.AddMilliseconds(1500);
            while (_sources.Count == 0 && DateTime.UtcNow < end)
            {
                Async(_mod);
                Thread.Sleep(20);
            }
            if (_sources.Count == 0)
            {
                CloseModule();
                return null;
            }
            _srcId = _sources.First();
            _src = NewObject();
            Check(Call(_mod, CmdOpen, _srcId, TypeObjectPtr, (ulong)_src), "buka kamera");
            Check(SetCallback(_src, CapEventProc, _onSourceEvent), "event kamera");
            // Foto ke PC (SDRAM), seperti Canon SaveTo host. Modul lama (D3X, D5000) tidak punya pilihan ini.
            var r = SetUnsigned(_src, CapSaveMedia, SaveMediaSdram);
            if (!Ok(r) && r != NotSupported) Console.Error.WriteLine($"[nikon] simpan ke PC ditolak (kode {r})");
            var model = ReadName(_src) ?? module;
            // Usage §5: nilai tiap setelan dibaca sekali setelah kamera dibuka, juga mengisi tabel label.
            foreach (var p in NikonProps.All)
            {
                try { PropOptions(p.PropId); }
                catch (CameraFailure e) { Console.Error.WriteLine($"[nikon] {p.Label} tidak terbaca: {e.Message}"); }
            }
            Console.WriteLine($"[nikon] modul {module}, kamera {model}");
            return (model, "usb");
        }
        catch
        {
            Close();
            throw;
        }
    }

    private string? ReadName(IntPtr obj)
    {
        var p = Marshal.AllocHGlobal(256);
        try
        {
            Marshal.WriteByte(p, 0);
            return Ok(Call(obj, CmdCapGet, CapName, TypeStringPtr, (ulong)p)) ? Marshal.PtrToStringAnsi(p)?.Trim() : null;
        }
        finally { Marshal.FreeHGlobal(p); }
    }

    private void CloseModule()
    {
        if (_mod == IntPtr.Zero) return;
        try { Call(_mod, CmdClose, 0, TypeNull, 0); } catch { /* modul sudah hilang */ }
        Marshal.FreeHGlobal(_mod);
        _mod = IntPtr.Zero;
    }

    public void Close()
    {
        if (_src != IntPtr.Zero)
        {
            try
            {
                // Usage: live view harus dimatikan sebelum Source ditutup.
                if (_live && !_lost) SetUnsigned(_src, CapLiveViewStatus, 0);
                Call(_src, CmdClose, 0, TypeNull, 0);
            }
            catch { /* kamera sudah dicabut */ }
            Marshal.FreeHGlobal(_src);
            _src = IntPtr.Zero;
        }
        _live = false;
        CloseModule();
        if (_lvBuf != IntPtr.Zero)
        {
            Marshal.FreeHGlobal(_lvBuf);
            _lvBuf = IntPtr.Zero;
        }
    }

    public void Pump()
    {
        var now = Environment.TickCount64;
        if (_mod == IntPtr.Zero || now < _nextPump) return;
        _nextPump = now + 100;
        Async(_mod);
        if (_src != IntPtr.Zero) Async(_src);
        if (_lost)
        {
            Console.WriteLine("[nikon] kamera dilepas (RemoveChild)");
            Close();
        }
    }

    /// <summary>DataProc: potongan file disusun sesuai offset; selain file (piksel mentah/thumbnail) diabaikan.</summary>
    private int OnData(IntPtr refClient, IntPtr info, IntPtr data)
    {
        try
        {
            var f = Marshal.PtrToStructure<Maid.FileInfo>(info);
            if ((f.Type & DataObjFile) == 0) return NoError;
            _file ??= new MemoryStream((int)f.TotalLength);
            _fileType = f.FileDataType;
            var chunk = new byte[f.Length];
            Marshal.Copy(data, chunk, 0, chunk.Length);
            _file.Position = f.Start;
            _file.Write(chunk);
            return NoError;
        }
        catch { return -117; } // UnexpectedError; jangan melempar ke kode native
    }

    /// <summary>Ambil satu item SDRAM. JPEG = byte; RAW/lainnya = null (tetap di-Acquire supaya SDRAM kosong).</summary>
    private byte[]? Acquire(uint itemId)
    {
        var item = NewObject();
        try
        {
            Check(Call(_src, CmdOpen, itemId, TypeObjectPtr, (ulong)item), "buka foto");
            var image = NewObject();
            try
            {
                Check(Call(item, CmdOpen, DataObjImage, TypeObjectPtr, (ulong)image), "buka gambar");
                _file = null;
                Check(SetCallback(image, CapDataProc, _onData), "DataProc");
                Check(Call(image, CmdCapStart, CapAcquire, TypeNull, 0, TimeSpan.FromSeconds(30)), "unduh foto");
                SetCallback(image, CapDataProc, null);
                return _fileType == FileJpeg ? _file?.ToArray() : null;
            }
            finally
            {
                try { Call(image, CmdClose, 0, TypeNull, 0); } catch { /* sudah tertutup */ }
                Marshal.FreeHGlobal(image);
                _file = null;
            }
        }
        finally
        {
            try { Call(item, CmdClose, 0, TypeNull, 0); } catch { /* sudah tertutup */ }
            Marshal.FreeHGlobal(item);
        }
    }

    public byte[] Capture(TimeSpan timeout)
    {
        // Item lama di SDRAM (rana ditekan di kamera) harus diambil dulu, kalau tidak jepret berikutnya bisa gagal.
        while (_items.TryDequeue(out var old)) Acquire(old);
        Check(Call(_src, CmdCapStart, CapCapture, TypeNull, 0, timeout), "jepret");
        var end = DateTime.UtcNow + timeout;
        while (true)
        {
            if (_items.TryDequeue(out var id) && Acquire(id) is { } jpeg)
            {
                // RAW+JPEG: item sisa ikut dikosongkan.
                while (_items.TryDequeue(out var rest)) Acquire(rest);
                return jpeg;
            }
            if (!IsOpen) throw new CameraFailure("camera_disconnected", "kamera terputus saat jepret");
            if (DateTime.UtcNow > end)
                throw new CameraFailure("capture_timeout", "kamera tidak mengirim foto JPEG (set kualitas ke JPEG)");
            Async(_src);
            Thread.Sleep(10);
        }
    }

    public byte[]? TakeUnsolicited()
    {
        if (!IsOpen) return null;
        Async(_src);
        return _items.TryDequeue(out var id) ? Acquire(id) : null;
    }

    public void SetLiveView(bool on)
    {
        Check(SetUnsigned(_src, CapLiveViewStatus, on ? 1u : 0u), "live view");
        _live = on;
    }

    public byte[]? LiveViewFrame()
    {
        if (_lvBuf == IntPtr.Zero)
        {
            // Ukuran data live view tetap per model: baca sekali (Get), lalu GetArray ke buffer itu.
            var size = new Maid.Array();
            var r = WithStruct(ref size, p => Call(_src, CmdCapGet, CapGetLiveViewImage, TypeArrayPtr, (ulong)p));
            if (r is NotLiveView or DeviceBusy) return null;
            Check(r, "ukuran live view");
            _lvSize = (int)(size.Elements * Math.Max((ushort)1, size.PhysicalBytes));
            _lvBuf = Marshal.AllocHGlobal(_lvSize);
        }
        var a = new Maid.Array { Type = ArrayUnsigned, Elements = (uint)_lvSize, PhysicalBytes = 1, Data = _lvBuf };
        var res = WithStruct(ref a, p => Call(_src, CmdCapGetArray, CapGetLiveViewImage, TypeArrayPtr, (ulong)p));
        if (res is NotLiveView or DeviceBusy) return null;
        Check(res, "frame live view");
        var n = (int)Math.Min(a.Elements, (uint)_lvSize);
        var bytes = new byte[n];
        Marshal.Copy(_lvBuf, bytes, 0, n);
        return JpegAfterHeader(bytes);
    }

    // ponytail: langkah MF dalam pulsa motor lensa (1–32767); kalibrasi di uji W-044 kalau terasa terlalu kasar/halus.
    private static readonly Dictionary<string, (uint Dir, double Pulses)> Steps = new()
    {
        ["near1"] = (MFDriveToClosest, 40), ["near2"] = (MFDriveToClosest, 200), ["near3"] = (MFDriveToClosest, 1000),
        ["far1"] = (MFDriveToInfinity, 40), ["far2"] = (MFDriveToInfinity, 200), ["far3"] = (MFDriveToInfinity, 1000),
    };

    /// <summary>`af` = Contrast AF saat live view (tunggu hasil ≤ 3 s), tanpa live view = AutoFocus. near/far = MFDrive.</summary>
    public void Focus(string step)
    {
        if (step == "af")
        {
            if (!_live)
            {
                Check(Call(_src, CmdCapStart, CapAutoFocus, TypeNull, 0), "AF");
                return;
            }
            Check(SetUnsigned(_src, CapContrastAF, ContrastAFStart), "AF");
            var end = DateTime.UtcNow.AddSeconds(3);
            while (DateTime.UtcNow < end)
            {
                if (GetUnsigned(CapContrastAF) is ContrastAFInFocus) return;
                if (GetUnsigned(CapContrastAF) is ContrastAFOutOfFocus)
                    throw new CameraFailure("focus_failed", "kamera Nikon gagal fokus; dekatkan subjek atau pakai fokus manual");
                Thread.Sleep(50);
            }
            return;
        }
        if (!Steps.TryGetValue(step, out var s)) throw new CameraFailure("bad_focus", $"langkah fokus '{step}' tidak dikenal");
        var range = new Maid.Range { Value = s.Pulses };
        Check(WithStruct(ref range, p => Call(_src, CmdCapSet, CapMFDriveStep, TypeRangePtr, (ulong)p)), "langkah MF");
        Check(SetUnsigned(_src, CapMFDrive, s.Dir), "fokus manual");
    }

    public void FocusAt(double x, double y) =>
        throw new CameraFailure("focus_unavailable", "tap to focus Nikon belum didukung");

    private uint? GetUnsigned(uint cap)
    {
        var p = Marshal.AllocHGlobal(4);
        try { return Ok(Call(_src, CmdCapGet, cap, TypeUnsignedPtr, (ulong)p)) ? (uint)Marshal.ReadInt32(p) : null; }
        finally { Marshal.FreeHGlobal(p); }
    }

    /// <summary>Enum PackedString: (teks semua pilihan, indeks sekarang).</summary>
    private (string[] Values, uint Index, Maid.Enum Enum, byte[] Raw) ReadEnum(uint cap)
    {
        var e = new Maid.Enum();
        Check(WithStruct(ref e, p => Call(_src, CmdCapGet, cap, TypeEnumPtr, (ulong)p)), "baca setelan");
        if (e.Type != ArrayPackedString || e.PhysicalBytes != 1)
            throw new CameraFailure("nikon_error", $"setelan Nikon 0x{cap:X} bertipe {e.Type}, bukan teks");
        var bytes = (int)e.Elements;
        var buf = Marshal.AllocHGlobal(Math.Max(bytes, 1));
        try
        {
            e.Data = buf;
            Check(WithStruct(ref e, p => Call(_src, CmdCapGetArray, cap, TypeEnumPtr, (ulong)p)), "pilihan setelan");
            var raw = new byte[bytes];
            Marshal.Copy(buf, raw, 0, bytes);
            e.Data = IntPtr.Zero;
            return (PackedStrings(raw), e.Value, e, raw);
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    private Maid.Range ReadRange(uint cap)
    {
        var r = new Maid.Range();
        Check(WithStruct(ref r, p => Call(_src, CmdCapGet, cap, TypeRangePtr, (ulong)p)), "baca setelan");
        return r;
    }

    private static double[] RangeValues(Maid.Range r) => r.Steps < 2
        ? [r.Value]
        : [.. Enumerable.Range(0, (int)r.Steps).Select(i => r.Lower + i * (r.Upper - r.Lower) / (r.Steps - 1))];

    public uint GetProp(uint propId)
    {
        if (propId == CapBatteryLevel)
        {
            var p = Marshal.AllocHGlobal(4);
            try
            {
                Check(Call(_src, CmdCapGet, CapBatteryLevel, TypeIntegerPtr, (ulong)p), "baterai");
                return (uint)Marshal.ReadInt32(p);
            }
            finally { Marshal.FreeHGlobal(p); }
        }
        if (propId == NikonProps.Exposure)
            return NikonProps.Remember(propId, NikonProps.EvLabel(ReadRange(propId).Value));
        var (values, index, _, _) = ReadEnum(propId);
        if (index >= values.Length) throw new CameraFailure("nikon_error", $"setelan Nikon 0x{propId:X} tidak terbaca");
        return NikonProps.Remember(propId, NikonProps.Display(propId, values[index]));
    }

    public uint[] PropOptions(uint propId)
    {
        if (propId == NikonProps.Exposure)
            return [.. RangeValues(ReadRange(propId)).Select(v => NikonProps.Remember(propId, NikonProps.EvLabel(v)))];
        var (values, _, _, _) = ReadEnum(propId);
        return [.. values.Select(v => NikonProps.Remember(propId, NikonProps.Display(propId, v)))];
    }

    public void SetProp(uint propId, uint value)
    {
        var label = NikonProps.Label(propId, value)
            ?? throw new CameraFailure("bad_prop", $"nilai Nikon 0x{value:X} belum pernah dibaca dari kamera");
        if (propId == NikonProps.Exposure)
        {
            var r = ReadRange(propId);
            var vals = RangeValues(r);
            var i = System.Array.FindIndex(vals, v => NikonProps.EvLabel(v) == label);
            if (i < 0) throw new CameraFailure("prop_rejected", $"{label} tidak tersedia di kamera sekarang");
            r.Value = vals[i];
            r.ValueIndex = (uint)i;
            Check(WithStruct(ref r, p => Call(_src, CmdCapSet, propId, TypeRangePtr, (ulong)p)), "ubah setelan");
            return;
        }
        var (values, _, e, raw) = ReadEnum(propId);
        var idx = System.Array.FindIndex(values, v => NikonProps.Display(propId, v) == label);
        if (idx < 0) throw new CameraFailure("prop_rejected", $"{label} tidak tersedia di kamera sekarang");
        // CapSet Enum butuh data array yang sama dengan hasil GetArray.
        var buf = Marshal.AllocHGlobal(raw.Length);
        try
        {
            Marshal.Copy(raw, 0, buf, raw.Length);
            e.Data = buf;
            e.Elements = (uint)raw.Length;
            e.Value = (uint)idx;
            Check(WithStruct(ref e, p => Call(_src, CmdCapSet, propId, TypeEnumPtr, (ulong)p)), "ubah setelan");
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    public void Dispose() => Close();
}
