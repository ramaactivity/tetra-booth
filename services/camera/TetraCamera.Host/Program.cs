using System.Security.Cryptography;
using System.Text;
using TetraCamera.Host;
using TetraCamera.Print;

// Port & token diberikan Electron main saat spawn (TSD §1). Default hanya untuk dev manual.
var port = int.Parse(Environment.GetEnvironmentVariable("TETRA_CAMERA_PORT") ?? "8765");
var token = Environment.GetEnvironmentVariable("TETRA_CAMERA_TOKEN") ?? "dev";
for (var i = 0; i + 1 < args.Length; i++)
{
    if (args[i] == "--port") port = int.Parse(args[i + 1]);
    if (args[i] == "--token") token = args[i + 1];
}
var tokenBytes = Encoding.UTF8.GetBytes(token);

var builder = WebApplication.CreateBuilder();
builder.WebHost.ConfigureKestrel(k => k.ListenLocalhost(port));
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();
app.UseWebSockets();

IPrinterAdapter printer = OperatingSystem.IsWindows()
    ? new TetraCamera.Print.Windows.WindowsPrinterAdapter()
    : new NullPrinterAdapter();
var dispatcher = new Dispatcher(printer);

app.Map("/ws", async (HttpContext ctx) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = StatusCodes.Status400BadRequest; return; }
    var provided = Encoding.UTF8.GetBytes(ctx.Request.Query["token"].ToString());
    if (!CryptographicOperations.FixedTimeEquals(provided, tokenBytes))
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    await SocketSession.RunAsync(ws, dispatcher, ctx.RequestAborted);
});

Console.WriteLine($"TetraCamera siap di ws://127.0.0.1:{port}/ws");
app.Run();
