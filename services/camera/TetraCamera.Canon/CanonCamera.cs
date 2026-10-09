using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using TetraCamera.HotFolder;

namespace TetraCamera.Canon;

/// <summary>
/// Kamera lewat DLL SDK pabrikan: Canon EDSDK (TSD §2.1, DECISIONS #111) dan Panasonic Lumix (#214, <see cref="DriverKind"/>).
/// SDK tidak thread-safe: semua panggilan driver berjalan di
/// satu thread khusus yang juga memompa event, menyambung ulang tiap <c>reconnect</c> kalau kamera tidak ada/dicabut,
/// dan (saat live view nyala) mengambil frame terbaru ±30 fps ke <see cref="LatestFrame"/>.
/// </summary>
public sealed class CanonCamera : ICameraSource, IDisposable
{
    /// <summary>
    /// Batas jepret di driver. Total terburuk: override ±2 s + jepret 8 s + restore ±1 s + antre = di bawah
    /// <see cref="CommandTimeout"/> (13 s) dan batas tunggu booth, jadi crew selalu melihat pesan yang jelas.
    /// </summary>
    public static readonly TimeSpan CaptureTimeout = TimeSpan.FromSeconds(8);
    /// <summary>Total waktu menukar ISO/shutter jepret sebelum rana (lebih = dilewati, foto pakai setelan live view).</summary>
    private static readonly TimeSpan OverrideBudget = TimeSpan.FromSeconds(1.5);
    /// <summary>Setelan live view yang belum berhasil dikembalikan setelah jepret (prop → nilai), thread SDK.</summary>
    private readonly Dictionary<uint, uint> _restore = [];
    private readonly Dictionary<uint, int> _restoreFails = [];
    private DateTime _nextRestore;
    /// <summary>Pengembalian yang ditolak terus (mis. dial Auto mengunci ISO) berhenti dicoba setelah ini.</summary>
    private const int RestoreTries = 10;
    /// <summary>
    /// Thread SDK tanpa detak selama ini = macet (mis. OpenSession 60D yang sibuk tidak pernah kembali, 2026-09-30).
    /// Operasi terlama yang wajar: jepret (10 s) atau sambung dengan coba ulang BUSY (±2 s).
    /// </summary>
    public static readonly TimeSpan StuckAfter = TimeSpan.FromSeconds(20);
    /// <summary>Batas tunggu perintah di antrean thread SDK: booth menerima error, bukan menunggu selamanya.</summary>
    public static readonly TimeSpan CommandTimeout = CaptureTimeout + TimeSpan.FromSeconds(5);
    private static readonly HashSet<string> Steps = ["af", "near1", "near2", "near3", "far1", "far2", "far3"];

    private readonly ICanonDriver _driver;
    private readonly DriverKind _kind;
    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private readonly TimeSpan _reconnect, _frameEvery;
    /// <summary>Live view diminta tapi tanpa frame selama ini → EVF dinyalakan ulang (maks. sekali per selang ini).</summary>
    private static readonly TimeSpan EvfRetry = TimeSpan.FromSeconds(2);
    /// <summary>
    /// Kamera dimatikan tanpa event shutdown (lapangan 9 Okt): live view gagal terus selama ini, atau cek ringan
    /// (baca satu setelan tiap <see cref="ProbeEvery"/> saat live view mati) gagal dua kali → sesi ditutup, status
    /// "terputus", dan loop menyambung ulang seperti kabel dicabut.
    /// </summary>
    private static readonly TimeSpan DeadAfter = TimeSpan.FromSeconds(6);
    private static readonly TimeSpan ProbeEvery = TimeSpan.FromSeconds(3);
    private DateTime _failSince = DateTime.MaxValue, _nextProbe;
    private int _probeFails;
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
    private volatile Tuple<string, string>? _info;
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
        TimeSpan? commandTimeout = null,
        DriverKind? kind = null)
    {
        _kind = kind ?? DriverKind.Canon;
        _stuckAfter = stuckAfter ?? StuckAfter;
        _commandTimeout = commandTimeout ?? CommandTimeout;
        _settingsPath = settingsPath;
        _saved = Load(settingsPath);
        foreach (var o in _kind.CaptureOverrides)
            if (_saved.TryGetValue(o.Name, out var v) && v != CanonProps.SameAsLiveLabel) _atCapture[o.Name] = v;
        _driver = driver;
        _reconnect = reconnect ?? TimeSpan.FromSeconds(2);
        _frameEvery = frameEvery ?? TimeSpan.FromMilliseconds(33);
        _thread = new Thread(Loop) { IsBackground = true, Name = "edsdk" };
        _thread.Start();
    }

    public string Brand => _kind.Brand;
    public string Id => _kind.Brand;
    public bool Connected => _info is not null;
    public string? Model => _info?.Item1;
    public string Serial => _info?.Item2 ?? "";
    public byte[]? LatestFrame => _live ? _frame : null;
    public bool CanFocusAt => _kind.FocusAt && Connected;
    public bool Stuck => Environment.TickCount64 - Interlocked.Read(ref _beat) > _stuckAfter.TotalMilliseconds;

    private void Loop()
    {
        var nextTry = DateTime.MinValue;
        var nextFrame = DateTime.MinValue;
        while (!_stop)
        {
            Interlocked.Exchange(ref _beat, Environment.TickCount64);
            if (_queue.TryTake(out var work, 5))
            {
                work();
                // Perintah panjang (jepret 700D) bisa membuat frame/cek gagal sesaat: hitungan "kamera mati" mulai lagi.
                _failSince = DateTime.MaxValue;
                _probeFails = 0;
            }
            try { if (_driver.IsOpen) _driver.Pump(); } catch { /* event gagal diambil: dicek lagi putaran berikutnya */ }
            if (_listen is { } listen && _driver.IsOpen) TakeShot(listen);
            var now = DateTime.UtcNow;
            if (_restore.Count > 0 && _driver.IsOpen && now >= _nextRestore)
            {
                _nextRestore = now + TimeSpan.FromSeconds(1);
                RestoreLive();
            }
            if (!_driver.IsOpen)
            {
                if (_info is not null)
                {
                    _info = null;
                    _frame = null;
                    Console.WriteLine($"[{Brand}] kamera terputus, menyambung ulang");
                    Notify(false);
                }
                if (now < nextTry) continue;
                nextTry = now + _reconnect;
                try
                {
                    var info = _driver.Open();
                    if (info is null) continue;
                    _info = Tuple.Create(info.Value.Model, info.Value.Serial);
                    Console.WriteLine($"[{Brand}] tersambung: {info.Value.Model}");
                    // Salinan di bawah lock: Save (thread HTTP) bisa mengubah _saved bersamaan.
                    KeyValuePair<string, string>[] saved;
                    lock (_saved) saved = [.. _saved];
                    // Pengembalian tertunda tetap berlaku (kamera putus tepat setelah jepret masih di ISO jepret);
                    // setelan tersimpan yang dipasang di bawah membatalkannya untuk setelan itu.
                    foreach (var (name, value) in saved)
                    {
                        try { ApplyProp(name, value); }
                        catch (Exception e) { Console.Error.WriteLine($"[{Brand}] setelan {name}={value} tidak dipasang: {e.Message}"); }
                    }
                    Notify(true);
                    if (_live)
                    {
                        _driver.SetLiveView(true);
                        _evfOnAt = _frameAt = DateTime.UtcNow;
                    }
                }
                catch (Exception e) { Console.Error.WriteLine($"[{Brand}] sambung gagal: {e.Message}"); }
            }
            else if (_live && now >= nextFrame)
            {
                nextFrame = now + _frameEvery;
                try
                {
                    var got = _driver.LiveViewFrame();
                    _failSince = DateTime.MaxValue;
                    if (got is { } f)
                    {
                        _frame = f;
                        _frameAt = now;
                    }
                    else if (now - _frameAt > EvfRetry && now - _evfOnAt > EvfRetry)
                    {
                        _evfOnAt = now;
                        Console.WriteLine($"[{Brand}] live view tanpa frame, EVF dinyalakan ulang");
                        _driver.SetLiveView(true);
                    }
                }
                catch (Exception e)
                {
                    if (_failSince == DateTime.MaxValue)
                    {
                        _failSince = now;
                        Console.Error.WriteLine($"[{Brand}] frame live view gagal: {e.Message}");
                    }
                    else if (now - _failSince > DeadAfter) Lost("live view gagal terus");
                }
            }
            else if (!_live && now >= _nextProbe)
            {
                _nextProbe = now + ProbeEvery;
                try
                {
                    _driver.GetProp(_kind.Props[0].PropId);
                    _probeFails = 0;
                }
                catch (Exception e) when (++_probeFails >= 2) { Lost($"cek kamera gagal: {e.Message}"); }
                catch { /* sekali gagal bisa karena sibuk: dicek lagi berikutnya */ }
            }
        }
        // Berhenti: kembalikan setelan live view lalu tutup SDK di thread ini (EDSDK tidak thread-safe).
        try { if (_driver.IsOpen) RestoreLive(); } catch { /* keluar */ }
        try { _driver.Dispose(); } catch { /* keluar */ }
    }

    /// <summary>Lapor status ke pelanggan; pelanggan yang error tidak boleh mematikan thread SDK.</summary>
    private void Notify(bool connected)
    {
        try { ConnectionChanged?.Invoke(connected); }
        catch (Exception e) { Console.Error.WriteLine($"[{Brand}] pelapor status gagal: {e.Message}"); }
    }

    /// <summary>Thread SDK: kamera tidak lagi menjawab → tutup sesi; putaran berikutnya melapor terputus & menyambung ulang.</summary>
    private void Lost(string why)
    {
        Console.WriteLine($"[{Brand}] kamera tidak merespons ({why}), dianggap terputus");
        _failSince = DateTime.MaxValue;
        _probeFails = 0;
        try { _driver.Close(); } catch { /* sesi memang sudah rusak */ }
    }

    /// <summary>Jalankan di thread SDK; tidak dijawab dalam <c>commandTimeout</c> = error "kamera tidak menjawab".</summary>
    /// <summary>Photo Stage (#178): folder tujuan + penerima jepretan rana fotografer; null = mati (booth).</summary>
    private volatile Tuple<string, Action<CaptureResult>>? _listen;
    private int _shotSeq;

    public void Listen(string? outputDir, Action<CaptureResult>? onShot) =>
        _listen = outputDir is null || onShot is null ? null : Tuple.Create(outputDir, onShot);

    /// <summary>Thread SDK: unduh jepretan yang tidak diminta, simpan, laporkan. Gagal = dicatat, loop jalan terus.</summary>
    private void TakeShot(Tuple<string, Action<CaptureResult>> listen)
    {
        try
        {
            if (_driver.TakeUnsolicited() is not { } bytes) return;
            if (JpegInfo.ReadSize(new MemoryStream(bytes)) is not { } dims)
            {
                Console.Error.WriteLine($"[{Brand}] jepretan stage bukan JPEG (set kualitas ke JPEG), dilewati");
                return;
            }
            Directory.CreateDirectory(listen.Item1);
            var dst = Path.Combine(listen.Item1, $"shot-{DateTime.Now:yyyyMMdd-HHmmss}-{++_shotSeq:D4}.jpg");
            File.WriteAllBytes(dst, bytes);
            listen.Item2(new CaptureResult(dst, dims.Width, dims.Height));
        }
        catch (Exception e) { Console.Error.WriteLine($"[{Brand}] jepretan stage gagal diunduh: {e.Message}"); }
    }

    private async Task<T> Run<T>(Func<T> f, CancellationToken ct = default)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var gone = new StrongBox<int>();
        _queue.Add(() =>
        {
            // Pemanggil sudah menyerah: jangan jepret/ubah setelan diam-diam setelah booth menampilkan error.
            if (Volatile.Read(ref gone.Value) == 1) return;
            try { tcs.SetResult(f()); }
            catch (Exception e) { tcs.SetException(e); }
        });
        try { return await tcs.Task.WaitAsync(_commandTimeout, ct); }
        catch (TimeoutException)
        {
            Volatile.Write(ref gone.Value, 1);
            throw new CameraFailure("camera_stuck", $"kamera {_kind.Name} tidak menjawab; matikan lalu nyalakan kamera");
        }
        catch (OperationCanceledException)
        {
            Volatile.Write(ref gone.Value, 1);
            throw;
        }
    }

    private void RequireConnected()
    {
        if (!Connected) throw new CameraFailure("camera_disconnected", $"kamera {_kind.Name} belum tersambung");
    }

    public async Task<CaptureResult> CaptureAsync(string outputDir, int index, CancellationToken ct = default)
    {
        RequireConnected();
        var bytes = await Run(CaptureWithIso, ct);
        var dims = JpegInfo.ReadSize(new MemoryStream(bytes))
            ?? throw new CameraFailure("capture_unreadable", "kamera mengirim file yang bukan JPEG (set kualitas ke JPEG)");
        Directory.CreateDirectory(outputDir);
        var dst = Path.Combine(outputDir, $"{index + 1}.jpg");
        await File.WriteAllBytesAsync(dst, bytes, ct);
        return new CaptureResult(dst, dims.Width, dims.Height);
    }

    /// <summary>
    /// Jepret; ISO/shutter jepret yang beda dari live view ditukar sebentar (flash #113, shutter W-034). Anggaran waktu
    /// (lapangan 9 Okt, 700D DEVICE_BUSY): penukaran maks. <see cref="OverrideBudget"/> dan sekali coba per setelan,
    /// pengembalian ke setelan live view tidak memblokir (dicoba ulang loop), jadi service selalu menjawab sebelum
    /// batas waktu booth dan crew melihat pesan yang jelas.
    /// </summary>
    private byte[] CaptureWithIso()
    {
        var until = DateTime.UtcNow + OverrideBudget;
        foreach (var o in _kind.CaptureOverrides)
        {
            if (!_atCapture.TryGetValue(o.Name, out var label)) continue;
            var want = o.Values.Where(kv => kv.Value == label).Select(kv => (uint?)kv.Key).FirstOrDefault();
            if (want is not { } w || w == CanonProps.SameAsLive) continue;
            if (!Supported(o.PropId, w))
            {
                Console.WriteLine($"[{Brand}] setelan jepret {o.Name}={label} tidak didukung kamera ini, dilewati");
                continue;
            }
            if (DateTime.UtcNow > until)
            {
                Console.Error.WriteLine($"[{Brand}] setelan jepret {o.Name} dilewati: waktu habis");
                continue;
            }
            try
            {
                var live = _driver.GetProp(o.PropId);
                if (live == w) continue;
                // Kamera menolak (700D: DEVICE_BUSY 0x81 terus, 2026-10-07) → tetap jepret dengan setelan live view.
                if (!TrySet(o.PropId, w, o.Name)) continue;
                // Pengembalian lama masih tertunda = kamera masih di nilai jepret sebelumnya; nilai live asli dipertahankan.
                _restore.TryAdd(o.PropId, live);
            }
            catch (Exception e) { Console.Error.WriteLine($"[{Brand}] setelan jepret {o.Name} dilewati: {e.Message}"); }
        }
        try { return _driver.Capture(CaptureTimeout); }
        finally { RestoreLive(); }
    }

    /// <summary>Thread SDK: kembalikan setelan live view yang ditukar saat jepret; yang ditolak dicoba lagi nanti.</summary>
    private void RestoreLive()
    {
        foreach (var (prop, live) in _restore.ToArray())
        {
            if (TrySet(prop, live, "kembalikan"))
            {
                _restore.Remove(prop);
                _restoreFails.Remove(prop);
            }
            else if ((_restoreFails[prop] = _restoreFails.GetValueOrDefault(prop) + 1) >= RestoreTries)
            {
                Console.Error.WriteLine($"[{Brand}] setelan live view 0x{prop:X} tidak bisa dikembalikan, berhenti mencoba");
                _restore.Remove(prop);
                _restoreFails.Remove(prop);
            }
        }
    }

    /// <summary>Ubah setelan sekali (driver sudah mencoba ulang saat BUSY); gagal = false + log (tidak melempar).</summary>
    private bool TrySet(uint prop, uint value, string what)
    {
        try
        {
            _driver.SetProp(prop, value);
            return true;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"[{Brand}] setelan jepret {what} dilewati: {e.Message}");
            return false;
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
        if (!_kind.FocusAt) return false;
        RequireConnected();
        await Run(() => { _driver.FocusAt(x, y); return 0; });
        return true;
    }

    /// <summary>Setelan yang terbaca (mode dial yang mengunci satu setelan = opsinya kosong, tetap ditampilkan).</summary>
    public async Task<IReadOnlyList<CameraProp>> PropsAsync()
    {
        if (!Connected) return [];
        var list = await Run(() => _kind.Props.Select(d =>
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
        foreach (var o in _kind.CaptureOverrides)
        {
            var i = list.FindIndex(p => p.Name == _kind.Props.First(d => d.PropId == o.PropId).Name);
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
            if (_kind.BatteryProp is not { } battery) return list;
            var level = await Run(() => _driver.GetProp(battery));
            list.Add(new CameraProp("battery", "Baterai", level > 100 ? "Adaptor AC" : $"{level}%", []));
        }
        catch (CameraFailure) { /* model tanpa info baterai */ }
        return list;
    }

    public async Task SetPropAsync(string name, string value)
    {
        // ISO/shutter jepret tidak dikirim ke kamera saat diubah: boleh diset kapan saja.
        if (_kind.CaptureOverrides.FirstOrDefault(o => o.Name == name) is { } ov)
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
        if (_kind.CaptureOverrides.Any(o => o.Name == name)) return; // virtual, dipakai saat jepret
        var d = _kind.Props.FirstOrDefault(x => x.Name == name)
            ?? throw new CameraFailure("bad_prop", $"setelan '{name}' tidak dikenal");
        var code = d.Values.Where(kv => kv.Value == value).Select(kv => (uint?)kv.Key).FirstOrDefault()
            ?? throw new CameraFailure("bad_prop", $"nilai '{value}' tidak dikenal untuk {d.Label}");
        // Setelan tersimpan dari kamera lain (ISO 12800 700D di 60D, lapangan 9 Okt): kamera menjawab DEVICE_BUSY, bukan
        // NOT_SUPPORTED, jadi dilewati sebelum dikirim.
        if (!Supported(d.PropId, code))
        {
            Console.WriteLine($"[{Brand}] setelan {name}={value} tidak didukung kamera ini, dilewati");
            return;
        }
        _driver.SetProp(d.PropId, code);
        // Pilihan crew menang atas pengembalian setelan jepret yang tertunda (jangan ditimpa 1 s kemudian).
        _restore.Remove(d.PropId);
        _restoreFails.Remove(d.PropId);
    }


    /// <summary>Kode ada di pilihan kamera saat ini? Daftar kosong / gagal dibaca = dianggap didukung (dicoba saja).</summary>
    private bool Supported(uint prop, uint code)
    {
        try
        {
            var o = _driver.PropOptions(prop);
            return o.Length == 0 || o.Contains(code);
        }
        catch { return true; }
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
            catch (IOException e) { Console.Error.WriteLine($"[{Brand}] setelan tidak tersimpan: {e.Message}"); }
        }
    }

    public void Dispose()
    {
        _stop = true;
        // Loop menutup SDK sendiri; jepret yang sedang jalan bisa ±12 s. Tidak selesai = keluar tanpa memanggil SDK
        // dari thread ini (EDSDK tidak thread-safe, bisa crash native).
        if (!_thread.Join(CommandTimeout))
            Console.Error.WriteLine($"[{Brand}] thread kamera belum berhenti, SDK tidak ditutup");
    }
}
