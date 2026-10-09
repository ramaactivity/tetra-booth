using TetraCamera.Canon;
using TetraCamera.HotFolder;
using TetraCamera.Lumix;

namespace TetraCamera.Tests;

/// <summary>Lumix (DECISIONS #214) dengan driver palsu: label kode SDK, CanonCamera bermerek Lumix, probe, parser.</summary>
public class LumixTests
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

    private static FakeCanonDriver Fake() => new("DC-GH5 Simulasi", LumixProps.FakeProps(), LumixProps.FakeOptions());

    [Fact]
    public void Kode_SDK_jadi_label_crew()
    {
        // Contoh spesifikasi bab 4: 1/30 = 30000, 1.6" = 0x80000640, 1/3.2 = 3200, F2.8 = 28, -2/3 EV = 0x8002.
        Assert.Equal(30000u, LumixProps.ShutterCode(1 / 30.0));
        Assert.Equal(0x80000640u, LumixProps.ShutterCode(1.6));
        Assert.Equal("1/30", LumixProps.ShutterLabel(30000));
        Assert.Equal("1/3.2", LumixProps.ShutterLabel(3200));
        Assert.Equal("1\"6", LumixProps.ShutterLabel(0x80000640));
        Assert.Equal("30\"", LumixProps.ShutterLabel(LumixProps.ShutterCode(30)));
        Assert.Equal("Auto", LumixProps.ShutterLabel(0x0FFFFFFF));
        Assert.Equal("ISO 1600", LumixProps.IsoLabel(1600));
        Assert.Equal("ISO Auto", LumixProps.IsoLabel(0xFFFFFFFF));
        Assert.Equal("f/2.8", LumixProps.ApertureLabel(28));
        Assert.Equal("-0.7 EV", LumixProps.EvLabel(0x8002));
        Assert.Equal("+1.0 EV", LumixProps.EvLabel(3));
        Assert.Equal("0.0 EV", LumixProps.EvLabel(0));
        Assert.Equal("Cloudy", LumixProps.WbLabel(0x8008));
        // Pilihan umum GH5 punya label (bukan "0x…").
        var shutter = LumixProps.All.First(d => d.PropId == LumixProps.Shutter).Values;
        foreach (var s in new[] { 1 / 8000.0, 1 / 1300.0, 1 / 125.0, 1 / 60.0, 1 / 13.0, 1.3, 60 })
            Assert.True(shutter.ContainsKey(LumixProps.ShutterCode(s)), $"{s}");
    }

    [Fact]
    public void Capability_dibaca_dari_offset_struct_dan_jumlah_mustahil_ditolak()
    {
        var b = new byte[Lmx.CapaSize];
        // ISO: FORM_ENUM_UINT32 di offset 0 (jumlah u16, nilai u32 mulai +4).
        BitConverter.TryWriteBytes(b.AsSpan(0), (ushort)3);
        foreach (var (v, i) in new uint[] { 200, 400, 800 }.Select((v, i) => (v, i)))
            BitConverter.TryWriteBytes(b.AsSpan(4 + i * 4), v);
        Assert.Equal([200u, 400u, 800u], Lmx.Enum(b, 0, wide: true));
        // Aperture: FORM_ENUM_UINT16 di offset 10 (setelah CurVal u16 + RANGE_UINT16 8 byte).
        BitConverter.TryWriteBytes(b.AsSpan(10), (ushort)2);
        BitConverter.TryWriteBytes(b.AsSpan(12), (ushort)28);
        BitConverter.TryWriteBytes(b.AsSpan(14), (ushort)56);
        Assert.Equal([28u, 56u], Lmx.Enum(b, 10, wide: false));
        BitConverter.TryWriteBytes(b.AsSpan(0), (ushort)600);
        Assert.Throws<CameraFailure>(() => Lmx.Enum(b, 0, wide: true));
    }

    [Fact]
    public void Kode_kamera_hilang_dibedakan_dari_sibuk()
    {
        Assert.True(Lmx.Lost(0x00030002)); // DEV_NEED_OPEN
        Assert.True(Lmx.Lost(0x00040003)); // COM_DATA_RCV
        Assert.False(Lmx.Lost(Lmx.ErrDataBusy));
        Assert.False(Lmx.Lost(0x00100001)); // CAM_INVALID_MODE
    }

    [Fact]
    public async Task CanonCamera_bermerek_Lumix_jepret_setelan_EV_tanpa_baterai_dan_tap_to_focus()
    {
        var d = Fake();
        var settings = Path.Combine(Path.GetTempPath(), $"tc-lumix-{Guid.NewGuid():N}.json");
        using var cam = new CanonCamera(d, reconnect: TimeSpan.FromMilliseconds(50),
            frameEvery: TimeSpan.FromMilliseconds(10), settingsPath: settings, kind: LumixProps.Kind);
        await Until(() => cam.Connected);
        Assert.Equal(("lumix", "DC-GH5 Simulasi"), (cam.Brand, cam.Model));
        Assert.False(cam.CanFocusAt);
        Assert.False(await cam.FocusAtAsync(0.5, 0.5));

        var props = await cam.PropsAsync();
        Assert.Equal(
            ["iso", "iso_capture", "shutterspeed", "shutter_capture", "aperture", "whitebalance", "exposurecomp"],
            props.Select(p => p.Name));
        var iso = props.First(p => p.Name == "iso");
        Assert.Equal("ISO 200", iso.Value);
        Assert.Equal(["ISO Auto", "ISO 200", "ISO 400", "ISO 800", "ISO 1600", "ISO 3200"], iso.Options);
        Assert.Equal("1/125", props.First(p => p.Name == "shutterspeed").Value);
        Assert.Equal(["-1.0 EV", "-0.3 EV", "0.0 EV", "+0.3 EV", "+1.0 EV"], props.First(p => p.Name == "exposurecomp").Options);

        await cam.SetPropAsync("exposurecomp", "+0.3 EV");
        Assert.Equal(1u, d.Props[LumixProps.Exposure]);
        await cam.SetPropAsync("whitebalance", "Cloudy");
        Assert.Equal(0x8008u, d.Props[LumixProps.WhiteBalance]);

        // Shutter jepret: dipasang sebentar saat rana lalu kembali ke shutter live view.
        await cam.SetPropAsync("shutter_capture", "1/200");
        var dir = Path.Combine(Path.GetTempPath(), $"tc-lumix-{Guid.NewGuid():N}");
        var r = await cam.CaptureAsync(dir, 0);
        Assert.Equal(Path.Combine(dir, "1.jpg"), r.Path);
        Assert.Equal(125000u, d.Props[LumixProps.Shutter]);
        Assert.Contains("\"exposurecomp\":\"\\u002B0.3 EV\"", await File.ReadAllTextAsync(settings));
    }

    [Fact]
    public void Probe_dengan_kamera_palsu_lulus()
    {
        var o = new StringWriter();
        var file = Path.Combine(Path.GetTempPath(), $"tc-lumix-{Guid.NewGuid():N}.jpg");
        Assert.Equal(0, DriverProbe.Run(Fake(), LumixProps.All, o, file));
        Assert.Contains("Model: DC-GH5 Simulasi", o.ToString());
        Assert.Contains("ISO live view: ISO 200 · 6 pilihan", o.ToString());
        Assert.True(File.Exists(file));
    }
}
