namespace TetraCamera.HotFolder;

/// <summary>
/// Sumber kamera di Camera Service (TSD §2): hot folder (§2.3) atau Canon EDSDK (§2.1, DECISIONS #111).
/// Dispatcher hanya bicara lewat antarmuka ini.
/// </summary>
public interface ICameraSource
{
    /// <summary>`hotfolder` / `canon` (CameraInfoSchema.brand).</summary>
    string Brand { get; }
    string Id { get; }
    bool Connected { get; }
    string? Model { get; }
    string Serial { get; }
    Task<CaptureResult> CaptureAsync(string outputDir, int index, CancellationToken ct = default);
    /// <summary>false = sumber ini tidak punya live view.</summary>
    Task<bool> StartLiveViewAsync();
    Task StopLiveViewAsync();
    /// <summary>Frame live view JPEG terbaru (null = belum ada / live view mati).</summary>
    byte[]? LatestFrame { get; }
    /// <summary>`af`, `near1..3`, `far1..3`; false = tidak didukung.</summary>
    Task<bool> FocusAsync(string step);
    /// <summary>Tap to focus (0–1 di frame kamera); false = tidak didukung.</summary>
    Task<bool> FocusAtAsync(double x, double y);
    /// <summary>Setelan eksposur (ISO/shutter/aperture/WB); kosong = tidak didukung.</summary>
    Task<IReadOnlyList<CameraProp>> PropsAsync();
    /// <summary>Ubah setelan ke salah satu label di <see cref="CameraProp.Options"/>.</summary>
    Task SetPropAsync(string name, string value);
    /// <summary>
    /// true = driver kamera macet (panggilan SDK tidak kembali). Health melapor gagal supaya supervisor booth
    /// me-restart Camera Service; proses baru memulai SDK dari nol.
    /// </summary>
    bool Stuck => false;
    /// <summary>Tap to focus didukung kamera yang tersambung sekarang (Sony: hanya bodi v3, DECISIONS #171).</summary>
    bool CanFocusAt => false;
}

public sealed record CameraProp(string Name, string Label, string Value, string[] Options);
