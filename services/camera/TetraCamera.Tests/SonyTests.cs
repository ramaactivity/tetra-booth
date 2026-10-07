using System.Text.Json;
using TetraCamera.HotFolder;
using TetraCamera.Host;
using TetraCamera.Print;
using TetraCamera.Sony;

namespace TetraCamera.Tests;

/// <summary>Sony Camera Remote Command (DECISIONS #169) dengan kamera palsu tingkat PTP: tanpa kamera, jalan di Mac/CI.</summary>
public class SonyTests
{
    private static async Task Until(Func<bool> ok, int ms = 3000)
    {
        var end = DateTime.UtcNow.AddMilliseconds(ms);
        while (!ok())
        {
            if (DateTime.UtcNow > end) throw new TimeoutException("kondisi tidak tercapai");
            await Task.Delay(10);
        }
    }

    private static SonySession Connect(FakeSonyTransport t)
    {
        Assert.True(t.Open());
        return SonyProtocol.Connect(t, retryMs: 1);
    }

    [Theory]
    [InlineData("ILCE-7M3", "v2")]
    [InlineData("ILCE-7M2", "v2")]
    [InlineData("ILCE-7RM3A", "v2")]
    [InlineData("ILCE-7M4", "v3")]
    [InlineData("ILCE-7M5", "v3")]
    [InlineData("ILCE-7C", "v3")]
    public void Profil_dipilih_dari_model(string model, string profile) =>
        Assert.Equal(profile, SonyProfile.ForModel(model).Name);

    [Fact]
    public void A7III_handshake_v2_berurutan()
    {
        var t = FakeSonyTransport.A7III();
        var s = Connect(t);
        Assert.Equal(("Sony Corporation", "ILCE-7M3", "fake-sony"), (s.Device.Manufacturer, s.Device.Model, s.Device.Serial));
        Assert.Equal("v2", s.Profile.Name);
        Assert.Equal(0x00C8, s.Ext.Version);
        Assert.Contains((ushort)0xD218, s.Ext.Properties);
        Assert.Equal([(0x1001, 0u), (0x9201, 1u), (0x9201, 2u), (0x9202, 0xC8u), (0x9201, 3u)], t.Log.Select(l => ((int)l.Op, l.P1)));
    }

    [Fact]
    public void A7IV_handshake_v3()
    {
        var t = FakeSonyTransport.A7IV();
        var s = Connect(t);
        Assert.Equal(("v3", (ushort)0x012C), (s.Profile.Name, s.Ext.Version));
        Assert.Contains(((ushort)0x9202, 0x012Cu), t.Log);
    }

    [Theory]
    [InlineData(true)]  // bodi menjawab 0xA101
    [InlineData(false)] // bodi menjawab versinya sendiri (0x00C8)
    public void Bodi_v2_tak_dikenal_ditolak_v3_lalu_jatuh_ke_v2(bool rejectNewer)
    {
        var t = new FakeSonyTransport("ILCE-9", 0x00C8, false) { RejectNewer = rejectNewer };
        var s = Connect(t);
        Assert.Equal("v2", s.Profile.Name);
        var ext = t.Log.Where(l => l.Op == 0x9202).Select(l => l.P1).ToArray();
        Assert.Equal([0x012Cu, 0x00C8u], ext);
        Assert.True(t.IsOpen);
        Assert.True(SonyProtocol.Poll(t).Props.ContainsKey(SonyProps.Iso));
    }

    [Fact]
    public void Versi_dipaksa_tidak_jatuh_ke_v2()
    {
        var t = FakeSonyTransport.A7III();
        Assert.True(t.Open());
        Assert.Throws<SonyRejected>(() => SonyProtocol.Connect(t, SonyProfile.V3, retryMs: 1));
    }

    [Fact]
    public void ExtDeviceInfo_kosong_diulang_sampai_ada()
    {
        var t = FakeSonyTransport.A7III();
        t.EmptyExtInfo = 3;
        Connect(t);
        Assert.Equal(4, t.Log.Count(l => l.Op == 0x9202));
    }

    [Fact]
    public void Polling_sebelum_handshake_ditolak_kamera()
    {
        var t = FakeSonyTransport.A7III();
        t.Open();
        var e = Assert.Throws<PtpError>(() => SonyProtocol.Poll(t));
        Assert.Equal(Ptp.AuthenticationFailed, e.Code);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Dataset_properti_satu_atau_dua_daftar_enum(bool v3)
    {
        var t = v3 ? FakeSonyTransport.A7IV() : FakeSonyTransport.A7III();
        Connect(t);
        var p = SonyProtocol.Poll(t);
        Assert.Equal(v3, p.TwoEnumLists);
        var iso = p.Props[0xD21E];
        Assert.Equal((400L, v3), (iso.Current, iso.Settable));
        Assert.Equal([0x00FFFFFF, 100L, 200, 400, 800, 1600, 3200, 6400], iso.SetValues);
        Assert.Equal(iso.SetValues, iso.GetSetValues);
        Assert.Equal(80, p.Props[0xD218].Current);
        Assert.Equal((-1L, 100L, 1L), p.Props[0xD218].Range);
        Assert.True(p.Props[0x5005].Settable);
        Assert.Equal(1, p.Props[0xD221].Current);
        Assert.Equal(v3, p.Props.ContainsKey(SonyProps.MediaStatus));
    }

    [Fact]
    public void Dataset_string_array_dan_int_bertanda()
    {
        var w = new PtpWriter().U64(3);
        w.U16(0xD2AA).U16(0xFFFF).U8(0).U8(2).Str("").Str("A7 III").U8(0);
        w.U16(0xD2AB).U16(0x4004).U8(0).U8(1).U32(1).U16(7).U32(2).U16(8).U16(9).U8(0);
        w.U16(0x5010).U16(0x0003).U8(1).U8(1).Value(0x0003, 0).Value(0x0003, -300).U8(2)
            .U16(2).Value(0x0003, -300).Value(0x0003, 300).U16(1).Value(0x0003, 0);
        var p = SonyProp.ParseAll(w.ToArray());
        Assert.True(p.TwoEnumLists);
        Assert.Equal("A7 III", p.Props[0xD2AA].Text);
        Assert.Equal(2, p.Props[0xD2AA].Enabled);
        Assert.True(p.Props.ContainsKey(0xD2AB));
        Assert.Equal(-300, p.Props[0x5010].Current);
        Assert.Equal([-300L, 300], p.Props[0x5010].SetValues);
        Assert.Equal([0L], p.Props[0x5010].GetSetValues);
    }

    [Fact]
    public void Dataset_terpotong_ditolak()
    {
        var t = FakeSonyTransport.A7IV();
        Connect(t);
        var full = t.Execute(Ptp.SdioGetAllExtDevicePropInfo, [], read: true).Data;
        Assert.Throws<FormatException>(() => SonyProp.ParseAll(full.AsSpan(0, full.Length - 3)));
        Assert.Throws<FormatException>(() => PtpDeviceInfo.Parse(new byte[5]));
    }

    [Fact]
    public async Task Kamera_tersambung_polling_jalan_lalu_cabut_colok_menyambung_ulang()
    {
        var t = FakeSonyTransport.A7III();
        using var cam = new SonyCamera(t, reconnect: TimeSpan.FromMilliseconds(30), pollEvery: TimeSpan.FromMilliseconds(10));
        var events = new List<bool>();
        cam.ConnectionChanged += on => { lock (events) events.Add(on); };
        await Until(() => cam.Connected && cam.Status is not null);
        Assert.Equal(("sony", "ILCE-7M3", "v2"), (cam.Brand, cam.Model, cam.Profile));

        t.Plugged = false;
        await Until(() => !cam.Connected);
        Assert.Null(cam.Status);
        t.Plugged = true;
        await Until(() => cam.Connected);
        lock (events) Assert.Equal([true, false, true], events);

        var disp = new Dispatcher(new NullPrinterAdapter(), cam);
        var list = JsonDocument.Parse(await disp.HandleAsync("""{"id":"l","type":"camera.list"}""")).RootElement;
        Assert.Equal("sony", list.GetProperty("payload")[0].GetProperty("brand").GetString());
    }

    [Fact]
    public async Task Transport_macet_health_melapor_macet()
    {
        var t = FakeSonyTransport.A7III();
        using var cam = new SonyCamera(t, reconnect: TimeSpan.FromMilliseconds(30), pollEvery: TimeSpan.FromMilliseconds(10),
            stuckAfter: TimeSpan.FromMilliseconds(300));
        await Until(() => cam.Connected);
        t.HangMs = 1000;
        await Until(() => cam.Stuck);
        t.HangMs = 0;
        await Until(() => !cam.Stuck, 4000);
    }

    [Fact]
    public void Probe_palsu_lulus_dan_mencetak_hasil()
    {
        var o = new StringWriter();
        Assert.Equal(0, SonyProbe.Run(FakeSonyTransport.A7III(), o));
        Assert.Contains("profil v2", o.ToString());
        Assert.Contains("HASIL: LULUS", o.ToString());
    }
}
