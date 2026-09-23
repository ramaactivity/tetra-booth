using System.Net.WebSockets;
using System.Text;

namespace TetraCamera.Host;

/// <summary>Satu koneksi WebSocket: baca pesan teks utuh, jawab lewat dispatcher. Frame biner diabaikan.</summary>
public static class SocketSession
{
    public static async Task RunAsync(WebSocket ws, Dispatcher dispatcher, CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];
        var message = new MemoryStream();
        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            WebSocketReceiveResult result;
            try { result = await ws.ReceiveAsync(buffer, ct); }
            catch (OperationCanceledException) { break; }
            catch (WebSocketException) { break; }

            if (result.MessageType == WebSocketMessageType.Close)
            {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
                break;
            }
            message.Write(buffer, 0, result.Count);
            if (!result.EndOfMessage) continue;

            if (result.MessageType == WebSocketMessageType.Text)
            {
                var text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                var reply = Encoding.UTF8.GetBytes(await dispatcher.HandleAsync(text, ct));
                await ws.SendAsync(reply, WebSocketMessageType.Text, true, ct);
            }
            message.SetLength(0);
        }
    }
}
