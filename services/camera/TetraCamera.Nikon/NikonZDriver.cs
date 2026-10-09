using System.Runtime.InteropServices;
using System.Text;
using TetraCamera.Canon;
using TetraCamera.HotFolder;
using static TetraCamera.Nikon.Maid;

namespace TetraCamera.Nikon;

/// <summary>
/// Nikon Z lewat "Remote SDK v2" (ControlServiceLayer.dll, DECISIONS #216): Z9, Z8, Z6III, Z7II, Z6II, Z7, Z6, Z5II,
/// Z5, Zf, Z50II, Z50, Z30, Zfc, ZR, Windows 11. API-nya bukan objek MAID melainkan fungsi C (InitializeSDK,
/// ConnectDevice, StartShooting, Get/SetCapability) dengan ID capability yang sama dengan <see cref="Maid"/>.
/// Foto disimpan Control Service sendiri ke folder <c>ImageSavePath</c> (DataProc tidak dipakai, seperti contoh Nikon);
/// live view didorong lewat callback LVDataProc dari thread milik DLL. Hanya satu kamera.
/// </summary>
public sealed class NikonZDriver : ICanonDriver
{
    public const string Dll = "ControlServiceLayer.dll";
    /// <summary>Profil yang wajib ada di %LOCALAPPDATA%\Nikon\NXTether (ReadMe Remote SDK v2).</summary>
    private static readonly string[] Profiles = ["DC_PTP_Config.config", "MaidLayer.config", "RangeValue.config"];
    /// <summary>NkMAIDLiveViewData: ulLvImageSize u32, 2× u16, header 884 byte (pack 2), lalu pImageData.</summary>
    private const int LvImagePtrOffset = 892;
    /// <summary>MAIDShootingStructure (pack 2): type, 4× u32, bool @20, wchar ImageSavePath[1024] @22, pointer @2070.</summary>
    private const int ShootSize = 2078, ShootAutoFocus = 20, ShootPath = 22;
    private const uint GetValue = 0, GetSupported = 1; // eNkSDKGetSettingRequestType
    private const uint ShootingSingle = 1;

    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate IntPtr AllocFn(nuint size);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void FreeFn(IntPtr p);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void AsyncDoneFn(IntPtr refComplete, int result);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int LvDataFn(IntPtr refProc, IntPtr data);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int InitFn(IntPtr alloc, IntPtr free, IntPtr callbacks, ref IntPtr devices, IntPtr caps);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int VoidFn();
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int EnumDevicesFn(ref IntPtr devices, IntPtr proc, IntPtr refProc);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int ConnectFn(uint id, ref IntPtr caps);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int AsyncFn(IntPtr proc, IntPtr refProc);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int ShootFn(IntPtr shoot, IntPtr proc, IntPtr refProc);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int GetCapFn(uint cap, uint request, ref IntPtr data, ref uint type);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int SetCapFn(uint cap, IntPtr data, uint type);
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int OperationFn(uint cap, IntPtr proc, IntPtr refProc);
    [UnmanagedFunctionPointer(CallingConvention.Winapi, CharSet = CharSet.Unicode)] private delegate int SavePathFn(string image, string video);

    private readonly InitFn _init;
    private readonly VoidFn _free, _disconnect;
    private readonly EnumDevicesFn _enumDevices;
    private readonly ConnectFn _connect;
    private readonly AsyncFn _startLv, _stopLv;
    private readonly ShootFn _shoot;
    private readonly GetCapFn _get;
    private readonly SetCapFn _set;
    private readonly OperationFn _operation;
    private readonly SavePathFn _savePath;
    // Delegate callback disimpan di field supaya tidak di-GC selama DLL memegang pointer-nya.
    private readonly AllocFn _alloc = n => Marshal.AllocHGlobal((nint)n);
    private readonly FreeFn _freeMem = p => { if (p != IntPtr.Zero) Marshal.FreeHGlobal(p); };
    private readonly EventProc _onEvent;
    private readonly LvDataFn _onLv;
    private readonly UIRequestProc _onUi = (_, req) => (uint)Marshal.ReadInt32(req, 4);
    private readonly AsyncDoneFn _onShot;
    private readonly IntPtr _callbacks;
    private readonly string _stageDir;
    private bool _sdk, _open, _live;
    private volatile bool _lost;
    private volatile int _shotResult = int.MinValue;
    private volatile byte[]? _frame;

    /// <param name="dir">Folder berisi ControlServiceLayer.dll + NkdPTP.dll, NkRoyalmile.dll, dnssd.dll + 3 file .config.</param>
    public NikonZDriver(string dir)
    {
        var path = Path.Combine(dir, Dll);
        if (!File.Exists(path)) throw new CameraFailure("nikon_missing", $"{Dll} tidak ada di {dir}");
        var profiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nikon", "NXTether");
        Directory.CreateDirectory(profiles);
        foreach (var p in Profiles)
        {
            var src = Path.Combine(dir, p);
            if (File.Exists(src)) File.Copy(src, Path.Combine(profiles, p), overwrite: true);
        }
        var h = Load(path);
        T Fn<T>(string name) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(h, name));
        _init = Fn<InitFn>("InitializeSDK");
        _free = Fn<VoidFn>("FreeSDK");
        _disconnect = Fn<VoidFn>("DisconnectDevice");
        _enumDevices = Fn<EnumDevicesFn>("EnumDevices");
        _connect = Fn<ConnectFn>("ConnectDevice");
        _startLv = Fn<AsyncFn>("StartLiveView");
        _stopLv = Fn<AsyncFn>("StopLiveView");
        _shoot = Fn<ShootFn>("StartShooting");
        _get = Fn<GetCapFn>("GetCapability");
        _set = Fn<SetCapFn>("SetCapability");
        _operation = Fn<OperationFn>("StartOperation");
        _savePath = Fn<SavePathFn>("SetImageVideoSavePath");

        _onEvent = (_, ev, _) => { if (ev == EventRemoveChild) _lost = true; };
        _onLv = OnLiveView;
        _onShot = (_, result) => _shotResult = result;
        // NkMAIDCSCallback: UIRequest, Event, Progress, Data, LiveViewData, refProc.
        _callbacks = Marshal.AllocHGlobal(6 * IntPtr.Size);
        IntPtr[] procs =
        [
            Marshal.GetFunctionPointerForDelegate(_onUi), Marshal.GetFunctionPointerForDelegate(_onEvent), IntPtr.Zero,
            IntPtr.Zero, Marshal.GetFunctionPointerForDelegate(_onLv), IntPtr.Zero,
        ];
        Marshal.Copy(procs, 0, _callbacks, procs.Length);
        _stageDir = Path.Combine(Path.GetTempPath(), "tetra-nikonz-stage");
    }

    public bool IsOpen => _open && !_lost;

    private static void Check(int r, string what)
    {
        if (Ok(r)) return;
        throw r switch
        {
            OutOfFocus => new CameraFailure("focus_failed", "kamera Nikon gagal fokus; dekatkan subjek atau pakai fokus manual"),
            DeviceBusy => new CameraFailure("camera_busy", $"kamera Nikon sibuk ({what}), coba lagi"),
            _ => new CameraFailure("nikon_error", $"Nikon Z {what} gagal (kode {r})"),
        };
    }

    public (string Model, string Serial)? Open()
    {
        var list = IntPtr.Zero;
        if (!_sdk)
        {
            Check(_init(Marshal.GetFunctionPointerForDelegate(_alloc), Marshal.GetFunctionPointerForDelegate(_freeMem),
                _callbacks, ref list, IntPtr.Zero), "mulai SDK");
            _sdk = true;
            FreeDevices(list);
            list = IntPtr.Zero;
        }
        if (!Ok(_enumDevices(ref list, IntPtr.Zero, IntPtr.Zero)) || list == IntPtr.Zero) return null;
        (uint Id, string Name)? pick = null;
        try
        {
            // NkMAIDEnumDevices: ulElements, ulValue, pDeviceData; NkMAIDDeviceInfo (138 byte): ID, Name[64], bool, PID, Version[64].
            var n = Marshal.ReadInt32(list);
            var data = Marshal.ReadIntPtr(list, 8);
            for (var i = 0; i < n && pick is null; i++)
            {
                var d = data + i * 138;
                if (Marshal.ReadByte(d, 68) != 0) pick = ((uint)Marshal.ReadInt32(d), Marshal.PtrToStringAnsi(d + 4) ?? "Nikon Z");
            }
        }
        finally { FreeDevices(list); }
        if (pick is not { } dev) return null;
        var caps = IntPtr.Zero;
        Check(_connect(dev.Id, ref caps), "sambung");
        FreeCaps(caps);
        _lost = false;
        _open = true;
        try
        {
            SetUnsigned(CapSaveMedia, SaveMediaSdram);
            Directory.CreateDirectory(_stageDir);
            _savePath(_stageDir, _stageDir);
            foreach (var p in NikonProps.All)
            {
                try { PropOptions(p.PropId); }
                catch (CameraFailure e) { Console.Error.WriteLine($"[nikon] {p.Label} tidak terbaca: {e.Message}"); }
            }
        }
        catch
        {
            Close();
            throw;
        }
        Console.WriteLine($"[nikon] Remote SDK v2, kamera {dev.Name}");
        return (dev.Name.Trim(), "usb");
    }

    private void FreeDevices(IntPtr list)
    {
        if (list == IntPtr.Zero) return;
        _freeMem(Marshal.ReadIntPtr(list, 8));
        _freeMem(list);
    }

    /// <summary>NkMAIDEnumCapInfo: pCapArray lalu hitungan.</summary>
    private void FreeCaps(IntPtr caps)
    {
        if (caps == IntPtr.Zero) return;
        _freeMem(Marshal.ReadIntPtr(caps));
        _freeMem(caps);
    }

    public void Close()
    {
        if (!_open) return;
        _open = false;
        try
        {
            if (_live && !_lost) _stopLv(IntPtr.Zero, IntPtr.Zero);
            _disconnect();
        }
        catch { /* kamera sudah dicabut */ }
        _live = false;
        _frame = null;
    }

    public void Pump() { }

    private int OnLiveView(IntPtr refProc, IntPtr data)
    {
        try
        {
            if (data == IntPtr.Zero) return NoError;
            var size = Marshal.ReadInt32(data);
            var img = Marshal.ReadIntPtr(data, LvImagePtrOffset);
            if (size <= 0 || img == IntPtr.Zero) return NoError;
            var bytes = new byte[size];
            Marshal.Copy(img, bytes, 0, size);
            _frame = JpegAfterHeader(bytes);
        }
        catch { /* jangan melempar ke kode native */ }
        return NoError;
    }

    public byte[] Capture(TimeSpan timeout)
    {
        var dir = Path.Combine(Path.GetTempPath(), $"tetra-nikonz-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        var shoot = Marshal.AllocHGlobal(ShootSize);
        try
        {
            Marshal.Copy(new byte[ShootSize], 0, shoot, ShootSize);
            Marshal.WriteInt32(shoot, (int)ShootingSingle);
            Marshal.WriteByte(shoot, ShootAutoFocus, 0);
            var path = Encoding.Unicode.GetBytes(dir + '\0');
            Marshal.Copy(path, 0, shoot + ShootPath, Math.Min(path.Length, 2046));
            _shotResult = int.MinValue;
            Check(_shoot(shoot, Marshal.GetFunctionPointerForDelegate(_onShot), IntPtr.Zero), "jepret");
            var end = DateTime.UtcNow + timeout;
            while (true)
            {
                if (_shotResult != int.MinValue) Check(_shotResult, "jepret");
                // File JPEG ditulis Control Service; tunggu ukurannya tetap supaya tidak terbaca setengah.
                var jpg = Directory.EnumerateFiles(dir).FirstOrDefault(f =>
                    f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase));
                if (jpg is not null && Stable(jpg)) return File.ReadAllBytes(jpg);
                if (!IsOpen) throw new CameraFailure("camera_disconnected", "kamera terputus saat jepret");
                if (DateTime.UtcNow > end)
                    throw new CameraFailure("capture_timeout", "kamera tidak mengirim foto JPEG (set kualitas ke JPEG)");
                Thread.Sleep(30);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(shoot);
            try { Directory.Delete(dir, true); } catch (IOException) { /* dibersihkan OS */ }
        }
    }

    private static bool Stable(string file)
    {
        var a = new System.IO.FileInfo(file).Length;
        Thread.Sleep(80);
        return a > 0 && a == new System.IO.FileInfo(file).Length;
    }

    /// <summary>Photo Stage: rana di kamera disimpan Control Service ke folder simpanan bawaan.</summary>
    public byte[]? TakeUnsolicited()
    {
        if (!Directory.Exists(_stageDir)) return null;
        var jpg = Directory.EnumerateFiles(_stageDir, "*.*")
            .FirstOrDefault(f => f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase));
        if (jpg is null || !Stable(jpg)) return null;
        var bytes = File.ReadAllBytes(jpg);
        File.Delete(jpg);
        return bytes;
    }

    public void SetLiveView(bool on)
    {
        Check(on ? _startLv(IntPtr.Zero, IntPtr.Zero) : _stopLv(IntPtr.Zero, IntPtr.Zero), "live view");
        _live = on;
        if (!on) _frame = null;
    }

    public byte[]? LiveViewFrame() => _live ? _frame : null;

    private void SetUnsigned(uint cap, uint value)
    {
        var p = Marshal.AllocHGlobal(4);
        try
        {
            Marshal.WriteInt32(p, (int)value);
            Check(_set(cap, p, TypeUnsignedPtr), $"setelan 0x{cap:X}");
        }
        finally { Marshal.FreeHGlobal(p); }
    }

    private (IntPtr Data, uint Type) Get(uint cap, uint request)
    {
        var data = IntPtr.Zero;
        uint type = 0;
        Check(_get(cap, request, ref data, ref type), $"baca 0x{cap:X}");
        if (data == IntPtr.Zero) throw new CameraFailure("nikon_error", $"Nikon Z 0x{cap:X} kosong");
        return (data, type);
    }

    private void FreeData(IntPtr data, uint type)
    {
        if (type is TypeEnumPtr) _freeMem(Marshal.ReadIntPtr(data, 18));
        else if (type is TypeArrayPtr) _freeMem(Marshal.ReadIntPtr(data, 24));
        _freeMem(data);
    }

    private (string[] Values, uint Index) ReadEnum(uint cap)
    {
        var (data, type) = Get(cap, GetSupported);
        try
        {
            if (type != TypeEnumPtr) throw new CameraFailure("nikon_error", $"setelan Nikon Z 0x{cap:X} bukan enum");
            var e = Marshal.PtrToStructure<Maid.Enum>(data);
            if (e.Type != ArrayPackedString || e.Data == IntPtr.Zero)
                throw new CameraFailure("nikon_error", $"setelan Nikon Z 0x{cap:X} bukan teks");
            var raw = new byte[e.Elements];
            Marshal.Copy(e.Data, raw, 0, raw.Length);
            return (PackedStrings(raw), e.Value);
        }
        finally { FreeData(data, type); }
    }

    private Maid.Range ReadRange(uint cap)
    {
        var (data, type) = Get(cap, GetValue);
        try
        {
            if (type != TypeRangePtr) throw new CameraFailure("nikon_error", $"setelan Nikon Z 0x{cap:X} bukan range");
            return Marshal.PtrToStructure<Maid.Range>(data);
        }
        finally { FreeData(data, type); }
    }

    private static double[] RangeValues(Maid.Range r) => r.Steps < 2
        ? [r.Value]
        : [.. Enumerable.Range(0, (int)r.Steps).Select(i => r.Lower + i * (r.Upper - r.Lower) / (r.Steps - 1))];

    public uint GetProp(uint propId)
    {
        if (propId == CapBatteryLevel)
        {
            var (data, type) = Get(CapBatteryLevel, GetValue);
            try { return (uint)Marshal.ReadInt32(data); }
            finally { FreeData(data, type); }
        }
        if (propId == NikonProps.Exposure)
        {
            var r = ReadRange(propId);
            var v = r.Steps < 2 ? r.Value : RangeValues(r)[Math.Min((int)r.ValueIndex, (int)r.Steps - 1)];
            return NikonProps.Remember(propId, NikonProps.EvLabel(v));
        }
        var (values, index) = ReadEnum(propId);
        if (index >= values.Length) throw new CameraFailure("nikon_error", $"setelan Nikon Z 0x{propId:X} tidak terbaca");
        return NikonProps.Remember(propId, NikonProps.Display(propId, values[index]));
    }

    public uint[] PropOptions(uint propId)
    {
        if (propId == NikonProps.Exposure)
            return [.. RangeValues(ReadRange(propId)).Select(v => NikonProps.Remember(propId, NikonProps.EvLabel(v)))];
        return [.. ReadEnum(propId).Values.Select(v => NikonProps.Remember(propId, NikonProps.Display(propId, v)))];
    }

    public void SetProp(uint propId, uint value)
    {
        var label = NikonProps.Label(propId, value)
            ?? throw new CameraFailure("bad_prop", $"nilai Nikon 0x{value:X} belum pernah dibaca dari kamera");
        if (propId == NikonProps.Exposure)
        {
            var r = ReadRange(propId);
            var i = System.Array.FindIndex(RangeValues(r), v => NikonProps.EvLabel(v) == label);
            if (i < 0) throw new CameraFailure("prop_rejected", $"{label} tidak tersedia di kamera sekarang");
            r.ValueIndex = (uint)i;
            r.Value = RangeValues(r)[i];
            WithNative(r, p => Check(_set(propId, p, TypeRangePtr), "ubah setelan"));
            return;
        }
        var (values, _) = ReadEnum(propId);
        var idx = System.Array.FindIndex(values, v => NikonProps.Display(propId, v) == label);
        if (idx < 0) throw new CameraFailure("prop_rejected", $"{label} tidak tersedia di kamera sekarang");
        // Contoh Nikon: set enum cukup dengan indeks, pData NULL.
        var e = new Maid.Enum { Type = ArrayPackedString, Elements = 0, Value = (uint)idx, PhysicalBytes = 1 };
        WithNative(e, p => Check(_set(propId, p, TypeEnumPtr), "ubah setelan"));
    }

    private static void WithNative<T>(T value, Action<IntPtr> call) where T : struct
    {
        var p = Marshal.AllocHGlobal(Marshal.SizeOf<T>());
        try
        {
            Marshal.StructureToPtr(value, p, false);
            call(p);
        }
        finally { Marshal.FreeHGlobal(p); }
    }

    // ponytail: sama dengan NikonDriver; kalibrasi di uji W-044.
    private static readonly Dictionary<string, (uint Dir, double Pulses)> Steps = new()
    {
        ["near1"] = (MFDriveToClosest, 40), ["near2"] = (MFDriveToClosest, 200), ["near3"] = (MFDriveToClosest, 1000),
        ["far1"] = (MFDriveToInfinity, 40), ["far2"] = (MFDriveToInfinity, 200), ["far3"] = (MFDriveToInfinity, 1000),
    };

    public void Focus(string step)
    {
        if (step == "af")
        {
            if (!_live)
            {
                Check(_operation(CapAutoFocus, IntPtr.Zero, IntPtr.Zero), "AF");
                return;
            }
            SetUnsigned(CapContrastAF, ContrastAFStart);
            var end = DateTime.UtcNow.AddSeconds(3);
            while (DateTime.UtcNow < end)
            {
                var (data, type) = Get(CapContrastAF, GetValue);
                uint v;
                try { v = (uint)Marshal.ReadInt32(data); }
                finally { FreeData(data, type); }
                if (v == ContrastAFInFocus) return;
                if (v == ContrastAFOutOfFocus)
                    throw new CameraFailure("focus_failed", "kamera Nikon gagal fokus; dekatkan subjek atau pakai fokus manual");
                Thread.Sleep(50);
            }
            return;
        }
        if (!Steps.TryGetValue(step, out var s)) throw new CameraFailure("bad_focus", $"langkah fokus '{step}' tidak dikenal");
        WithNative(new Maid.Range { Value = s.Pulses }, p => Check(_set(CapMFDriveStep, p, TypeRangePtr), "langkah MF"));
        SetUnsigned(CapMFDrive, s.Dir);
    }

    public void FocusAt(double x, double y) =>
        throw new CameraFailure("focus_unavailable", "tap to focus Nikon belum didukung");

    public void Dispose()
    {
        Close();
        if (_sdk)
        {
            try { _free(); } catch { /* keluar */ }
            _sdk = false;
        }
    }
}
