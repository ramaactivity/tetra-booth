using System.Text.Json;
using TetraCamera.Host;
using TetraCamera.Print;

namespace TetraCamera.Tests;

public class DispatcherTests
{
    private readonly Dispatcher _d = new(new NullPrinterAdapter());

    [Fact]
    public async Task Health_membalas_dengan_id_dan_type_sama()
    {
        var reply = JsonDocument.Parse(await _d.HandleAsync("""{"id":"abc","type":"system.health"}""")).RootElement;
        Assert.Equal("abc", reply.GetProperty("id").GetString());
        Assert.Equal("system.health", reply.GetProperty("type").GetString());
        var p = reply.GetProperty("payload");
        Assert.True(p.GetProperty("uptime").GetDouble() >= 0);
        Assert.Equal("disconnected", p.GetProperty("camera").GetString());
        Assert.Equal("unavailable", p.GetProperty("printer").GetString());
    }

    [Fact]
    public async Task Type_tidak_dikenal_membalas_error_dengan_id_sama()
    {
        var reply = JsonDocument.Parse(await _d.HandleAsync("""{"id":"x1","type":"camera.fly"}""")).RootElement;
        Assert.Equal("x1", reply.GetProperty("id").GetString());
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal("unknown_type", reply.GetProperty("payload").GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("bukan json", "bad_json")]
    [InlineData("""{"type":"system.health"}""", "bad_envelope")]
    public async Task Pesan_rusak_membalas_error(string input, string code)
    {
        var reply = JsonDocument.Parse(await _d.HandleAsync(input)).RootElement;
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal(code, reply.GetProperty("payload").GetProperty("code").GetString());
    }
}
