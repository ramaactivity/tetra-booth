using System.Text.Json;
using TetraCamera.HotFolder;
using TetraCamera.Host;
using TetraCamera.Print;
using TetraCamera.Sony;
using static TetraCamera.Sony.SonyProps;

namespace TetraCamera.Tests;

/// <summary>Sony S2–S5 (jepret, live view, setelan & AF, sambung ulang & error) dengan kamera palsu tingkat PTP.</summary>
public class SonyCameraTests
{
    private static async Task Until(Func<bool> ok, int ms = 4000)
    {
        var end = DateTime.UtcNow.AddMilliseconds(ms);
        while (!ok())
        {
            if (DateTime.UtcNow > end) throw new TimeoutException("kondisi tidak tercapai");
            await Task.Delay(10);
        }
    }

    private static string Dir() => Path.Combine(Path.GetTempPath(), $"tc-sony-{Guid.NewGuid():N}");

    private static async Task<SonyCamera> Make(FakeSonyTransport t, string? settings = null, TimeSpan? captureTimeout = null)
    {
        t.ShotMs = 40;
        var cam = new SonyCamera(t, reconnect: TimeSpan.FromMilliseconds(30), pollEvery: TimeSpan.FromMilliseconds(20),
            settingsPath: settings, captureTimeout: captureTimeout);
        await Until(() => cam.Connected);
        return cam;
    }

    public static TheoryData<string> Bodies => ["A7III", "A7IV"];
    private static FakeSonyTransport Body(string b) => b == "A7III" ? FakeSonyTransport.A7III() : FakeSonyTransport.A7IV();

    // ---------- parser ----------

    [Fact]
    public void Live_view_dataset_v2_v3_diurai_dari_offset_dan_ukuran()
    {
        foreach (var t in new[] { FakeSonyTransport.A7III(), FakeSonyTransport.A7IV() })
        {
            t.Open();
            SonyProtocol.Connect(t, retryMs: 1);
            var r = t.Execute(Ptp.GetObject, [Ptp.LiveViewHandle], read: true);
            Assert.True(r.Ok);
            Assert.Equal(FakeSonyTransport.LiveFrame, SonyProtocol.LiveViewJpeg(r.Data));
            // Diminta lagi < 33 ms: Access_Denied dengan ukuran 0 (frame belum baru).
            var again = t.Execute(Ptp.GetObject, [Ptp.LiveViewHandle], read: true);
            Assert.Equal(Ptp.AccessDenied, again.Code);
            Assert.Null(SonyProtocol.LiveViewJpeg(again.Data));
        }
        var bad = new PtpWriter().U32(8).U32(100).Raw([0xFF, 0xD8, 0, 0]).ToArray();
        Assert.Throws<FormatException>(() => SonyProtocol.LiveViewJpeg(bad));
        var notJpeg = new PtpWriter().U32(8).U32(4).Raw([1, 2, 3, 4]).ToArray();
        Assert.Throws<FormatException>(() => SonyProtocol.LiveViewJpeg(notJpeg));
        Assert.Throws<FormatException>(() => SonyProtocol.LiveViewJpeg(new byte[5]));
    }

    [Fact]
    public void ObjectInfo_format_ukuran_nama()
    {
        var o = PtpObjectInfo.Parse(new PtpObjectInfo(Ptp.FormatRaw, 123456, "DSC00001.ARW").ToBytes());
        Assert.Equal((Ptp.FormatRaw, 123456u, "DSC00001.ARW", false), (o.Format, o.Size, o.FileName, o.IsJpeg));
        Assert.True(new PtpObjectInfo(Ptp.FormatJfif, 1, "").IsJpeg);
    }

    [Theory]
    [InlineData(0x00FFFFFFL, "ISO Auto")]
    [InlineData(400L, "ISO 400")]
    [InlineData(0x01000064L, "ISO 100 (Multi Frame NR)")]
    public void Label_iso(long v, string label) => Assert.Equal(label, IsoLabel(v));

    [Theory]
    [InlineData(0x0001007DL, "1/125")]
    [InlineData(0x000F000AL, "1.5\"")]
    [InlineData(0x012C000AL, "30\"")]
    [InlineData(0L, "Bulb")]
    [InlineData(0xFFFFFFFFL, "—")]
    public void Label_shutter(long v, string label) => Assert.Equal(label, ShutterLabel(v));

    [Fact]
    public void Label_aperture_ev_wb_simpan()
    {
        Assert.Equal(("f/4.5", "f/11", "—"), (ApertureLabel(450), ApertureLabel(1100), ApertureLabel(0xFFFF)));
        Assert.Equal(("-1.0 EV", "+0.3 EV", "0.0 EV"), (EvLabel(-1000), EvLabel(300), EvLabel(0)));
        Assert.Equal(("Auto", "Cloudy", "Shade"), (WbLabel(2), WbLabel(0x8010), WbLabel(0x8011)));
        Assert.Equal(("PC saja", "PC + kartu"), (SaveLabel(SaveToPc), SaveLabel(SaveToBoth)));
    }

    [Fact]
    public void Titik_tap_ke_koordinat_640x480()
    {
        Assert.Equal(0, SonyCamera.AfPoint(0, 0));
        Assert.Equal((639L << 16) | 479, SonyCamera.AfPoint(1, 1));
        Assert.Equal((320L << 16) | 240, SonyCamera.AfPoint(0.5, 0.5));
    }

    // ---------- S2 jepret ----------

    [Theory]
    [MemberData(nameof(Bodies))]
    public async Task Jepret_S1_S2_lalu_unduh_JPEG_penuh_ke_folder_sesi(string body)
    {
        var t = Body(body);
        using var cam = await Make(t);
        var dir = Dir();
        var r = await cam.CaptureAsync(dir, 2);
        Assert.Equal(Path.Combine(dir, "3.jpg"), r.Path);
        Assert.Equal((1200, 800), (r.Width, r.Height));
        Assert.Equal(FakeSonyTransport.Shot, await File.ReadAllBytesAsync(r.Path));
        lock (t.Controls)
            Assert.Equal([(S1, Down), (S2, Down), (S2, Up), (S1, Up)],
                t.Controls.Where(c => c.Code is S1 or S2).Select(c => (c.Code, c.Value)));
        Assert.Equal(0, t.Get(ShootingFileInfo));
    }

    [Fact]
    public async Task RAW_plus_JPEG_JPEG_dipakai_RAW_dibuang_buffer_kosong()
    {
        var t = FakeSonyTransport.A7IV();
        t.RawPlusJpeg = true;
        using var cam = await Make(t);
        var r = await cam.CaptureAsync(Dir(), 0);
        Assert.Equal(FakeSonyTransport.Shot, await File.ReadAllBytesAsync(r.Path));
        // RAW yang belum siap saat JPEG diambil dibuang di jepret berikutnya; foto kedua tetap JPEG baru.
        await cam.CaptureAsync(Dir(), 1);
        await Until(() => t.Get(ShootingFileInfo) == 0);
    }

    [Fact]
    public async Task File_lama_di_buffer_dibuang_sebelum_jepret()
    {
        var t = FakeSonyTransport.A7III();
        using var cam = await Make(t);
        t.AddStrayFile();
        await cam.CaptureAsync(Dir(), 0);
        lock (t.Log) Assert.Equal(2, t.Log.Count(l => l.Op == Ptp.GetObject && l.P1 == Ptp.ShotHandle));
        Assert.Equal(1, t.Shots);
    }

    [Fact]
    public async Task Rana_tanpa_file_capture_timeout_dengan_petunjuk()
    {
        var t = FakeSonyTransport.A7III();
        t.NoFile = true;
        using var cam = await Make(t, captureTimeout: TimeSpan.FromMilliseconds(300));
        var e = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 0));
        Assert.Equal("capture_timeout", e.Code);
        Assert.Contains("PC Only", e.Message);
        // S1 tetap dilepas (urutan Sony), kamera tetap tersambung.
        lock (t.Controls) Assert.Equal((S1, (long)Up), t.Controls.Last(c => c.Code == S1));
        Assert.True(cam.Connected);
    }

    [Fact]
    public async Task Fokus_gagal_tetap_jepret_setelah_batas_tunggu()
    {
        var t = FakeSonyTransport.A7IV();
        t.AfFails = true;
        using var cam = await Make(t);
        Assert.True(File.Exists((await cam.CaptureAsync(Dir(), 0)).Path));
    }

    [Fact]
    public async Task Device_busy_sebentar_diulang_lama_jadi_camera_busy()
    {
        var t = FakeSonyTransport.A7III();
        using var cam = await Make(t);
        t.BusyCount = 3;
        Assert.True(File.Exists((await cam.CaptureAsync(Dir(), 0)).Path));
        t.BusyCount = 1000;
        var e = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 1));
        Assert.Equal("camera_busy", e.Code);
        Assert.Contains("Imaging Edge", e.Message);
        t.BusyCount = 0;
        Assert.True(File.Exists((await cam.CaptureAsync(Dir(), 2)).Path));
    }

    [Fact]
    public async Task Kabel_dicabut_saat_unduh_lalu_dicolok_jepret_lagi()
    {
        var t = FakeSonyTransport.A7III();
        using var cam = await Make(t);
        var events = new List<bool>();
        cam.ConnectionChanged += on => { lock (events) events.Add(on); };
        t.PullDuringTransfer = true;
        var e = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 0));
        Assert.Equal("camera_disconnected", e.Code);
        await Until(() => !cam.Connected);
        e = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 0));
        Assert.Contains("terputus", e.Message);
        t.Plugged = true;
        await Until(() => cam.Connected);
        // File yang tertinggal di buffer saat kabel dicabut dibuang, foto baru yang dipakai.
        Assert.True(File.Exists((await cam.CaptureAsync(Dir(), 0)).Path));
        lock (events) Assert.Equal([false, true], events);
    }

    [Theory]
    [InlineData(SaveToBoth, 0x02L, 812L, "card_missing")]
    [InlineData(SaveToBoth, 0x09L, 812L, "card_error")]
    [InlineData(SaveToBoth, 0x01L, 0L, "card_full")]
    [InlineData(SaveToCard, 0x01L, 812L, "save_to_card")]
    [InlineData(SaveToPc, 0x02L, 0L, null)] // PC saja: kartu tidak dipakai
    public async Task Kartu_v3_dicek_hanya_kalau_simpan_ke_kartu(long dest, long card, long shots, string? code)
    {
        var t = FakeSonyTransport.A7IV();
        t.SetStatus(SaveDestination, dest);
        t.SetStatus(MediaStatus, card);
        t.SetStatus(MediaShots, shots);
        using var cam = await Make(t);
        if (code is null)
        {
            Assert.True(File.Exists((await cam.CaptureAsync(Dir(), 0)).Path));
            return;
        }
        var e = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 0));
        Assert.Equal(code, e.Code);
        Assert.Equal(0, t.Shots);
    }

    [Fact]
    public async Task Kamera_panas_dan_error_menolak_jepret_dan_tampil_di_setelan()
    {
        var t = FakeSonyTransport.A7IV();
        using var cam = await Make(t);
        t.SetStatus(Overheating, 1);
        Assert.Equal("Mulai panas", (await cam.PropsAsync()).Single(p => p.Name == "heat").Value);
        t.SetStatus(Overheating, 2);
        Assert.Equal("camera_overheated", (await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 0))).Code);
        t.SetStatus(Overheating, 0);
        t.SetStatus(CameraError, 2);
        Assert.Equal("camera_error", (await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 0))).Code);
    }

    // ---------- S3 live view ----------

    [Theory]
    [MemberData(nameof(Bodies))]
    public async Task Live_view_frame_maks_30fps_berhenti_saat_stop_dan_lanjut_setelah_jepret(string body)
    {
        var t = Body(body);
        using var cam = await Make(t);
        Assert.Null(cam.LatestFrame);
        Assert.True(await cam.StartLiveViewAsync());
        await Until(() => cam.LatestFrame is not null);
        Assert.Equal(FakeSonyTransport.LiveFrame, cam.LatestFrame);
        int Gets() { lock (t.Log) return t.Log.Count(l => l.Op == Ptp.GetObject && l.P1 == Ptp.LiveViewHandle); }
        var n0 = Gets();
        await Task.Delay(500);
        Assert.InRange(Gets() - n0, 5, 17); // ≥ 33 ms antar permintaan
        lock (t.Log) Assert.Equal(1, t.Log.Count(l => l.Op == Ptp.GetObjectInfo && l.P1 == Ptp.LiveViewHandle));
        await cam.CaptureAsync(Dir(), 0);
        n0 = Gets();
        await Until(() => Gets() > n0);
        await cam.StopLiveViewAsync();
        Assert.Null(cam.LatestFrame);
        n0 = Gets();
        await Task.Delay(150);
        Assert.Equal(n0, Gets());
    }

    [Fact]
    public async Task Live_view_belum_siap_tidak_ada_frame_lalu_jalan_saat_status_enabled()
    {
        var t = FakeSonyTransport.A7III();
        t.SetStatus(LiveViewStatus, 0);
        using var cam = await Make(t);
        await cam.StartLiveViewAsync();
        await Task.Delay(150);
        Assert.Null(cam.LatestFrame);
        t.SetStatus(LiveViewStatus, 1);
        await Until(() => cam.LatestFrame is not null);
    }

    // ---------- S4 setelan & AF ----------

    [Fact]
    public async Task V2_setelan_eksposur_lewat_langkah_WB_absolut_simpan_ke_hanya_dibaca()
    {
        var t = FakeSonyTransport.A7III();
        using var cam = await Make(t);
        var props = await cam.PropsAsync();
        var iso = props.Single(p => p.Name == "iso");
        Assert.Equal(("ISO", "ISO 400"), (iso.Label, iso.Value));
        Assert.Equal(["ISO Auto", "ISO 100", "ISO 200", "ISO 400", "ISO 800", "ISO 1600", "ISO 3200", "ISO 6400"], iso.Options);
        Assert.Equal("1/125", props.Single(p => p.Name == "shutterspeed").Value);
        Assert.Equal("f/5.6", props.Single(p => p.Name == "aperture").Value);
        Assert.Equal("0.0 EV", props.Single(p => p.Name == "exposurecomp").Value);
        var dest = props.Single(p => p.Name == "savedest");
        Assert.Equal(("PC saja", 0), (dest.Value, dest.Options.Length));
        Assert.Equal("80%", props.Single(p => p.Name == "battery").Value);
        Assert.DoesNotContain(props, p => p.Name == "card"); // A7 III tidak punya status kartu

        await cam.SetPropAsync("iso", "ISO 1600");
        Assert.Equal(1600, t.Get(Iso));
        lock (t.Controls) Assert.Contains((Iso, 2L), t.Controls);
        await cam.SetPropAsync("shutterspeed", "1/30");
        Assert.Equal(0x0001001E, t.Get(Shutter));
        await cam.SetPropAsync("exposurecomp", "-0.7 EV");
        Assert.Equal(-700, t.Get(ExposureComp));
        await cam.SetPropAsync("whitebalance", "Shade");
        Assert.Equal(0x8011, t.Get(WhiteBalance));
        lock (t.Log) Assert.Contains((Ptp.SdioSetExtDevicePropValue, (uint)WhiteBalance), t.Log);
        Assert.Equal("bad_prop", (await Assert.ThrowsAsync<CameraFailure>(() => cam.SetPropAsync("iso", "ISO 5"))).Code);
    }

    [Fact]
    public async Task V3_setelan_absolut_position_key_dipasang_dan_live_view_high()
    {
        var t = FakeSonyTransport.A7IV();
        using var cam = await Make(t);
        Assert.Equal((1L, 2L), (t.Get(PositionKey), t.Get(LiveViewQuality)));
        await cam.SetPropAsync("iso", "ISO 3200");
        await cam.SetPropAsync("aperture", "f/2.8");
        Assert.Equal((3200L, 280L), (t.Get(Iso), t.Get(FNumber)));
        lock (t.Log) Assert.Contains((Ptp.SdioSetExtDevicePropValue, (uint)Iso), t.Log);
        lock (t.Controls) Assert.DoesNotContain(t.Controls, c => c.Code == Iso);
        var props = await cam.PropsAsync();
        Assert.Equal("OK, sisa 812 foto", props.Single(p => p.Name == "card").Value);
    }

    [Fact]
    public async Task V3_dial_kamera_menang_setelan_ditolak_dengan_pesan()
    {
        var t = FakeSonyTransport.A7IV();
        using var cam = await Make(t);
        t.SetStatus(PositionKey, 0); // mis. crew memutar Position Key di kamera
        var e = await Assert.ThrowsAsync<CameraFailure>(() => cam.SetPropAsync("iso", "ISO 800"));
        Assert.Equal("prop_rejected", e.Code);
    }

    [Fact]
    public async Task Setelan_crew_tersimpan_dipasang_ulang_setelah_cabut_colok()
    {
        var file = Path.Combine(Path.GetTempPath(), $"sony-{Guid.NewGuid():N}.json");
        var t = FakeSonyTransport.A7III();
        using var cam = await Make(t, settings: file);
        await cam.SetPropAsync("iso", "ISO 800");
        Assert.Contains("ISO 800", await File.ReadAllTextAsync(file));
        t.Plugged = false;
        await Until(() => !cam.Connected);
        t.SetStatus(Iso, 400); // kamera dimatikan & dial diputar
        t.Plugged = true;
        await Until(() => cam.Connected);
        await Until(() => t.Get(Iso) == 800);
    }

    [Theory]
    [MemberData(nameof(Bodies))]
    public async Task AF_setengah_tekan_dan_near_far_per_profil(string body)
    {
        var t = Body(body);
        using var cam = await Make(t);
        Assert.True(await cam.FocusAsync("af"));
        lock (t.Controls) Assert.Equal([(S1, Down), (S1, Up)], t.Controls.Select(c => (c.Code, c.Value)));
        // A7 III (fake): tanpa kontrol Near/Far → tidak didukung; A7 IV: langkah −1.
        Assert.Equal(body == "A7IV", await cam.FocusAsync("near1"));
        if (body == "A7IV") lock (t.Controls) Assert.Contains((NearFar, -1L), t.Controls);
        await Assert.ThrowsAsync<CameraFailure>(() => cam.FocusAsync("zoom"));
    }

    [Fact]
    public async Task Tap_to_focus_hanya_v3_dan_status_tapFocus_di_camera_status()
    {
        using var v2 = await Make(FakeSonyTransport.A7III());
        Assert.False(v2.CanFocusAt);
        Assert.False(await v2.FocusAtAsync(0.5, 0.5));
        var t = FakeSonyTransport.A7IV();
        using var v3 = await Make(t);
        Assert.True(v3.CanFocusAt);
        Assert.True(await v3.FocusAtAsync(0.25, 0.75));
        lock (t.Controls) Assert.Equal((AfAreaPosition, SonyCamera.AfPoint(0.25, 0.75)), t.Controls[0]);
        await Assert.ThrowsAsync<CameraFailure>(() => v3.FocusAtAsync(1.5, 0));
        foreach (var (cam, tap) in new[] { (v2, false), (v3, true) })
        {
            var r = JsonDocument.Parse(await new Dispatcher(new NullPrinterAdapter(), cam)
                .HandleAsync("""{"id":"s","type":"camera.status"}""")).RootElement;
            Assert.Equal(tap, r.GetProperty("payload").GetProperty("tapFocus").GetBoolean());
        }
    }

    [Fact]
    public async Task Near_far_di_mode_AF_ditolak_dengan_pesan()
    {
        var t = FakeSonyTransport.A7IV();
        t.SetStatus(NearFarEnabled, 0);
        using var cam = await Make(t);
        Assert.Equal("focus_mf_only", (await Assert.ThrowsAsync<CameraFailure>(() => cam.FocusAsync("far2"))).Code);
    }

    // ---------- S5 sambung ulang & error ----------

    [Fact]
    public async Task Kamera_tidur_lalu_bangun_menyambung_ulang_sendiri()
    {
        var t = FakeSonyTransport.A7IV();
        using var cam = await Make(t);
        await cam.StartLiveViewAsync();
        await Until(() => cam.LatestFrame is not null);
        t.Sleep();
        await Until(() => !cam.Connected);
        Assert.Null(cam.LatestFrame);
        Assert.Contains("terputus", cam.Problem);
        t.Wake();
        await Until(() => cam.Connected);
        await Until(() => cam.LatestFrame is not null); // live view lanjut tanpa start ulang
        Assert.Equal(1, t.Get(PositionKey)); // dipasang lagi (kembali 0 tiap sesi baru)
        Assert.True(File.Exists((await cam.CaptureAsync(Dir(), 0)).Path));
    }

    [Fact]
    public async Task Kamera_tidak_ada_pesan_crew_menyebut_PC_Remote()
    {
        var t = FakeSonyTransport.A7III();
        t.Plugged = false;
        using var cam = new SonyCamera(t, reconnect: TimeSpan.FromMilliseconds(30));
        await Until(() => cam.Problem is not null);
        var e = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Dir(), 0));
        Assert.Equal("camera_disconnected", e.Code);
        Assert.Contains("PC Remote", e.Message);
        Assert.Empty(await cam.PropsAsync());
    }

    [Fact]
    public async Task Baterai_lemah_ditandai()
    {
        var t = FakeSonyTransport.A7III();
        using var cam = await Make(t);
        t.BatteryPercent = 7;
        Assert.Equal("7% (lemah, ganti baterai)", (await cam.PropsAsync()).Single(p => p.Name == "battery").Value);
    }
}
