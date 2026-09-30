using System.Text.Json;
using TetraCamera.Canon;
using TetraCamera.HotFolder;
using TetraCamera.Host;
using TetraCamera.Print;

namespace TetraCamera.Tests;

/// <summary>Canon EDSDK (DECISIONS #111) dengan driver palsu: tanpa kamera & DLL, jalan di Mac/CI.</summary>
public class CanonCameraTests
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

    private static CanonCamera Make(FakeCanonDriver d) =>
        new(d, reconnect: TimeSpan.FromMilliseconds(50), frameEvery: TimeSpan.FromMilliseconds(10));

    [Fact]
    public async Task Driver_macet_perintah_gagal_dengan_waktu_habis_dan_health_melapor_macet()
    {
        var d = new FakeCanonDriver();
        using var cam = new CanonCamera(d, reconnect: TimeSpan.FromMilliseconds(50),
            stuckAfter: TimeSpan.FromMilliseconds(300), commandTimeout: TimeSpan.FromMilliseconds(300));
        await Until(() => cam.Connected);
        Assert.False(cam.Stuck);
        d.HangMs = 1500;
        var dir = Path.Combine(Path.GetTempPath(), $"tc-canon-{Guid.NewGuid():N}");
        var e = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(dir, 0));
        Assert.Equal("camera_stuck", e.Code);
        await Until(() => cam.Stuck);
        var disp = new Dispatcher(new NullPrinterAdapter(), cam);
        var r = JsonDocument.Parse(await disp.HandleAsync("""{"id":"h","type":"system.health"}""")).RootElement;
        Assert.Equal("error", r.GetProperty("type").GetString());
        Assert.Equal("camera_stuck", r.GetProperty("payload").GetProperty("code").GetString());
        // Panggilan akhirnya kembali: detak jalan lagi, health normal.
        d.HangMs = 0;
        await Until(() => !cam.Stuck, 4000);
    }

    [Fact]
    public async Task Tersambung_lalu_jepret_menyimpan_JPEG_ke_folder_sesi()
    {
        var d = new FakeCanonDriver();
        using var cam = Make(d);
        await Until(() => cam.Connected);
        Assert.Equal("Canon EOS Simulasi", cam.Model);
        var dir = Path.Combine(Path.GetTempPath(), $"tc-canon-{Guid.NewGuid():N}");
        var r = await cam.CaptureAsync(dir, 1);
        Assert.Equal(Path.Combine(dir, "2.jpg"), r.Path);
        Assert.Equal((1200, 800), (r.Width, r.Height));
        Assert.Equal(FakeCanonDriver.Jpeg, await File.ReadAllBytesAsync(r.Path));
    }

    [Fact]
    public async Task Live_view_mengisi_frame_terbaru_dan_mati_saat_dihentikan()
    {
        var d = new FakeCanonDriver();
        using var cam = Make(d);
        await Until(() => cam.Connected);
        Assert.Null(cam.LatestFrame);
        Assert.True(await cam.StartLiveViewAsync());
        await Until(() => cam.LatestFrame is not null);
        Assert.True(d.LiveView);
        await cam.StopLiveViewAsync();
        Assert.Null(cam.LatestFrame);
        Assert.False(d.LiveView);
    }

    [Fact]
    public async Task Dicabut_lalu_dicolok_menyambung_ulang_dan_live_view_menyala_lagi()
    {
        var d = new FakeCanonDriver();
        using var cam = Make(d);
        var changes = new List<bool>();
        cam.ConnectionChanged += on => { lock (changes) changes.Add(on); };
        await Until(() => cam.Connected);
        await cam.StartLiveViewAsync();
        d.Plugged = false;
        await Until(() => !cam.Connected);
        await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Path.GetTempPath(), 0));
        d.SetLiveView(false); // kamera baru dicolok: live view mati
        d.Plugged = true;
        await Until(() => cam.Connected && cam.LatestFrame is not null);
        Assert.True(d.LiveView);
        lock (changes) Assert.Equal([false, true], changes.Where((_, i) => i > 0));
    }

    [Fact]
    public async Task Fokus_diteruskan_ke_kamera_langkah_tak_dikenal_ditolak()
    {
        var d = new FakeCanonDriver();
        using var cam = Make(d);
        await Until(() => cam.Connected);
        Assert.True(await cam.FocusAsync("af"));
        Assert.True(await cam.FocusAsync("near2"));
        Assert.Equal(["af", "near2"], d.FocusSteps);
        Assert.True(await cam.FocusAtAsync(0.25, 0.75));
        Assert.Equal("at 0.25,0.75", d.FocusSteps[^1]);
        await Assert.ThrowsAsync<CameraFailure>(() => cam.FocusAtAsync(1.5, 0));
        await Assert.ThrowsAsync<CameraFailure>(() => cam.FocusAsync("maju"));
    }

    [Fact]
    public async Task Setelan_ISO_shutter_aperture_WB_terbaca_berlabel_dan_bisa_diubah_lewat_label()
    {
        var d = new FakeCanonDriver();
        using var cam = Make(d);
        await Until(() => cam.Connected);
        var props = await cam.PropsAsync();
        Assert.Equal(["iso", "iso_capture", "shutterspeed", "shutter_capture", "aperture", "whitebalance", "quality", "battery"], props.Select(p => p.Name));
        var iso = props[0];
        Assert.Equal("ISO 100", iso.Value);
        Assert.Equal(["ISO 100", "ISO 200", "ISO 400", "ISO 800", "ISO 1600"], iso.Options);
        Assert.Equal("Sama dengan live view", props[1].Value);
        Assert.Equal("1/125", props[2].Value);
        Assert.Equal("Sama dengan live view", props[3].Value);
        Assert.Equal("f/5.6", props[4].Value);
        Assert.Equal("Auto", props[5].Value);
        Assert.Equal("JPEG L Fine", props[6].Value);
        Assert.Equal("80%", props[7].Value);
        Assert.Empty(props[7].Options);
        await cam.SetPropAsync("quality", "JPEG S1 Fine");
        Assert.Equal(0x0E13FF0Fu, d.Props[0x100]);
        await cam.SetPropAsync("iso", "ISO 800");
        Assert.Equal(0x60u, d.Props[0x402]);
        await cam.SetPropAsync("whitebalance", "Shade");
        Assert.Equal(8u, d.Props[0x106]);
        await Assert.ThrowsAsync<CameraFailure>(() => cam.SetPropAsync("iso", "ISO 123"));
        await Assert.ThrowsAsync<CameraFailure>(() => cam.SetPropAsync("zoom", "2x"));
    }

    [Fact]
    public async Task ISO_jepret_dipasang_saat_rana_lalu_ISO_live_view_dikembalikan()
    {
        var d = new FakeCanonDriver();
        using var cam = Make(d);
        await Until(() => cam.Connected);
        await cam.SetPropAsync("iso", "ISO 800");
        await cam.SetPropAsync("iso_capture", "ISO 200");
        var dir = Path.Combine(Path.GetTempPath(), $"tc-iso-{Guid.NewGuid():N}");
        await cam.CaptureAsync(dir, 0);
        Assert.Equal([0x50u], d.IsoAtCapture);
        Assert.Equal(0x60u, d.Props[0x402]); // kembali ke ISO live view
        Assert.Equal("ISO 200", (await cam.PropsAsync()).Single(p => p.Name == "iso_capture").Value);
        await cam.SetPropAsync("iso_capture", "Sama dengan live view");
        await cam.CaptureAsync(dir, 1);
        Assert.Equal([0x50u, 0x60u], d.IsoAtCapture);
    }

    [Fact]
    public async Task Shutter_jepret_dipasang_saat_rana_bersama_ISO_lalu_keduanya_dikembalikan()
    {
        var d = new FakeCanonDriver();
        using var cam = Make(d);
        await Until(() => cam.Connected);
        await cam.SetPropAsync("shutterspeed", "1/30");
        await cam.SetPropAsync("shutter_capture", "1/125");
        await cam.SetPropAsync("iso", "ISO 800");
        await cam.SetPropAsync("iso_capture", "ISO 200");
        var dir = Path.Combine(Path.GetTempPath(), $"tc-sh-{Guid.NewGuid():N}");
        await cam.CaptureAsync(dir, 0);
        Assert.Equal([0x70u], d.ShutterAtCapture);
        Assert.Equal([0x50u], d.IsoAtCapture);
        Assert.Equal(0x60u, d.Props[0x406]); // kembali ke shutter live view
        Assert.Equal(0x60u, d.Props[0x402]);
        var sh = (await cam.PropsAsync()).Single(p => p.Name == "shutter_capture");
        Assert.Equal("1/125", sh.Value);
        Assert.Equal("Sama dengan live view", sh.Options[0]);
        await cam.SetPropAsync("shutter_capture", "Sama dengan live view");
        await cam.CaptureAsync(dir, 1);
        Assert.Equal([0x70u, 0x60u], d.ShutterAtCapture);
        await Assert.ThrowsAsync<CameraFailure>(() => cam.SetPropAsync("shutter_capture", "1/7"));
    }

    [Fact]
    public async Task Setelan_disimpan_ke_file_dan_dipasang_lagi_saat_kamera_tersambung()
    {
        var file = Path.Combine(Path.GetTempPath(), $"tc-set-{Guid.NewGuid():N}.json");
        var d = new FakeCanonDriver();
        using (var cam = new CanonCamera(d, TimeSpan.FromMilliseconds(50), TimeSpan.FromMilliseconds(10), file))
        {
            await Until(() => cam.Connected);
            await cam.SetPropAsync("iso", "ISO 400");
            await cam.SetPropAsync("iso_capture", "ISO 200");
        }
        // Kamera baru dinyalakan (setelan pabrik) + Camera Service baru: setelan dari file dipasang lagi.
        var d2 = new FakeCanonDriver();
        using var cam2 = new CanonCamera(d2, TimeSpan.FromMilliseconds(50), TimeSpan.FromMilliseconds(10), file);
        await Until(() => cam2.Connected && d2.Props[0x402] == 0x58);
        Assert.Equal("ISO 200", (await cam2.PropsAsync()).Single(p => p.Name == "iso_capture").Value);
    }

    [Fact]
    public async Task Dispatcher_Canon_list_liveview_focus_capture()
    {
        using var cam = Make(new FakeCanonDriver());
        await Until(() => cam.Connected);
        var disp = new Dispatcher(new NullPrinterAdapter(), cam);
        async Task<JsonElement> Send(string json) => JsonDocument.Parse(await disp.HandleAsync(json)).RootElement;
        var list = (await Send("""{"id":"1","type":"camera.list"}""")).GetProperty("payload")[0];
        Assert.Equal("canon", list.GetProperty("brand").GetString());
        Assert.True((await Send("""{"id":"2","type":"liveview.start"}""")).GetProperty("payload").GetProperty("ok").GetBoolean());
        Assert.True((await Send("""{"id":"3","type":"camera.focus","payload":{"step":"af"}}""")).GetProperty("payload").GetProperty("ok").GetBoolean());
        var dir = Path.Combine(Path.GetTempPath(), $"tc-disp-{Guid.NewGuid():N}").Replace("\\", "/");
        var cap = await Send(JsonSerializer.Serialize(new
        {
            id = "4",
            type = "capture",
            payload = new { sessionId = "s", index = 0, outputDir = dir },
        }));
        Assert.Equal(1200, cap.GetProperty("payload").GetProperty("width").GetInt32());
        var props = (await Send("""{"id":"6","type":"camera.props"}""")).GetProperty("payload");
        Assert.Equal("ISO 100", props[0].GetProperty("value").GetString());
        Assert.True((await Send("""{"id":"7","type":"camera.setProp","payload":{"name":"iso","value":"ISO 400"}}""")).GetProperty("payload").GetProperty("ok").GetBoolean());
        var h = (await Send("""{"id":"5","type":"system.health"}""")).GetProperty("payload");
        Assert.Equal("connected", h.GetProperty("camera").GetString());
    }
}
