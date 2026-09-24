using System.Globalization;

namespace TetraCamera.Print;

/// <summary>
/// Jurnal job print di disk supaya pengiriman ulang setelah Camera Service crash tidak mencetak dua kali
/// (DECISIONS #39). Baris: <c>ISO-UTC \t jobId \t spooling|spooled</c>, di-flush ke disk setiap tulis.
/// <list type="bullet">
/// <item><c>spooled</c>: job sudah diserahkan ke spooler → kirim ulang dijawab selesai tanpa mencetak.</item>
/// <item><c>spooling</c> tanpa <c>spooled</c>: crash di tengah penyerahan → tidak pasti, jangan cetak otomatis.</item>
/// </list>
/// Entri lebih tua dari <see cref="Keep"/> dibuang saat dibuka.
/// </summary>
public sealed class PrintJournal
{
    public static readonly TimeSpan Keep = TimeSpan.FromHours(24);
    private readonly string _path;
    private readonly Lock _lock = new();
    private readonly Dictionary<string, string> _state = new(StringComparer.Ordinal);

    public PrintJournal(string path, DateTime? nowUtc = null)
    {
        _path = path;
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        var cutoff = (nowUtc ?? DateTime.UtcNow) - Keep;
        var kept = new List<string>();
        if (File.Exists(path))
        {
            foreach (var line in File.ReadAllLines(path))
            {
                var p = line.Split('\t');
                if (p.Length != 3) continue;
                if (!DateTime.TryParse(p[0], CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var at)) continue;
                if (at < cutoff) continue;
                kept.Add(line);
                _state[p[1]] = p[2];
            }
        }
        File.WriteAllLines(path, kept);
    }

    public bool IsSpooled(string jobId) { lock (_lock) return _state.GetValueOrDefault(jobId) == "spooled"; }

    /// <summary>Penyerahan ke spooler dimulai tapi tidak pernah dikonfirmasi (crash di tengah).</summary>
    public bool IsUncertain(string jobId) { lock (_lock) return _state.GetValueOrDefault(jobId) == "spooling"; }

    public void MarkSpooling(string jobId) => Append(jobId, "spooling");
    public void MarkSpooled(string jobId) => Append(jobId, "spooled");
    /// <summary>Gagal pasti (exception dari driver/validasi): tidak tercetak, boleh dicoba lagi.</summary>
    public void MarkFailed(string jobId) => Append(jobId, "failed");

    private void Append(string jobId, string state)
    {
        lock (_lock)
        {
            _state[jobId] = state;
            using var f = new FileStream(_path, FileMode.Append, FileAccess.Write, FileShare.Read);
            using (var w = new StreamWriter(f))
                w.WriteLine($"{DateTime.UtcNow:O}\t{jobId}\t{state}");
            // Tahan crash: pastikan baris sampai ke disk sebelum lanjut mencetak.
            using var sync = new FileStream(_path, FileMode.Open, FileAccess.Write, FileShare.ReadWrite);
            sync.Flush(flushToDisk: true);
        }
    }
}
