namespace TetraCamera.Sony;

/// <summary>
/// Diagnostik ubah setelan Sony di hardware (`TetraCamera --sony-set --sony-probe wpd`, lapangan 15 Okt: A7 III v2
/// melaporkan ISO/shutter/F/EV hanya-baca dan tidak punya kontrol berkode sama). Mencoba beberapa cara per setelan dan
/// mencetak apakah nilai di kamera berubah, lalu mengembalikan nilai awal dengan cara yang berhasil.
/// </summary>
public static class SonySetProbe
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
            SonyProtocol.Connect(t, null, m => o.WriteLine($"INFO  {m}"));
            long? Cur(ushort c) => SonyProtocol.Poll(t).Props.TryGetValue(c, out var p) ? p.Current : null;
            long? Settle(ushort c, long? before)
            {
                for (var i = 0; i < 15; i++)
                {
                    Thread.Sleep(100);
                    var v = Cur(c);
                    if (v != before) return v;
                }
                return Cur(c);
            }
            // Dataset pertama setelah sambung bisa belum lengkap (ISO terbaca 0): tunggu sebentar.
            for (var w = 0; w < 10 && Cur(SonyProps.Iso) is null or 0; w++) Thread.Sleep(200);
            foreach (var (name, code) in new[] {
                         ("ISO", SonyProps.Iso), ("Shutter", SonyProps.Shutter),
                         ("F", SonyProps.FNumber), ("EV", SonyProps.ExposureComp) })
            {
                var p0 = SonyProtocol.Poll(t).Props.GetValueOrDefault(code);
                if (p0 is null)
                {
                    o.WriteLine($"INFO  {name} 0x{code:X4} tidak ada");
                    continue;
                }
                var opts = p0.SetValues.Length > 0 ? p0.SetValues : p0.GetSetValues;
                o.WriteLine($"INFO  {name} 0x{code:X4} tipe 0x{p0.DataType:X4} ubah={p0.Settable} aktif={p0.Enabled} " +
                    $"nilai=0x{p0.Current:X} pilihan={opts.Length}");
                var start = p0.Current;
                string? works = null;
                // A. absolut lewat 0x9205 (tetangga di daftar enum)
                var idx = Array.IndexOf(opts, start);
                if (idx >= 0 && opts.Length > 1)
                {
                    var target = opts[idx + 1 < opts.Length ? idx + 1 : idx - 1];
                    var r = t.Execute(Ptp.SdioSetExtDevicePropValue, [code], write: new PtpWriter().Value(p0.DataType, target).ToArray());
                    var v = Settle(code, start);
                    o.WriteLine($"TRY   {name} A 0x9205 absolut 0x{target:X}: jawaban 0x{r.Code:X4} → 0x{v:X}");
                    if (v == target) works ??= "A";
                    if (v != start) Restore(t, code, p0.DataType, start, o, name);
                }
                // B. langkah +1 lewat 0x9205 (INT8)
                {
                    var r = t.Execute(Ptp.SdioSetExtDevicePropValue, [code], write: new PtpWriter().Value(0x0001, 1).ToArray());
                    var v = Settle(code, start);
                    o.WriteLine($"TRY   {name} B 0x9205 langkah +1 (INT8): jawaban 0x{r.Code:X4} → 0x{v:X}");
                    if (v != start)
                    {
                        works ??= "B";
                        t.Execute(Ptp.SdioSetExtDevicePropValue, [code], write: new PtpWriter().Value(0x0001, -1).ToArray());
                        o.WriteLine($"INFO  {name} dikembalikan langkah -1 → 0x{Settle(code, v):X}");
                    }
                }
                // C. langkah +1 lewat 0x9207 (INT8)
                {
                    var r = t.Execute(Ptp.SdioControlDevice, [code], write: new PtpWriter().Value(0x0001, 1).ToArray());
                    var v = Settle(code, start);
                    o.WriteLine($"TRY   {name} C 0x9207 langkah +1 (INT8): jawaban 0x{r.Code:X4} → 0x{v:X}");
                    if (v != start)
                    {
                        works ??= "C";
                        t.Execute(Ptp.SdioControlDevice, [code], write: new PtpWriter().Value(0x0001, -1).ToArray());
                        o.WriteLine($"INFO  {name} dikembalikan langkah -1 → 0x{Settle(code, v):X}");
                    }
                }
                o.WriteLine($"HASIL {name}: {works ?? "tidak ada cara yang mengubah nilai"} (akhir 0x{Cur(code):X})");
            }
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

    private static void Restore(IPtpTransport t, ushort code, ushort type, long value, TextWriter o, string name)
    {
        t.Execute(Ptp.SdioSetExtDevicePropValue, [code], write: new PtpWriter().Value(type, value).ToArray());
        Thread.Sleep(300);
        o.WriteLine($"INFO  {name} dikembalikan absolut ke 0x{value:X}");
    }
}
