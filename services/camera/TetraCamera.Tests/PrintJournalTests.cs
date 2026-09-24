using System.Collections.Concurrent;
using TetraCamera.Print;

namespace TetraCamera.Tests;

public sealed class PrintJournalTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "tetra-journal-" + Guid.NewGuid().ToString("N")[..8]);
    private string File_ => Path.Combine(_dir, "print-journal.log");
    public void Dispose() { try { Directory.Delete(_dir, true); } catch (IOException) { } }

    private sealed class Fake : QueuedPrinterAdapter
    {
        public readonly ConcurrentQueue<string> Printed = new();
        public readonly ConcurrentQueue<PrinterEvent> Events = new();
        public Fake Init() { Event += e => Events.Enqueue(e); return this; }
        protected override void PrintCore(PrintJob job, CancellationToken ct)
        {
            if (job.JobId.StartsWith("gagal", StringComparison.Ordinal)) throw new PrintFailure(PrintErrors.PaperNotSupported, "x");
            Printed.Enqueue(job.JobId);
        }
        protected override PrinterStatus ReadStatus() => new(PrinterState.Ready, null, null);
    }

    private static Fake Adapter(PrintJournal j) => new Fake { Journal = j }.Init();

    private static async Task<T> WaitFor<T>(Fake a, string jobId) where T : PrinterEvent
    {
        for (var i = 0; i < 200; i++)
        {
            var hit = a.Events.OfType<T>().FirstOrDefault(e => e switch
            {
                PrintDoneEvent d => d.JobId == jobId,
                PrintFailedEvent f => f.JobId == jobId,
                _ => false,
            });
            if (hit is not null) return hit;
            await Task.Delay(10);
        }
        throw new TimeoutException(typeof(T).Name);
    }

    private static PrintJob Job(string id) => new(id, "x.png", 1, "4R");

    [Fact]
    public async Task Kirim_ulang_setelah_restart_tidak_mencetak_dua_kali()
    {
        await using (var a = Adapter(new PrintJournal(File_)))
        {
            await a.SubmitAsync(Job("s1"));
            await WaitFor<PrintDoneEvent>(a, "s1");
            Assert.Single(a.Printed);
        }
        // "Restart": proses baru, jurnal dibaca dari disk, booth mengirim ulang jobId yang sama.
        await using var b = Adapter(new PrintJournal(File_));
        await b.SubmitAsync(Job("s1"));
        await WaitFor<PrintDoneEvent>(b, "s1");
        Assert.Empty(b.Printed);
        Assert.Equal(PrintJobState.Done, (await b.GetJobStatusAsync("s1")).State);
    }

    [Fact]
    public async Task Crash_di_tengah_penyerahan_ditandai_tidak_pasti_dan_tidak_dicetak_otomatis()
    {
        new PrintJournal(File_).MarkSpooling("s2");   // proses lama mati sebelum MarkSpooled
        await using var a = Adapter(new PrintJournal(File_));
        await a.SubmitAsync(Job("s2"));
        var f = await WaitFor<PrintFailedEvent>(a, "s2");
        Assert.Equal(PrintErrors.PrintUncertain, f.Code);
        Assert.Empty(a.Printed);
    }

    [Fact]
    public async Task Gagal_pasti_boleh_dicoba_lagi_setelah_restart()
    {
        await using (var a = Adapter(new PrintJournal(File_)))
        {
            await a.SubmitAsync(Job("gagal-1"));
            await WaitFor<PrintFailedEvent>(a, "gagal-1");
        }
        var j = new PrintJournal(File_);
        Assert.False(j.IsSpooled("gagal-1"));
        Assert.False(j.IsUncertain("gagal-1"));
    }

    [Fact]
    public void Entri_lebih_tua_dari_24_jam_dibuang_saat_dibuka()
    {
        new PrintJournal(File_).MarkSpooled("lama");
        var besok = DateTime.UtcNow + PrintJournal.Keep + TimeSpan.FromMinutes(1);
        Assert.False(new PrintJournal(File_, besok).IsSpooled("lama"));
        Assert.False(new PrintJournal(File_).IsSpooled("lama")); // file sudah ditulis ulang tanpa entri lama
    }
}
