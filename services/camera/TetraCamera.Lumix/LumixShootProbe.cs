using System.Diagnostics;
using System.Runtime.InteropServices;
using static TetraCamera.Lumix.Lmx;

namespace TetraCamera.Lumix;

/// <summary>
/// Diagnostik jepret GH5 (W-043, 15 Okt: rana diterima tapi tidak ada event objek): daftarkan callback ke banyak ID
/// event, jepret dengan / tanpa pompa pesan Windows, dan cetak setiap callback yang datang beserta waktunya.
/// </summary>
public static class LumixShootProbe
{
    private static readonly Stopwatch Clock = Stopwatch.StartNew();
    private static TextWriter _out = TextWriter.Null;
    // Delegate di field statis supaya tidak di-GC selama DLL memegang pointer-nya.
    private static readonly Callback Spy = (type, param) =>
    {
        _out.WriteLine($"EVENT +{Clock.ElapsedMilliseconds} ms type=0x{type:X8} param=0x{param:X8} thread={Environment.CurrentManagedThreadId}");
        return 0;
    };

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg { public IntPtr Hwnd; public uint Message; public UIntPtr W; public IntPtr L; public uint Time; public int X, Y; }
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Msg m, IntPtr h, uint min, uint max, uint remove);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Msg m);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Msg m);

    public static int Run(string dllDir, TextWriter o)
    {
        _out = o;
        using var d = new LumixDriver(dllDir);
        if (d.Open() is not { } who) { o.WriteLine("kamera tidak ditemukan"); return 1; }
        o.WriteLine($"tersambung {who.Model} (thread {Environment.CurrentManagedThreadId}, {Thread.CurrentThread.GetApartmentState()})");
        if (Environment.GetEnvironmentVariable("LUMIX_PROBE_CAPA") == "1")
        {
            var capa = new byte[CapaSize];
            foreach (var (name, fn, prop) in new (string, Func<byte[], (byte, uint)>, uint)[]
            {
                ("ISO", b => (LMX_func_api_ISO_Get_Capability(b, out var e), e), LumixProps.Iso),
                ("SS", b => (LMX_func_api_SS_Get_Capability(b, out var e), e), LumixProps.Shutter),
                ("F", b => (LMX_func_api_Aperture_Get_Capability(b, out var e), e), LumixProps.Aperture),
                ("EV", b => (LMX_func_api_Exposure_Get_Capability(b, out var e), e), LumixProps.Exposure),
            })
            {
                Array.Clear(capa);
                var (ok, err) = fn(capa);
                var last = Array.FindLastIndex(capa, x => x != 0);
                o.WriteLine($"CAPA {name} ok={ok} err=0x{err:X8} nilai=0x{d.GetProp(prop):X} {last + 1} byte:");
                o.WriteLine("  " + Convert.ToHexString(capa, 0, Math.Min(last + 8, 600)));
            }
            return 0;
        }
        // Semua ID event 0x10000001–0x100000FF kecuali dua milik driver (tetap dipegang LumixDriver).
        var reg = 0;
        for (uint id = 0x10000001; id <= 0x100000FF; id++)
            if (id is not (EventObjectAdd or EventObjectTransfer) && LMX_func_api_Reg_NotifyCallback(id, Spy) is var r)
                reg += r == 1 ? 1 : 0;
        o.WriteLine($"callback tambahan terdaftar: {reg}");
        var mode = Environment.GetEnvironmentVariable("LUMIX_PROBE_AF") == "1" ? "AF lalu jepret" : "jepret";
        for (var round = 0; round < 2; round++)
        {
            var pump = round == 1;
            o.WriteLine($"--- {mode}, pompa pesan: {(pump ? "ya" : "tidak")} (+{Clock.ElapsedMilliseconds} ms)");
            try
            {
                if (mode.StartsWith("AF")) d.Focus("af");
                var shot = d.Capture(TimeSpan.Zero);
                o.WriteLine($"langsung ada foto {shot.Length} byte");
                continue;
            }
            catch (HotFolder.CameraFailure e) when (e.Code == "capture_timeout") { o.WriteLine($"rana dikirim +{Clock.ElapsedMilliseconds} ms"); }
            catch (HotFolder.CameraFailure e) { o.WriteLine($"gagal: {e.Code} {e.Message}"); continue; }
            var end = Clock.ElapsedMilliseconds + 10000;
            while (Clock.ElapsedMilliseconds < end)
            {
                if (d.TakeUnsolicited() is { } jpeg) { o.WriteLine($"FOTO +{Clock.ElapsedMilliseconds} ms {jpeg.Length} byte"); break; }
                if (pump)
                    while (PeekMessage(out var m, IntPtr.Zero, 0, 0, 1)) { TranslateMessage(ref m); DispatchMessage(ref m); }
                Thread.Sleep(20);
            }
        }
        for (uint id = 0x10000001; id <= 0x100000FF; id++)
            if (id is not (EventObjectAdd or EventObjectTransfer)) LMX_func_api_Delete_CallBackInfo(id);
        return 0;
    }
}
