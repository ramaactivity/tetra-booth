using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace TetraCamera.Print.Windows;

/// <summary>
/// Config printer. Sementara dari argumen Host (`--printer`, `--paper-4r`, `--paper-2x6x2`, `--print-to-file`),
/// nanti dari config device lewat Electron.
/// </summary>
/// <param name="OutputDirectory">
/// Kalau diisi: hasil driver ditulis ke file di folder ini (PrintToFile), mis. untuk "Microsoft Print to PDF"
/// di uji & stress test. Printer dengan port <c>PORTPROMPT:</c> tanpa ini akan membuka dialog Save As, jadi ditolak.
/// </param>
/// <param name="Printer2x6x2">
/// Antrean khusus preset 2x6x2 (DECISIONS #47/#52): antrean kedua ke printer DNP yang sama dengan `2inch cut: Enable`
/// diset lewat dialog Printing Preferences. Driver DNP hanya menuruti setelan dari dialognya, bukan DEVMODE dari program
/// (W-022, lembar K1–K8), jadi aplikasi tidak pernah mengubah setelan printer. Default: <paramref name="PrinterName"/>.
/// </param>
/// <param name="PrintOffset">
/// Kalibrasi DNP (`--print-offset "x,y"`, M-021): pojok kiri-atas area 4×6 fisik di halaman, 1/100 in. Tanpa nilai = tengah.
/// </param>
public sealed record WindowsPrinterOptions(
    string? PrinterName, PaperConfig Paper, string? OutputDirectory = null,
    string? Printer2x6x2 = null, (double X, double Y)? PrintOffset = null);

/// <summary>
/// Print ke DNP lewat spooler Windows (System.Drawing.Printing). Desain: PLAN-FASE-1 "Desain M4".
/// Satu-satunya proyek yang boleh memakai API khusus Windows (CLAUDE.md aturan 10).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsPrinterAdapter : QueuedPrinterAdapter
{
    /// <summary>Kanvas cetak fisik: 4×6 in @300dpi (packages/shared PRINT_CANVAS).</summary>
    public const int CanvasWidth = 1200, CanvasHeight = 1800;

    private readonly WindowsPrinterOptions _options;

    public WindowsPrinterAdapter(WindowsPrinterOptions options, TimeSpan? statusPoll = null)
    {
        _options = options;
        StartStatusPolling(statusPoll ?? TimeSpan.FromSeconds(5));
    }

    protected override PrinterStatus ReadStatus() =>
        string.IsNullOrEmpty(_options.PrinterName)
            ? new PrinterStatus(PrinterState.Unavailable, null, "printer belum dikonfigurasi (--printer)")
            : Spooler.ToStatus(Spooler.TryGet(_options.PrinterName), _options.PrinterName);

    protected override void PrintCore(PrintJob job, CancellationToken ct)
    {
        // 2x6x2: antrean kedua yang dialognya diset potong 2 inci (DECISIONS #52), kalau dikonfigurasi.
        var name = job.Paper == Presets.TwoBySixByTwo && !string.IsNullOrEmpty(_options.Printer2x6x2)
            ? _options.Printer2x6x2
            : _options.PrinterName;
        if (string.IsNullOrEmpty(name))
            throw new PrintFailure(PrintErrors.PrinterUnavailable, "printer belum dikonfigurasi (--printer)");

        var info = Spooler.TryGet(name);
        var status = Spooler.ToStatus(info, name);
        if (status.State == PrinterState.Unavailable)
            throw new PrintFailure(PrintErrors.PrinterUnavailable, status.Message ?? "printer tidak tersedia");
        if (status.State == PrinterState.Error)
            throw new PrintFailure(PrintErrors.PrinterError, status.Message ?? "printer error");
        if (_options.OutputDirectory is null && string.Equals(info!.Port, "PORTPROMPT:", StringComparison.OrdinalIgnoreCase))
            throw new PrintFailure(PrintErrors.OutputFileRequired,
                $"printer '{name}' meminta nama file (dialog); pakai --print-to-file");

        using var image = LoadImage(job.Path);

        var settings = new PrinterSettings { PrinterName = name };
        if (!settings.IsValid)
            throw new PrintFailure(PrintErrors.PrinterUnavailable, $"printer '{name}' tidak terpasang");

        var driverSizes = settings.PaperSizes.Cast<PaperSize>().ToList();
        var chosen = PaperSelector.Select(
            driverSizes.Select(p => new PaperOption(p.PaperName, p.Width, p.Height)).ToList(), job.Paper, _options.Paper);
        var paper = driverSizes.First(p => p.PaperName == chosen.Name && p.Width == chosen.Width && p.Height == chosen.Height);

        using var doc = new PrintDocument();
        doc.PrinterSettings = settings;
        doc.DocumentName = $"Tetra {job.JobId}";
        doc.PrintController = new StandardPrintController();
        var page = doc.DefaultPageSettings;
        page.PaperSize = paper;
        page.Landscape = false;
        page.Margins = new Margins(0, 0, 0, 0);

        // Driver yang mengabaikan pilihan kertas melaporkan area kertas lain (W-006): jangan cetak.
        // Mode ber-margin (inkjet): cukup area cetak memuat 4×6 in utuh.
        var area = page.PrintableArea;
        var margins = _options.Paper.AllowMargins;
        if (margins ? !PaperSelector.PrintableAreaFitsFourBySix(area.Width, area.Height)
                    : !PaperSelector.PrintableAreaMatches(chosen, area.Width, area.Height))
            throw new PrintFailure(PrintErrors.PaperMismatch, margins
                ? $"area cetak {area.Width:0.#}x{area.Height:0.#} '{chosen.Name}' tidak muat 4x6 in (400x600)"
                : $"PrintableArea {area.Width:0.#}x{area.Height:0.#} tidak cocok dengan '{chosen.Name}' {chosen.Width}x{chosen.Height}");

        if (_options.OutputDirectory is not null)
        {
            Directory.CreateDirectory(_options.OutputDirectory);
            var file = Path.Combine(_options.OutputDirectory, OutputFileName(job.JobId, info!.Driver));
            File.Delete(file);
            settings.PrintToFile = true;
            settings.PrintFileName = file;
        }

        // Kertas yang didefinisikan melebar di driver: putar gambar, tetap tepat 4×6 in.
        var landscapePaper = paper.Width > paper.Height;
        if (landscapePaper) image.RotateFlip(RotateFlipType.Rotate90FlipNone);
        var fourBySix = landscapePaper
            ? new RectangleF(0, 0, PaperSelector.FourBySixLong, PaperSelector.FourBySixShort)
            : new RectangleF(0, 0, PaperSelector.FourBySixShort, PaperSelector.FourBySixLong);

        var coverPage = PaperSelector.IsFourBySix(chosen);
        var printed = 0;
        doc.PrintPage += (_, e) =>
        {
            var g = e.Graphics!;
            g.PageUnit = GraphicsUnit.Display; // 1/100 in
            // Normal: origin = tepi kertas (borderless DNP). Ber-margin: origin = pojok area cetak, 4×6 utuh di dalamnya.
            if (!margins) g.TranslateTransform(-e.PageSettings.HardMarginX, -e.PageSettings.HardMarginY);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            // Kertas 4×6 dye-sub (overscan borderless, M-021): lapisan cover menutup seluruh halaman sebagai bleed,
            // lalu gambar tepat 4×6 tanpa skala di posisi kalibrasi (default tengah), supaya margin desain terjaga.
            // Kertas lain (mis. A5 di uji PDF) dan mode ber-margin: tepat 4×6 in di origin.
            RectangleF target = fourBySix;
            if (!margins && coverPage)
            {
                var b = e.PageSettings.Bounds;
                var c = PaperSelector.CoverRect(b.Width, b.Height, fourBySix.Width, fourBySix.Height);
                g.DrawImage(image, new RectangleF((float)c.X, (float)c.Y, (float)c.W, (float)c.H));
                var x = PaperSelector.ExactRect(b.Width, b.Height, fourBySix.Width, fourBySix.Height, _options.PrintOffset);
                target = new RectangleF((float)x.X, (float)x.Y, (float)x.W, (float)x.H);
            }
            g.DrawImage(image, target);
            printed++;
            // Salinan sebagai halaman: jumlah halaman = copies, tidak bergantung dukungan Copies di driver.
            e.HasMorePages = printed < job.Copies && !ct.IsCancellationRequested;
        };

        ct.ThrowIfCancellationRequested();
        try { doc.Print(); }
        catch (Exception e) when (e is InvalidPrinterException or System.ComponentModel.Win32Exception)
        {
            throw new PrintFailure(PrintErrors.PrintError, e.Message);
        }
    }

    private static Bitmap LoadImage(string path)
    {
        Bitmap bmp;
        try
        {
            // Salin ke memori supaya file tidak terkunci selama antrean print.
            using var fs = File.OpenRead(path);
            using var ms = new MemoryStream();
            fs.CopyTo(ms);
            ms.Position = 0;
            using var decoded = new Bitmap(ms);
            bmp = new Bitmap(decoded);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException or ExternalException)
        {
            throw new PrintFailure(PrintErrors.ImageUnreadable, $"gambar tidak bisa dibaca: {e.Message}");
        }

        if (bmp.Width != CanvasWidth || bmp.Height != CanvasHeight)
        {
            var (w, h) = (bmp.Width, bmp.Height);
            bmp.Dispose();
            throw new PrintFailure(PrintErrors.ImageSize, $"gambar {w}x{h}, harus {CanvasWidth}x{CanvasHeight}");
        }
        return bmp;
    }

    private static string OutputFileName(string jobId, string driver)
    {
        var safe = string.Concat(jobId.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        var ext = driver.Contains("PDF", StringComparison.OrdinalIgnoreCase) ? ".pdf"
            : driver.Contains("XPS", StringComparison.OrdinalIgnoreCase) ? ".xps"
            : ".prn";
        return safe + ext;
    }
}
