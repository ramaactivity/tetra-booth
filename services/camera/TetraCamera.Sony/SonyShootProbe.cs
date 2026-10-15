namespace TetraCamera.Sony;

/// <summary>
/// Diagnostik jepret Sony di hardware (`TetraCamera --sony-probe wpd --sony-shoot`, lapangan 15 Okt: A7 III rana
/// tidak berbunyi, setelan hanya-baca). Mencetak semua properti (bisa diubah PC atau tidak, aktif, nilai), daftar
/// kontrol, lalu S1/S2 dengan kode jawaban kamera dan perubahan Focus Indication / Shooting File Info tiap 100 ms.
/// Tidak menyimpan apa pun.
/// </summary>
public static class SonyShootProbe
{
    public static int Run(IPtpTransport t, TextWriter o)
    {
        if (!t.Open())
        {
            o.WriteLine("GAGAL buka kamera");
            return 1;
        }
        try
        {
            var s = SonyProtocol.Connect(t, null, m => o.WriteLine($"INFO  {m}"));
            o.WriteLine($"INFO  kontrol ({s.Ext.Controls.Length}): {string.Join(" ", s.Ext.Controls.Select(c => $"0x{c:X4}"))}");
            var st = SonyProtocol.Poll(t);
            o.WriteLine($"INFO  properti ({st.Props.Count}), enum {(st.TwoEnumLists ? "dua" : "satu")} daftar:");
            foreach (var p in st.Props.Values.OrderBy(p => p.Code))
                o.WriteLine(
                    $"PROP  0x{p.Code:X4} tipe 0x{p.DataType:X4} {(p.Settable ? "ubah" : "baca")} aktif={p.Enabled} " +
                    $"nilai={(p.Text ?? $"0x{p.Current:X}")} pilihan={p.SetValues.Length}" +
                    (p.Range is { } r ? $" rentang {r.Min}..{r.Max}/{r.Step}" : ""));

            long? Val(ushort c) => SonyProtocol.Poll(t).Props.TryGetValue(c, out var v) ? v.Current : null;
            string Watch() => $"fokus 0xD213={Val(SonyProps.FocusIndication):X} file 0xD215={Val(SonyProps.ShootingFileInfo):X}";
            void Ctl(string label, ushort code, long value)
            {
                var r = t.Execute(Ptp.SdioControlDevice, [code], write: new PtpWriter().Value(0x0004, value).ToArray());
                o.WriteLine($"CTRL  {label}: jawaban 0x{r.Code:X4}  {Watch()}");
            }
            void Follow(string label, int ms)
            {
                var end = DateTime.UtcNow.AddMilliseconds(ms);
                var last = "";
                while (DateTime.UtcNow < end)
                {
                    var w = Watch();
                    if (w != last) o.WriteLine($"WAIT  {label} +{ms - (end - DateTime.UtcNow).TotalMilliseconds:0} ms: {w}");
                    last = w;
                    Thread.Sleep(100);
                }
            }

            o.WriteLine($"INFO  awal: {Watch()}");
            Ctl("S1 Down", SonyProps.S1, SonyProps.Down);
            Follow("setelah S1", 1500);
            Ctl("S2 Down", SonyProps.S2, SonyProps.Down);
            Follow("setelah S2 Down", 500);
            Ctl("S2 Up", SonyProps.S2, SonyProps.Up);
            Ctl("S1 Up", SonyProps.S1, SonyProps.Up);
            Follow("setelah lepas", 5000);
            var shot = t.Execute(Ptp.GetObjectInfo, [Ptp.ShotHandle], read: true);
            o.WriteLine($"INFO  GetObjectInfo 0xFFFFC001: jawaban 0x{shot.Code:X4}, {shot.Data.Length} byte");
            return 0;
        }
        catch (Exception e)
        {
            o.WriteLine($"GAGAL {e.GetType().Name}: {e.Message}");
            return 1;
        }
        finally
        {
            try { t.Close(); } catch { /* keluar */ }
        }
    }
}
