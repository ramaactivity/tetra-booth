using System.Text.Json;
using System.Text.Json.Nodes;
using TetraCamera.HotFolder;
using TetraCamera.Print;

namespace TetraCamera.Host;

/// <summary>
/// Menerima pesan teks JSON `{ id, type, payload }`, membalas dengan `id` yang sama. TSD §2.
/// Skema: packages/shared/src/camera-protocol.ts. Perintah kamera ditambah bersama sumber kamera simulasi (M1).
/// </summary>
public sealed class Dispatcher(IPrinterAdapter printer, HotFolderCamera? camera = null)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly DateTime _startedAt = DateTime.UtcNow;

    public async Task<string> HandleAsync(string text, CancellationToken ct = default)
    {
        JsonNode? node;
        try { node = JsonNode.Parse(text); }
        catch (JsonException) { return Error("", "bad_json", "pesan bukan JSON"); }

        string? id, type;
        try
        {
            id = node?["id"]?.GetValue<string>();
            type = node?["type"]?.GetValue<string>();
        }
        catch (InvalidOperationException) { return Error("", "bad_envelope", "id dan type harus string"); }
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(type))
            return Error(id ?? "", "bad_envelope", "pesan butuh id dan type");

        var payload = node?["payload"];
        try
        {
            return type switch
            {
                "system.health" => Reply(id, type, new
                {
                    uptime = (DateTime.UtcNow - _startedAt).TotalSeconds,
                    camera = camera is null ? "disconnected" : "connected",
                    printer = State((await printer.GetStatusAsync(ct)).State),
                    workingSetMb = Math.Round(Environment.WorkingSet / 1048576.0, 1),
                    handles = System.Diagnostics.Process.GetCurrentProcess().HandleCount,
                }),
                "camera.list" => Reply(id, type, camera is null
                    ? Array.Empty<object>()
                    : [new { id = "hotfolder", brand = "hotfolder", model = "Hot folder", serial = camera.Folder }]),
                "camera.connect" => Reply(id, type, new { ok = camera is not null && RequiredString(payload, "id") == "hotfolder" }),
                "camera.status" => Reply(id, type, new
                {
                    connected = camera is not null,
                    model = camera is null ? null : "Hot folder",
                    battery = (int?)null,
                    shotsRemaining = (int?)null,
                }),
                "liveview.start" or "liveview.stop" => Error(id, "unsupported", "hot folder tidak punya live view"),
                "capture" => await Capture(id, type, payload, ct),
                "print.submit" => await PrintSubmit(id, type, payload, ct),
                "print.status" => await PrintStatus(id, type, payload, ct),
                _ => Error(id, "unknown_type", $"perintah '{type}' belum didukung"),
            };
        }
        catch (BadPayload e) { return Error(id, "bad_payload", e.Message); }
        catch (PrintFailure f) { return Error(id, f.Code, f.Message); }
        catch (CameraFailure f) { return Error(id, f.Code, f.Message); }
    }

    private async Task<string> Capture(string id, string type, JsonNode? p, CancellationToken ct)
    {
        if (camera is null) throw new CameraFailure("no_camera", "tidak ada kamera (jalankan dengan --hot-folder)");
        RequiredString(p, "sessionId");
        var outputDir = RequiredString(p, "outputDir");
        if (!Path.IsPathFullyQualified(outputDir)) throw new BadPayload("outputDir harus path absolut");
        int index;
        try { index = p?["index"]?.GetValue<int>() ?? throw new BadPayload("index wajib diisi"); }
        catch (Exception e) when (e is InvalidOperationException or FormatException) { throw new BadPayload("index harus bilangan bulat"); }
        if (index < 0) throw new BadPayload("index harus ≥ 0");
        var r = await camera.CaptureAsync(outputDir, index, ct);
        return Reply(id, type, new { path = r.Path, width = r.Width, height = r.Height });
    }

    private async Task<string> PrintSubmit(string id, string type, JsonNode? p, CancellationToken ct)
    {
        var job = new PrintJob(
            JobId: RequiredString(p, "jobId"),
            Path: RequiredString(p, "path"),
            Copies: PositiveInt(p, "copies"),
            Paper: RequiredString(p, "paper"));
        if (!Presets.IsKnown(job.Paper)) throw new BadPayload("paper harus \"4R\" atau \"2x6x2\"");
        await printer.SubmitAsync(job, ct);
        return Reply(id, type, new { accepted = true });
    }

    private async Task<string> PrintStatus(string id, string type, JsonNode? p, CancellationToken ct)
    {
        var s = await printer.GetJobStatusAsync(RequiredString(p, "jobId"), ct);
        return s.Error is null
            ? Reply(id, type, new { status = s.State.ToString().ToLowerInvariant() })
            : Reply(id, type, new { status = s.State.ToString().ToLowerInvariant(), error = s.Error });
    }

    /// <summary>Event adapter → pesan teks tanpa `id` (EventSchema di camera-protocol.ts).</summary>
    public static string SerializeEvent(PrinterEvent e) => e switch
    {
        PrintDoneEvent d => Event("print.done", new { jobId = d.JobId }),
        PrintFailedEvent f => Event("print.failed", new { jobId = f.JobId, code = f.Code, message = f.Message }),
        PrinterStatusEvent s => s.Status.Message is null
            ? Event("printer.status", new { status = State(s.Status.State), paperRemaining = s.Status.PaperRemaining })
            : Event("printer.status", new { status = State(s.Status.State), paperRemaining = s.Status.PaperRemaining, message = s.Status.Message }),
        _ => throw new ArgumentOutOfRangeException(nameof(e), e, "event tidak dikenal"),
    };

    private static string State(PrinterState s) => s.ToString().ToLowerInvariant();

    private static string RequiredString(JsonNode? p, string key)
    {
        try
        {
            var v = p?[key]?.GetValue<string>();
            return string.IsNullOrEmpty(v) ? throw new BadPayload($"{key} wajib diisi") : v;
        }
        catch (InvalidOperationException) { throw new BadPayload($"{key} harus string"); }
    }

    private static int PositiveInt(JsonNode? p, string key)
    {
        try
        {
            var v = p?[key]?.GetValue<int>() ?? throw new BadPayload($"{key} wajib diisi");
            return v > 0 ? v : throw new BadPayload($"{key} harus > 0");
        }
        catch (Exception e) when (e is InvalidOperationException or FormatException) { throw new BadPayload($"{key} harus bilangan bulat"); }
    }

    private static string Reply(string id, string type, object payload) =>
        JsonSerializer.Serialize(new { id, type, payload }, Json);

    private static string Event(string type, object payload) =>
        JsonSerializer.Serialize(new { type, payload }, Json);

    private static string Error(string id, string code, string message) =>
        JsonSerializer.Serialize(new { id, type = "error", payload = new { code, message } }, Json);

    private sealed class BadPayload(string message) : Exception(message);
}
