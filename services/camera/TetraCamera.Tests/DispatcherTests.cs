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
        Assert.True(p.GetProperty("workingSetMb").GetDouble() > 0);
        Assert.True(p.GetProperty("handles").GetInt32() >= 0);
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
    [InlineData("""{"id":1,"type":"system.health"}""", "bad_envelope")]
    public async Task Pesan_rusak_membalas_error(string input, string code)
    {
        var reply = JsonDocument.Parse(await _d.HandleAsync(input)).RootElement;
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal(code, reply.GetProperty("payload").GetProperty("code").GetString());
    }

    /// <summary>Adapter perekam: menerima semua job, status diatur test.</summary>
    private sealed class RecordingAdapter : IPrinterAdapter
    {
        public readonly List<PrintJob> Jobs = [];
        public PrintJobStatus JobStatus = new(PrintJobState.Queued, null);
        public event Action<PrinterEvent>? Event { add { } remove { } }
        public Task<PrinterStatus> GetStatusAsync(CancellationToken ct = default) =>
            Task.FromResult(new PrinterStatus(PrinterState.Ready, null, null));
        public Task SubmitAsync(PrintJob job, CancellationToken ct = default) { Jobs.Add(job); return Task.CompletedTask; }
        public Task<PrintJobStatus> GetJobStatusAsync(string jobId, CancellationToken ct = default) =>
            jobId == "ada" ? Task.FromResult(JobStatus) : throw new PrintFailure(PrintErrors.UnknownJob, "tidak dikenal");
    }

    private static async Task<JsonElement> Send(Dispatcher d, string json) =>
        JsonDocument.Parse(await d.HandleAsync(json)).RootElement;

    [Fact]
    public async Task Print_submit_valid_diteruskan_ke_adapter_dan_accepted()
    {
        var a = new RecordingAdapter();
        var r = await Send(new Dispatcher(a),
            """{"id":"p1","type":"print.submit","payload":{"jobId":"j1","path":"C:/s/strip.png","copies":2,"paper":"2x6x2"}}""");
        Assert.Equal("print.submit", r.GetProperty("type").GetString());
        Assert.True(r.GetProperty("payload").GetProperty("accepted").GetBoolean());
        Assert.Equal(new PrintJob("j1", "C:/s/strip.png", 2, "2x6x2"), Assert.Single(a.Jobs));
    }

    [Theory]
    [InlineData("""{"path":"a.png","copies":1,"paper":"4R"}""")]
    [InlineData("""{"jobId":"j","path":"a.png","copies":0,"paper":"4R"}""")]
    [InlineData("""{"jobId":"j","path":"a.png","copies":1.5,"paper":"4R"}""")]
    [InlineData("""{"jobId":"j","path":"a.png","copies":"1","paper":"4R"}""")]
    [InlineData("""{"jobId":"j","path":"a.png","copies":1,"paper":"A4"}""")]
    [InlineData("""{"jobId":"j","path":"","copies":1,"paper":"4R"}""")]
    public async Task Print_submit_payload_salah_bad_payload_tanpa_menyentuh_adapter(string payload)
    {
        var a = new RecordingAdapter();
        var r = await Send(new Dispatcher(a), $$"""{"id":"p2","type":"print.submit","payload":{{payload}}}""");
        Assert.Equal("p2", r.GetProperty("id").GetString());
        Assert.Equal("bad_payload", r.GetProperty("payload").GetProperty("code").GetString());
        Assert.Empty(a.Jobs);
    }

    [Fact]
    public async Task Print_submit_tanpa_printer_error_no_printer()
    {
        var r = await Send(_d, """{"id":"p3","type":"print.submit","payload":{"jobId":"j","path":"a.png","copies":1,"paper":"4R"}}""");
        Assert.Equal("error", r.GetProperty("type").GetString());
        Assert.Equal(PrintErrors.NoPrinter, r.GetProperty("payload").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Print_status_membalas_status_dan_error()
    {
        var a = new RecordingAdapter { JobStatus = new(PrintJobState.Failed, PrintErrors.PaperNotSupported) };
        var r = await Send(new Dispatcher(a), """{"id":"s1","type":"print.status","payload":{"jobId":"ada"}}""");
        var p = r.GetProperty("payload");
        Assert.Equal("failed", p.GetProperty("status").GetString());
        Assert.Equal(PrintErrors.PaperNotSupported, p.GetProperty("error").GetString());

        a.JobStatus = new(PrintJobState.Done, null);
        p = (await Send(new Dispatcher(a), """{"id":"s2","type":"print.status","payload":{"jobId":"ada"}}""")).GetProperty("payload");
        Assert.Equal("done", p.GetProperty("status").GetString());
        Assert.False(p.TryGetProperty("error", out _));
    }

    [Fact]
    public async Task Print_status_job_tidak_dikenal_error_unknown_job()
    {
        var r = await Send(new Dispatcher(new RecordingAdapter()), """{"id":"s3","type":"print.status","payload":{"jobId":"x"}}""");
        Assert.Equal(PrintErrors.UnknownJob, r.GetProperty("payload").GetProperty("code").GetString());
    }

    [Fact]
    public void Event_diserialisasi_sesuai_EventSchema_tanpa_id()
    {
        var done = JsonDocument.Parse(Dispatcher.SerializeEvent(new PrintDoneEvent("j1"))).RootElement;
        Assert.False(done.TryGetProperty("id", out _));
        Assert.Equal("print.done", done.GetProperty("type").GetString());
        Assert.Equal("j1", done.GetProperty("payload").GetProperty("jobId").GetString());

        var failed = JsonDocument.Parse(Dispatcher.SerializeEvent(new PrintFailedEvent("j2", "paper_not_supported", "x"))).RootElement;
        Assert.Equal("paper_not_supported", failed.GetProperty("payload").GetProperty("code").GetString());

        var st = JsonDocument.Parse(Dispatcher.SerializeEvent(
            new PrinterStatusEvent(new PrinterStatus(PrinterState.Unavailable, null, "offline")))).RootElement.GetProperty("payload");
        Assert.Equal("unavailable", st.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, st.GetProperty("paperRemaining").ValueKind);
        Assert.Equal("offline", st.GetProperty("message").GetString());
    }
}
