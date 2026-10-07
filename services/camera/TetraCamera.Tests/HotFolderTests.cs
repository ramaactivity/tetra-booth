using System.Text.Json;
using TetraCamera.Host;
using TetraCamera.HotFolder;
using TetraCamera.Print;

namespace TetraCamera.Tests;

public sealed class HotFolderTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "tetra-hf-" + Guid.NewGuid().ToString("N")[..8]);
    private string In => Path.Combine(_root, "in");
    private string Out => Path.Combine(_root, "out");
    public void Dispose() { try { Directory.Delete(_root, true); } catch (IOException) { } }

    /// <summary>Header JPEG minimal: SOI, APP0, SOF0 (ukuran), EOI. Cukup untuk pembaca ukuran.</summary>
    internal static byte[] Jpeg(int w, int h) =>
    [
        0xFF, 0xD8,
        0xFF, 0xE0, 0x00, 0x10, (byte)'J', (byte)'F', (byte)'I', (byte)'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
        0xFF, 0xC0, 0x00, 0x11, 0x08, (byte)(h >> 8), (byte)h, (byte)(w >> 8), (byte)w, 0x03,
        1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
        0xFF, 0xD9,
    ];

    [Theory]
    [InlineData(6000, 4000)]
    [InlineData(2560, 1920)]
    public void Ukuran_dibaca_dari_SOF(int w, int h) =>
        Assert.Equal((w, h), JpegInfo.ReadSize(new MemoryStream(Jpeg(w, h))));

    [Fact]
    public void Bukan_JPEG_null() => Assert.Null(JpegInfo.ReadSize(new MemoryStream([0x89, 0x50, 0x4E, 0x47])));

    [Fact]
    public async Task Capture_mengambil_JPEG_baru_bukan_file_lama()
    {
        Directory.CreateDirectory(In);
        await File.WriteAllBytesAsync(Path.Combine(In, "lama.jpg"), Jpeg(10, 10));
        var cam = new HotFolderCamera(In, TimeSpan.FromSeconds(5));
        var capture = cam.CaptureAsync(Out, 0);
        await Task.Delay(300);
        await File.WriteAllBytesAsync(Path.Combine(In, "IMG_0001.JPG"), Jpeg(6000, 4000));
        var r = await capture;
        Assert.Equal(Path.Combine(Out, "1.jpg"), r.Path);
        Assert.Equal((6000, 4000), (r.Width, r.Height));
        Assert.True(File.Exists(r.Path));
    }

    [Fact]
    public async Task File_sesaat_sebelum_capture_masih_dihitung_dan_tidak_dipakai_dua_kali()
    {
        // 3 dtk, bukan 1: runner Windows CI (antivirus) bisa menahan file sesaat sebelum bisa dibuka eksklusif.
        var cam = new HotFolderCamera(In, TimeSpan.FromSeconds(3));
        await File.WriteAllBytesAsync(Path.Combine(In, "a.jpg"), Jpeg(100, 50));
        var r = await cam.CaptureAsync(Out, 2);
        Assert.Equal(Path.Combine(Out, "3.jpg"), r.Path);
        var f = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Out, 3));
        Assert.Equal("capture_timeout", f.Code);
    }

    [Fact]
    public async Task Dispatcher_capture_lewat_hot_folder()
    {
        var cam = new HotFolderCamera(In, TimeSpan.FromSeconds(5));
        var d = new Dispatcher(new NullPrinterAdapter(), cam);
        var req = JsonSerializer.Serialize(new { id = "c1", type = "capture", payload = new { sessionId = "s", index = 0, outputDir = Out } });
        var reply = d.HandleAsync(req);
        await Task.Delay(200);
        await File.WriteAllBytesAsync(Path.Combine(In, "x.jpeg"), Jpeg(3000, 2000));
        var p = JsonDocument.Parse(await reply).RootElement;
        Assert.Equal("capture", p.GetProperty("type").GetString());
        Assert.Equal(3000, p.GetProperty("payload").GetProperty("width").GetInt32());

        var status = JsonDocument.Parse(await d.HandleAsync("""{"id":"s1","type":"camera.status"}""")).RootElement;
        Assert.True(status.GetProperty("payload").GetProperty("connected").GetBoolean());
        var lv = JsonDocument.Parse(await d.HandleAsync("""{"id":"l1","type":"liveview.start"}""")).RootElement;
        Assert.Equal("unsupported", lv.GetProperty("payload").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Tanpa_kamera_capture_gagal_berkode_dan_outputDir_harus_absolut()
    {
        var none = new Dispatcher(new NullPrinterAdapter());
        var r1 = JsonDocument.Parse(await none.HandleAsync("""{"id":"c","type":"capture","payload":{"sessionId":"s","index":0,"outputDir":"/tmp/x"}}""")).RootElement;
        Assert.Equal("no_camera", r1.GetProperty("payload").GetProperty("code").GetString());
        var d = new Dispatcher(new NullPrinterAdapter(), new HotFolderCamera(In));
        var r2 = JsonDocument.Parse(await d.HandleAsync("""{"id":"c","type":"capture","payload":{"sessionId":"s","index":0,"outputDir":"relatif"}}""")).RootElement;
        Assert.Equal("bad_payload", r2.GetProperty("payload").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Pemicu_shutter_dipanggil_lalu_JPEG_dari_software_tether_diambil()
    {
        var port = FreePort();
        using var server = new System.Net.HttpListener();
        server.Prefixes.Add($"http://127.0.0.1:{port}/");
        server.Start();
        // Software tether palsu: setiap GET menyimpan JPEG ke hot folder.
        var serve = Task.Run(async () =>
        {
            var ctx = await server.GetContextAsync();
            await File.WriteAllBytesAsync(Path.Combine(In, "DSC_0001.jpg"), Jpeg(5184, 3456));
            ctx.Response.StatusCode = 200;
            ctx.Response.Close();
        });
        var cam = new HotFolderCamera(In, TimeSpan.FromSeconds(5), new Uri($"http://127.0.0.1:{port}/?CMD=Capture"));
        var r = await cam.CaptureAsync(Out, 0);
        await serve;
        Assert.Equal((5184, 3456), (r.Width, r.Height));
    }

    [Fact]
    public async Task Pemicu_tidak_bisa_dihubungi_gagal_berkode()
    {
        var port = FreePort(); // port bebas, tidak ada server
        var cam = new HotFolderCamera(In, TimeSpan.FromSeconds(2), new Uri($"http://127.0.0.1:{port}/"));
        var f = await Assert.ThrowsAsync<CameraFailure>(() => cam.CaptureAsync(Out, 0));
        Assert.Equal("trigger_failed", f.Code);
    }

    private static int FreePort()
    {
        var l = System.Net.Sockets.TcpListener.Create(0);
        l.Start();
        var p = ((System.Net.IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return p;
    }
}
