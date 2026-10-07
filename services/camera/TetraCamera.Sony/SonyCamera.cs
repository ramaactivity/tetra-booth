using System.Collections.Concurrent;
using System.Text.Json;
using TetraCamera.HotFolder;
using static TetraCamera.Sony.SonyProps;

namespace TetraCamera.Sony;

/// <summary>
/// Kamera Sony lewat Camera Remote Command (PTP, DECISIONS #169/#171). Pola sama dengan CanonCamera: semua panggilan
/// transport (termasuk COM WPD) jalan di satu thread yang mengambil perintah dari antrean, menyambung ulang tiap
/// <c>reconnect</c>, polling SDIO_GetAllExtDevicePropInfo tiap <c>pollEvery</c> (status + deteksi cabut), dan saat live
/// view nyala mengambil frame 0xFFFFC002 maks. 30 fps. Profil v2/v3 tidak bercabang di sini: cara mengubah setelan
/// (nilai absolut / langkah) dan fitur (tap-to-focus, near/far, kartu, panas) dibaca dari dataset kamera itu sendiri.
/// </summary>
public sealed class SonyCamera : ICameraSource, IDisposable
{
    public static readonly TimeSpan CaptureTimeout = TimeSpan.FromSeconds(10);
    /// <summary>Thread kamera tanpa detak selama ini = panggilan transport macet (lihat CanonCamera.StuckAfter).</summary>
    public static readonly TimeSpan StuckAfter = TimeSpan.FromSeconds(20);
    /// <summary>S1 ditahan maks. selama ini menunggu Focus Indication; MF / kontras rendah tetap dijepret.</summary>
    public static readonly TimeSpan FocusWait = TimeSpan.FromMilliseconds(1500);
    /// <summary>Device_Busy (0x2019) diulang sekian kali × 100 ms sebelum menyerah.</summary>
    private const int BusyTries = 10;
    /// <summary>Setelan baru ditunggu muncul di dataset maks. selama ini (ms).</summary>
    private const int SettleMs = 1500;
    private static readonly HashSet<string> Steps = ["af", "near1", "near2", "near3", "far1", "far2", "far3"];
    /// <summary>Near/Far (INT16 −7…7). Negatif = dekat: diverifikasi di bodi (W-039).</summary>
    private static readonly Dictionary<string, short> NearFarSteps =
        new() { ["near1"] = -1, ["near2"] = -3, ["near3"] = -7, ["far1"] = 1, ["far2"] = 3, ["far3"] = 7 };

    private readonly IPtpTransport _t;
    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private readonly TimeSpan _reconnect, _pollEvery, _frameEvery, _stuckAfter, _commandTimeout, _captureTimeout;
    private volatile bool _stop, _live;
    private long _beat = Environment.TickCount64;
    private volatile SonySession? _session;
    private volatile PropSet? _status;
    private volatile byte[]? _frame;
    /// <summary>Kenapa belum tersambung (pesan crew), null = tidak ada masalah.</summary>
    private volatile string? _problem;
    /// <summary>GetObjectInfo(0xFFFFC002) sudah dipanggil untuk sesi live view ini (thread kamera).</summary>
    private bool _liveInfo;
    private readonly string? _settingsPath;
    private readonly Dictionary<string, string> _saved;

    /// <summary>Kamera tersambung (true) / terputus (false); dipanggil dari thread kamera.</summary>
    public event Action<bool>? ConnectionChanged;

    public SonyCamera(
        IPtpTransport transport,
        TimeSpan? reconnect = null,
        TimeSpan? pollEvery = null,
        TimeSpan? stuckAfter = null,
        string? settingsPath = null,
        TimeSpan? frameEvery = null,
        TimeSpan? commandTimeout = null,
        TimeSpan? captureTimeout = null)
    {
        _t = transport;
        _captureTimeout = captureTimeout ?? CaptureTimeout;
        _reconnect = reconnect ?? TimeSpan.FromSeconds(2);
        _pollEvery = pollEvery ?? TimeSpan.FromMilliseconds(200);
        // Sony: maks. 30 fps, GetObject live view tidak boleh lebih rapat dari 33 ms.
        _frameEvery = frameEvery is { } f && f > TimeSpan.FromMilliseconds(33) ? f : TimeSpan.FromMilliseconds(33);
        _stuckAfter = stuckAfter ?? StuckAfter;
        _commandTimeout = commandTimeout ?? _captureTimeout + TimeSpan.FromSeconds(5);
        _settingsPath = settingsPath;
        _saved = Load(settingsPath);
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
    public byte[]? LatestFrame => _live ? _frame : null;
    public bool Stuck => Environment.TickCount64 - Interlocked.Read(ref _beat) > _stuckAfter.TotalMilliseconds;
    /// <summary>Tap-to-focus: hanya bodi yang mengiklankan kontrol AF Area Position (v3; A7 II/III tidak).</summary>
    public bool CanFocusAt => _session?.Ext.Controls.Contains(AfAreaPosition) == true;
    /// <summary>Pesan crew kenapa kamera belum tersambung (null = tersambung / belum dicoba).</summary>
    public string? Problem => _problem;

    private void Loop()
    {
        var nextTry = DateTime.MinValue;
        var nextPoll = DateTime.MinValue;
        var nextFrame = DateTime.MinValue;
        var failing = false;
        while (!_stop)
        {
            Interlocked.Exchange(ref _beat, Environment.TickCount64);
            if (_queue.TryTake(out var work, 5)) work();
            var now = DateTime.UtcNow;
            if (!_t.IsOpen)
            {
                if (_session is not null)
                {
                    _session = null;
                    _status = null;
                    _frame = null;
                    _problem = "kamera Sony terputus (kabel USB / kamera mati atau tidur)";
                    Console.WriteLine("[sony] kamera terputus, menyambung ulang");
                    ConnectionChanged?.Invoke(false);
                }
                if (now < nextTry) continue;
                nextTry = now + _reconnect;
                if (Connect()) nextPoll = nextFrame = DateTime.UtcNow;
                continue;
            }
            try
            {
                if (now >= nextPoll)
                {
                    nextPoll = now + _pollEvery;
                    Poll();
                }
                if (_live && now >= nextFrame)
                {
                    nextFrame = now + _frameEvery;
                    Frame();
                }
                failing = false;
            }
            catch (Exception e) when (e is PtpError or FormatException or CameraFailure)
            {
                // Kamera menjawab tapi sibuk/datanya aneh: tetap tersambung, dicatat sekali sampai pulih.
                if (!failing) Console.Error.WriteLine($"[sony] status/live view gagal dibaca: {e.Message}");
                failing = true;
            }
            catch (Exception e) { Drop(e); }
        }
    }

    /// <summary>Buka + handshake + siapkan kamera. false = belum bisa (alasan di <see cref="Problem"/>).</summary>
    private bool Connect()
    {
        try
        {
            if (!_t.Open())
            {
                _problem ??= "kamera Sony tidak terdeteksi: nyalakan kamera, USB Connection = PC Remote, kabel langsung ke laptop";
                return false;
            }
            var s = SonyProtocol.Connect(_t, log: m => Console.WriteLine($"[sony] {m}"));
            _session = s;
            _liveInfo = false;
            Prepare(s);
            _problem = null;
            Console.WriteLine($"[sony] tersambung: {s.Device.Model} ({s.Profile.Name})");
            ConnectionChanged?.Invoke(true);
            return true;
        }
        catch (Exception e)
        {
            _session = null;
            _problem = e switch
            {
                PtpError { Code: Ptp.OperationNotSupported } or SonyRejected =>
                    "kamera Sony menolak remote: atur USB Connection ke PC Remote (A7 IV ke atas: PC Remote Function = On)",
                PtpError { Code: Ptp.DeviceBusy } => "kamera Sony sedang dipakai aplikasi lain: tutup Imaging Edge / aplikasi tether",
                _ => $"kamera Sony gagal tersambung: {e.Message}",
            };
            Console.Error.WriteLine($"[sony] sambung gagal: {e.Message}");
            try { _t.Close(); } catch { /* dicoba lagi */ }
            return false;
        }
    }

    /// <summary>
    /// v3: Position Key = PC Remote (kembali 0 tiap sesi ditutup, jadi dipasang tiap sambung) & live view kualitas High.
    /// Lalu setelan crew yang tersimpan dipasang ulang (#113).
    /// </summary>
    private void Prepare(SonySession s)
    {
        var st = Poll();
        foreach (var (code, value) in new[] { (PositionKey, 0x01L), (LiveViewQuality, 0x02L) })
        {
            if (st.Props.TryGetValue(code, out var p) && p.Settable && p.Current != value)
            {
                try { SetValue(p, value); }
                catch (PtpError e) { Console.Error.WriteLine($"[sony] 0x{code:X4} tidak dipasang: {e.Message}"); }
            }
        }
        KeyValuePair<string, string>[] saved;
        lock (_saved) saved = [.. _saved];
        foreach (var (name, value) in saved)
        {
            try { ApplyProp(name, value); }
            catch (Exception e) when (e is CameraFailure or PtpError)
            {
                Console.Error.WriteLine($"[sony] setelan {name}={value} tidak dipasang: {e.Message}");
            }
        }
    }

    /// <summary>Panggilan transport gagal (perangkat hilang): tutup, loop menyambung ulang.</summary>
    private void Drop(Exception e)
    {
        Console.Error.WriteLine($"[sony] transport gagal: {e.Message}");
        try { _t.Close(); } catch { /* sudah putus */ }
    }

    private PropSet Poll() => _status = SonyProp.ParseAll(Call(Ptp.SdioGetAllExtDevicePropInfo, [], read: true).Data);

    private static long? Value(PropSet st, ushort code) => st.Props.TryGetValue(code, out var p) ? p.Current : null;

    /// <summary>Satu frame live view (thread kamera). 0x200F = frame belum baru, 0x2009 = live view belum siap.</summary>
    private void Frame()
    {
        if (_status is not { } st || Value(st, LiveViewStatus) != 0x01)
        {
            _liveInfo = false;
            return;
        }
        if (!_liveInfo)
        {
            // Sekali per sesi live view (saran Sony untuk performa); ukurannya perkiraan terburuk, tidak dipakai.
            if (!_t.Execute(Ptp.GetObjectInfo, [Ptp.LiveViewHandle], read: true).Ok) return;
            _liveInfo = true;
        }
        var r = _t.Execute(Ptp.GetObject, [Ptp.LiveViewHandle], read: true);
        if (r.Code is Ptp.AccessDenied) return;
        if (r.Code is Ptp.InvalidObjectHandle)
        {
            _liveInfo = false;
            return;
        }
        if (!r.Ok) throw new PtpError(Ptp.GetObject, r.Code);
        if (SonyProtocol.LiveViewJpeg(r.Data) is { } jpeg) _frame = jpeg;
    }

    /// <summary>Jalankan operasi; Device_Busy diulang, 0xA106 = error kamera, lainnya <see cref="PtpError"/>.</summary>
    private PtpResponse Call(ushort op, uint[] args, bool read = false, byte[]? write = null)
    {
        for (var i = 0; ; i++)
        {
            var r = _t.Execute(op, args, read, write);
            if (r.Ok) return r;
            if (r.Code == Ptp.DeviceBusy && i + 1 < BusyTries)
            {
                Thread.Sleep(100);
                continue;
            }
            throw r.Code switch
            {
                Ptp.DeviceBusy => new CameraFailure("camera_busy",
                    "Kamera Sony sibuk. Tutup Imaging Edge / aplikasi lain, tunggu kamera selesai menyimpan, lalu coba lagi."),
                Ptp.CameraStatusError => new CameraFailure("camera_error",
                    "Kamera Sony melapor error. Cek pesan di layar kamera."),
                _ => new PtpError(op, r.Code),
            };
        }
    }

    private void Control(ushort code, ushort type, long value) =>
        Call(Ptp.SdioControlDevice, [code], write: new PtpWriter().Value(type, value).ToArray());

    private void SetValue(SonyProp p, long value) =>
        Call(Ptp.SdioSetExtDevicePropValue, [p.Code], write: new PtpWriter().Value(p.DataType, value).ToArray());

    /// <summary>Jalankan di thread kamera; tidak dijawab dalam <c>commandTimeout</c> = error "kamera tidak menjawab".</summary>
    private async Task<T> Run<T>(Func<T> f)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _queue.Add(() =>
        {
            if (_session is null)
            {
                tcs.SetException(Disconnected());
                return;
            }
            try { tcs.SetResult(f()); }
            catch (IOException e)
            {
                Drop(e);
                tcs.SetException(new CameraFailure("camera_disconnected", "kamera Sony terputus saat dipakai (kabel USB / kamera mati)"));
            }
            catch (PtpError e) { tcs.SetException(new CameraFailure("camera_rejected", $"kamera Sony menolak perintah ({e.Message})")); }
            catch (Exception e) { tcs.SetException(e); }
        });
        try { return await tcs.Task.WaitAsync(_commandTimeout); }
        catch (TimeoutException)
        {
            throw new CameraFailure("camera_stuck", "kamera Sony tidak menjawab; matikan lalu nyalakan kamera");
        }
    }

    private CameraFailure Disconnected() =>
        new("camera_disconnected", _problem is { } p ? $"kamera Sony belum tersambung: {p}" : "kamera Sony belum tersambung");

    private void RequireConnected()
    {
        if (!Connected) throw Disconnected();
    }

    // ---------- Jepret (S2) ----------

    public async Task<CaptureResult> CaptureAsync(string outputDir, int index, CancellationToken ct = default)
    {
        RequireConnected();
        var bytes = await Run(Shoot).WaitAsync(ct);
        var dims = JpegInfo.ReadSize(new MemoryStream(bytes))
            ?? throw new CameraFailure("capture_unreadable", "kamera mengirim file yang bukan JPEG (set format file ke JPEG)");
        Directory.CreateDirectory(outputDir);
        var dst = Path.Combine(outputDir, $"{index + 1}.jpg");
        await File.WriteAllBytesAsync(dst, bytes, ct);
        return new CaptureResult(dst, dims.Width, dims.Height);
    }

    /// <summary>
    /// S1 Down → tunggu fokus → S2 Down → S2 Up → S1 Up (urutan wajib Sony), lalu polling Shooting File Info sampai
    /// file siap (bit 0x8000) dan unduh 0xFFFFC001 berulang sampai kosong: JPEG pertama dipakai, RAW/HEIF dibuang.
    /// File sisa sebelum jepret (jepret manual di kamera, RAW yang belum diambil) dibuang dulu supaya foto tidak tertukar.
    /// </summary>
    private byte[] Shoot()
    {
        var st = Poll();
        Guard(st);
        for (var n = 0; Ready(st) > 0 && n < 20; n++, st = Poll())
            Console.WriteLine($"[sony] file lama di buffer dibuang: {Download().Info.FileName}");
        var t0 = DateTime.UtcNow;
        try
        {
            Control(S1, 0x0004, Down);
            WaitFocus();
            Control(S2, 0x0004, Down);
            Control(S2, 0x0004, Up);
        }
        finally
        {
            try { Control(S1, 0x0004, Up); } catch (Exception e) when (e is PtpError or CameraFailure) { /* sudah dilepas */ }
        }
        var deadline = DateTime.UtcNow + _captureTimeout;
        byte[]? jpeg = null;
        var files = 0;
        while (true)
        {
            st = Poll();
            if (Ready(st) > 0 && files < 10)
            {
                files++;
                var (info, data) = Download();
                if (info.IsJpeg && jpeg is null) jpeg = data;
                else Console.WriteLine($"[sony] {info.FileName} (format 0x{info.Format:X4}) dibuang, hanya JPEG yang dipakai");
                continue;
            }
            if (files > 0) break;
            if (DateTime.UtcNow > deadline)
                throw new CameraFailure("capture_timeout",
                    "kamera Sony tidak mengirim foto. Cek Still Img. Save Dest. = PC Only / PC+Camera, lensa terpasang, dan fokus.");
            Thread.Sleep(50);
        }
        Console.WriteLine($"[sony] jepret → file {(DateTime.UtcNow - t0).TotalMilliseconds:0} ms");
        return jpeg ?? throw new CameraFailure("capture_unreadable",
            "kamera Sony hanya mengirim RAW. Set File Format ke JPEG (atau RAW+J PC Save Img = JPEG Only).");
    }

    /// <summary>File yang siap diambil (Shooting File Info: bit 0x8000 = siap, sisanya jumlah).</summary>
    private static int Ready(PropSet st) => Value(st, ShootingFileInfo) is { } v && (v & 0x8000) != 0 ? (int)(v & 0x7FFF) : 0;

    private (PtpObjectInfo Info, byte[] Data) Download()
    {
        var info = PtpObjectInfo.Parse(Call(Ptp.GetObjectInfo, [Ptp.ShotHandle], read: true).Data);
        return (info, Call(Ptp.GetObject, [Ptp.ShotHandle], read: true).Data);
    }

    /// <summary>Tolak jepret yang pasti gagal dengan pesan crew: kamera panas/error, simpan ke kartu tanpa kartu yang sehat.</summary>
    private static void Guard(PropSet st)
    {
        if (Value(st, Overheating) == 0x02)
            throw new CameraFailure("camera_overheated",
                "Kamera Sony terlalu panas. Matikan kamera ±10 menit di tempat teduh, lalu nyalakan lagi.");
        if (Value(st, CameraError) == 0x02)
            throw new CameraFailure("camera_error", "Kamera Sony melapor error. Cek pesan di layar kamera.");
        var dest = Value(st, SaveDestination) ?? SaveToPc;
        if (dest == SaveToCard)
            throw new CameraFailure("save_to_card",
                "Kamera Sony menyimpan ke kartu saja, foto tidak dikirim ke laptop. Ubah Still Img. Save Dest. ke PC Only.");
        if ((dest & SaveToCard) == 0) return; // PC saja: kartu tidak dipakai
        if (Value(st, MediaStatus) is { } card && SonyProps.CardProblem(card) is { } bad)
            throw new CameraFailure(bad.Code, bad.Message);
        if (Value(st, MediaShots) == 0)
            throw new CameraFailure("card_full",
                "Kartu memori kamera penuh. Ganti kartu, atau ubah Still Img. Save Dest. ke PC Only di menu kamera.");
    }

    /// <summary>Tahan S1 sampai Focus Indication terkunci/gagal (AF-S 0x02/0x03, AF-C 0x06/0x07) atau batas waktu.</summary>
    private long? WaitFocus()
    {
        var end = DateTime.UtcNow + FocusWait;
        while (true)
        {
            var f = Value(Poll(), FocusIndication);
            if (f is null or 0x02 or 0x03 or 0x06 or 0x07 || DateTime.UtcNow > end) return f;
            Thread.Sleep(50);
        }
    }

    // ---------- Live view (S3) ----------

    /// <summary>Sony mengirim live view terus selama PC Remote; start/stop hanya menyalakan pengambilan frame.</summary>
    public Task<bool> StartLiveViewAsync()
    {
        _live = true;
        return Task.FromResult(true);
    }

    public Task StopLiveViewAsync()
    {
        _live = false;
        _frame = null;
        return Task.CompletedTask;
    }

    // ---------- Fokus & setelan (S4) ----------

    public async Task<bool> FocusAsync(string step)
    {
        if (!Steps.Contains(step)) throw new CameraFailure("bad_focus", $"langkah fokus '{step}' tidak dikenal");
        RequireConnected();
        return await Run(() =>
        {
            if (step == "af")
            {
                HalfPress();
                return true;
            }
            if (_session?.Ext.Controls.Contains(NearFar) != true) return false;
            if (Value(Poll(), NearFarEnabled) is { } on && on != 0x01)
                throw new CameraFailure("focus_mf_only", "Geser fokus hanya bisa saat kamera di mode fokus MF");
            Control(NearFar, 0x0003, NearFarSteps[step]);
            return true;
        });
    }

    /// <summary>
    /// Tap-to-focus (v3): titik 0–1 di frame → AF Area Position (x 0–639 di 2 byte atas, y 0–479 di 2 byte bawah), lalu AF.
    /// Mode area kamera harus Spot / Expand Flexible Spot (CHECKLIST-EVENT). Bodi tanpa kontrol ini = false (UI menyembunyikan).
    /// </summary>
    public async Task<bool> FocusAtAsync(double x, double y)
    {
        if (x is < 0 or > 1 || y is < 0 or > 1) throw new CameraFailure("bad_focus", "titik fokus harus 0–1");
        RequireConnected();
        if (!CanFocusAt) return false;
        return await Run(() =>
        {
            Control(AfAreaPosition, 0x0006, AfPoint(x, y));
            HalfPress();
            return true;
        });
    }

    /// <summary>Titik 0–1 → nilai AF Area Position (kontrol 0xD2DC).</summary>
    public static long AfPoint(double x, double y) =>
        ((long)Math.Round(x * 639) << 16) | (long)Math.Round(y * 479);

    private void HalfPress()
    {
        try
        {
            Control(S1, 0x0004, Down);
            WaitFocus();
        }
        finally { Control(S1, 0x0004, Up); }
    }

    /// <summary>
    /// Setelan untuk sheet crew: ISO/shutter/aperture/WB/EV dengan pilihan kalau bisa diubah dari PC (nilai absolut
    /// atau langkah), selain itu hanya dibaca. Ditambah status yang hanya dibaca: baterai, simpan ke, kartu, suhu.
    /// </summary>
    public async Task<IReadOnlyList<CameraProp>> PropsAsync()
    {
        if (!Connected) return [];
        return await Run(() =>
        {
            var st = Poll();
            var list = new List<CameraProp>();
            foreach (var d in All)
            {
                if (!st.Props.TryGetValue(d.Code, out var p)) continue;
                string[] opts = HowToSet(p) == How.ReadOnly ? [] : [.. Options(p).Select(d.Format).Distinct()];
                list.Add(new CameraProp(d.Name, d.Label, p.Enabled == 0 ? "" : d.Format(p.Current), opts));
            }
            if (Value(st, Battery) is { } b)
                list.Add(new CameraProp("battery", "Baterai", b < 0 ? "—" : b <= 10 ? $"{b}% (lemah, ganti baterai)" : $"{b}%", []));
            if (Value(st, SaveDestination) is { } dest)
                list.Add(new CameraProp("savedest", "Simpan foto ke", SaveLabel(dest), []));
            if (Value(st, MediaStatus) is { } card)
            {
                var shots = Value(st, MediaShots);
                list.Add(new CameraProp("card", "Kartu memori",
                    SonyProps.CardProblem(card) is { } bad ? bad.Code == "card_missing" ? "Tidak ada kartu" : "Error / terkunci"
                        : shots is { } n ? $"OK, sisa {n} foto" : "OK", []));
            }
            if (Value(st, Overheating) is { } heat and > 0)
                list.Add(new CameraProp("heat", "Suhu kamera", heat >= 2 ? "Terlalu panas" : "Mulai panas", []));
            return (IReadOnlyList<CameraProp>)list;
        });
    }

    public async Task SetPropAsync(string name, string value)
    {
        RequireConnected();
        await Run(() =>
        {
            ApplyProp(name, value);
            return 0;
        });
        Save(name, value);
    }

    private enum How { ReadOnly, Absolute, Step }

    /// <summary>
    /// GetSet = 1 → SDIO_SetExtDevicePropValue nilai absolut (v3, juga WB di v2). Hanya-baca tapi bodi punya kontrol
    /// berkode sama → langkah notch lewat SDIO_ControlDevice (v2: ISO/shutter/F/EV). Selain itu diatur di kamera.
    /// </summary>
    private How HowToSet(SonyProp p) =>
        p.Enabled != 0x01 ? How.ReadOnly
        : p.Settable ? How.Absolute
        : _session?.Ext.Controls.Contains(p.Code) == true ? How.Step
        : How.ReadOnly;

    private static long[] Options(SonyProp p) => p.SetValues.Length > 0 ? p.SetValues : p.GetSetValues;

    /// <summary>Pasang satu setelan (thread kamera), lalu tunggu dataset menunjukkan nilai baru.</summary>
    private void ApplyProp(string name, string value)
    {
        var d = All.FirstOrDefault(x => x.Name == name)
            ?? throw new CameraFailure("bad_prop", $"setelan '{name}' tidak dikenal");
        var p = Poll().Props.GetValueOrDefault(d.Code)
            ?? throw new CameraFailure("not_supported", $"{d.Label} tidak ada di kamera ini");
        var opts = Options(p);
        var target = opts.Cast<long?>().FirstOrDefault(v => d.Format(v!.Value) == value)
            ?? throw new CameraFailure("bad_prop", $"nilai '{value}' tidak dikenal untuk {d.Label}");
        if (p.Current == target) return;
        switch (HowToSet(p))
        {
            case How.ReadOnly:
                throw new CameraFailure("not_supported", $"{d.Label} hanya bisa diubah di kamera (dial / menu)");
            case How.Absolute:
                SetValue(p, target);
                if (Settle(d.Code, target) != target)
                    throw new CameraFailure("prop_rejected", $"kamera tidak memakai {d.Label} {value}: putar dial mode ke M lalu coba lagi");
                return;
            default:
                // ponytail: selisih indeks di daftar enum = jumlah notch (urutan daftar = urutan dial); diverifikasi W-040.
                for (var round = 0; round < 10; round++)
                {
                    var i = Array.IndexOf(opts, p.Current);
                    var j = Array.IndexOf(opts, target);
                    if (i < 0) throw new CameraFailure("prop_rejected", $"{d.Label} kamera di luar daftar, atur di kamera");
                    Control(d.Code, 0x0001, Math.Clamp(j - i, -127, 127));
                    var now = Settle(d.Code, target, p.Current);
                    if (now == target) return;
                    if (now == p.Current)
                        throw new CameraFailure("prop_rejected", $"kamera tidak menerima perubahan {d.Label}: atur di kamera");
                    p = p with { Current = now ?? p.Current };
                }
                throw new CameraFailure("prop_rejected", $"{d.Label} tidak sampai ke {value}, atur di kamera");
        }
    }

    /// <summary>Polling sampai nilai = <paramref name="target"/> atau berubah dari <paramref name="from"/>, maks. SettleMs.</summary>
    private long? Settle(ushort code, long target, long? from = null)
    {
        var end = DateTime.UtcNow.AddMilliseconds(SettleMs);
        while (true)
        {
            var v = Value(Poll(), code);
            if (v == target || (from is not null && v != from) || DateTime.UtcNow > end) return v;
            Thread.Sleep(50);
        }
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
            catch (IOException e) { Console.Error.WriteLine($"[sony] setelan tidak tersimpan: {e.Message}"); }
        }
    }

    public void Dispose()
    {
        _stop = true;
        _thread.Join(TimeSpan.FromSeconds(3));
        try { _t.Dispose(); } catch { /* keluar */ }
    }
}
