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
(double X, double Y)? printOffset = null;
string? printer2x6x2 = null;
Uri? hotFolderTrigger = null;
// Canon EDSDK (DECISIONS #111): folder berisi EDSDK.dll, atau "fake" (kamera simulasi untuk dev/e2e).
string? canon = null, canonSettings = null;
// Sony Camera Remote Command (DECISIONS #169): `wpd` (Windows), `fake` (A7 III v2) / `fake-v3` (A7 IV) untuk dev/e2e.
// `--sony-probe <wpd|fake|fake-v3>` = diagnostik W-037 lalu keluar; `--sony-force 2|3` memaksa versi protokol.
string? sony = null, sonyProbe = null, sonyForce = null;
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
        case "--printer-2x6x2": printer2x6x2 = args[i + 1]; break;
        case "--print-offset":
            printOffset = PaperSelector.ParseOffset(args[i + 1]);
            if (printOffset is null) Console.Error.WriteLine($"--print-offset '{args[i + 1]}' tidak valid (format \"x,y\" dalam 1/100 in), diabaikan");
            break;
        case "--hot-folder-trigger": hotFolderTrigger = new Uri(args[i + 1]); break;
        case "--canon": canon = args[i + 1]; break;
        case "--canon-settings": canonSettings = Path.GetFullPath(args[i + 1]); break;
        case "--sony": sony = args[i + 1]; break;
        case "--sony-probe": sonyProbe = args[i + 1]; break;
        case "--sony-force": sonyForce = args[i + 1]; break;
    }
}
if (sonyProbe is not null)
{
    using var t = SonyTransport(sonyProbe);
    if (t is null) return 1;
    return TetraCamera.Sony.SonyProbe.Run(t, Console.Out,
        sonyForce switch { "2" => TetraCamera.Sony.SonyProfile.V2, "3" => TetraCamera.Sony.SonyProfile.V3, _ => null });
}
var tokenBytes = Encoding.UTF8.GetBytes(token);

var builder = WebApplication.CreateBuilder();
builder.WebHost.ConfigureKestrel(k => k.ListenLocalhost(port));
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();
app.UseWebSockets();

IPrinterAdapter printer = OperatingSystem.IsWindows()
    ? new TetraCamera.Print.Windows.WindowsPrinterAdapter(
        new(printerName, new PaperConfig(paper4R, paper2x6x2, paperFitMargin), printToFile, printer2x6x2, printOffset))
    {
        // Jurnal job print di disk: kirim ulang setelah crash tidak mencetak dua kali (DECISIONS #39).
        Journal = printJournal is null ? null : new PrintJournal(printJournal),
    }
    : new NullPrinterAdapter();
var events = new EventHub();
printer.Event += e => events.Publish(Dispatcher.SerializeEvent(e));
TetraCamera.HotFolder.ICameraSource? camera = null;
if (canon is not null)
{
    try
    {
        var cam = new TetraCamera.Canon.CanonCamera(canon == "fake"
            ? new TetraCamera.Canon.FakeCanonDriver()
            : new TetraCamera.Canon.EdsdkDriver(Path.GetFullPath(canon)),
            settingsPath: canonSettings);
        cam.ConnectionChanged += on => events.Publish(Dispatcher.CameraEvent(cam, on));
        camera = cam;
    }
    catch (TetraCamera.HotFolder.CameraFailure e) { Console.Error.WriteLine($"Canon EDSDK tidak dipakai: {e.Message}"); }
}
if (camera is null && sony is not null && SonyTransport(sony) is { } sonyTransport)
{
    var cam = new TetraCamera.Sony.SonyCamera(sonyTransport);
    cam.ConnectionChanged += on => events.Publish(Dispatcher.CameraEvent(cam, on));
    camera = cam;
}
camera ??= hotFolder is null ? null : new TetraCamera.HotFolder.HotFolderCamera(hotFolder, trigger: hotFolderTrigger);
var dispatcher = new Dispatcher(printer, camera);

// Frame live view terbaru (Canon): diambil berulang oleh Electron main.
app.MapGet("/liveview.jpg", (HttpContext ctx) =>
{
    var provided = Encoding.UTF8.GetBytes(ctx.Request.Query["token"].ToString());
    if (!CryptographicOperations.FixedTimeEquals(provided, tokenBytes)) return Results.Unauthorized();
    return camera?.LatestFrame is { } f ? Results.File(f, "image/jpeg") : Results.NoContent();
});

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
if (camera is not null) Console.WriteLine($"Kamera: {camera.Brand} ({camera.Serial})");
if (printerName is not null) Console.WriteLine($"Printer: {printerName} (4R: {paper4R ?? "ukuran 4x6"}, 2x6x2: {paper2x6x2 ?? "-"}{(paperFitMargin ? ", mode ber-margin" : "")})");
app.Run();
return 0;

static TetraCamera.Sony.IPtpTransport? SonyTransport(string kind)
{
    if (kind == "fake") return TetraCamera.Sony.FakeSonyTransport.A7III();
    if (kind == "fake-v3") return TetraCamera.Sony.FakeSonyTransport.A7IV();
    if (kind == "wpd" && OperatingSystem.IsWindows()) return new TetraCamera.Sony.WpdTransport();
    Console.Error.WriteLine($"--sony '{kind}' tidak dipakai (fake | fake-v3 | wpd di Windows)");
    return null;
}
