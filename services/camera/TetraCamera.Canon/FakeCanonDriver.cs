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
    /// <summary>Jepret tertahan selama ini (ms): meniru panggilan EDSDK yang tidak kembali.</summary>
    public volatile int HangMs;
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
        if (HangMs > 0) Thread.Sleep(HangMs);
        if (!IsOpen) throw new CameraFailure("camera_disconnected", "kamera terputus saat jepret");
        Captures++;
        IsoAtCapture.Add(Props[0x402]);
        ShutterAtCapture.Add(Props[0x406]);
        return Jpeg;
    }

    /// <summary>Jepretan rana fotografer yang menunggu diambil (uji Photo Stage #178).</summary>
    public volatile int PendingShots;
    public byte[]? TakeUnsolicited()
    {
        if (PendingShots <= 0 || !IsOpen) return null;
        PendingShots--;
        return Jpeg;
    }

    public void SetLiveView(bool on) => LiveView = on;
    public byte[]? LiveViewFrame() => LiveView && IsOpen ? Jpeg : null;
    public void Focus(string step) => FocusSteps.Add(step);
    public void FocusAt(double x, double y) => FocusSteps.Add($"at {x:0.00},{y:0.00}");

    /// <summary>Setelan kamera palsu: ISO 100, 1/125, f/5.6, Auto; beberapa pilihan per setelan.</summary>
    public Dictionary<uint, uint> Props { get; } =
        new() { [0x402] = 0x48, [0x406] = 0x70, [0x405] = 0x30, [0x106] = 0, [0x100] = 0x0013FF0F, [Edsdk.PropBatteryLevel] = 80 };
    /// <summary>ISO yang terpasang tepat saat tiap jepret (uji ISO jepret #113).</summary>
    public List<uint> IsoAtCapture { get; } = [];
    public List<uint> ShutterAtCapture { get; } = [];
    private static readonly Dictionary<uint, uint[]> Options = new()
    {
        [0x402] = [0x48, 0x50, 0x58, 0x60, 0x68],
        [0x406] = [0x60, 0x68, 0x70, 0x78, 0x80],
        [0x405] = [0x20, 0x28, 0x30, 0x38, 0x40],
        [0x106] = [0, 1, 2, 3, 8],
        [0x100] = [0x0013FF0F, 0x0113FF0F, 0x0213FF0F, 0x0E13FF0F],
    };
    public uint GetProp(uint propId) => Props[propId];
    public uint[] PropOptions(uint propId) => Options[propId];
    public void SetProp(uint propId, uint value) => Props[propId] = value;
    public void Dispose() => Close();
}
