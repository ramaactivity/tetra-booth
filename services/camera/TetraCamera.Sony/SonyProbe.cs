namespace TetraCamera.Sony;

/// <summary>
/// Diagnostik W-037 (`TetraCamera --sony-probe wpd`): apakah transport meneruskan opcode vendor Sony & handle khusus.
/// Mencetak satu baris per langkah ("OK"/"GAGAL"/"INFO") supaya hasilnya bisa disalin utuh ke laporan Windows.
/// Exit code 0 = handshake + polling berhasil.
/// </summary>
public static class SonyProbe
{
    public static int Run(IPtpTransport t, TextWriter o, SonyProfile? force = null)
    {
        var ok = true;
        void Step(string name, Func<string> f)
        {
            try { o.WriteLine($"OK    {name}: {f()}"); }
            catch (Exception e)
            {
                ok = false;
                o.WriteLine($"GAGAL {name}: {e.GetType().Name}: {e.Message}");
            }
        }

        if (OperatingSystem.IsWindows() && t is WpdTransport)
            foreach (var d in WpdTransport.Devices()) o.WriteLine($"INFO  perangkat WPD: {d}");
        if (!t.Open())
        {
            o.WriteLine("GAGAL buka: tidak ada kamera Sony (cek mode USB PC Remote & driver MTP USB Device)");
            return 1;
        }
        o.WriteLine("OK    buka kamera");
        if (OperatingSystem.IsWindows() && t is WpdTransport w)
            Step("opcode vendor dari driver", () =>
            {
                var ops = w.VendorOpcodes();
                var missing = Ptp.RequiredVendorOps.Where(op => !ops.Contains(op)).ToArray();
                var list = string.Join(" ", ops.Select(op => $"0x{op:X4}"));
                return missing.Length == 0
                    ? $"{ops.Length} opcode, lengkap: {list}"
                    : throw new InvalidOperationException(
                        $"tidak ada {string.Join(" ", missing.Select(m => $"0x{m:X4}"))}; yang ada: {list}");
            });

        SonySession? s = null;
        Step("handshake", () =>
        {
            s = SonyProtocol.Connect(t, force, m => o.WriteLine($"INFO  {m}"));
            return $"{s.Device.Model} profil {s.Profile.Name}, versi 0x{s.Ext.Version:X4}, serial {s.Device.Serial}";
        });
        if (s is not null)
        {
            Step("operasi di GetDeviceInfo", () =>
            {
                var missing = Ptp.RequiredVendorOps.Where(op => !s.Device.Operations.Contains(op)).ToArray();
                return missing.Length == 0
                    ? $"{s.Device.Operations.Length} operasi, vendor lengkap"
                    : throw new InvalidOperationException($"tidak ada {string.Join(" ", missing.Select(m => $"0x{m:X4}"))}");
            });
            Step("SDIO_GetAllExtDevicePropInfo", () =>
            {
                var p = SonyProtocol.Poll(t);
                string Val(ushort c) => p.Props.TryGetValue(c, out var v) ? $"{v.Current}" : "-";
                return $"{p.Props.Count} properti, enum {(p.TwoEnumLists ? "dua" : "satu")} daftar; " +
                    $"baterai 0xD218={Val(0xD218)}, live view 0xD221={Val(0xD221)}, simpan 0xD222={Val(0xD222)}, ISO 0xD21E={Val(0xD21E)}";
            });
            // Handle khusus: jawaban PTP apa pun (OK / 0x2009 / 0x200F) = driver meneruskan; exception = driver menolak.
            foreach (var h in new[] { Ptp.LiveViewHandle, Ptp.ShotHandle })
                Step($"GetObjectInfo 0x{h:X8} diteruskan driver", () =>
                    $"kamera menjawab 0x{t.Execute(Ptp.GetObjectInfo, [h], read: true).Code:X4}");
        }
        try { t.Close(); } catch { /* keluar */ }
        o.WriteLine(ok ? "HASIL: LULUS" : "HASIL: ADA YANG GAGAL");
        return ok ? 0 : 1;
    }
}
