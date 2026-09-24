using System.Collections.Concurrent;

namespace TetraCamera.Host;

/// <summary>Sebar event (pesan teks JSON tanpa `id`) ke semua koneksi WebSocket yang terbuka. TSD §2.</summary>
public sealed class EventHub
{
    private readonly ConcurrentDictionary<Guid, Func<string, Task>> _subscribers = new();

    public IDisposable Subscribe(Func<string, Task> send)
    {
        var key = Guid.NewGuid();
        _subscribers[key] = send;
        return new Subscription(() => _subscribers.TryRemove(key, out _));
    }

    public void Publish(string json)
    {
        foreach (var send in _subscribers.Values)
        {
            // Koneksi yang putus/lambat tidak boleh menahan koneksi lain.
            _ = send(json).ContinueWith(_ => { }, TaskContinuationOptions.OnlyOnFaulted);
        }
    }

    private sealed class Subscription(Action dispose) : IDisposable
    {
        private Action? _dispose = dispose;
        public void Dispose() => Interlocked.Exchange(ref _dispose, null)?.Invoke();
    }
}
