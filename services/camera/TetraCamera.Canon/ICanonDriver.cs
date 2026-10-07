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
    /// <summary>
    /// Photo Stage (#178): file yang dikirim kamera tanpa diminta (rana fotografer) diunduh ke memori;
    /// null = tidak ada. Dipanggil dari loop thread SDK setelah <see cref="Pump"/>.
    /// </summary>
    byte[]? TakeUnsolicited();
    void SetLiveView(bool on);
    /// <summary>Satu frame live view JPEG; null = belum siap.</summary>
    byte[]? LiveViewFrame();
    /// <summary>`af`, `near1..3`, `far1..3`.</summary>
    void Focus(string step);
    /// <summary>Tap to focus: pindahkan area AF live view ke titik (0–1 di frame kamera, tanpa cermin), lalu AF.</summary>
    void FocusAt(double x, double y);
    /// <summary>Nilai setelan saat ini (kode EDSDK).</summary>
    uint GetProp(uint propId);
    /// <summary>Kode yang bisa dipilih sekarang (bergantung mode dial & lensa).</summary>
    uint[] PropOptions(uint propId);
    void SetProp(uint propId, uint value);
}
