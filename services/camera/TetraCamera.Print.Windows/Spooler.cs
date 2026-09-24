using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace TetraCamera.Print.Windows;

/// <summary>Baca status printer dari spooler Windows (winspool GetPrinter level 2). Tanpa WMI, tanpa paket tambahan.</summary>
[SupportedOSPlatform("windows")]
internal static class Spooler
{
    public sealed record Info(string Name, string Port, string Driver, uint Status, uint Attributes, uint Jobs);

    private const uint AttributeWorkOffline = 0x400;

    private static readonly (uint Flag, string Text)[] Offline =
    [
        (0x80, "offline"), (0x1000, "tidak tersedia"), (0x800000, "status tidak diketahui"),
    ];

    private static readonly (uint Flag, string Text)[] Errors =
    [
        (0x1, "dijeda"), (0x2, "error"), (0x8, "kertas macet"), (0x10, "kertas habis"),
        (0x20, "butuh feed manual"), (0x40, "masalah kertas"), (0x800, "output penuh"),
        (0x40000, "tinta/ribbon habis"), (0x100000, "butuh tindakan operator"),
        (0x200000, "memori printer habis"), (0x400000, "pintu terbuka"),
    ];

    public static Info? TryGet(string printerName)
    {
        if (!OpenPrinter(printerName, out var h, IntPtr.Zero)) return null;
        try
        {
            GetPrinter(h, 2, IntPtr.Zero, 0, out var needed);
            if (needed == 0) return null;
            var buf = Marshal.AllocHGlobal((int)needed);
            try
            {
                if (!GetPrinter(h, 2, buf, needed, out _)) return null;
                var p = Marshal.PtrToStructure<PrinterInfo2>(buf);
                return new Info(p.pPrinterName ?? printerName, p.pPortName ?? "", p.pDriverName ?? "",
                    p.Status, p.Attributes, p.cJobs);
            }
            finally { Marshal.FreeHGlobal(buf); }
        }
        finally { ClosePrinter(h); }
    }

    public static PrinterStatus ToStatus(Info? info, string printerName)
    {
        if (info is null)
            return new PrinterStatus(PrinterState.Unavailable, null, $"printer '{printerName}' tidak terpasang");

        var offline = Describe(info.Status, Offline);
        if ((info.Attributes & AttributeWorkOffline) != 0) offline.Insert(0, "offline");
        if (offline.Count > 0)
            return new PrinterStatus(PrinterState.Unavailable, null, string.Join(", ", offline.Distinct()));

        var errors = Describe(info.Status, Errors);
        return errors.Count > 0
            ? new PrinterStatus(PrinterState.Error, null, string.Join(", ", errors))
            : new PrinterStatus(PrinterState.Ready, null, null);
    }

    private static List<string> Describe(uint status, (uint Flag, string Text)[] table) =>
        table.Where(t => (status & t.Flag) != 0).Select(t => t.Text).ToList();

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PrinterInfo2
    {
        public string? pServerName;
        public string? pPrinterName;
        public string? pShareName;
        public string? pPortName;
        public string? pDriverName;
        public string? pComment;
        public string? pLocation;
        public IntPtr pDevMode;
        public string? pSepFile;
        public string? pPrintProcessor;
        public string? pDatatype;
        public string? pParameters;
        public IntPtr pSecurityDescriptor;
        public uint Attributes;
        public uint Priority;
        public uint DefaultPriority;
        public uint StartTime;
        public uint UntilTime;
        public uint Status;
        public uint cJobs;
        public uint AveragePPM;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "GetPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetPrinter(IntPtr hPrinter, int level, IntPtr pPrinter, uint cbBuf, out uint pcbNeeded);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);
}
