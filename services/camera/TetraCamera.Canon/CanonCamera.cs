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
    private static readonly HashSet<string> Steps = ["af", "near1", "near2", "near3", "far1", "far2", "far3"];

    private readonly ICanonDriver _driver;
    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private readonly TimeSpan _reconnect, _frameEvery;
    private volatile bool _live, _stop;
    private volatile byte[]? _frame;
    private (string Model, string Serial)? _info;
    /// <summary>ISO jepret (#113); null = sama dengan live view.</summary>
    private volatile string? _isoCapture;
    /// <summary>File setelan crew (nama → label); dipasang ulang tiap kamera tersambung (#113).</summary>
    private readonly string? _settingsPath;
    private readonly Dictionary<string, string> _saved;

    /// <summary>Kamera tersambung (true) / terputus (false); dipanggil dari thread SDK.</summary>
    public event Action<bool>? ConnectionChanged;

    public CanonCamera(
        ICanonDriver driver,
        TimeSpan? reconnect = null,
        TimeSpan? frameEvery = null,
        string? settingsPath = null)
    {
        _settingsPath = settingsPath;
        _saved = Load(settingsPath);
        if (_saved.TryGetValue(CanonProps.IsoCapture.Name, out var ic)) _isoCapture = ic;
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

    private void Loop()
    {
        var nextTry = DateTime.MinValue;
        var nextFrame = DateTime.MinValue;
        while (!_stop)
        {
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
                    if (_live) _driver.SetLiveView(true);
                }
                catch (Exception e) { Console.Error.WriteLine($"[canon] sambung gagal: {e.Message}"); }
            }
            else if (_live && now >= nextFrame)
            {
                nextFrame = now + _frameEvery;
                try { if (_driver.LiveViewFrame() is { } f) _frame = f; }
                catch (Exception e) { Console.Error.WriteLine($"[canon] frame live view gagal: {e.Message}"); }
            }
        }
    }

    /// <summary>Jalankan di thread SDK.</summary>
    private Task<T> Run<T>(Func<T> f)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _queue.Add(() =>
        {
            try { tcs.SetResult(f()); }
            catch (Exception e) { tcs.SetException(e); }
        });
        return tcs.Task;
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

    /// <summary>Jepret; kalau ISO jepret beda dari ISO live view, tukar sebentar lalu kembalikan (flash, #113).</summary>
    private byte[] CaptureWithIso()
    {
        var label = _isoCapture;
        uint? want = label is null
            ? null
            : CanonProps.IsoCapture.Values.Where(kv => kv.Value == label).Select(kv => (uint?)kv.Key).FirstOrDefault();
        uint live = 0;
        var swap = want is { } w && w != CanonProps.SameAsLive && (live = _driver.GetProp(CanonProps.IsoProp)) != w;
        if (swap) _driver.SetProp(CanonProps.IsoProp, want!.Value);
        try { return _driver.Capture(CaptureTimeout); }
        finally { if (swap) _driver.SetProp(CanonProps.IsoProp, live); }
    }

    public async Task<bool> StartLiveViewAsync()
    {
        _live = true;
        if (Connected) await Run(() => { _driver.SetLiveView(true); return 0; });
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

    /// <summary>Setelan yang terbaca (mode dial yang mengunci satu setelan = opsinya kosong, tetap ditampilkan).</summary>
    public async Task<IReadOnlyList<CameraProp>> PropsAsync()
    {
        if (!Connected) return [];
        var capture = new CameraProp(
            CanonProps.IsoCapture.Name,
            CanonProps.IsoCapture.Label,
            _isoCapture ?? CanonProps.SameAsLiveLabel,
            []);
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
        // ISO jepret memakai pilihan ISO yang sama dengan kamera, ditambah "Sama dengan live view".
        if (list.FirstOrDefault(p => p.Name == "iso") is { } iso)
            list.Insert(1, capture with { Options = [CanonProps.SameAsLiveLabel, .. iso.Options] });
        return list;
    }

    public async Task SetPropAsync(string name, string value)
    {
        // ISO jepret tidak dikirim ke kamera saat diubah: boleh diset kapan saja.
        if (name == CanonProps.IsoCapture.Name)
        {
            if (!CanonProps.IsoCapture.Values.Values.Contains(value))
                throw new CameraFailure("bad_prop", $"nilai '{value}' tidak dikenal untuk ISO jepret");
            _isoCapture = value == CanonProps.SameAsLiveLabel ? null : value;
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
        if (name == CanonProps.IsoCapture.Name) return; // virtual, dipakai saat jepret
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
