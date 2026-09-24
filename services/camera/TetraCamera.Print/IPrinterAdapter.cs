namespace TetraCamera.Print;

public enum PrinterState { Ready, Error, Unavailable }

public sealed record PrinterStatus(PrinterState State, int? PaperRemaining, string? Message)
{
    public static readonly PrinterStatus Unavailable = new(PrinterState.Unavailable, null, null);
}

/// <summary>Paper preset: "4R" (4x6) atau "2x6x2" (4x6 dipotong dua). TSD §2.4.</summary>
public sealed record PrintJob(string JobId, string Path, int Copies, string Paper);

public enum PrintJobState { Queued, Printing, Done, Failed }

public sealed record PrintJobStatus(PrintJobState State, string? Error);

/// <summary>Event dari adapter, diteruskan Host ke booth sebagai `print.done`, `print.failed`, `printer.status`.</summary>
public abstract record PrinterEvent;
public sealed record PrintDoneEvent(string JobId) : PrinterEvent;
public sealed record PrintFailedEvent(string JobId, string Code, string Message) : PrinterEvent;
public sealed record PrinterStatusEvent(PrinterStatus Status) : PrinterEvent;

/// <summary>Kode error print (payload `print.failed.code` / balasan `error.code`).</summary>
public static class PrintErrors
{
    public const string NoPrinter = "no_printer";
    public const string PrinterUnavailable = "printer_unavailable";
    public const string PrinterError = "printer_error";
    public const string OutputFileRequired = "output_file_required";
    public const string PaperNotSupported = "paper_not_supported";
    public const string PaperMismatch = "paper_mismatch";
    public const string BadPaper = "bad_paper";
    public const string ImageUnreadable = "image_unreadable";
    public const string ImageSize = "image_size";
    public const string UnknownJob = "unknown_job";
    public const string PrintError = "print_error";
    /// <summary>Crash di tengah penyerahan ke spooler: mungkin sudah tercetak. Tidak dicetak ulang otomatis.</summary>
    public const string PrintUncertain = "print_uncertain";
}

/// <summary>Kegagalan print berkode. Pesan dalam Bahasa Indonesia, untuk log & mode crew.</summary>
public sealed class PrintFailure(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>
/// Batas antara dispatcher dan printer fisik. Implementasi per OS:
/// WindowsPrinterAdapter (Fase 1), CupsPrinterAdapter (Fase 6).
/// </summary>
public interface IPrinterAdapter
{
    Task<PrinterStatus> GetStatusAsync(CancellationToken ct = default);

    /// <summary>Masukkan job ke antrean. Idempoten per <c>JobId</c>. Ditolak → <see cref="PrintFailure"/>.</summary>
    Task SubmitAsync(PrintJob job, CancellationToken ct = default);

    /// <summary>Status job. Job tidak dikenal → <see cref="PrintFailure"/> <c>unknown_job</c>.</summary>
    Task<PrintJobStatus> GetJobStatusAsync(string jobId, CancellationToken ct = default);

    event Action<PrinterEvent>? Event;
}

/// <summary>Dipakai saat tidak ada printer (OS tanpa adapter, atau dev di macOS).</summary>
public sealed class NullPrinterAdapter : IPrinterAdapter
{
    public event Action<PrinterEvent>? Event { add { } remove { } }

    public Task<PrinterStatus> GetStatusAsync(CancellationToken ct = default) =>
        Task.FromResult(PrinterStatus.Unavailable);

    public Task SubmitAsync(PrintJob job, CancellationToken ct = default) =>
        throw new PrintFailure(PrintErrors.NoPrinter, "tidak ada printer adapter untuk OS ini");

    public Task<PrintJobStatus> GetJobStatusAsync(string jobId, CancellationToken ct = default) =>
        throw new PrintFailure(PrintErrors.UnknownJob, $"job '{jobId}' tidak dikenal");
}
