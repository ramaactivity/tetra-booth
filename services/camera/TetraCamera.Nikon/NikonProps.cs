using System.Collections.Concurrent;
using System.Globalization;
using TetraCamera.Canon;

namespace TetraCamera.Nikon;

/// <summary>
/// Setelan Nikon di mode crew (DECISIONS #216), nama sama dengan Canon/Sony/Lumix. MAID memberi pilihan ISO, shutter,
/// aperture, dan WB sebagai teks dari kamera ("100", "1/125", "5.6", "Auto"), bukan kode tetap. Karena itu kode setelan =
/// hash label, dan tabel label diisi driver setiap kali membaca kamera (<see cref="Remember"/>). Id setelan = id
/// capability MAID.
/// </summary>
public static class NikonProps
{
    public const uint Iso = Maid.CapSensitivity, Shutter = Maid.CapShutterSpeed, Aperture = Maid.CapAperture,
        WhiteBalance = Maid.CapWBMode, Exposure = Maid.CapExposureComp;

    private static readonly Dictionary<uint, ConcurrentDictionary<uint, string>> Labels = new()
    {
        [Iso] = new(), [Shutter] = new(), [Aperture] = new(), [WhiteBalance] = new(), [Exposure] = new(),
    };

    /// <summary>FNV-1a 32-bit: kode stabil untuk satu label (nilai kamera ↔ setelan crew yang tersimpan).</summary>
    public static uint Code(string label)
    {
        var h = 2166136261u;
        foreach (var c in label) h = (h ^ c) * 16777619u;
        return h;
    }

    /// <summary>Catat label (thread SDK) lalu kembalikan kodenya.</summary>
    public static uint Remember(uint prop, string label)
    {
        var code = Code(label);
        Labels[prop][code] = label;
        return code;
    }

    public static string? Label(uint prop, uint code) => Labels[prop].GetValueOrDefault(code);

    /// <summary>Label crew dari teks kamera: ISO "100" → "ISO 100", shutter "2" → 2", aperture "5.6" → "f/5.6".</summary>
    public static string Display(uint prop, string raw)
    {
        var num = double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out _);
        return prop switch
        {
            Iso => $"ISO {raw}",
            Shutter when num => $"{raw}\"",
            Aperture when num => $"f/{raw}",
            _ => raw,
        };
    }

    /// <summary>Sama dengan label EV Sony/Lumix: "+0.3 EV", "-1.0 EV".</summary>
    public static string EvLabel(double ev) =>
        (ev > 0.01 ? "+" : "") + (Math.Abs(ev) < 0.01 ? 0 : ev).ToString("0.0", CultureInfo.InvariantCulture) + " EV";

    public static readonly CanonProps.Def[] All =
    [
        new("iso", "ISO live view", Iso, Labels[Iso]),
        new("shutterspeed", "Shutter", Shutter, Labels[Shutter]),
        new("aperture", "Aperture", Aperture, Labels[Aperture]),
        new("whitebalance", "White balance", WhiteBalance, Labels[WhiteBalance]),
        new("exposurecomp", "Kompensasi eksposur", Exposure, Labels[Exposure]),
    ];

    /// <summary>
    /// ISO/shutter jepret seperti Canon (#113, W-034). Memakai tabel label yang sama (ikut terisi saat kamera dibaca),
    /// ditambah "Sama dengan live view".
    /// </summary>
    public static readonly CanonProps.Def[] CaptureOverrides = Overrides();

    private static CanonProps.Def[] Overrides()
    {
        Labels[Iso][CanonProps.SameAsLive] = CanonProps.SameAsLiveLabel;
        Labels[Shutter][CanonProps.SameAsLive] = CanonProps.SameAsLiveLabel;
        return
        [
            new("iso_capture", "ISO jepret (flash)", Iso, Labels[Iso], Virtual: true),
            new("shutter_capture", "Shutter jepret", Shutter, Labels[Shutter], Virtual: true),
        ];
    }

    /// <summary>Baterai MAID: persen, -1 = adaptor AC (CanonCamera menampilkan "Adaptor AC" untuk nilai &gt; 100).</summary>
    public static readonly DriverKind Kind =
        new("nikon", "Nikon", All, CaptureOverrides, Maid.CapBatteryLevel, false);

    /// <summary>Kamera Nikon palsu (`--nikon fake`): teks pilihan seperti kamera asli, label dicatat seperti driver.</summary>
    public static (Dictionary<uint, uint> Props, Dictionary<uint, uint[]> Options) Fake()
    {
        uint[] Opts(uint prop, params string[] raw) =>
            [.. raw.Select(r => Remember(prop, prop == Exposure ? r : Display(prop, r)))];
        var options = new Dictionary<uint, uint[]>
        {
            [Iso] = Opts(Iso, "100", "200", "400", "800", "1600"),
            [Shutter] = Opts(Shutter, "1/60", "1/100", "1/125", "1/160", "1/200"),
            [Aperture] = Opts(Aperture, "2.8", "4", "5.6", "8"),
            [WhiteBalance] = Opts(WhiteBalance, "Auto", "Sunny", "Cloudy", "Incandescent"),
            [Exposure] = Opts(Exposure, EvLabel(-1), EvLabel(-1 / 3.0), EvLabel(0), EvLabel(1 / 3.0), EvLabel(1)),
        };
        var props = new Dictionary<uint, uint>
        {
            [Iso] = options[Iso][1], [Shutter] = options[Shutter][2], [Aperture] = options[Aperture][2],
            [WhiteBalance] = options[WhiteBalance][0], [Exposure] = options[Exposure][2], [Maid.CapBatteryLevel] = 80,
        };
        return (props, options);
    }

    /// <summary>
    /// Modul MAID per bodi (dokumen "Usage of TypeXXXX Module" tiap paket). Kunci = nama WPD tanpa spasi, huruf besar.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> Modules = new Dictionary<string, string>
    {
        ["D3"] = "Type0001", ["D300"] = "Type0001", ["D700"] = "Type0001", ["D300S"] = "Type0001", ["D3S"] = "Type0001",
        ["D3X"] = "Type0002", ["D90"] = "Type0003", ["D5000"] = "Type0003", ["D7000"] = "Type0004",
        ["D5100"] = "Type0005", ["D800"] = "Type0006", ["D800E"] = "Type0006", ["D4"] = "Type0007",
        ["D600"] = "Type0008", ["D610"] = "Type0008", ["D5200"] = "Type0009", ["D7100"] = "Type0010",
        ["D5300"] = "Type0011", ["DF"] = "Type0012", ["D4S"] = "Type0013", ["D810"] = "Type0014",
        ["D810A"] = "Type0014", ["D750"] = "Type0015", ["D5500"] = "Type0016", ["D5600"] = "Type0016",
        ["D7200"] = "Type0017", ["D5"] = "Type0018", ["V3"] = "Type0019", ["D500"] = "Type0020",
        ["D7500"] = "Type0021", ["D850"] = "Type0022", ["Z7"] = "Type0023", ["Z6"] = "Type0024",
        ["Z50"] = "Type0025", ["D780"] = "Type0026", ["D6"] = "Type0027", ["Z5"] = "Type0028",
        ["Z6_2"] = "Type0029", ["Z7_2"] = "Type0029", ["Z6II"] = "Type0029", ["Z7II"] = "Type0029",
        ["Z9"] = "Type0030", ["Z8"] = "Type0031",
    };

    /// <summary>Modul untuk nama perangkat WPD ("NIKON D750", "Z 6_2"); null = tidak dikenal (coba semua modul).</summary>
    public static string? ModuleFor(string deviceName)
    {
        var n = deviceName.ToUpperInvariant().Replace("NIKON", "").Replace("DSC", "").Replace(" ", "").Trim();
        return Modules.GetValueOrDefault(n);
    }
}
