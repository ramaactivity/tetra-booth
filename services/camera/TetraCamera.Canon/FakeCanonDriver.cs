using TetraCamera.HotFolder;

namespace TetraCamera.Canon;

/// <summary>
/// Kamera Canon palsu (`--canon fake`): jepret & live view memakai JPEG contoh 1200×800, untuk dev/e2e di Mac
/// dan unit test. <see cref="Plugged"/> = false mensimulasikan kamera dicabut.
/// </summary>
public sealed class FakeCanonDriver : ICanonDriver
{
    public static readonly byte[] Jpeg = Load();
    private static byte[] Load()
    {
        using var s = typeof(FakeCanonDriver).Assembly.GetManifestResourceStream("TetraCamera.Canon.fake.jpg")!;
        using var m = new MemoryStream();
        s.CopyTo(m);
        return m.ToArray();
    }

    public volatile bool Plugged = true;
    public bool LiveView { get; private set; }
    public List<string> FocusSteps { get; } = [];
    public int Captures { get; private set; }
    private bool _open;

    /// <summary>Seperti EDSDK: kamera dicabut = sesi tertutup (harus Open lagi setelah dicolok).</summary>
    public bool IsOpen
    {
        get
        {
            if (!Plugged) _open = false;
            return _open;
        }
    }

    public (string Model, string Serial)? Open()
    {
        if (!Plugged) return null;
        _open = true;
        return ("Canon EOS Simulasi", "fake-usb");
    }

    public void Close() => _open = false;
    public void Pump() { }

    public byte[] Capture(TimeSpan timeout)
    {
        if (!IsOpen) throw new CameraFailure("camera_disconnected", "kamera terputus saat jepret");
        Captures++;
        return Jpeg;
    }

    public void SetLiveView(bool on) => LiveView = on;
    public byte[]? LiveViewFrame() => LiveView && IsOpen ? Jpeg : null;
    public void Focus(string step) => FocusSteps.Add(step);
    public void Dispose() => Close();
}
