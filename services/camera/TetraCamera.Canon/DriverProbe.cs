using TetraCamera.HotFolder;

namespace TetraCamera.Canon;

/// <summary>Probe driver SDK (Lumix #214, Nikon #216) untuk uji Windows dengan kamera asli.</summary>
public static class DriverProbe
{
    /// <summary>
    /// Diagnostik uji kamera asli (`--lumix-probe`, `--nikon-probe`): sambung, cetak model + setelan + pilihan, ambil frame live view, jepret satu
    /// ke <paramref name="outFile"/>. 0 = semua jalan.
    /// </summary>
    public static int Run(ICanonDriver d, CanonProps.Def[] props, TextWriter o, string outFile)
    {
        try
        {
            if (d.Open() is not { } info)
            {
                o.WriteLine("Tidak ada kamera tersambung (mode USB kamera, kamera menyala?)");
                return 1;
            }
            o.WriteLine($"Model: {info.Model}");
            foreach (var p in props)
            {
                try
                {
                    var v = d.GetProp(p.PropId);
                    var opts = d.PropOptions(p.PropId);
                    var unknown = opts.Where(x => !p.Values.ContainsKey(x)).Select(x => $"0x{x:X}").ToArray();
                    o.WriteLine($"{p.Label}: {p.Values.GetValueOrDefault(v, $"0x{v:X}")} · {opts.Length} pilihan" +
                        (unknown.Length > 0 ? $" · tanpa label: {string.Join(" ", unknown)}" : ""));
                }
                catch (CameraFailure e) { o.WriteLine($"{p.Label}: {e.Message}"); }
            }
            d.SetLiveView(true);
            byte[]? frame = null;
            for (var i = 0; i < 100 && frame is null; i++)
            {
                frame = d.LiveViewFrame();
                if (frame is null) Thread.Sleep(50);
            }
            o.WriteLine(frame is null ? "Live view: tidak ada frame dalam 5 detik"
                : $"Live view: {(JpegInfo.ReadSize(new MemoryStream(frame)) is { } s ? $"{s.Width}×{s.Height}" : "bukan JPEG")}, {frame.Length} byte");
            d.SetLiveView(false);
            var jpeg = d.Capture(CanonCamera.CaptureTimeout);
            var dst = outFile;
            File.WriteAllBytes(dst, jpeg);
            var dims = JpegInfo.ReadSize(new MemoryStream(jpeg));
            o.WriteLine($"Jepret: {dst} ({(dims is { } x ? $"{x.Width}×{x.Height}" : "bukan JPEG")}, {jpeg.Length} byte)");
            return frame is not null && dims is not null ? 0 : 1;
        }
        catch (CameraFailure e)
        {
            o.WriteLine($"Gagal: {e.Message}");
            return 1;
        }
        finally { d.Close(); }
    }
}
