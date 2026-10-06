using System.Collections.Concurrent;
using System.Text.Json;
using TetraCamera.HotFolder;

namespace TetraCamera.Canon;

/// <summary>
/// Kamera Canon lewat EDSDK (TSD §2.1, DECISIONS #111). EDSDK tidak thread-safe: semua panggilan driver berjalan di
/// satu thread khusus yang juga memompa event, menyambung ulang tiap <c>reconnect</c> kalau kamera tidak ada/dicabut,
/// dan (saat live view nyala) mengambil frame terbaru ±30 fps ke <see cref="LatestFrame"/>.
/// </summary>
public sealed class CanonCamera : ICameraSource, IDisposable
{
    public static readonly TimeSpan CaptureTimeout = TimeSpan.FromSeconds(10);
    /// <summary>
    /// Thread SDK tanpa detak selama ini = macet (mis. OpenSession 60D yang sibuk tidak pernah kembali, 2026-09-30).
    /// Operasi terlama yang wajar: jepret (10 s) atau sambung dengan coba ulang BUSY (±2 s).
    /// </summary>
    public static readonly TimeSpan StuckAfter = TimeSpan.FromSeconds(20);
    /// <summary>Batas tunggu perintah di antrean thread SDK: booth menerima error, bukan menunggu selamanya.</summary>
    public static readonly TimeSpan CommandTimeout = CaptureTimeout + TimeSpan.FromSeconds(5);
    private static readonly HashSet<string> Steps = ["af", "near1", "near2", "near3", "far1", "far2", "far3"];

    private readonly ICanonDriver _driver;
    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private readonly TimeSpan _reconnect, _frameEvery;
    /// <summary>Live view diminta tapi tanpa frame selama ini → EVF dinyalakan ulang (maks. sekali per selang ini).</summary>
    private static readonly TimeSpan EvfRetry = TimeSpan.FromSeconds(2);
    /// <summary>
    /// Terakhir ada frame / terakhir EVF dinyalakan (thread SDK). 60D kadang mengabaikan EVF yang dinyalakan tepat
    /// setelah sambung ulang (cabut-colok USB saat live view, W-034): frame tidak pernah siap sampai layar dibuka ulang.
    /// </summary>
    private DateTime _evfOnAt, _frameAt;
    private volatile bool _live, _stop;
    /// <summary>Detak thread SDK (Environment.TickCount64), diperbarui tiap putaran loop.</summary>
    private long _beat = Environment.TickCount64;
    private readonly TimeSpan _stuckAfter, _commandTimeout;
    private volatile byte[]? _frame;
    private (string Model, string Serial)? _info;
    /// <summary>ISO jepret (#113) & shutter jepret: nama setelan → label; tidak ada = sama dengan live view.</summary>
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _atCapture = new();
    /// <summary>File setelan crew (nama → label); dipasang ulang tiap kamera tersambung (#113).</summary>
    private readonly string? _settingsPath;
    private readonly Dictionary<string, string> _saved;

    /// <summary>Kamera tersambung (true) / terputus (false); dipanggil dari thread SDK.</summary>
    public event Action<bool>? ConnectionChanged;

    public CanonCamera(
        ICanonDriver driver,
        TimeSpan? reconnect = null,
        TimeSpan? frameEvery = null,
        string? settingsPath = null,
        TimeSpan? stuckAfter = null,
        TimeSpan? commandTimeout = null)
    {
        _stuckAfter = stuckAfter ?? StuckAfter;
        _commandTimeout = commandTimeout ?? CommandTimeout;
        _settingsPath = settingsPath;
        _saved = Load(settingsPath);
        foreach (var o in CanonProps.CaptureOverrides)
            if (_saved.TryGetValue(o.Name, out var v) && v != CanonProps.SameAsLiveLabel) _atCapture[o.Name] = v;
        _driver = driver;
        _reconnect = reconnect ?? TimeSpan.FromSeconds(2);
        _frameEvery = frameEvery ?? TimeSpan.FromMilliseconds(33);
        _thread = new Thread(Loop) { IsBackground = true, Name = "edsdk" };
        _thread.Start();
    }

    public string Brand => "canon";
    public string Id => "canon";
    public bool Connected => _info is not null;
    public string? Model => _info?.Model;
    public string Serial => _info?.Serial ?? "";
    public byte[]? LatestFrame => _live ? _frame : null;
    public bool CanFocusAt => Connected;
    public bool Stuck => Environment.TickCount64 - Interlocked.Read(ref _beat) > _stuckAfter.TotalMilliseconds;

    private void Loop()
    {
        var nextTry = DateTime.MinValue;
        var nextFrame = DateTime.MinValue;
        while (!_stop)
        {
            Interlocked.Exchange(ref _beat, Environment.TickCount64);
            if (_queue.TryTake(out var work, 5)) work();
            try { if (_driver.IsOpen) _driver.Pump(); } catch { /* event gagal diambil: dicek lagi putaran berikutnya */ }
            var now = DateTime.UtcNow;
            if (!_driver.IsOpen)
            {
                if (_info is not null)
                {
                    _info = null;
                    _frame = null;
                    Console.WriteLine("[canon] kamera terputus, menyambung ulang");
                    ConnectionChanged?.Invoke(false);
                }
                if (now < nextTry) continue;
                nextTry = now + _reconnect;
                try
                {
                    var info = _driver.Open();
                    if (info is null) continue;
                    _info = info;
                    Console.WriteLine($"[canon] tersambung: {info.Value.Model}");
                    foreach (var (name, value) in _saved)
                    {
                        try { ApplyProp(name, value); }
                        catch (Exception e) { Console.Error.WriteLine($"[canon] setelan {name}={value} tidak dipasang: {e.Message}"); }
                    }
                    ConnectionChanged?.Invoke(true);
                    if (_live)
                    {
                        _driver.SetLiveView(true);
                        _evfOnAt = _frameAt = DateTime.UtcNow;
                    }
                }
                catch (Exception e) { Console.Error.WriteLine($"[canon] sambung gagal: {e.Message}"); }
            }
            else if (_live && now >= nextFrame)
            {
                nextFrame = now + _frameEvery;
                try
                {
                    if (_driver.LiveViewFrame() is { } f)
                    {
                        _frame = f;
                        _frameAt = now;
                    }
                    else if (now - _frameAt > EvfRetry && now - _evfOnAt > EvfRetry)
                    {
                        _evfOnAt = now;
                        Console.WriteLine("[canon] live view tanpa frame, EVF dinyalakan ulang");
                        _driver.SetLiveView(true);
                    }
                }
                catch (Exception e) { Console.Error.WriteLine($"[canon] frame live view gagal: {e.Message}"); }
            }
        }
    }

    /// <summary>Jalankan di thread SDK; tidak dijawab dalam <c>commandTimeout</c> = error "kamera tidak menjawab".</summary>
    private async Task<T> Run<T>(Func<T> f)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _queue.Add(() =>
        {
            try { tcs.SetResult(f()); }
            catch (Exception e) { tcs.SetException(e); }
        });
        try { return await tcs.Task.WaitAsync(_commandTimeout); }
        catch (TimeoutException)
        {
            throw new CameraFailure("camera_stuck", "kamera Canon tidak menjawab; matikan lalu nyalakan kamera");
        }
    }

    private void RequireConnected()
    {
        if (!Connected) throw new CameraFailure("camera_disconnected", "kamera Canon belum tersambung");
    }

    public async Task<CaptureResult> CaptureAsync(string outputDir, int index, CancellationToken ct = default)
    {
        RequireConnected();
        var bytes = await Run(CaptureWithIso).WaitAsync(ct);
        var dims = JpegInfo.ReadSize(new MemoryStream(bytes))
            ?? throw new CameraFailure("capture_unreadable", "kamera mengirim file yang bukan JPEG (set kualitas ke JPEG)");
        Directory.CreateDirectory(outputDir);
        var dst = Path.Combine(outputDir, $"{index + 1}.jpg");
        await File.WriteAllBytesAsync(dst, bytes, ct);
        return new CaptureResult(dst, dims.Width, dims.Height);
    }

    /// <summary>
    /// Jepret; ISO/shutter jepret yang beda dari live view ditukar sebentar lalu dikembalikan (flash #113, shutter W-034).
    /// </summary>
    private byte[] CaptureWithIso()
    {
        var restore = new List<(uint Prop, uint Live)>();
        try
        {
            foreach (var o in CanonProps.CaptureOverrides)
            {
                if (!_atCapture.TryGetValue(o.Name, out var label)) continue;
                var want = o.Values.Where(kv => kv.Value == label).Select(kv => (uint?)kv.Key).FirstOrDefault();
                if (want is not { } w || w == CanonProps.SameAsLive) continue;
                var live = _driver.GetProp(o.PropId);
                if (live == w) continue;
                _driver.SetProp(o.PropId, w);
                restore.Add((o.PropId, live));
            }
            return _driver.Capture(CaptureTimeout);
        }
        finally
        {
            for (var i = restore.Count - 1; i >= 0; i--) _driver.SetProp(restore[i].Prop, restore[i].Live);
        }
    }

    public async Task<bool> StartLiveViewAsync()
    {
        _live = true;
        if (Connected) await Run(() => { _driver.SetLiveView(true); _evfOnAt = _frameAt = DateTime.UtcNow; return 0; });
        return true;
    }

    public async Task StopLiveViewAsync()
    {
        _live = false;
        _frame = null;
        if (Connected) await Run(() => { _driver.SetLiveView(false); return 0; });
    }

    public async Task<bool> FocusAsync(string step)
    {
        if (!Steps.Contains(step)) throw new CameraFailure("bad_focus", $"langkah fokus '{step}' tidak dikenal");
        RequireConnected();
        await Run(() => { _driver.Focus(step); return 0; });
        return true;
    }

    public async Task<bool> FocusAtAsync(double x, double y)
    {
        if (x is < 0 or > 1 || y is < 0 or > 1) throw new CameraFailure("bad_focus", "titik fokus harus 0–1");
        RequireConnected();
        await Run(() => { _driver.FocusAt(x, y); return 0; });
        return true;
    }

    /// <summary>Setelan yang terbaca (mode dial yang mengunci satu setelan = opsinya kosong, tetap ditampilkan).</summary>
    public async Task<IReadOnlyList<CameraProp>> PropsAsync()
    {
        if (!Connected) return [];
        var list = await Run(() => CanonProps.All.Select(d =>
        {
            try
            {
                var v = _driver.GetProp(d.PropId);
                var opts = _driver.PropOptions(d.PropId).Where(d.Values.ContainsKey).Select(o => d.Values[o]).ToArray();
                return new CameraProp(d.Name, d.Label, d.Values.GetValueOrDefault(v, $"0x{v:X}"), opts);
            }
            catch (CameraFailure) { return null; }
        }).OfType<CameraProp>().ToList());
        // ISO/shutter jepret memakai pilihan kamera yang sama, ditambah "Sama dengan live view", tepat di bawahnya.
        foreach (var o in CanonProps.CaptureOverrides)
        {
            var i = list.FindIndex(p => p.Name == CanonProps.All.First(d => d.PropId == o.PropId).Name);
            if (i < 0) continue;
            list.Insert(i + 1, new CameraProp(
                o.Name,
                o.Label,
                _atCapture.GetValueOrDefault(o.Name, CanonProps.SameAsLiveLabel),
                [CanonProps.SameAsLiveLabel, .. list[i].Options]));
        }
        // Baterai: hanya dibaca (tanpa pilihan), terbaca tiap sheet crew dibuka. 0xFFFFFFFF = adaptor AC.
        try
        {
            var level = await Run(() => _driver.GetProp(Edsdk.PropBatteryLevel));
            list.Add(new CameraProp("battery", "Baterai", level > 100 ? "Adaptor AC" : $"{level}%", []));
        }
        catch (CameraFailure) { /* model tanpa info baterai */ }
        return list;
    }

    public async Task SetPropAsync(string name, string value)
    {
        // ISO/shutter jepret tidak dikirim ke kamera saat diubah: boleh diset kapan saja.
        if (CanonProps.CaptureOverrides.FirstOrDefault(o => o.Name == name) is { } ov)
        {
            if (!ov.Values.Values.Contains(value))
                throw new CameraFailure("bad_prop", $"nilai '{value}' tidak dikenal untuk {ov.Label}");
            if (value == CanonProps.SameAsLiveLabel) _atCapture.TryRemove(name, out _);
            else _atCapture[name] = value;
            Save(name, value);
            return;
        }
        RequireConnected();
        await Run(() => { ApplyProp(name, value); return 0; });
        Save(name, value);
    }

    /// <summary>Pasang satu setelan ke kamera (thread SDK). Label tak dikenal = CameraFailure.</summary>
    private void ApplyProp(string name, string value)
    {
        if (CanonProps.CaptureOverrides.Any(o => o.Name == name)) return; // virtual, dipakai saat jepret
        var d = CanonProps.All.FirstOrDefault(x => x.Name == name)
            ?? throw new CameraFailure("bad_prop", $"setelan '{name}' tidak dikenal");
        var code = d.Values.Where(kv => kv.Value == value).Select(kv => (uint?)kv.Key).FirstOrDefault()
            ?? throw new CameraFailure("bad_prop", $"nilai '{value}' tidak dikenal untuk {d.Label}");
        _driver.SetProp(d.PropId, code);
    }

    private static Dictionary<string, string> Load(string? path)
    {
        try
        {
            return path is not null && File.Exists(path)
                ? JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(path)) ?? []
                : [];
        }
        catch (Exception e) when (e is IOException or JsonException) { return []; }
    }

    private void Save(string name, string value)
    {
        lock (_saved)
        {
            _saved[name] = value;
            if (_settingsPath is null) return;
            try { File.WriteAllText(_settingsPath, JsonSerializer.Serialize(_saved)); }
            catch (IOException e) { Console.Error.WriteLine($"[canon] setelan tidak tersimpan: {e.Message}"); }
        }
    }

    public void Dispose()
    {
        _stop = true;
        _thread.Join(TimeSpan.FromSeconds(3));
        try { _driver.Dispose(); } catch { /* keluar */ }
    }
}
