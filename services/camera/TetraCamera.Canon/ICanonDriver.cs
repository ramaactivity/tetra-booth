namespace TetraCamera.Canon;

/// <summary>
/// Operasi kamera Canon yang dipakai <see cref="CanonCamera"/>. Semua method dipanggil dari satu thread (thread SDK).
/// Implementasi: <see cref="EdsdkDriver"/> (EDSDK asli, Windows) dan <see cref="FakeCanonDriver"/> (Mac/CI/uji).
/// </summary>
public interface ICanonDriver : IDisposable
{
    /// <summary>Buka sesi ke kamera pertama. null = tidak ada kamera tersambung.</summary>
    (string Model, string Serial)? Open();
    bool IsOpen { get; }
    void Close();
    /// <summary>Proses event SDK (kamera dicabut, file siap diunduh). Dipanggil berkala.</summary>
    void Pump();
    /// <summary>Jepret lalu unduh JPEG hasilnya ke memori (menunggu transfer maks. <paramref name="timeout"/>).</summary>
    byte[] Capture(TimeSpan timeout);
    void SetLiveView(bool on);
    /// <summary>Satu frame live view JPEG; null = belum siap.</summary>
    byte[]? LiveViewFrame();
    /// <summary>`af`, `near1..3`, `far1..3`.</summary>
    void Focus(string step);
}
