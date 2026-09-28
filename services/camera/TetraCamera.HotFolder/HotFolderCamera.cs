namespace TetraCamera.HotFolder;

/// <summary>Capture gagal berkode (dipetakan ke balasan `error` WebSocket).</summary>
public sealed class CameraFailure(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public sealed record CaptureResult(string Path, int Width, int Height);

/// <summary>
/// Fallback kamera lewat folder (TSD §2.3): software lain (mis. EOS Utility) menyimpan JPEG ke folder ini,
/// dan setiap capture mengambil JPEG pertama yang muncul sejak capture diminta (toleransi <see cref="Grace"/>).
/// ponytail: folder dipindai tiap 100 ms, bukan FileSystemWatcher (yang bisa kehilangan event dan berbeda
/// perilaku antar OS). Cukup untuk folder berisi puluhan file; ganti ke watcher kalau foldernya ribuan file.
/// </summary>
public sealed class HotFolderCamera : ICameraSource
{
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(10);
    /// <summary>File yang tersimpan sesaat sebelum capture diminta tetap dihitung (tamu/operator menekan sedikit lebih cepat).</summary>
    public static readonly TimeSpan Grace = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan Poll = TimeSpan.FromMilliseconds(100);

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private readonly Uri? _trigger;
    private readonly HashSet<string> _consumed = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _one = new(1, 1);
    private readonly TimeSpan _timeout;

    /// <param name="trigger">
    /// Opsional: URL yang dipanggil (GET) setiap capture untuk memicu shutter di software tether
    /// (mis. web server digiCamControl), supaya tidak perlu menekan shutter manual (W-023).
    /// </param>
    public HotFolderCamera(string folder, TimeSpan? timeout = null, Uri? trigger = null)
    {
        _trigger = trigger;
        Folder = Path.GetFullPath(folder);
        Directory.CreateDirectory(Folder);
        _timeout = timeout ?? DefaultTimeout;
        // File lama di folder bukan foto sesi ini.
        foreach (var f in Candidates()) _consumed.Add(f.FullName);
    }

    public string Folder { get; }
    public string Brand => "hotfolder";
    public string Id => "hotfolder";
    public bool Connected => true;
    public string? Model => "Hot folder";
    public string Serial => Folder;
    public byte[]? LatestFrame => null;
    public Task<bool> StartLiveViewAsync() => Task.FromResult(false);
    public Task StopLiveViewAsync() => Task.CompletedTask;
    public Task<bool> FocusAsync(string step) => Task.FromResult(false);

    private IEnumerable<FileInfo> Candidates() =>
        new DirectoryInfo(Folder).EnumerateFiles()
            .Where(f => f.Extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase) ||
                        f.Extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase));

    public async Task<CaptureResult> CaptureAsync(string outputDir, int index, CancellationToken ct = default)
    {
        await _one.WaitAsync(ct);
        try
        {
            var armedAt = DateTime.UtcNow - Grace;
            var deadline = DateTime.UtcNow + _timeout;
            if (_trigger is not null) await TriggerAsync(ct);
            while (DateTime.UtcNow < deadline)
            {
                var next = Candidates()
                    .Where(f => !_consumed.Contains(f.FullName) && f.LastWriteTimeUtc >= armedAt)
                    .OrderBy(f => f.LastWriteTimeUtc)
                    .FirstOrDefault();
                if (next is not null)
                {
                    _consumed.Add(next.FullName);
                    return await TakeAsync(next.FullName, outputDir, index, deadline, ct);
                }
                await Task.Delay(Poll, ct);
            }
            throw new CameraFailure("capture_timeout", $"Tidak ada foto baru di hot folder dalam {_timeout.TotalSeconds:0} detik");
        }
        finally { _one.Release(); }
    }

    private async Task TriggerAsync(CancellationToken ct)
    {
        try
        {
            using var r = await Http.GetAsync(_trigger, ct);
            if (!r.IsSuccessStatusCode)
                throw new CameraFailure("trigger_failed", $"pemicu shutter membalas {(int)r.StatusCode}");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new CameraFailure("trigger_failed", $"pemicu shutter tidak bisa dihubungi: {e.Message}");
        }
    }

    /// <summary>Tunggu file selesai ditulis (bisa dibuka eksklusif & ukurannya stabil), salin ke folder sesi.</summary>
    private static async Task<CaptureResult> TakeAsync(string src, string outputDir, int index, DateTime deadline, CancellationToken ct)
    {
        long last = -1;
        while (true)
        {
            try
            {
                var size = new FileInfo(src).Length;
                if (size > 0 && size == last)
                {
                    await using var fs = new FileStream(src, FileMode.Open, FileAccess.Read, FileShare.None);
                    var dims = JpegInfo.ReadSize(fs) ?? throw new CameraFailure("capture_unreadable", $"{Path.GetFileName(src)} bukan JPEG yang valid");
                    Directory.CreateDirectory(outputDir);
                    var dst = Path.Combine(outputDir, $"{index + 1}.jpg");
                    fs.Seek(0, SeekOrigin.Begin);
                    await using (var o = new FileStream(dst, FileMode.Create, FileAccess.Write))
                        await fs.CopyToAsync(o, ct);
                    return new CaptureResult(dst, dims.Width, dims.Height);
                }
                last = size;
            }
            catch (IOException) { /* masih ditulis software lain */ }
            if (DateTime.UtcNow > deadline + TimeSpan.FromSeconds(5))
                throw new CameraFailure("capture_unreadable", $"{Path.GetFileName(src)} tidak selesai ditulis");
            await Task.Delay(Poll, ct);
        }
    }
}
