namespace TetraCamera.Sony;

/// <summary>
/// Versi protokol Sony per bodi (docs/PLAN-SONY.md §1): opcode & alur sama, beda versi handshake dan sebagian kontrol.
/// v2 = PTP 2 (bodi sebelum 2020, mis. A7 II/A7 III), v3 = PTP 3 (A7 IV/A7 V/A7C).
/// </summary>
public sealed record SonyProfile(string Name, ushort Version)
{
    public static readonly SonyProfile V2 = new("v2", 0x00C8);
    public static readonly SonyProfile V3 = new("v3", 0x012C);

    /// <summary>
    /// Bodi PTP 2 saja (sebelum 2020). Semua bodi di daftar PTP 2 bisa v2, jadi salah masuk sini aman; bodi yang tidak
    /// tercantum dicoba v3 dulu lalu jatuh ke v2 kalau ditolak (<see cref="SonyProtocol.Connect"/>).
    /// </summary>
    private static readonly string[] V2Models =
        ["ILCE-7M2", "ILCE-7M3", "ILCE-7RM3", "ILCE-7RM4", "ILCE-9M2", "ILCE-6100", "ILCE-6400", "ILCE-6600"];

    public static SonyProfile ForModel(string model) =>
        V2Models.Any(m => model.StartsWith(m, StringComparison.OrdinalIgnoreCase)) ? V2 : V3;

    public int Major => Version / 100;
}

/// <summary>Hasil sambung: info bodi, profil yang dipakai, dan isi SDIO_GetExtDeviceInfo.</summary>
public sealed record SonySession(PtpDeviceInfo Device, SonyProfile Profile, SonyExtDeviceInfo Ext);

/// <summary>Handshake & polling Camera Remote Command (identifier: docs/PLAN-SONY.md §3).</summary>
public static class SonyProtocol
{
    /// <summary>SDIO_GetExtDeviceInfo dengan data kosong diulang (kamera belum siap), maks. sekian kali.</summary>
    public const int ExtInfoTries = 20;

    /// <summary>
    /// GetDeviceInfo → profil dari model → handshake. v3 ditolak (0xA101, atau kamera menjawab versi mayor &lt; 3)
    /// → handshake ulang dengan v2. <paramref name="force"/> = paksa satu profil (probe W-037).
    /// </summary>
    public static SonySession Connect(IPtpTransport t, SonyProfile? force = null, Action<string>? log = null, int retryMs = 100)
    {
        var dev = PtpDeviceInfo.Parse(t.Call(Ptp.GetDeviceInfo, [], read: true).Data);
        var profile = force ?? SonyProfile.ForModel(dev.Model);
        log?.Invoke($"GetDeviceInfo: {dev.Manufacturer} {dev.Model} fw {dev.Version}, profil {profile.Name}");
        try
        {
            return new(dev, profile, Handshake(t, profile, log, retryMs));
        }
        catch (SonyRejected e) when (profile == SonyProfile.V3 && force is null)
        {
            log?.Invoke($"v3 ditolak ({e.Message}), buka ulang lalu handshake v2");
            t.Close();
            if (!t.Open()) throw new IOException("kamera Sony hilang saat handshake ulang");
            return new(dev, SonyProfile.V2, Handshake(t, SonyProfile.V2, log, retryMs));
        }
    }

    /// <summary>SDIO_Connect fase 1 & 2 → SDIO_GetExtDeviceInfo (ulang selama data kosong) → SDIO_Connect fase 3.</summary>
    public static SonyExtDeviceInfo Handshake(IPtpTransport t, SonyProfile p, Action<string>? log = null, int retryMs = 100)
    {
        t.Call(Ptp.SdioConnect, [1, 0, 0], read: true);
        t.Call(Ptp.SdioConnect, [2, 0, 0], read: true);
        SonyExtDeviceInfo? ext = null;
        for (var i = 0; ext is null; i++)
        {
            var r = t.Execute(Ptp.SdioGetExtDeviceInfo, [p.Version], read: true);
            if (r.Code == Ptp.AuthenticationFailed) throw new SonyRejected($"0x9202 versi 0x{p.Version:X4} dijawab 0xA101");
            if (!r.Ok) throw new PtpError(Ptp.SdioGetExtDeviceInfo, r.Code);
            if (r.Data.Length > 0) ext = SonyExtDeviceInfo.Parse(r.Data);
            else if (i + 1 >= ExtInfoTries) throw new IOException($"SDIO_GetExtDeviceInfo kosong {ExtInfoTries}× (kamera belum siap)");
            else Thread.Sleep(retryMs);
        }
        log?.Invoke($"SDIO_GetExtDeviceInfo: versi 0x{ext.Version:X4}, {ext.Properties.Length} properti, {ext.Controls.Length} kontrol");
        if (ext.Version / 100 < p.Major) throw new SonyRejected($"kamera menjawab versi 0x{ext.Version:X4}");
        t.Call(Ptp.SdioConnect, [3, 0, 0], read: true);
        return ext;
    }

    /// <summary>SDIO_GetAllExtDevicePropInfo: status & setelan terkini (dipanggil berkala saat idle).</summary>
    public static PropSet Poll(IPtpTransport t) =>
        SonyProp.ParseAll(t.Call(Ptp.SdioGetAllExtDevicePropInfo, [], read: true).Data);
}

/// <summary>Kamera menolak versi protokol yang diminta.</summary>
public sealed class SonyRejected(string message) : Exception(message);
