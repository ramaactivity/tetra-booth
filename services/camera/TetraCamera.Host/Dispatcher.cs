using System.Text.Json;
using System.Text.Json.Nodes;
using TetraCamera.Print;

namespace TetraCamera.Host;

/// <summary>
/// Menerima pesan teks JSON `{ id, type, payload }`, membalas dengan `id` yang sama. TSD §2.
/// Fase 0: hanya `system.health`. Perintah kamera & print ditambah di Fase 1.
/// </summary>
public sealed class Dispatcher(IPrinterAdapter printer)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly DateTime _startedAt = DateTime.UtcNow;

    public async Task<string> HandleAsync(string text, CancellationToken ct = default)
    {
        JsonNode? node;
        try { node = JsonNode.Parse(text); }
        catch (JsonException) { return Error("", "bad_json", "pesan bukan JSON"); }

        var id = node?["id"]?.GetValue<string>();
        var type = node?["type"]?.GetValue<string>();
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(type))
            return Error(id ?? "", "bad_envelope", "pesan butuh id dan type");

        return type switch
        {
            "system.health" => Reply(id, type, new
            {
                uptime = (DateTime.UtcNow - _startedAt).TotalSeconds,
                camera = "disconnected",
                printer = (await printer.GetStatusAsync(ct)).State.ToString().ToLowerInvariant(),
            }),
            _ => Error(id, "unknown_type", $"perintah '{type}' belum didukung"),
        };
    }

    private static string Reply(string id, string type, object payload) =>
        JsonSerializer.Serialize(new { id, type, payload }, Json);

    private static string Error(string id, string code, string message) =>
        JsonSerializer.Serialize(new { id, type = "error", payload = new { code, message } }, Json);
}
