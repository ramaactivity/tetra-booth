using System.Globalization;
using TetraCamera.Canon;

namespace TetraCamera.Lumix;

/// <summary>
/// Setelan Lumix di mode crew (DECISIONS #214), nama sama dengan Canon/Sony supaya sheet crew dipakai bersama. Kode =
/// nilai SDK Lumix (spesifikasi API bab 4): ISO apa adanya, shutter penyebut ×1000 (≥ 1 detik: detik ×1000 + bit 31),
/// aperture F ×10, EV kelipatan 1/3 (negatif + 0x8000). Id setelan = id event SDK.
/// </summary>
public static class LumixProps
{
    public const uint Iso = 0x02000020, Shutter = 0x02000030, Aperture = 0x02000040, WhiteBalance = 0x02000050,
        Exposure = 0x02000060;

    private static string Num(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);

    public static string IsoLabel(uint v) => v switch
    {
        0xFFFFFFFF => "ISO Auto",
        0xFFFFFFFE => "ISO Intelligent",
        _ => $"ISO {v}",
    };

    public static uint ShutterCode(double seconds) =>
        seconds >= 1 ? 0x80000000u | (uint)Math.Round(seconds * 1000) : (uint)Math.Round(1 / seconds * 1000);

    /// <summary>Gaya label Canon: 1/125, 1/3.2, 1"3, 30".</summary>
    public static string ShutterLabel(uint v) => v switch
    {
        0xFFFFFFFF => "Bulb",
        0x0FFFFFFF => "Auto",
        _ when (v & 0x80000000) != 0 => Num((v & 0x7FFFFFFF) / 1000.0).Replace('.', '"') +
            ((v & 0x7FFFFFFF) % 1000 == 0 ? "\"" : ""),
        _ => $"1/{Num(v / 1000.0)}",
    };

    public static string ApertureLabel(uint v) => v is 0xFFFF ? "Auto" : $"f/{Num(v / 10.0)}";

    /// <summary>Nama sama dengan label WB Canon (diterjemahkan di CameraProps booth: "Auto" → "Otomatis", dst).</summary>
    public static string WbLabel(uint v) => v switch
    {
        0x0002 => "Auto",
        0x8014 => "Auto (cool)",
        0x8015 => "Auto (warm)",
        0x0004 => "Daylight",
        0x8008 => "Cloudy",
        0x800F => "Shade",
        0x0006 => "Tungsten",
        0x0005 => "Fluorescent",
        0x0007 => "Flash",
        0x8009 => "White set",
        0x800A => "Black & white",
        0x800B => "Custom 1",
        0x800C => "Custom 2",
        0x800D => "Custom 3",
        0x800E => "Custom 4",
        0x8010 => "Color temperature",
        0x8011 => "Color temperature 2",
        0x8012 => "Color temperature 3",
        0x8013 => "Color temperature 4",
        _ => $"0x{v:X4}",
    };

    /// <summary>Sama dengan label EV Sony: "+0.3 EV", "-1.0 EV".</summary>
    public static string EvLabel(uint v)
    {
        var ev = (v & 0x7FFF) / 3.0 * ((v & 0x8000) != 0 ? -1 : 1);
        return (ev > 0 ? "+" : "") + ev.ToString("0.0", CultureInfo.InvariantCulture) + " EV";
    }

    private static Dictionary<uint, string> Table(IEnumerable<uint> codes, Func<uint, string> label) =>
        codes.Distinct().ToDictionary(c => c, label);

    // ponytail: daftar nilai umum Lumix (GH5: ISO 100–25600, shutter 60"–1/16000, ½ & ⅓ stop). Kode dari kamera yang
    // tidak ada di sini tidak tampil di pilihan; tambahkan di sini kalau uji W-043 menemukan "0x…".
    private static readonly uint[] IsoCodes =
    [
        0xFFFFFFFF, 0xFFFFFFFE, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000,
        2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600, 32000, 40000, 51200, 64000, 80000, 102400,
        128000, 160000, 204800,
    ];

    private static readonly double[] ShutterSeconds =
    [
        60, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3.2, 2.5, 2, 1.6, 1.3, 1,
        .. new double[]
        {
            1.3, 1.5, 1.6, 2, 2.5, 3, 3.2, 4, 5, 6, 8, 10, 11, 13, 15, 20, 25, 30, 40, 45, 50, 60, 80, 90, 100, 125, 160,
            180, 200, 250, 320, 350, 400, 500, 640, 750, 800, 1000, 1250, 1300, 1500, 1600, 2000, 2500, 3000, 3200, 4000,
            5000, 6000, 6400, 8000, 10000, 13000, 16000, 20000, 25000, 32000,
        }.Select(d => 1 / d),
    ];

    private static readonly uint[] ApertureCodes =
    [
        0xFFFF, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 22, 25, 28, 32, 35, 40, 45, 50, 56, 63, 71, 80, 90, 100, 110, 130,
        140, 160, 180, 200, 220,
    ];

    private static readonly uint[] WbCodes =
    [
        0x0002, 0x8014, 0x8015, 0x0004, 0x8008, 0x800F, 0x0006, 0x0005, 0x0007, 0x8009, 0x800A, 0x800B, 0x800C, 0x800D,
        0x800E, 0x8010, 0x8011, 0x8012, 0x8013,
    ];

    private static readonly uint[] EvCodes = [.. Enumerable.Range(0, 16).SelectMany(n => new[] { (uint)n, 0x8000u | (uint)n })];

    public static readonly CanonProps.Def[] All =
    [
        new("iso", "ISO live view", Iso, Table(IsoCodes, IsoLabel)),
        new("shutterspeed", "Shutter", Shutter,
            Table([0xFFFFFFFF, 0x0FFFFFFF, .. ShutterSeconds.Select(ShutterCode)], ShutterLabel)),
        new("aperture", "Aperture", Aperture, Table(ApertureCodes, ApertureLabel)),
        new("whitebalance", "White balance", WhiteBalance, Table(WbCodes, WbLabel)),
        new("exposurecomp", "Kompensasi eksposur", Exposure, Table(EvCodes, EvLabel)),
    ];

    private static CanonProps.Def Capture(string name, string label, uint prop) => new(
        name,
        label,
        prop,
        new Dictionary<uint, string>(All.First(d => d.PropId == prop).Values)
        {
            [CanonProps.SameAsLive] = CanonProps.SameAsLiveLabel,
        },
        Virtual: true);

    /// <summary>ISO/shutter jepret seperti Canon (#113, W-034): dipasang tepat sebelum rana lalu dikembalikan.</summary>
    public static readonly CanonProps.Def[] CaptureOverrides =
        [Capture("iso_capture", "ISO jepret (flash)", Iso), Capture("shutter_capture", "Shutter jepret", Shutter)];

    /// <summary>SDK Lumix tanpa info baterai dan tanpa pindah titik AF: tap to focus tidak ada, AF tetap ada.</summary>
    public static readonly DriverKind Kind = new("lumix", "Lumix", All, CaptureOverrides, null, false);

    /// <summary>Kamera Lumix palsu (`--lumix fake`): ISO 200, 1/125, f/5.6, WB Auto, EV 0.</summary>
    public static Dictionary<uint, uint> FakeProps() => new()
    {
        [Iso] = 200, [Shutter] = 125000, [Aperture] = 56, [WhiteBalance] = 2, [Exposure] = 0,
    };

    public static Dictionary<uint, uint[]> FakeOptions() => new()
    {
        [Iso] = [0xFFFFFFFF, 200, 400, 800, 1600, 3200],
        [Shutter] = [60000, 100000, 125000, 160000, 200000],
        [Aperture] = [28, 40, 56, 80],
        [WhiteBalance] = [2, 4, 0x8008, 6],
        [Exposure] = [0x8003, 0x8001, 0, 1, 3],
    };
}
