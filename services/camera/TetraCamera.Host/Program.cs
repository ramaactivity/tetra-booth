using System.Security.Cryptography;
using System.Text;
using TetraCamera.Host;
using TetraCamera.Print;

// Port & token diberikan Electron main saat spawn (TSD §1). Default hanya untuk dev manual.
var port = int.Parse(Environment.GetEnvironmentVariable("TETRA_CAMERA_PORT") ?? "8765");
var token = Environment.GetEnvironmentVariable("TETRA_CAMERA_TOKEN") ?? "dev";
// Printer (M4): sementara dari argumen, nanti dari config device lewat Electron.
string? printerName = null, paper4R = null, paper2x6x2 = null, printToFile = null, printJournal = null, hotFolder = null;
var paperFitMargin = false;
for (var i = 0; i + 1 < args.Length; i++)
{
    switch (args[i])
    {
        case "--port": port = int.Parse(args[i + 1]); break;
        case "--token": token = args[i + 1]; break;
        case "--printer": printerName = args[i + 1]; break;
        case "--paper-4r": paper4R = args[i + 1]; break;
        case "--paper-2x6x2": paper2x6x2 = args[i + 1]; break;
        case "--print-to-file": printToFile = Path.GetFullPath(args[i + 1]); break;
        case "--print-journal": printJournal = Path.GetFullPath(args[i + 1]); break;
        case "--hot-folder": hotFolder = Path.GetFullPath(args[i + 1]); break;
        case "--paper-fit": paperFitMargin = args[i + 1] == "margin"; break;
    }
}
var tokenBytes = Encoding.UTF8.GetBytes(token);

var builder = WebApplication.CreateBuilder();
builder.WebHost.ConfigureKestrel(k => k.ListenLocalhost(port));
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();
app.UseWebSockets();

IPrinterAdapter printer = OperatingSystem.IsWindows()
    ? new TetraCamera.Print.Windows.WindowsPrinterAdapter(
        new(printerName, new PaperConfig(paper4R, paper2x6x2, paperFitMargin), printToFile))
    {
        // Jurnal job print di disk: kirim ulang setelah crash tidak mencetak dua kali (DECISIONS #39).
        Journal = printJournal is null ? null : new PrintJournal(printJournal),
    }
    : new NullPrinterAdapter();
var events = new EventHub();
printer.Event += e => events.Publish(Dispatcher.SerializeEvent(e));
var camera = hotFolder is null ? null : new TetraCamera.HotFolder.HotFolderCamera(hotFolder);
var dispatcher = new Dispatcher(printer, camera);

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
    await SocketSession.RunAsync(ws, dispatcher, events, ctx.RequestAborted);
});

Console.WriteLine($"TetraCamera siap di ws://127.0.0.1:{port}/ws");
if (camera is not null) Console.WriteLine($"Kamera: hot folder {camera.Folder}");
if (printerName is not null) Console.WriteLine($"Printer: {printerName} (4R: {paper4R ?? "ukuran 4x6"}, 2x6x2: {paper2x6x2 ?? "-"}{(paperFitMargin ? ", mode ber-margin" : "")})");
app.Run();
