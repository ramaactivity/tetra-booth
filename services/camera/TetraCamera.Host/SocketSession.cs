using System.Net.WebSockets;
using System.Text;

namespace TetraCamera.Host;

/// <summary>
/// Satu koneksi WebSocket: baca pesan teks utuh, jawab lewat dispatcher, terima event dari hub.
/// Balasan & event dikirim bergantian lewat satu kunci (WebSocket tidak boleh SendAsync paralel). Frame biner diabaikan.
/// </summary>
public static class SocketSession
{
    public static async Task RunAsync(WebSocket ws, Dispatcher dispatcher, EventHub events, CancellationToken ct)
    {
        using var sendLock = new SemaphoreSlim(1, 1);
        async Task Send(string text)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            await sendLock.WaitAsync(ct);
            try
            {
                if (ws.State == WebSocketState.Open)
                    await ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
            }
            finally { sendLock.Release(); }
        }

        using var subscription = events.Subscribe(Send);
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
                try { await Send(await dispatcher.HandleAsync(text, ct)); }
                catch (OperationCanceledException) { break; }
                catch (WebSocketException) { break; }
            }
            message.SetLength(0);
        }
    }
}
