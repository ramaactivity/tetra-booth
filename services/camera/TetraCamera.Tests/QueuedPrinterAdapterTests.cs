using System.Collections.Concurrent;
using TetraCamera.Print;

namespace TetraCamera.Tests;

public class QueuedPrinterAdapterTests
{
    /// <summary>Adapter palsu: job "gagal-*" gagal berkode, sisanya berhasil; status bisa diatur test.</summary>
    private sealed class FakeAdapter : QueuedPrinterAdapter
    {
        public readonly ConcurrentQueue<string> Printed = new();
        public readonly ConcurrentQueue<PrinterEvent> Events = new();
        public PrinterStatus Status = new(PrinterState.Ready, null, null);
        public SemaphoreSlim? Gate;

        public FakeAdapter() => Event += e => Events.Enqueue(e);

        protected override void PrintCore(PrintJob job, CancellationToken ct)
        {
            Gate?.Wait(ct);
            if (job.JobId.StartsWith("gagal", StringComparison.Ordinal))
                throw new PrintFailure(PrintErrors.PaperNotSupported, "tidak ada 4x6");
            if (job.JobId.StartsWith("crash", StringComparison.Ordinal))
                throw new InvalidOperationException("driver meledak");
            Printed.Enqueue(job.JobId);
        }

        protected override PrinterStatus ReadStatus() => Status;
    }

    private static PrintJob Job(string id) => new(id, "C:/x.png", 1, "4R");

    private static async Task<T> WaitFor<T>(FakeAdapter a, Func<T, bool> match) where T : PrinterEvent
    {
        for (var i = 0; i < 200; i++)
        {
            if (a.Events.OfType<T>().FirstOrDefault(match) is { } e) return e;
            await Task.Delay(10);
        }
        throw new TimeoutException($"event {typeof(T).Name} tidak datang");
    }

    [Fact]
    public async Task Job_berhasil_jadi_done_dan_emit_print_done()
    {
        await using var a = new FakeAdapter();
        await a.SubmitAsync(Job("j1"));
        await WaitFor<PrintDoneEvent>(a, e => e.JobId == "j1");
        Assert.Equal(PrintJobState.Done, (await a.GetJobStatusAsync("j1")).State);
    }

    [Fact]
    public async Task Job_gagal_emit_print_failed_berkode_dan_status_failed()
    {
        await using var a = new FakeAdapter();
        await a.SubmitAsync(Job("gagal-1"));
        var e = await WaitFor<PrintFailedEvent>(a, e => e.JobId == "gagal-1");
        Assert.Equal(PrintErrors.PaperNotSupported, e.Code);
        Assert.Equal(new PrintJobStatus(PrintJobState.Failed, PrintErrors.PaperNotSupported), await a.GetJobStatusAsync("gagal-1"));
    }

    [Fact]
    public async Task Exception_tak_terduga_jadi_print_error_dan_worker_tetap_jalan()
    {
        await using var a = new FakeAdapter();
        await a.SubmitAsync(Job("crash-1"));
        await a.SubmitAsync(Job("j2"));
        Assert.Equal(PrintErrors.PrintError, (await WaitFor<PrintFailedEvent>(a, e => e.JobId == "crash-1")).Code);
        await WaitFor<PrintDoneEvent>(a, e => e.JobId == "j2");
    }

    [Fact]
    public async Task JobId_sama_tidak_dicetak_dua_kali()
    {
        await using var a = new FakeAdapter();
        await a.SubmitAsync(Job("dup"));
        await a.SubmitAsync(Job("dup"));
        await a.SubmitAsync(Job("akhir"));
        await WaitFor<PrintDoneEvent>(a, e => e.JobId == "akhir");
        Assert.Equal(["dup", "akhir"], a.Printed.ToArray());
    }

    [Fact]
    public async Task Job_dicetak_berurutan_dengan_status_queued_lalu_printing()
    {
        await using var a = new FakeAdapter { Gate = new SemaphoreSlim(0) };
        await a.SubmitAsync(Job("a"));
        await a.SubmitAsync(Job("b"));
        for (var i = 0; i < 100 && (await a.GetJobStatusAsync("a")).State != PrintJobState.Printing; i++) await Task.Delay(10);
        Assert.Equal(PrintJobState.Printing, (await a.GetJobStatusAsync("a")).State);
        Assert.Equal(PrintJobState.Queued, (await a.GetJobStatusAsync("b")).State);
        a.Gate.Release(2);
        await WaitFor<PrintDoneEvent>(a, e => e.JobId == "b");
        Assert.Equal(["a", "b"], a.Printed.ToArray());
    }

    [Fact]
    public async Task Job_tidak_dikenal_gagal_unknown_job()
    {
        await using var a = new FakeAdapter();
        var f = await Assert.ThrowsAsync<PrintFailure>(() => a.GetJobStatusAsync("tidak-ada"));
        Assert.Equal(PrintErrors.UnknownJob, f.Code);
    }

    [Theory]
    [InlineData("", "C:/x.png", 1, "4R", PrintErrors.PrintError)]
    [InlineData("j", "C:/x.png", 0, "4R", PrintErrors.PrintError)]
    [InlineData("j", "C:/x.png", 1, "A4", PrintErrors.BadPaper)]
    public async Task Job_tidak_valid_ditolak_saat_submit(string id, string path, int copies, string paper, string code)
    {
        await using var a = new FakeAdapter();
        var f = await Assert.ThrowsAsync<PrintFailure>(() => a.SubmitAsync(new PrintJob(id, path, copies, paper)));
        Assert.Equal(code, f.Code);
    }

    [Fact]
    public async Task Printer_status_hanya_emit_saat_berubah()
    {
        await using var a = new FakeAdapter();
        a.RefreshStatus();
        a.RefreshStatus();
        a.Status = new PrinterStatus(PrinterState.Error, null, "kertas habis");
        a.RefreshStatus();
        var statuses = a.Events.OfType<PrinterStatusEvent>().Select(e => e.Status).ToArray();
        Assert.Equal(2, statuses.Length);
        Assert.Equal(PrinterState.Ready, statuses[0].State);
        Assert.Equal("kertas habis", statuses[1].Message);
    }
}
