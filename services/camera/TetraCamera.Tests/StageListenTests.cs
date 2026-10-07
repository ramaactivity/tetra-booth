using System.Collections.Concurrent;
using System.Text.Json;
using TetraCamera.Canon;
using TetraCamera.Host;
using TetraCamera.HotFolder;
using TetraCamera.Print;

namespace TetraCamera.Tests;

/// <summary>Photo Stage (#178): jepretan rana fotografer / file baru di folder dilaporkan sebagai `capture.shot`.</summary>
public sealed class StageListenTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "tetra-stage-" + Guid.NewGuid().ToString("N")[..8]);
    public void Dispose() { try { Directory.Delete(_root, true); } catch (IOException) { } }

    private static async Task Until(Func<bool> ok, int ms = 4000)
    {
        var end = DateTime.UtcNow.AddMilliseconds(ms);
        while (!ok())
        {
            if (DateTime.UtcNow > end) throw new TimeoutException("kondisi tidak tercapai");
            await Task.Delay(10);
        }
    }

    [Fact]
    public async Task Canon_rana_fotografer_disimpan_dan_dilaporkan_hanya_saat_mendengar()
    {
        var d = new FakeCanonDriver();
        using var cam = new CanonCamera(d, reconnect: TimeSpan.FromMilliseconds(50), frameEvery: TimeSpan.FromMilliseconds(10));
        await Until(() => cam.Connected);
        var events = new ConcurrentQueue<string>();
        var disp = new Dispatcher(new NullPrinterAdapter(), cam, events.Enqueue);
        var outDir = Path.Combine(_root, "shots");
        var r = JsonDocument.Parse(await disp.HandleAsync(
            JsonSerializer.Serialize(new { id = "1", type = "capture.listen", payload = new { outputDir = outDir } }))).RootElement;
        Assert.True(r.GetProperty("payload").GetProperty("ok").GetBoolean());
        d.PendingShots = 2;
        await Until(() => events.Count == 2);
        foreach (var e in events)
        {
            var ev = JsonDocument.Parse(e).RootElement;
            Assert.Equal("capture.shot", ev.GetProperty("type").GetString());
            var path = ev.GetProperty("payload").GetProperty("path").GetString()!;
            Assert.True(File.Exists(path));
            Assert.StartsWith(outDir, path);
            Assert.Equal(1200, ev.GetProperty("payload").GetProperty("width").GetInt32());
        }
        // Berhenti mendengar = perilaku booth: jepretan liar tidak diambil.
        await disp.HandleAsync("""{"id":"2","type":"capture.listen","payload":{"outputDir":null}}""");
        d.PendingShots = 1;
        await Task.Delay(200);
        Assert.Equal(2, events.Count);
        Assert.Equal(1, d.PendingShots);
    }

    [Fact]
    public async Task Folder_pantau_file_baru_dilaporkan_file_lama_diabaikan()
    {
        var input = Path.Combine(_root, "in");
        Directory.CreateDirectory(input);
        await File.WriteAllBytesAsync(Path.Combine(input, "lama.jpg"), HotFolderTests.Jpeg(10, 10));
        var cam = new HotFolderCamera(input);
        var shots = new ConcurrentQueue<CaptureResult>();
        cam.Listen(Path.Combine(_root, "out"), shots.Enqueue);
        await Task.Delay(150);
        await File.WriteAllBytesAsync(Path.Combine(input, "DSC0001.JPG"), HotFolderTests.Jpeg(6000, 4000));
        await File.WriteAllBytesAsync(Path.Combine(input, "DSC0002.JPG"), HotFolderTests.Jpeg(6000, 4000));
        await Until(() => shots.Count == 2);
        Assert.All(shots, s => Assert.Equal((6000, 4000), (s.Width, s.Height)));
        cam.Listen(null, null);
        await Task.Delay(150);
        await File.WriteAllBytesAsync(Path.Combine(input, "DSC0003.JPG"), HotFolderTests.Jpeg(6000, 4000));
        await Task.Delay(400);
        Assert.Equal(2, shots.Count);
    }

    [Fact]
    public async Task Listen_path_relatif_ditolak()
    {
        var disp = new Dispatcher(new NullPrinterAdapter(), new HotFolderCamera(Path.Combine(_root, "in2")));
        var r = JsonDocument.Parse(await disp.HandleAsync(
            """{"id":"1","type":"capture.listen","payload":{"outputDir":"relatif"}}""")).RootElement;
        Assert.Equal("bad_payload", r.GetProperty("payload").GetProperty("code").GetString());
    }
}
