using System.Globalization;

namespace TetraCamera.Sony;

/// <summary>
/// Kode properti & kontrol Sony yang dipakai (identifier dari Camera Control PTP 2/3 Reference, docs/PLAN-SONY.md §3)
/// dan labelnya untuk sheet crew. Nama setelan sama dengan Canon (`iso`, `shutterspeed`, `aperture`, `whitebalance`)
/// supaya Kamera & Tes Jepret dipakai bersama; `exposurecomp` tambahan Sony. Label ditulis sendiri dari format nilai
/// di dokumen (ISO = angka, shutter = pembilang/penyebut, F ×100, EV ×1000), bukan salinan tabel Sony.
/// </summary>
public static class SonyProps
{
    // Properti (SDIO_GetAllExtDevicePropInfo).
    public const ushort WhiteBalance = 0x5005, FNumber = 0x5007, ExposureComp = 0x5010, Shutter = 0xD20D,
        FocusIndication = 0xD213, ShootingFileInfo = 0xD215, Battery = 0xD218, Iso = 0xD21E, LiveViewStatus = 0xD221,
        SaveDestination = 0xD222, NearFarEnabled = 0xD235, MediaStatus = 0xD248, MediaShots = 0xD249,
        Overheating = 0xD251, PositionKey = 0xD25A, LiveViewQuality = 0xD26A, CameraError = 0xD1BB;

    // Kontrol (SDIO_ControlDevice). F/EV/shutter/ISO memakai kode yang sama dengan propertinya (v2: langkah notch).
    public const ushort S1 = 0xD2C1, S2 = 0xD2C2, NearFar = 0xD2D1, AfAreaPosition = 0xD2DC;
    public const ushort Up = 0x0001, Down = 0x0002;

    /// <summary>Nilai 0xD222 (Still Image Save Destination).</summary>
    public const long SaveToPc = 0x0001, SaveToCard = 0x0010, SaveToBoth = 0x0011;

    public sealed record Def(string Name, string Label, ushort Code, Func<long, string> Format);

    public static readonly Def[] All =
    [
        new("iso", "ISO", Iso, IsoLabel),
        new("shutterspeed", "Shutter", Shutter, ShutterLabel),
        new("aperture", "Aperture", FNumber, ApertureLabel),
        new("whitebalance", "White balance", WhiteBalance, WbLabel),
        new("exposurecomp", "Kompensasi eksposur", ExposureComp, EvLabel),
    ];

    public static string IsoLabel(long v) => v switch
    {
        0x00FFFFFF => "ISO Auto",
        _ when (v >> 24) == 0x01 => $"ISO {v & 0xFFFFFF} (Multi Frame NR)",
        _ when (v >> 24) == 0x02 => $"ISO {v & 0xFFFFFF} (Multi Frame NR+)",
        _ => $"ISO {v}",
    };

    /// <summary>Pembilang (2 byte atas) / penyebut (2 byte bawah): 1/125, 1.5", 30"; 0 = Bulb.</summary>
    public static string ShutterLabel(long v)
    {
        if (v == 0) return "Bulb";
        if (v is 0xFFFFFFFF or < 0) return "—";
        var (num, den) = ((v >> 16) & 0xFFFF, v & 0xFFFF);
        if (den == 0) return "—";
        if (num == 1 && den > 1) return $"1/{den}";
        return $"{((double)num / den).ToString("0.#", CultureInfo.InvariantCulture)}\"";
    }

    public static string ApertureLabel(long v) => v switch
    {
        0xFFFD => "Tertutup",
        0xFFFE or 0xFFFF => "—",
        _ => $"f/{(v / 100.0).ToString("0.#", CultureInfo.InvariantCulture)}",
    };

    /// <summary>Nama sama dengan label WB Canon (diterjemahkan di CameraProps booth: "Auto" → "Otomatis", dst).</summary>
    public static string WbLabel(long v) => v switch
    {
        0x0001 => "Manual",
        0x0002 => "Auto",
        0x0003 => "One-push Auto",
        0x0004 => "Daylight",
        0x0005 => "Fluorescent",
        0x0006 => "Tungsten",
        0x0007 => "Flash",
        0x8001 => "Fluorescent (warm white)",
        0x8002 => "Fluorescent (cool white)",
        0x8003 => "Fluorescent (day white)",
        0x8004 => "Fluorescent (daylight)",
        0x8010 => "Cloudy",
        0x8011 => "Shade",
        0x8012 => "Color temperature",
        0x8020 => "Custom 1",
        0x8021 => "Custom 2",
        0x8022 => "Custom 3",
        0x8023 => "Custom",
        0x8030 => "Underwater auto",
        _ => $"0x{v:X4}",
    };

    /// <summary>EV ×1000 (INT16): -1000 → "-1.0 EV", 300 → "+0.3 EV".</summary>
    public static string EvLabel(long v) =>
        (v > 0 ? "+" : "") + (v / 1000.0).ToString("0.0", CultureInfo.InvariantCulture) + " EV";

    public static string SaveLabel(long v) => v switch
    {
        SaveToPc => "PC saja",
        SaveToCard => "Kartu kamera saja",
        SaveToBoth => "PC + kartu",
        _ => $"0x{v:X4}",
    };

    /// <summary>Media SLOT1 Status (v3, sebagian v2): null = OK.</summary>
    public static (string Code, string Message)? CardProblem(long v) => v switch
    {
        0x01 => null,
        0x02 => ("card_missing", "Tidak ada kartu memori di kamera. Pasang kartu, atau ubah Still Img. Save Dest. ke PC Only di menu kamera."),
        0x06 => ("card_error", "Kartu memori sedang dibaca kamera. Tunggu sebentar lalu coba lagi."),
        _ => ("card_error", "Kartu memori error atau terkunci. Ganti kartu, atau ubah Still Img. Save Dest. ke PC Only di menu kamera."),
    };
}
