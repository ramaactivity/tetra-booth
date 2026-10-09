using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using TetraCamera.Canon;
using TetraCamera.HotFolder;
using static TetraCamera.Lumix.Lmx;

namespace TetraCamera.Lumix;

/// <summary>
/// Panasonic Lumix lewat Lumix Remote Control Library (Lmxptpif.dll, DECISIONS #214), dijalankan
/// <see cref="CanonCamera"/> dengan <see cref="LumixProps.Kind"/>. Hasil jepret dikirim ke PC: DLL memanggil callback
/// transfer dari thread-nya sendiri, file diunduh di situ (seperti contoh Panasonic) lalu diambil Capture.
/// SDK tidak punya event cabut kabel: <see cref="Pump"/> membaca ISO tiap detik, dua kali gagal "kamera hilang" = tutup.
/// </summary>
public sealed class LumixDriver : ICanonDriver
{
    private static string? _dllDir;
    private static bool _init;
    private readonly byte[] _devInfo = new byte[DevInfoSize];
    private readonly byte[] _capa = new byte[CapaSize];
    private readonly byte[] _ctrl = new byte[RecCtrlSize];
    private readonly byte[] _jpeg = new byte[JpegMax], _hist = new byte[256], _posture = new byte[16], _level = new byte[16];
    private readonly ConcurrentQueue<byte[]> _shots = new();
    // Delegate disimpan di field supaya tidak di-GC selama DLL memegang pointer-nya.
    private readonly Callback _onEvent;
    private volatile bool _open;
    private int _lost;
    private long _nextCheck;

    /// <param name="dllDir">Folder berisi Lmxptpif.dll (mis. %APPDATA%\TetraBooth\lumix).</param>
    public LumixDriver(string dllDir)
    {
        var path = Path.Combine(dllDir, Dll);
        if (!File.Exists(path)) throw new CameraFailure("lumix_missing", $"{Dll} tidak ada di {dllDir}");
        if (_dllDir is null)
        {
            _dllDir = dllDir;
            NativeLibrary.SetDllImportResolver(typeof(LumixDriver).Assembly, Resolve);
        }
        // Lmxptpif.dll butuh Visual C++ 2015–2022 runtime x64 (MSVCP140.dll): gagal dimuat = beri tahu sekarang.
        if (!NativeLibrary.TryLoad(path, out _))
            throw new CameraFailure("lumix_missing",
                $"{Dll} tidak bisa dimuat; pasang Microsoft Visual C++ Redistributable x64 (vc_redist.x64.exe)");
        _onEvent = OnEvent;
    }

    private static IntPtr Resolve(string name, Assembly _, DllImportSearchPath? __) =>
        name == Dll && _dllDir is not null ? NativeLibrary.Load(Path.Combine(_dllDir, Dll)) : IntPtr.Zero;

    public bool IsOpen => _open;

    private void Check(byte ok, uint err, string what)
    {
        if (ok == 1) return;
        if (Lost(err)) Interlocked.Increment(ref _lost);
        throw new CameraFailure("lumix_error", $"Lumix {what} gagal: 0x{err:X8}");
    }

    public (string Model, string Serial)? Open()
    {
        if (!_init)
        {
            LMX_func_api_Init();
            _init = true;
        }
        Array.Clear(_devInfo);
        if (LMX_func_api_Get_PnPDeviceInfo(_devInfo, out _) != 1) return null;
        var n = BitConverter.ToUInt32(_devInfo, 0);
        if (n > 512) throw new CameraFailure("lumix_error", $"daftar perangkat Lumix tidak terbaca (jumlah {n})");
        if (n == 0) return null;
        // WPD juga mendaftar HP/flashdisk: pilih Panasonic, kalau tidak ada ambil yang pertama.
        var pick = 0;
        for (var i = (int)n - 1; i >= 0; i--)
            if (Text(i, DevInfoMaker).Contains("Panasonic", StringComparison.OrdinalIgnoreCase)) pick = i;
        var model = Text(pick, DevInfoModel);
        Check(LMX_func_api_Select_PnPDevice((uint)pick, _devInfo, out var err), err, "pilih kamera");
        if (LMX_func_api_Open_Session(ConnectVersion, out _, out err) != 1 && err != ErrSessionAlreadyOpened)
        {
            LMX_func_api_Close_Device(out _);
            Check(0, err, "buka sesi");
        }
        LMX_func_api_Reg_NotifyCallback(EventObjectTransfer, _onEvent);
        LMX_func_api_Reg_NotifyCallback(EventObjectAdd, _onEvent);
        // Foto dikirim ke PC (seperti Canon SaveTo host). Ditolak = file tetap datang lewat event objek kartu.
        if (LMX_func_api_SetupFilesConfig_Set_Target(TargetPcOnly, out err) != 1)
            Console.Error.WriteLine($"[lumix] simpan ke PC ditolak (0x{err:X8}), foto diambil dari kartu");
        _lost = 0;
        _open = true;
        return (model, "usb");
    }

    private string Text(int item, int field)
    {
        var at = DevInfoItems + item * DevInfoItemSize + field;
        var s = Encoding.Unicode.GetString(_devInfo, at, 512);
        return s[..(s.IndexOf('\0') is var z and >= 0 ? z : s.Length)].Trim();
    }

    public void Close()
    {
        if (!_open) return;
        _open = false;
        LMX_func_api_Delete_CallBackInfo(EventObjectTransfer);
        LMX_func_api_Delete_CallBackInfo(EventObjectAdd);
        LMX_func_api_Close_Session(out _);
        LMX_func_api_Close_Device(out _);
    }

    public void Pump()
    {
        var now = Environment.TickCount64;
        if (now < _nextCheck) return;
        _nextCheck = now + 1000;
        if (LMX_func_api_ISO_Get_Param(out _, out var err) == 1) _lost = 0;
        else if (Lost(err)) _lost++;
        if (_lost >= 2)
        {
            Console.WriteLine($"[lumix] kamera tidak menjawab (0x{err:X8}), sesi ditutup");
            Close();
        }
    }

    /// <summary>Thread DLL: unduh JPEG jepretan ke antrean, RAW/video dilewati. Tidak boleh melempar ke kode native.</summary>
    private int OnEvent(uint type, uint param)
    {
        var handle = type == EventObjectTransfer ? TransferHandle : param;
        try
        {
            if (LMX_func_api_Get_Object_FormatType(handle, out var format, out var err) != 1)
                throw new CameraFailure("lumix_error", $"format 0x{err:X8}");
            if (format != FormatJpeg)
            {
                if (type == EventObjectTransfer) LMX_func_api_Skip_Object_Transfer(handle, out _);
                return 0;
            }
            if (LMX_func_api_Get_Object_DataSize(handle, out var size, out err) != 1 || size is 0 or > int.MaxValue)
                throw new CameraFailure("lumix_error", $"ukuran 0x{err:X8}");
            var bytes = new byte[size];
            var chunk = new byte[Math.Min((int)size, JpegMax)];
            for (ulong at = 0; at < size;)
            {
                var n = (uint)Math.Min((ulong)chunk.Length, size - at);
                if (LMX_func_api_Get_Partial_ObjectEx(handle, chunk, at, n, out err) != 1)
                    throw new CameraFailure("lumix_error", $"unduh 0x{err:X8}");
                Buffer.BlockCopy(chunk, 0, bytes, (int)at, (int)n);
                at += n;
            }
            _shots.Enqueue(bytes);
        }
        catch (Exception e) { Console.Error.WriteLine($"[lumix] foto gagal diunduh: {e.Message}"); }
        return 0;
    }

    public byte[] Capture(TimeSpan timeout)
    {
        _shots.Clear();
        Control(LMX_func_api_Rec_Ctrl_Release, TagReleaseOneShot, null, "jepret");
        var deadline = DateTime.UtcNow + timeout;
        while (true)
        {
            if (_shots.TryDequeue(out var jpeg)) return jpeg;
            if (!_open) throw new CameraFailure("camera_disconnected", "kamera terputus saat jepret");
            if (DateTime.UtcNow > deadline) throw new CameraFailure("capture_timeout", "kamera tidak mengirim foto");
            Thread.Sleep(20);
        }
    }

    public byte[]? TakeUnsolicited() => _shots.TryDequeue(out var j) ? j : null;

    private delegate byte CtrlFn(byte[] ctrl, out uint err);

    private void Control(CtrlFn fn, uint tag, uint? param, string what)
    {
        Array.Clear(_ctrl);
        BitConverter.TryWriteBytes(_ctrl.AsSpan(0), tag);
        if (param is { } p)
        {
            BitConverter.TryWriteBytes(_ctrl.AsSpan(4), (ushort)1);
            BitConverter.TryWriteBytes(_ctrl.AsSpan(8), p);
        }
        Check(fn(_ctrl, out var err), err, what);
    }

    public void SetLiveView(bool on)
    {
        uint err;
        Check(on ? LMX_func_api_Ctrl_LiveView_Start(out err) : LMX_func_api_Ctrl_LiveView_Stop(out err), err, "live view");
    }

    public byte[]? LiveViewFrame()
    {
        uint hist = 76, posture = 2, level = 4, size = 0;
        if (LMX_func_api_Get_LiveView_data(_hist, ref hist, _posture, ref posture, _level, ref level, _jpeg, ref size,
                out var err) != 1)
        {
            if (err == ErrDataBusy) return null;
            Check(0, err, "frame live view");
        }
        return size is > 0 and <= JpegMax ? _jpeg[..(int)size] : null;
    }

    // ponytail: lama dorong MF = kalibrasi langkah near/far (seperti 1/2/3 Canon); ubah kalau uji W-043 terasa kasar.
    private static readonly Dictionary<string, (uint Dir, int Ms)> Steps = new()
    {
        ["near1"] = (MfNearSlow, 60), ["near2"] = (MfNearSlow, 200), ["near3"] = (MfNearFast, 200),
        ["far1"] = (MfFarSlow, 60), ["far2"] = (MfFarSlow, 200), ["far3"] = (MfFarFast, 200),
    };

    /// <summary>`af` = AF sekali (lensa mode AF). near/far = dorong fokus manual sebentar lalu berhenti (mode MF).</summary>
    public void Focus(string step)
    {
        if (step == "af")
        {
            Control(LMX_func_api_Rec_Ctrl_AF_AE, TagAfOneShot, null, "AF");
            return;
        }
        if (!Steps.TryGetValue(step, out var s)) throw new CameraFailure("bad_focus", $"langkah fokus '{step}' tidak dikenal");
        Control(LMX_func_api_Rec_Ctrl_Lens, TagLensMfBar, s.Dir, "fokus manual");
        Thread.Sleep(s.Ms);
        Control(LMX_func_api_Rec_Ctrl_Lens, TagLensMfBar, MfStop, "fokus manual");
    }

    public void FocusAt(double x, double y) =>
        throw new CameraFailure("focus_unavailable", "Lumix tidak mendukung tap to focus");

    private delegate byte GetFn(out uint v, out uint err);

    public uint GetProp(uint propId)
    {
        GetFn f = propId switch
        {
            LumixProps.Iso => LMX_func_api_ISO_Get_Param,
            LumixProps.Shutter => LMX_func_api_SS_Get_Param,
            LumixProps.Aperture => LMX_func_api_Aperture_Get_Param,
            LumixProps.WhiteBalance => LMX_func_api_WB_Get_Param,
            LumixProps.Exposure => LMX_func_api_Exposure_Get_Param,
            _ => throw new CameraFailure("bad_prop", $"setelan Lumix 0x{propId:X8} tidak dikenal"),
        };
        Check(f(out var v, out var err), err, "baca setelan");
        return v;
    }

    private delegate byte CapaFn(byte[] capa, out uint err);

    /// <summary>Daftar pilihan dari struct capability (offset: lihat <see cref="Lmx"/>).</summary>
    public uint[] PropOptions(uint propId)
    {
        (CapaFn f, int at, bool wide) = propId switch
        {
            LumixProps.Iso => ((CapaFn)LMX_func_api_ISO_Get_Capability, 0, true),
            LumixProps.Shutter => (LMX_func_api_SS_Get_Capability, 0, true),
            LumixProps.Aperture => (LMX_func_api_Aperture_Get_Capability, 10, false),
            LumixProps.WhiteBalance => (LMX_func_api_WB_Get_Capability, 0, false),
            LumixProps.Exposure => (LMX_func_api_Exposure_Get_Capability, 10, false),
            _ => throw new CameraFailure("bad_prop", $"setelan Lumix 0x{propId:X8} tidak dikenal"),
        };
        Array.Clear(_capa);
        Check(f(_capa, out var err), err, "pilihan setelan");
        return Lmx.Enum(_capa, at, wide);
    }

    private delegate byte SetFn(uint v, out uint err);

    public void SetProp(uint propId, uint value)
    {
        SetFn f = propId switch
        {
            LumixProps.Iso => LMX_func_api_ISO_Set_Param,
            LumixProps.Shutter => LMX_func_api_SS_Set_Param,
            LumixProps.Aperture => LMX_func_api_Aperture_Set_Param,
            LumixProps.WhiteBalance => LMX_func_api_WB_Set_Param,
            LumixProps.Exposure => LMX_func_api_Exposure_Set_Param,
            _ => throw new CameraFailure("bad_prop", $"setelan Lumix 0x{propId:X8} tidak dikenal"),
        };
        Check(f(value, out var err), err, "ubah setelan");
    }

    public void Dispose() => Close();
}
