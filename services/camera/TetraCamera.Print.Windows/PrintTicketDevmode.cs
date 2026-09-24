using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Runtime.Versioning;
using System.Text;

namespace TetraCamera.Print.Windows;

/// <summary>
/// DEVMODE ↔ PrintTicket lewat Print Ticket API Windows (prntvpt.dll), untuk fitur driver yang tidak ada di
/// System.Drawing, mis. pemotong 2 inci DNP (M-020, DECISIONS #52). Hanya mengubah DEVMODE job ini:
/// setelan antrean dan Printing Preferences pengguna tidak disentuh. Diuji di W-022 (job 11/12 di spooler).
/// </summary>
[SupportedOSPlatform("windows")]
internal static class PrintTicketDevmode
{
    /// <summary>
    /// Terapkan opsi pemotong ke DEVMODE <paramref name="settings"/>. Mengembalikan opsi yang terbaca kembali dari
    /// DEVMODE, atau <c>null</c> kalau driver tidak punya fitur pemotong (dilewati).
    /// </summary>
    public static string? ApplyCutter(PrinterSettings settings, string option)
    {
        var printer = settings.PrinterName;
        var ticket = ToTicket(printer, settings.GetHdevmode());
        var updated = CutterTicket.WithCutter(ticket, option);
        if (updated is null) return null;

        var hNew = ToDevmode(printer, updated);
        try { settings.SetHdevmode(hNew); }
        finally { GlobalFree(hNew); }

        var applied = CutterTicket.Read(ToTicket(printer, settings.GetHdevmode()));
        if (applied != option)
            throw new PrintFailure(PrintErrors.PrintError, $"pemotong driver tetap {applied ?? "?"}, bukan {option}");
        return applied;
    }

    /// <summary>DEVMODE (HGLOBAL dari <see cref="PrinterSettings.GetHdevmode()"/>, dibebaskan di sini) → XML tiket.</summary>
    private static string ToTicket(string printer, IntPtr hDevmode)
    {
        var provider = Open(printer);
        var p = GlobalLock(hDevmode);
        try
        {
            // DEVMODEW: dmSize @68, dmDriverExtra @70 (setelah dmDeviceName 32 WCHAR, dmSpecVersion, dmDriverVersion).
            var size = (uint)(Marshal.ReadInt16(p, 68) + Marshal.ReadInt16(p, 70));
            Check(CreateStreamOnHGlobal(IntPtr.Zero, true, out var stream), "CreateStreamOnHGlobal");
            Check(PTConvertDevModeToPrintTicket(provider, size, p, JobScope, stream), "PTConvertDevModeToPrintTicket");
            Check(GetHGlobalFromStream(stream, out var hText), "GetHGlobalFromStream");
            var len = (int)GlobalSize(hText);
            var bytes = new byte[len];
            Marshal.Copy(GlobalLock(hText), bytes, 0, len);
            GlobalUnlock(hText);
            return Encoding.UTF8.GetString(bytes).TrimEnd('\0');
        }
        finally
        {
            GlobalUnlock(hDevmode);
            GlobalFree(hDevmode);
            PTCloseProvider(provider);
        }
    }

    /// <summary>XML tiket → DEVMODE baru (HGLOBAL, pemanggil membebaskan) di atas DEVMODE default pengguna.</summary>
    private static IntPtr ToDevmode(string printer, string ticketXml)
    {
        var provider = Open(printer);
        try
        {
            var bytes = Encoding.UTF8.GetBytes(ticketXml);
            Check(CreateStreamOnHGlobal(IntPtr.Zero, true, out var stream), "CreateStreamOnHGlobal");
            stream.Write(bytes, bytes.Length, IntPtr.Zero);
            stream.Seek(0, 0, IntPtr.Zero);
            Check(PTConvertPrintTicketToDevMode(provider, stream, UserDefaultDevmode, JobScope, out var cb, out var devmode, out var error),
                $"PTConvertPrintTicketToDevMode {error}");
            try
            {
                var h = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)cb);
                var dst = GlobalLock(h);
                var buffer = new byte[cb];
                Marshal.Copy(devmode, buffer, 0, (int)cb);
                Marshal.Copy(buffer, 0, dst, (int)cb);
                GlobalUnlock(h);
                return h;
            }
            finally { PTReleaseMemory(devmode); }
        }
        finally { PTCloseProvider(provider); }
    }

    private static IntPtr Open(string printer)
    {
        Check(PTOpenProvider(printer, 1, out var provider), $"PTOpenProvider '{printer}'");
        return provider;
    }

    private static void Check(int hr, string what)
    {
        if (hr != 0) throw new PrintFailure(PrintErrors.PrintError, $"PrintTicket: {what} gagal (0x{hr:X8})");
    }

    private const int JobScope = 2;           // EPrintTicketScope.kPTJobScope
    private const int UserDefaultDevmode = 0; // EDefaultDevmodeType.kUserDefaultDevmode
    private const uint GMEM_MOVEABLE = 0x0002;

    [DllImport("prntvpt.dll", CharSet = CharSet.Unicode)] private static extern int PTOpenProvider(string printerName, int version, out IntPtr provider);
    [DllImport("prntvpt.dll")] private static extern int PTCloseProvider(IntPtr provider);
    [DllImport("prntvpt.dll")] private static extern int PTConvertDevModeToPrintTicket(IntPtr provider, uint cbDevmode, IntPtr devmode, int scope, IStream printTicket);
    [DllImport("prntvpt.dll")] private static extern int PTConvertPrintTicketToDevMode(IntPtr provider, IStream printTicket, int baseType, int scope, out uint cbDevmode, out IntPtr devmode, [MarshalAs(UnmanagedType.BStr)] out string errorMessage);
    [DllImport("prntvpt.dll")] private static extern int PTReleaseMemory(IntPtr buffer);
    [DllImport("ole32.dll")] private static extern int CreateStreamOnHGlobal(IntPtr hGlobal, bool deleteOnRelease, out IStream stream);
    [DllImport("ole32.dll")] private static extern int GetHGlobalFromStream(IStream stream, out IntPtr hGlobal);
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr h);
    [DllImport("kernel32.dll")] private static extern bool GlobalUnlock(IntPtr h);
    [DllImport("kernel32.dll")] private static extern UIntPtr GlobalSize(IntPtr h);
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalFree(IntPtr h);
}
