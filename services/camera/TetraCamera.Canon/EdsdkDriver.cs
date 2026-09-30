using System.Reflection;
using System.Runtime.InteropServices;
using TetraCamera.HotFolder;
using static TetraCamera.Canon.Edsdk;

namespace TetraCamera.Canon;

/// <summary>
/// Canon EDSDK asli (TSD §2.1, DECISIONS #111). Hasil disimpan ke host (SaveTo_Host) dan diunduh ke memori;
/// auto power off diperpanjang tiap jepret. Event kamera diambil lewat EdsGetEvent (aplikasi konsol, tanpa message loop).
/// </summary>
public sealed class EdsdkDriver : ICanonDriver
{
    private static readonly Dictionary<string, int> Drive = new()
    {
        ["near1"] = 0x0001, ["near2"] = 0x0002, ["near3"] = 0x0003,
        ["far1"] = 0x8001, ["far2"] = 0x8002, ["far3"] = 0x8003,
    };

    private static string? _dllDir;
    private bool _sdk;
    private IntPtr _list, _cam, _pending;
    // Delegate disimpan di field supaya tidak di-GC selama SDK memegang pointer-nya.
    private readonly ObjectEventHandler _onObject;
    private readonly StateEventHandler _onState;

    /// <param name="dllDir">Folder berisi EDSDK.dll + EdsImage.dll (mis. %APPDATA%\TetraBooth\edsdk).</param>
    public EdsdkDriver(string dllDir)
    {
        if (!File.Exists(Path.Combine(dllDir, Dll)))
            throw new CameraFailure("edsdk_missing", $"{Dll} tidak ada di {dllDir}");
        if (_dllDir is null)
        {
            _dllDir = dllDir;
            NativeLibrary.SetDllImportResolver(typeof(EdsdkDriver).Assembly, Resolve);
        }
        _onObject = OnObject;
        _onState = OnState;
    }

    private static IntPtr Resolve(string name, Assembly _, DllImportSearchPath? __) =>
        name == Dll && _dllDir is not null ? NativeLibrary.Load(Path.Combine(_dllDir, Dll)) : IntPtr.Zero;

    public bool IsOpen => _cam != IntPtr.Zero;

    private static void Check(uint err, string what)
    {
        if (err != ErrOk) throw new CameraFailure("canon_error", $"EDSDK {what} gagal: 0x{err:X8}");
    }

    public (string Model, string Serial)? Open()
    {
        if (!_sdk)
        {
            Check(EdsInitializeSDK(), "init");
            _sdk = true;
        }
        Check(EdsGetCameraList(out _list), "daftar kamera");
        Check(EdsGetChildCount(_list, out var n), "jumlah kamera");
        if (n == 0)
        {
            Release(ref _list);
            return null;
        }
        Check(EdsGetChildAtIndex(_list, 0, out var cam), "kamera");
        Check(EdsGetDeviceInfo(cam, out var info), "info kamera");
        Check(EdsSetObjectEventHandler(cam, ObjectEventAll, _onObject, IntPtr.Zero), "handler objek");
        Check(EdsSetCameraStateEventHandler(cam, StateEventAll, _onState, IntPtr.Zero), "handler status");
        var err = EdsOpenSession(cam);
        if (err != ErrOk)
        {
            EdsRelease(cam);
            Release(ref _list);
            Check(err, "buka sesi");
        }
        _cam = cam;
        try
        {
            // 60D sering menjawab DEVICE_BUSY (0x81) sesaat setelah sesi dibuka (uji 2026-09-30): coba ulang sebentar.
            var host = SaveToHost;
            RetryBusy(() => EdsSetPropertyData(_cam, PropSaveTo, 0, sizeof(uint), ref host), "SaveTo host");
            // Kamera perlu tahu "sisa ruang" di host sebelum mau mengirim file (SaveTo_Host).
            RetryBusy(
                () => EdsSetCapacity(_cam, new Capacity { NumberOfFreeClusters = 0x7FFFFFFF, BytesPerSector = 0x1000, Reset = 1 }),
                "kapasitas");
        }
        catch
        {
            // Jangan tinggalkan sesi setengah terbuka: IsOpen true tanpa info = live view jalan tapi jepret ditolak
            // "belum tersambung" dan loop tidak pernah menyambung ulang (60D, 0.5.33).
            Close();
            throw;
        }
        return (info.DeviceDescription, info.PortName);
    }

    private const uint ErrDeviceBusy = 0x00000081;

    private static void RetryBusy(Func<uint> call, string what)
    {
        var err = call();
        for (var i = 0; err == ErrDeviceBusy && i < 10; i++)
        {
            Thread.Sleep(200);
            EdsGetEvent();
            err = call();
        }
        Check(err, what);
    }

    public void Close()
    {
        if (_cam != IntPtr.Zero)
        {
            EdsCloseSession(_cam);
            Release(ref _cam);
        }
        Release(ref _pending);
        Release(ref _list);
    }

    /// <summary>
    /// AF live view ditahan `AfHold` lalu dilepas di Pump (tidak memblokir thread SDK: live view tetap mengalir).
    /// AF kontras 60D di ruang redup butuh &gt; 1,2 dtk; dilepas lebih cepat = lensa berhenti di tengah (W-034).
    /// </summary>
    private static readonly TimeSpan AfHold = TimeSpan.FromSeconds(3);
    private DateTime? _afOffAt;

    private void AfOff()
    {
        if (_afOffAt is null) return;
        _afOffAt = null;
        EdsSendCommand(_cam, CmdDoEvfAf, 0);
    }

    public void Pump()
    {
        EdsGetEvent();
        if (_afOffAt is { } t && DateTime.UtcNow >= t) AfOff();
    }

    public byte[] Capture(TimeSpan timeout)
    {
        AfOff();
        Release(ref _pending);
        EdsSendCommand(_cam, CmdExtendShutDownTimer, 0);
        var deadline = DateTime.UtcNow + timeout;
        uint err;
        // Kamera sibuk (mis. baru selesai AF) → coba lagi sebentar.
        while ((err = EdsSendCommand(_cam, CmdTakePicture, 0)) == ErrDeviceBusy && DateTime.UtcNow < deadline)
            Thread.Sleep(100);
        Check(err, "jepret");
        while (_pending == IntPtr.Zero)
        {
            if (!IsOpen) throw new CameraFailure("camera_disconnected", "kamera terputus saat jepret");
            if (DateTime.UtcNow > deadline) throw new CameraFailure("capture_timeout", "kamera tidak mengirim foto");
            EdsGetEvent();
            Thread.Sleep(20);
        }
        var item = _pending;
        _pending = IntPtr.Zero;
        try
        {
            Check(EdsGetDirectoryItemInfo(item, out var info), "info file");
            Check(EdsCreateMemoryStream(info.Size, out var stream), "stream");
            try
            {
                Check(EdsDownload(item, info.Size, stream), "unduh");
                Check(EdsDownloadComplete(item), "selesai unduh");
                return Bytes(stream);
            }
            finally { EdsRelease(stream); }
        }
        finally { EdsRelease(item); }
    }

    /// <summary>
    /// Sistem koordinat live view, dibaca dari frame EVF (seperti contoh EDSDK). 60D menolaknya dari objek kamera
    /// (`0x00000050` PROPERTIES_UNAVAILABLE, uji 2026-09-29), jadi disimpan saat frame pertama diunduh.
    /// </summary>
    private Size? _evfSys;

    public void SetLiveView(bool on)
    {
        if (!on) AfOff();
        if (on) _evfSys = null;
        var device = on ? EvfOutputDevicePc : 0;
        Check(EdsSetPropertyData(_cam, PropEvfOutputDevice, 0, sizeof(uint), ref device), "live view");
    }

    public byte[]? LiveViewFrame()
    {
        Check(EdsCreateMemoryStream(0, out var stream), "stream live view");
        try
        {
            Check(EdsCreateEvfImageRef(stream, out var evf), "frame live view");
            try
            {
                var err = EdsDownloadEvfImage(_cam, evf);
                if (err == ErrObjectNotReady) return null;
                Check(err, "unduh frame live view");
                if (_evfSys is null && EdsGetPropertyData(evf, PropEvfCoordinateSystem, 0, 8, out Size sys) == 0 && sys.Width > 0)
                    _evfSys = sys;
                return Bytes(stream);
            }
            finally { EdsRelease(evf); }
        }
        finally { EdsRelease(stream); }
    }

    public void FocusAt(double x, double y)
    {
        var sys = _evfSys
            ?? (EdsGetPropertyData(_cam, PropEvfCoordinateSystem, 0, 8, out Size cam) == 0 && cam.Width > 0
                ? cam
                : throw new CameraFailure("focus_unavailable", "koordinat live view belum ada; tunggu live view tampil"));
        // Posisi = sudut kiri-atas area zoom/AF live view (±1/5 frame): digeser supaya titik ketuk di tengahnya.
        int Pos(double v, int size) => Math.Clamp((int)(v * size - size / 10.0), 0, size - size / 5);
        var p = new Point { X = Pos(x, sys.Width), Y = Pos(y, sys.Height) };
        Check(EdsSetPropertyData(_cam, PropEvfZoomPosition, 0, 8, ref p), "posisi AF");
        // Dibaca balik: kamera bisa membulatkan/menolak posisi (bukti area AF benar-benar pindah, #114).
        var got = EdsGetPropertyData(_cam, PropEvfZoomPosition, 0, 8, out Point back) == 0 ? $"{back.X},{back.Y}" : "?";
        Console.WriteLine($"[canon] fokus ketuk {x:0.00},{y:0.00} → posisi {p.X},{p.Y} (dibaca {got}) dari {sys.Width}×{sys.Height}");
        Focus("af");
    }

    public void Focus(string step)
    {
        if (step == "af")
        {
            // Seperti menekan rana setengah: AF nyala, dilepas oleh Pump setelah AfHold.
            AfOff();
            var mode = EdsGetPropertyData(_cam, PropEvfAFMode, 0, sizeof(uint), out uint m) == 0
                ? m switch { 0 => "Quick", 1 => "Live", 2 => "Live wajah", 3 => "Live multi", _ => $"0x{m:X}" }
                : "?";
            Check(EdsSendCommand(_cam, CmdDoEvfAf, 1), "AF");
            _afOffAt = DateTime.UtcNow + AfHold;
            Console.WriteLine($"[canon] AF live view (mode AF: {mode})");
            return;
        }
        if (!Drive.TryGetValue(step, out var code)) throw new CameraFailure("bad_focus", $"langkah fokus '{step}' tidak dikenal");
        Check(EdsSendCommand(_cam, CmdDriveLensEvf, code), "fokus manual");
    }

    public uint GetProp(uint propId)
    {
        Check(EdsGetPropertyData(_cam, propId, 0, sizeof(uint), out uint v), "baca setelan");
        return v;
    }

    public uint[] PropOptions(uint propId)
    {
        Check(EdsGetPropertyDesc(_cam, propId, out var d), "pilihan setelan");
        return d.PropDesc.Take(Math.Clamp(d.NumElements, 0, 128)).Select(x => (uint)x).ToArray();
    }

    public void SetProp(uint propId, uint value)
    {
        uint busy = 0;
        uint err;
        // Kamera sibuk sesaat (mis. sedang mengirim frame) → coba lagi sebentar.
        while ((err = EdsSetPropertyData(_cam, propId, 0, sizeof(uint), ref value)) == ErrDeviceBusy && busy++ < 10)
            Thread.Sleep(50);
        Check(err, "ubah setelan");
    }

    private uint OnObject(uint inEvent, IntPtr inRef, IntPtr _)
    {
        if (inEvent == ObjectEventDirItemRequestTransfer)
        {
            Release(ref _pending);
            _pending = inRef; // dilepas setelah diunduh
        }
        else if (inRef != IntPtr.Zero) EdsRelease(inRef);
        return ErrOk;
    }

    private uint OnState(uint inEvent, uint __, IntPtr _)
    {
        if (inEvent == StateEventShutdown) Close(); // dicabut / dimatikan → CanonCamera menyambung ulang
        else if (inEvent == StateEventWillSoonShutDown && IsOpen) EdsSendCommand(_cam, CmdExtendShutDownTimer, 0);
        return ErrOk;
    }

    private static byte[] Bytes(IntPtr stream)
    {
        Check(EdsGetPointer(stream, out var p), "pointer");
        Check(EdsGetLength(stream, out var len), "panjang");
        var b = new byte[len];
        Marshal.Copy(p, b, 0, (int)len);
        return b;
    }

    private static void Release(ref IntPtr r)
    {
        if (r == IntPtr.Zero) return;
        EdsRelease(r);
        r = IntPtr.Zero;
    }

    public void Dispose()
    {
        Close();
        if (_sdk) EdsTerminateSDK();
        _sdk = false;
    }
}
