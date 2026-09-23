using System.Runtime.Versioning;

namespace TetraCamera.Print.Windows;

/// <summary>
/// Print ke DNP lewat spooler Windows (System.Drawing.Printing). Diisi di Fase 1.
/// Satu-satunya proyek yang boleh memakai API khusus Windows (CLAUDE.md aturan 10).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsPrinterAdapter : IPrinterAdapter
{
    public Task<PrinterStatus> GetStatusAsync(CancellationToken ct = default) =>
        Task.FromResult(new PrinterStatus(PrinterState.Unavailable, null, "belum diimplementasi (Fase 1)"));

    public Task SubmitAsync(PrintJob job, CancellationToken ct = default) =>
        throw new NotImplementedException("Fase 1");

    public Task<PrintJobStatus> GetJobStatusAsync(string jobId, CancellationToken ct = default) =>
        throw new NotImplementedException("Fase 1");
}
