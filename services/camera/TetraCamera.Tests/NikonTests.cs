using System.Runtime.InteropServices;
using TetraCamera.Canon;
using TetraCamera.Nikon;

namespace TetraCamera.Tests;

/// <summary>Nikon MAID3 (DECISIONS #216) tanpa kamera: tata letak struct, pemilihan modul, label, CanonCamera bermerek Nikon.</summary>
public class NikonTests
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

    private static FakeCanonDriver Fake()
    {
        var (props, options) = NikonProps.Fake();
        return new FakeCanonDriver("D750 Simulasi", props, options);
    }

    [Fact]
    public void Ukuran_struct_sama_dengan_header_pack2_x64()
    {
        Assert.Equal(24, Marshal.SizeOf<Maid.Object>());
        Assert.Equal(16, Marshal.SizeOf<Maid.Callback>());
        Assert.Equal(26, Marshal.SizeOf<Maid.Enum>());
        Assert.Equal(18, Marshal.OffsetOf<Maid.Enum>(nameof(Maid.Enum.Data)).ToInt32());
        Assert.Equal(32, Marshal.SizeOf<Maid.Array>());
        Assert.Equal(44, Marshal.SizeOf<Maid.Range>());
        Assert.Equal(28, Marshal.SizeOf<Maid.FileInfo>());
        Assert.Equal(272, Marshal.SizeOf<Maid.CapInfo>());
    }

    [Fact]
    public void Nama_WPD_memilih_modul()
    {
        Assert.Equal("Type0015", NikonProps.ModuleFor("D750"));
        Assert.Equal("Type0015", NikonProps.ModuleFor("NIKON DSC D750"));
        Assert.Equal("Type0021", NikonProps.ModuleFor("D7500"));
        Assert.Equal("Type0029", NikonProps.ModuleFor("Z 6_2"));
        Assert.Equal("Type0003", NikonProps.ModuleFor("D90"));
        Assert.Equal("Type0012", NikonProps.ModuleFor("Df"));
        Assert.Null(NikonProps.ModuleFor("Z f"));
    }

    [Fact]
    public void Teks_kamera_jadi_label_crew_dan_JPEG_live_view_diambil_setelah_header()
    {
        Assert.Equal("ISO 100", NikonProps.Display(NikonProps.Iso, "100"));
        Assert.Equal("ISO Hi-0.3", NikonProps.Display(NikonProps.Iso, "Hi-0.3"));
        Assert.Equal("1/125", NikonProps.Display(NikonProps.Shutter, "1/125"));
        Assert.Equal("2\"", NikonProps.Display(NikonProps.Shutter, "2"));
        Assert.Equal("f/5.6", NikonProps.Display(NikonProps.Aperture, "5.6"));
        Assert.Equal("FEE", NikonProps.Display(NikonProps.Aperture, "FEE"));
        Assert.Equal("-0.3 EV", NikonProps.EvLabel(-1 / 3.0));
        Assert.Equal("0.0 EV", NikonProps.EvLabel(-0.0000001));
        Assert.Equal(["Auto", "100", "Hi-1.0"], Maid.PackedStrings("Auto\0100\0Hi-1.0\0"u8.ToArray()));
        Assert.Equal(NikonProps.Code("1/125"), NikonProps.Code("1/125"));
        Assert.NotEqual(NikonProps.Code("1/125"), NikonProps.Code("1/160"));
        byte[] frame = [1, 2, 3, 0xFF, 0xD8, 0xFF, 0xE0, 9];
        Assert.Equal([0xFF, 0xD8, 0xFF, 0xE0, 9], Maid.JpegAfterHeader(frame));
        Assert.Null(Maid.JpegAfterHeader([1, 2, 3]));
    }

    [Fact]
    public async Task CanonCamera_bermerek_Nikon_setelan_teks_kamera_baterai_dan_jepret()
    {
        var d = Fake();
        var settings = Path.Combine(Path.GetTempPath(), $"tc-nikon-{Guid.NewGuid():N}.json");
        using var cam = new CanonCamera(d, reconnect: TimeSpan.FromMilliseconds(50),
            frameEvery: TimeSpan.FromMilliseconds(10), settingsPath: settings, kind: NikonProps.Kind);
        await Until(() => cam.Connected);
        Assert.Equal(("nikon", "D750 Simulasi", false), (cam.Brand, cam.Model, cam.CanFocusAt));

        var props = await cam.PropsAsync();
        Assert.Equal(
            ["iso", "iso_capture", "shutterspeed", "shutter_capture", "aperture", "whitebalance", "exposurecomp", "battery"],
            props.Select(p => p.Name));
        Assert.Equal("ISO 200", props.First(p => p.Name == "iso").Value);
        Assert.Equal(["Auto", "Sunny", "Cloudy", "Incandescent"], props.First(p => p.Name == "whitebalance").Options);
        Assert.Equal("80%", props.First(p => p.Name == "battery").Value);

        await cam.SetPropAsync("iso", "ISO 800");
        Assert.Equal(NikonProps.Code("ISO 800"), d.Props[NikonProps.Iso]);
        await cam.SetPropAsync("exposurecomp", "+0.3 EV");
        Assert.Equal(NikonProps.Code("+0.3 EV"), d.Props[NikonProps.Exposure]);

        await cam.SetPropAsync("shutter_capture", "1/200");
        var dir = Path.Combine(Path.GetTempPath(), $"tc-nikon-{Guid.NewGuid():N}");
        var r = await cam.CaptureAsync(dir, 0);
        Assert.True(File.Exists(r.Path));
        Assert.Equal(NikonProps.Code("1/125"), d.Props[NikonProps.Shutter]);
    }

    [Fact]
    public void Probe_dengan_kamera_palsu_lulus()
    {
        var o = new StringWriter();
        var file = Path.Combine(Path.GetTempPath(), $"tc-nikon-{Guid.NewGuid():N}.jpg");
        Assert.Equal(0, DriverProbe.Run(Fake(), NikonProps.All, o, file));
        Assert.Contains("Model: D750 Simulasi", o.ToString());
        Assert.Contains("Shutter: 1/125 · 5 pilihan", o.ToString());
    }

    [Fact]
    public void Pemilih_memakai_modul_klasik_dulu_lalu_Remote_SDK_v2_dan_berhenti_mencoba_v2_yang_gagal_mulai()
    {
        var classic = new FakeCanonDriver("D750") { Plugged = false };
        var z = new FakeCanonDriver("Z f");
        var made = 0;
        using var cams = new NikonCameras(classic, () => { made++; return z; });
        Assert.Equal("Z f", cams.Open()?.Model);
        Assert.True(cams.IsOpen);
        // Jalur yang tersambung dipakai terus, walau kamera klasik dicolok kemudian.
        classic.Plugged = true;
        z.Close();
        Assert.Equal("Z f", cams.Open()?.Model);
        Assert.Equal(1, made);

        var broken = new NikonCameras(new FakeCanonDriver { Plugged = false },
            () => { made++; throw new HotFolder.CameraFailure("nikon_error", "butuh Windows 11"); });
        Assert.Null(broken.Open());
        Assert.Null(broken.Open());
        Assert.Equal(2, made);
    }

    [Fact]
    public void Folder_tanpa_modul_ditolak_dengan_pesan_jelas()
    {
        var e = Assert.Throws<HotFolder.CameraFailure>(() => new NikonDriver(Path.GetTempPath(), () => null));
        Assert.Equal("nikon_missing", e.Code);
    }
}
