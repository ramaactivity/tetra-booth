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
        var host = SaveToHost;
        Check(EdsSetPropertyData(_cam, PropSaveTo, 0, sizeof(uint), ref host), "SaveTo host");
        // Kamera perlu tahu "sisa ruang" di host sebelum mau mengirim file (SaveTo_Host).
        Check(EdsSetCapacity(_cam, new Capacity { NumberOfFreeClusters = 0x7FFFFFFF, BytesPerSector = 0x1000, Reset = 1 }), "kapasitas");
        return (info.DeviceDescription, info.PortName);
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

    public void Pump() => EdsGetEvent();

    public byte[] Capture(TimeSpan timeout)
    {
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

    public void SetLiveView(bool on)
    {
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
                return Bytes(stream);
            }
            finally { EdsRelease(evf); }
        }
        finally { EdsRelease(stream); }
    }

    public void Focus(string step)
    {
        if (step == "af")
        {
            // AF selama ±1 dtk, lalu dilepas (seperti menekan setengah lalu melepas tombol rana).
            Check(EdsSendCommand(_cam, CmdDoEvfAf, 1), "AF");
            var until = DateTime.UtcNow.AddMilliseconds(1200);
            while (DateTime.UtcNow < until)
            {
                EdsGetEvent();
                Thread.Sleep(30);
            }
            EdsSendCommand(_cam, CmdDoEvfAf, 0);
            return;
        }
        if (!Drive.TryGetValue(step, out var code)) throw new CameraFailure("bad_focus", $"langkah fokus '{step}' tidak dikenal");
        Check(EdsSendCommand(_cam, CmdDriveLensEvf, code), "fokus manual");
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
