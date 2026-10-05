using TetraCamera.HotFolder;

namespace TetraCamera.Sony;

/// <summary>
/// Kamera Sony lewat Camera Remote Command (PTP, DECISIONS #169). Semua panggilan transport (termasuk COM WPD) jalan di
/// satu thread: sambung + handshake (ulang tiap <c>reconnect</c> kalau kamera tidak ada/dicabut) lalu polling status
/// SDIO_GetAllExtDevicePropInfo tiap <c>pollEvery</c>, yang sekaligus mendeteksi kabel dicabut.
/// S1: tersambung + model saja; jepret, live view, fokus, dan setelan menyusul (docs/PLAN-SONY.md S2–S4).
/// </summary>
public sealed class SonyCamera : ICameraSource, IDisposable
{
    /// <summary>Thread kamera tanpa detak selama ini = panggilan transport macet (lihat CanonCamera.StuckAfter).</summary>
    public static readonly TimeSpan StuckAfter = TimeSpan.FromSeconds(20);

    private readonly IPtpTransport _t;
    private readonly Thread _thread;
    private readonly TimeSpan _reconnect, _pollEvery, _stuckAfter;
    private volatile bool _stop;
    private long _beat = Environment.TickCount64;
    private volatile SonySession? _session;
    private volatile PropSet? _status;

    /// <summary>Kamera tersambung (true) / terputus (false); dipanggil dari thread kamera.</summary>
    public event Action<bool>? ConnectionChanged;

    public SonyCamera(IPtpTransport transport, TimeSpan? reconnect = null, TimeSpan? pollEvery = null, TimeSpan? stuckAfter = null)
    {
        _t = transport;
        _reconnect = reconnect ?? TimeSpan.FromSeconds(2);
        _pollEvery = pollEvery ?? TimeSpan.FromMilliseconds(200);
        _stuckAfter = stuckAfter ?? StuckAfter;
        _thread = new Thread(Loop) { IsBackground = true, Name = "sony-ptp" };
        _thread.Start();
    }

    public string Brand => "sony";
    public string Id => "sony";
    public bool Connected => _session is not null;
    public string? Model => _session?.Device.Model;
    public string Serial => _session?.Device.Serial ?? "";
    /// <summary>Profil protokol yang dipakai (v2/v3); null = belum tersambung.</summary>
    public string? Profile => _session?.Profile.Name;
    /// <summary>Hasil polling terakhir (properti per kode).</summary>
    public PropSet? Status => _status;
    public byte[]? LatestFrame => null;
    public bool Stuck => Environment.TickCount64 - Interlocked.Read(ref _beat) > _stuckAfter.TotalMilliseconds;

    private void Loop()
    {
        var nextTry = DateTime.MinValue;
        var nextPoll = DateTime.MinValue;
        var pollFailing = false;
        while (!_stop)
        {
            Interlocked.Exchange(ref _beat, Environment.TickCount64);
            Thread.Sleep(5);
            var now = DateTime.UtcNow;
            if (!_t.IsOpen)
            {
                if (_session is not null)
                {
                    _session = null;
                    _status = null;
                    Console.WriteLine("[sony] kamera terputus, menyambung ulang");
                    ConnectionChanged?.Invoke(false);
                }
                if (now < nextTry) continue;
                nextTry = now + _reconnect;
                try
                {
                    if (!_t.Open()) continue;
                    var s = SonyProtocol.Connect(_t, log: m => Console.WriteLine($"[sony] {m}"));
                    _session = s;
                    nextPoll = now;
                    Console.WriteLine($"[sony] tersambung: {s.Device.Model} ({s.Profile.Name})");
                    ConnectionChanged?.Invoke(true);
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine($"[sony] sambung gagal: {e.Message}");
                    try { _t.Close(); } catch { /* dicoba lagi */ }
                }
            }
            else if (now >= nextPoll)
            {
                nextPoll = now + _pollEvery;
                try
                {
                    _status = SonyProtocol.Poll(_t);
                    pollFailing = false;
                }
                catch (Exception e) when (e is PtpError or FormatException)
                {
                    // Kamera menjawab tapi sibuk/datanya aneh: tetap tersambung, dicatat sekali sampai pulih.
                    if (!pollFailing) Console.Error.WriteLine($"[sony] status gagal dibaca: {e.Message}");
                    pollFailing = true;
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine($"[sony] transport gagal: {e.Message}");
                    try { _t.Close(); } catch { /* sudah putus */ }
                }
            }
        }
    }

    private static CameraFailure NotYet(string what) =>
        new("not_supported", $"{what} kamera Sony belum didukung di versi ini");

    public Task<CaptureResult> CaptureAsync(string outputDir, int index, CancellationToken ct = default) =>
        Task.FromException<CaptureResult>(Connected
            ? NotYet("Jepret")
            : new CameraFailure("camera_disconnected", "kamera Sony belum tersambung"));

    public Task<bool> StartLiveViewAsync() => Task.FromResult(false);
    public Task StopLiveViewAsync() => Task.CompletedTask;
    public Task<bool> FocusAsync(string step) => Task.FromResult(false);
    public Task<bool> FocusAtAsync(double x, double y) => Task.FromResult(false);
    public Task<IReadOnlyList<CameraProp>> PropsAsync() => Task.FromResult<IReadOnlyList<CameraProp>>([]);
    public Task SetPropAsync(string name, string value) => Task.FromException(NotYet("Setelan"));

    public void Dispose()
    {
        _stop = true;
        _thread.Join(TimeSpan.FromSeconds(3));
        try { _t.Dispose(); } catch { /* keluar */ }
    }
}
