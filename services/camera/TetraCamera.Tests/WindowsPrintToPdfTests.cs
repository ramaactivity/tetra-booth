using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using TetraCamera.Print;
using TetraCamera.Print.Windows;

namespace TetraCamera.Tests;

/// <summary>
/// Kriteria uji M4 poin 2 (PLAN-FASE-1): integrasi ke "Microsoft Print to PDF".
/// Dilewati (return awal) kalau bukan Windows atau printer itu tidak terpasang, supaya CI tetap hijau.
/// </summary>
[System.Runtime.Versioning.SupportedOSPlatform("windows6.1")]
public sealed class WindowsPrintToPdfTests : IDisposable
{
    private const string Pdf = "Microsoft Print to PDF";
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "tetra-m4-" + Guid.NewGuid().ToString("N")[..8]);

    public WindowsPrintToPdfTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch (IOException) { }
    }

    [System.Runtime.Versioning.SupportedOSPlatformGuard("windows6.1")]
    private static bool Available() =>
        OperatingSystem.IsWindowsVersionAtLeast(6, 1) && PrinterSettings.InstalledPrinters.Cast<string>().Contains(Pdf);

    /// <summary>Gambar uji 1200×1800 (border, penanda sudut) seperti W-006.</summary>
    private string TestImage(int w = 1200, int h = 1800)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        var path = Path.Combine(_dir, $"strip-{w}x{h}.png");
        using var bmp = new Bitmap(w, h);
        using (var g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.White);
            g.DrawRectangle(Pens.Red, 0, 0, w - 1, h - 1);
            g.FillRectangle(Brushes.Blue, 0, 0, 100, 100);
            g.FillRectangle(Brushes.Blue, w - 100, h - 100, 100, 100);
        }
        bmp.Save(path, ImageFormat.Png);
        return path;
    }

    private sealed class Probe : IAsyncDisposable
    {
        public readonly WindowsPrinterAdapter Adapter;
        public readonly string OutDir;
        private readonly ConcurrentDictionary<string, TaskCompletionSource<PrinterEvent>> _jobs = new();

        public Probe(string printer, PaperConfig paper, string outDir)
        {
            if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
            OutDir = outDir;
            Adapter = new WindowsPrinterAdapter(new WindowsPrinterOptions(printer, paper, outDir));
            Adapter.Event += e =>
            {
                var id = e switch { PrintDoneEvent d => d.JobId, PrintFailedEvent f => f.JobId, _ => null };
                if (id is not null) Tcs(id).TrySetResult(e);
            };
        }

        private TaskCompletionSource<PrinterEvent> Tcs(string id) =>
            _jobs.GetOrAdd(id, _ => new TaskCompletionSource<PrinterEvent>(TaskCreationOptions.RunContinuationsAsynchronously));

        public async Task<PrinterEvent> Print(string jobId, string path, int copies, string paper)
        {
            var wait = Tcs(jobId).Task;
            await Adapter.SubmitAsync(new PrintJob(jobId, path, copies, paper));
            return await wait.WaitAsync(TimeSpan.FromSeconds(90));
        }

        public ValueTask DisposeAsync() => Adapter.DisposeAsync();
    }

    private Probe NewProbe(string printer = Pdf, PaperConfig? paper = null) =>
        new(printer, paper ?? new PaperConfig(), Path.Combine(_dir, "out"));

    private string[] OutputFiles(Probe p) =>
        Directory.Exists(p.OutDir) ? Directory.GetFiles(p.OutDir) : [];

    [Fact]
    public async Task A_config_A5_PDF_A5_gambar_tepat_288x432pt_di_origin_halaman_sama_dengan_copies()
    {
        if (!Available()) return;
        await using var p = NewProbe(paper: new PaperConfig(Paper4R: "A5"));
        var e = await p.Print("m4-a5", TestImage(), copies: 2, paper: "4R");
        Assert.IsType<PrintDoneEvent>(e);

        var pdf = PdfInspector.Read(Path.Combine(p.OutDir, "m4-a5.pdf"));
        var media = Assert.Single(pdf.MediaBoxes.Distinct());
        Assert.Equal(419.52, media.Width, 0.5);   // A5 = 5,83 in
        Assert.Equal(595.32, media.Height, 0.5);  // 8,27 in
        Assert.Equal(2, pdf.PageCount);
        Assert.Equal(2, pdf.ImageBoxes.Count);
        foreach (var b in pdf.ImageBoxes)
        {
            // Tepat 4×6 in (288×432 pt), menempel di pojok kiri atas kertas (PDF: y dari bawah).
            Assert.Equal(288, b.Width, 0.5);
            Assert.Equal(432, b.Height, 0.5);
            Assert.Equal(0, b.MinX, 0.5);
            Assert.Equal(media.MaxY, b.MaxY, 0.5);
        }
    }

    [Fact]
    public async Task A_2x6x2_lewat_nama_config_ikut_tercetak()
    {
        if (!Available()) return;
        await using var p = NewProbe(paper: new PaperConfig(Paper2x6x2: "A5"));
        Assert.IsType<PrintDoneEvent>(await p.Print("m4-2x6x2", TestImage(), 1, "2x6x2"));
        var pdf = PdfInspector.Read(Path.Combine(p.OutDir, "m4-2x6x2.pdf"));
        Assert.Equal(1, pdf.PageCount);
        Assert.Equal(288, Assert.Single(pdf.ImageBoxes).Width, 0.5);
    }

    [Fact]
    public async Task B_tanpa_config_4R_tidak_pernah_PDF_Letter()
    {
        if (!Available()) return;
        await using var p = NewProbe();
        var e = await p.Print("m4-nocfg", TestImage(), 1, "4R");
        if (!DriverHas4x6())
        {
            // Laptop uji (Win 11 21H2): Print to PDF tanpa 4×6 → gagal berkode, tidak ada file.
            Assert.Equal(PrintErrors.PaperNotSupported, Assert.IsType<PrintFailedEvent>(e).Code);
            Assert.Empty(OutputFiles(p));
            Assert.Equal(new PrintJobStatus(PrintJobState.Failed, PrintErrors.PaperNotSupported),
                await p.Adapter.GetJobStatusAsync("m4-nocfg"));
            return;
        }
        // Runner CI (Windows Server): driver punya 4×6 → dipilih lewat ukuran, PDF harus tepat 4×6, bukan Letter.
        Assert.IsType<PrintDoneEvent>(e);
        var media = Assert.Single(PdfInspector.Read(Path.Combine(p.OutDir, "m4-nocfg.pdf")).MediaBoxes.Distinct());
        Assert.Equal(288, Math.Min(media.Width, media.Height), 1.5);
        Assert.Equal(432, Math.Max(media.Width, media.Height), 1.5);
    }

    /// <summary>Driver Print to PDF berbeda antar versi Windows: sebagian punya ukuran 4×6 (±0,02 in).</summary>
    private static bool DriverHas4x6()
    {
        if (!OperatingSystem.IsWindows()) return false;
        return new PrinterSettings { PrinterName = Pdf }.PaperSizes.Cast<PaperSize>().Any(s =>
            (Math.Abs(s.Width - 400) <= 2 && Math.Abs(s.Height - 600) <= 2) ||
            (Math.Abs(s.Width - 600) <= 2 && Math.Abs(s.Height - 400) <= 2));
    }

    [Fact]
    public async Task C_printer_tidak_ada_status_unavailable_dan_job_gagal_berkode()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var p = NewProbe(printer: "Tetra Printer Tidak Ada " + Guid.NewGuid().ToString("N")[..6]);
        var status = await p.Adapter.GetStatusAsync();
        Assert.Equal(PrinterState.Unavailable, status.State);
        Assert.Contains("tidak terpasang", status.Message);

        var e = Assert.IsType<PrintFailedEvent>(await p.Print("m4-noprinter", Path.Combine(_dir, "tidak-perlu.png"), 1, "4R"));
        Assert.Equal(PrintErrors.PrinterUnavailable, e.Code);
    }

    [Fact]
    public async Task Printer_dialog_tanpa_print_to_file_ditolak_bukan_membuka_Save_As()
    {
        if (!Available()) return;
        await using var a = new WindowsPrinterAdapter(new WindowsPrinterOptions(Pdf, new PaperConfig(Paper4R: "A5")));
        var done = new TaskCompletionSource<PrinterEvent>(TaskCreationOptions.RunContinuationsAsynchronously);
        a.Event += e => { if (e is PrintFailedEvent or PrintDoneEvent) done.TrySetResult(e); };
        await a.SubmitAsync(new PrintJob("m4-prompt", TestImage(), 1, "4R"));
        var f = Assert.IsType<PrintFailedEvent>(await done.Task.WaitAsync(TimeSpan.FromSeconds(30)));
        Assert.Equal(PrintErrors.OutputFileRequired, f.Code);
    }

    [Theory]
    [InlineData(600, 1800)]
    [InlineData(2400, 3600)]
    public async Task Gambar_bukan_1200x1800_gagal_image_size(int w, int h)
    {
        if (!Available()) return;
        await using var p = NewProbe(paper: new PaperConfig(Paper4R: "A5"));
        var e = Assert.IsType<PrintFailedEvent>(await p.Print($"m4-size-{w}", TestImage(w, h), 1, "4R"));
        Assert.Equal(PrintErrors.ImageSize, e.Code);
        Assert.Empty(OutputFiles(p));
    }

    [Fact]
    public async Task File_gambar_tidak_ada_gagal_image_unreadable()
    {
        if (!Available()) return;
        await using var p = NewProbe(paper: new PaperConfig(Paper4R: "A5"));
        var e = Assert.IsType<PrintFailedEvent>(await p.Print("m4-missing", Path.Combine(_dir, "hilang.png"), 1, "4R"));
        Assert.Equal(PrintErrors.ImageUnreadable, e.Code);
    }

    [Fact]
    public async Task Status_Print_to_PDF_ready()
    {
        if (!Available()) return;
        await using var p = NewProbe();
        Assert.Equal(PrinterState.Ready, (await p.Adapter.GetStatusAsync()).State);
    }
}
