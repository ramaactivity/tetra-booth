namespace TetraCamera.Print;

/// <summary>Satu ukuran kertas dari driver. Satuan 1/100 inci (sama dengan System.Drawing.Printing).</summary>
public sealed record PaperOption(string Name, int Width, int Height);

/// <summary>
/// Nama kertas persis dari driver per preset, dari config device (sementara: argumen Host).
/// <paramref name="AllowMargins"/>: mode ber-margin untuk printer inkjet biasa (W-018, DECISIONS #44): kertas boleh
/// lebih besar & punya margin keras, gambar tetap tepat 4×6 in di pojok area cetak, crew menggunting.
/// </summary>
public sealed record PaperConfig(string? Paper4R = null, string? Paper2x6x2 = null, bool AllowMargins = false)
{
    public string? NameFor(string preset) => preset switch
    {
        Presets.FourR => Paper4R,
        Presets.TwoBySixByTwo => Paper2x6x2,
        _ => null,
    };
}

public static class Presets
{
    public const string FourR = "4R";
    public const string TwoBySixByTwo = "2x6x2";

    public static bool IsKnown(string preset) => preset is FourR or TwoBySixByTwo;
}

/// <summary>
/// Pemilihan kertas untuk satu preset (PLAN-FASE-1 "Desain M4", DECISIONS #27).
/// Hanya memilih dari daftar driver; tidak pernah membuat ukuran custom dan tidak pernah jatuh ke Letter/A4.
/// </summary>
public static class PaperSelector
{
    /// <summary>Lebar × tinggi 4×6 inci dalam 1/100 inci.</summary>
    public const int FourBySixShort = 400, FourBySixLong = 600;

    /// <summary>Toleransi pencocokan ukuran driver (1/100 inci): kurang ≤ 2, lebih ≤ 17.</summary>
    public const int SizeTolerance = 2;

    /// <summary>Kertas 4×6 driver dye-sub boleh lebih besar karena overscan borderless (DNP DS-RX1: 615×413, W-021).</summary>
    public const int OverscanTolerance = 17;

    /// <summary>PrintableArea boleh kurang dari kertas sebesar ini (1/100 inci).</summary>
    public const int PrintableUnderTolerance = 2;

    /// <summary>PrintableArea boleh melebihi kertas sebesar ini (overscan borderless, 1/100 inci).</summary>
    public const int PrintableOverTolerance = 25;

    /// <summary>
    /// Urutan: nama persis dari config → 4R: ukuran 4×6 di orientasi mana pun (−2…+17, overscan) → 2x6x2: ukuran 4×6
    /// bukan 2-up, utamakan melebar (DNP "(6x4)", potong 2 inci diatur driver; DECISIONS #246 menyimpang dari #27 yang
    /// mewajibkan config) → gagal <c>paper_not_supported</c>.
    /// </summary>
    public static PaperOption Select(IReadOnlyList<PaperOption> available, string preset, PaperConfig config)
    {
        if (!Presets.IsKnown(preset))
            throw new PrintFailure(PrintErrors.BadPaper, $"preset kertas '{preset}' tidak dikenal");

        var configured = config.NameFor(preset);
        if (!string.IsNullOrEmpty(configured))
        {
            var byName = available.FirstOrDefault(p => string.Equals(p.Name, configured, StringComparison.Ordinal));
            if (byName is not null) return byName;
        }

        var bySize = preset == Presets.FourR
            ? available.FirstOrDefault(IsFourBySix)
            // Laptop tanpa booth-flags.txt (hp-dd, 10 Okt): "(6x4)" terbukti di B02, bukan media 2-up "(6x4) x 2".
            : available.Where(p => IsFourBySix(p) && !IsTwoUp(p)).OrderBy(p => p.Width >= p.Height ? 0 : 1).FirstOrDefault();
        if (bySize is not null) return bySize;

        const string why = "tidak ada kertas 4x6 di driver";
        var named = string.IsNullOrEmpty(configured) ? "" : $"; '{configured}' tidak ada di driver";
        throw new PrintFailure(PrintErrors.PaperNotSupported, $"{why}{named}");
    }

    /// <summary>Media 2-up DNP ("(6x4) x 2", "PR (4x6) x 2"): lembar 6×8 dipotong dua, bukan strip 2 inci.</summary>
    public static bool IsTwoUp(PaperOption p) => p.Name.TrimEnd().EndsWith(" x 2", StringComparison.OrdinalIgnoreCase);

    public static bool IsFourBySix(PaperOption p)
    {
        var (s, l) = Sorted(p.Width, p.Height);
        static bool Near(int v, int target) => v >= target - SizeTolerance && v <= target + OverscanTolerance;
        return Near(s, FourBySixShort) && Near(l, FourBySixLong);
    }

    /// <summary>
    /// Kotak gambar yang menutup seluruh halaman (skala <i>cover</i>, rasio tetap, di tengah) untuk cetak borderless:
    /// halaman DNP lebih besar dari 4×6 karena overscan, jadi gambar tepat 4×6 di pojok meninggalkan tepi putih (W-021).
    /// </summary>
    public static (double X, double Y, double W, double H) CoverRect(double pageW, double pageH, double imgW, double imgH)
    {
        var k = Math.Max(pageW / imgW, pageH / imgH);
        var (w, h) = (imgW * k, imgH * k);
        return ((pageW - w) / 2, (pageH - h) / 2, w, h);
    }

    /// <summary>
    /// Kotak gambar tepat 4×6 in tanpa skala di halaman kertas kelas 4×6 (M-021, DECISIONS #53), supaya margin desain
    /// (mm) terjaga setelah DNP memotong overscan. <paramref name="offset"/> = pojok kiri-atas area 4×6 fisik di
    /// koordinat halaman (1/100 in, dari kalibrasi `--print-offset`); tanpa offset = tengah halaman.
    /// </summary>
    public static (double X, double Y, double W, double H) ExactRect(
        double pageW, double pageH, double imgW, double imgH, (double X, double Y)? offset = null)
    {
        var (x, y) = offset ?? ((pageW - imgW) / 2, (pageH - imgH) / 2);
        return (x, y, imgW, imgH);
    }

    /// <summary>Nilai `--print-offset "x,y"` (1/100 in, titik desimal). Tidak valid → <c>null</c>.</summary>
    public static (double X, double Y)? ParseOffset(string? value)
    {
        var parts = value?.Split(',', StringSplitOptions.TrimEntries);
        if (parts is not { Length: 2 }) return null;
        var inv = System.Globalization.CultureInfo.InvariantCulture;
        const System.Globalization.NumberStyles s = System.Globalization.NumberStyles.Float;
        return double.TryParse(parts[0], s, inv, out var x) && double.TryParse(parts[1], s, inv, out var y) ? (x, y) : null;
    }

    /// <summary>
    /// PrintableArea dari driver harus menutup kertas terpilih, tapi tidak jauh lebih besar
    /// (driver yang mengabaikan pilihan kertas melaporkan area kertas lain, mis. Letter). Orientasi diabaikan.
    /// </summary>
    /// <summary>Mode ber-margin: area cetak cukup untuk 4×6 in utuh (orientasi mana pun), tanpa perlu menutup kertas.</summary>
    public static bool PrintableAreaFitsFourBySix(double areaWidth, double areaHeight)
    {
        var (a, b) = (Math.Min(areaWidth, areaHeight), Math.Max(areaWidth, areaHeight));
        return a >= FourBySixShort && b >= FourBySixLong;
    }

    public static bool PrintableAreaMatches(PaperOption paper, double areaWidth, double areaHeight)
    {
        var (ps, pl) = Sorted(paper.Width, paper.Height);
        var (a, b) = (Math.Min(areaWidth, areaHeight), Math.Max(areaWidth, areaHeight));
        return a >= ps - PrintableUnderTolerance && b >= pl - PrintableUnderTolerance
            && a <= ps + PrintableOverTolerance && b <= pl + PrintableOverTolerance;
    }

    private static (int Short, int Long) Sorted(int w, int h) => (Math.Min(w, h), Math.Max(w, h));
}
