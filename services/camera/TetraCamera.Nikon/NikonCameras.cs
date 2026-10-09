using TetraCamera.Canon;
using TetraCamera.HotFolder;

namespace TetraCamera.Nikon;

/// <summary>
/// Pilih jalur Nikon untuk kamera yang tercolok (DECISIONS #216): bodi yang punya modul MAID klasik → <see cref="NikonDriver"/>
/// (Windows 10/11), selain itu (Z6III, Zf, Z30, Zfc, Z5II, Z50II, ZR) → Remote SDK v2 <see cref="NikonZDriver"/>
/// (Windows 11). Keduanya membawa NkdPTP.dll berbeda versi dan satu proses hanya memuat satu: jalur yang pertama
/// tersambung dipakai sampai Camera Service dimulai ulang (ganti keluarga kamera = buka ulang booth).
/// </summary>
public sealed class NikonCameras(ICanonDriver? classic, Func<ICanonDriver>? z) : ICanonDriver
{
    private ICanonDriver? _active;
    private ICanonDriver? _z;
    private bool _zFailed;

    private ICanonDriver Active => _active ?? throw new CameraFailure("camera_disconnected", "kamera Nikon belum tersambung");

    public bool IsOpen => _active?.IsOpen ?? false;

    public (string Model, string Serial)? Open()
    {
        if (_active is { } a) return a.Open();
        if (classic?.Open() is { } info)
        {
            _active = classic;
            return info;
        }
        if (z is null || _zFailed) return null;
        try
        {
            _z ??= z();
            if (_z.Open() is not { } zi) return null;
            _active = _z;
            return zi;
        }
        catch (CameraFailure e)
        {
            // Remote SDK v2 butuh Windows 11 + VC++ 2022; gagal mulai = jangan coba tiap 2 detik.
            _zFailed = true;
            Console.Error.WriteLine($"[nikon] Remote SDK v2 tidak dipakai: {e.Message}");
            return null;
        }
    }

    public void Close() => _active?.Close();
    public void Pump() => _active?.Pump();
    public byte[] Capture(TimeSpan timeout) => Active.Capture(timeout);
    public byte[]? TakeUnsolicited() => _active?.TakeUnsolicited();
    public void SetLiveView(bool on) => Active.SetLiveView(on);
    public byte[]? LiveViewFrame() => _active?.LiveViewFrame();
    public void Focus(string step) => Active.Focus(step);
    public void FocusAt(double x, double y) => Active.FocusAt(x, y);
    public uint GetProp(uint propId) => Active.GetProp(propId);
    public uint[] PropOptions(uint propId) => Active.PropOptions(propId);
    public void SetProp(uint propId, uint value) => Active.SetProp(propId, value);

    public void Dispose()
    {
        classic?.Dispose();
        _z?.Dispose();
    }
}
