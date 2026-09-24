using System.Collections.Concurrent;
using System.Threading.Channels;

namespace TetraCamera.Print;

/// <summary>
/// Antrean print lintas platform: satu worker (job dicetak berurutan), tabel job di memori
/// (queued → printing → done/failed), event berkode. Turunan per OS hanya mengisi cara mencetak & membaca status.
/// </summary>
public abstract class QueuedPrinterAdapter : IPrinterAdapter, IAsyncDisposable
{
    private readonly Channel<PrintJob> _queue = Channel.CreateUnbounded<PrintJob>(new() { SingleReader = true });
    private readonly ConcurrentDictionary<string, PrintJobStatus> _jobs = new();
    private readonly CancellationTokenSource _stop = new();
    private readonly Task _worker;
    private readonly Lock _statusLock = new();
    private PrinterStatus? _lastStatus;
    private Timer? _poll;

    protected QueuedPrinterAdapter()
    {
        _worker = Task.Run(RunAsync);
    }

    /// <summary>Dipanggil turunan di akhir konstruktornya: baca status berkala, emit saat berubah.</summary>
    protected void StartStatusPolling(TimeSpan interval) =>
        _poll = new Timer(_ => RefreshStatus(), null, interval, interval);

    public event Action<PrinterEvent>? Event;

    /// <summary>Jurnal di disk untuk mencegah cetak ganda saat job dikirim ulang setelah crash. Opsional.</summary>
    public PrintJournal? Journal { get; init; }

    /// <summary>Cetak satu job sampai diserahkan ke spooler/driver. Gagal → lempar <see cref="PrintFailure"/>.</summary>
    protected abstract void PrintCore(PrintJob job, CancellationToken ct);

    /// <summary>Baca status printer saat ini (cepat, tanpa efek samping).</summary>
    protected abstract PrinterStatus ReadStatus();

    public Task<PrinterStatus> GetStatusAsync(CancellationToken ct = default) => Task.FromResult(RefreshStatus());

    public Task SubmitAsync(PrintJob job, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(job.JobId) || string.IsNullOrEmpty(job.Path) || job.Copies < 1)
            throw new PrintFailure(PrintErrors.PrintError, "job butuh jobId, path, dan copies ≥ 1");
        if (!Presets.IsKnown(job.Paper))
            throw new PrintFailure(PrintErrors.BadPaper, $"preset kertas '{job.Paper}' tidak dikenal");

        // Idempoten: jobId yang sama tidak dicetak dua kali (dalam proses ini).
        if (!_jobs.TryAdd(job.JobId, new PrintJobStatus(PrintJobState.Queued, null))) return Task.CompletedTask;

        // Idempoten lintas restart lewat jurnal (DECISIONS #39).
        if (Journal?.IsSpooled(job.JobId) == true)
        {
            _jobs[job.JobId] = new PrintJobStatus(PrintJobState.Done, null);
            _ = Task.Run(() => Emit(new PrintDoneEvent(job.JobId)));
            return Task.CompletedTask;
        }
        if (Journal?.IsUncertain(job.JobId) == true)
        {
            _ = Task.Run(() => Fail(job.JobId, PrintErrors.PrintUncertain,
                "Camera Service berhenti saat job ini diserahkan ke printer. Cek lembar yang keluar, lalu cetak ulang dari mode crew bila perlu."));
            return Task.CompletedTask;
        }
        if (!_queue.Writer.TryWrite(job))
        {
            _jobs[job.JobId] = new PrintJobStatus(PrintJobState.Failed, PrintErrors.PrintError);
            throw new PrintFailure(PrintErrors.PrintError, "antrean print sudah ditutup");
        }
        return Task.CompletedTask;
    }

    public Task<PrintJobStatus> GetJobStatusAsync(string jobId, CancellationToken ct = default) =>
        _jobs.TryGetValue(jobId, out var s)
            ? Task.FromResult(s)
            : throw new PrintFailure(PrintErrors.UnknownJob, $"job '{jobId}' tidak dikenal");

    /// <summary>Baca status; emit <c>printer.status</c> hanya kalau berubah.</summary>
    public PrinterStatus RefreshStatus()
    {
        PrinterStatus now;
        try { now = ReadStatus(); }
        catch (Exception e) { now = new PrinterStatus(PrinterState.Error, null, e.Message); }

        bool changed;
        lock (_statusLock)
        {
            changed = now != _lastStatus;
            _lastStatus = now;
        }
        if (changed) Emit(new PrinterStatusEvent(now));
        return now;
    }

    private async Task RunAsync()
    {
        try
        {
            await foreach (var job in _queue.Reader.ReadAllAsync(_stop.Token))
            {
                _jobs[job.JobId] = new PrintJobStatus(PrintJobState.Printing, null);
                try
                {
                    Journal?.MarkSpooling(job.JobId);
                    PrintCore(job, _stop.Token);
                    Journal?.MarkSpooled(job.JobId);
                    _jobs[job.JobId] = new PrintJobStatus(PrintJobState.Done, null);
                    Emit(new PrintDoneEvent(job.JobId));
                }
                catch (PrintFailure f)
                {
                    Journal?.MarkFailed(job.JobId);
                    Fail(job.JobId, f.Code, f.Message);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    Journal?.MarkFailed(job.JobId);
                    Fail(job.JobId, PrintErrors.PrintError, e.Message);
                }
                RefreshStatus();
            }
        }
        catch (OperationCanceledException) { }
    }

    private void Fail(string jobId, string code, string message)
    {
        _jobs[jobId] = new PrintJobStatus(PrintJobState.Failed, code);
        Emit(new PrintFailedEvent(jobId, code, message));
    }

    private void Emit(PrinterEvent e)
    {
        try { Event?.Invoke(e); }
        catch { /* pendengar yang error tidak boleh mematikan worker print */ }
    }

    public async ValueTask DisposeAsync()
    {
        if (_poll is not null) await _poll.DisposeAsync();
        _queue.Writer.TryComplete();
        await _stop.CancelAsync();
        try { await _worker; } catch (OperationCanceledException) { }
        _stop.Dispose();
        GC.SuppressFinalize(this);
    }
}
