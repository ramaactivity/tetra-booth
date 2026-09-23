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

/// <summary>
/// Batas antara dispatcher dan printer fisik. Implementasi per OS:
/// WindowsPrinterAdapter (Fase 1), CupsPrinterAdapter (Fase 6).
/// </summary>
public interface IPrinterAdapter
{
    Task<PrinterStatus> GetStatusAsync(CancellationToken ct = default);
    Task SubmitAsync(PrintJob job, CancellationToken ct = default);
    Task<PrintJobStatus> GetJobStatusAsync(string jobId, CancellationToken ct = default);
}

/// <summary>Dipakai saat tidak ada printer (OS tanpa adapter, atau dev di macOS).</summary>
public sealed class NullPrinterAdapter : IPrinterAdapter
{
    public Task<PrinterStatus> GetStatusAsync(CancellationToken ct = default) =>
        Task.FromResult(PrinterStatus.Unavailable);

    public Task SubmitAsync(PrintJob job, CancellationToken ct = default) =>
        throw new InvalidOperationException("Tidak ada printer adapter untuk OS ini.");

    public Task<PrintJobStatus> GetJobStatusAsync(string jobId, CancellationToken ct = default) =>
        Task.FromResult(new PrintJobStatus(PrintJobState.Failed, "no_printer"));
}
