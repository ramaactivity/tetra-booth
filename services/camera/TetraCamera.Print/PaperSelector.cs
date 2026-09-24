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

    /// <summary>Toleransi pencocokan ukuran driver (1/100 inci).</summary>
    public const int SizeTolerance = 2;

    /// <summary>PrintableArea boleh kurang dari kertas sebesar ini (1/100 inci).</summary>
    public const int PrintableUnderTolerance = 2;

    /// <summary>PrintableArea boleh melebihi kertas sebesar ini (overscan borderless, 1/100 inci).</summary>
    public const int PrintableOverTolerance = 25;

    /// <summary>
    /// Urutan: nama persis dari config → khusus 4R: ukuran 4×6 di orientasi mana pun (±2) → gagal <c>paper_not_supported</c>.
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

        if (preset == Presets.FourR)
        {
            var bySize = available.FirstOrDefault(IsFourBySix);
            if (bySize is not null) return bySize;
        }

        var why = preset == Presets.TwoBySixByTwo
            ? "2x6x2 butuh nama kertas dari config (--paper-2x6x2)"
            : "tidak ada kertas 4x6 di driver";
        var named = string.IsNullOrEmpty(configured) ? "" : $"; '{configured}' tidak ada di driver";
        throw new PrintFailure(PrintErrors.PaperNotSupported, $"{why}{named}");
    }

    public static bool IsFourBySix(PaperOption p)
    {
        var (s, l) = Sorted(p.Width, p.Height);
        return Math.Abs(s - FourBySixShort) <= SizeTolerance && Math.Abs(l - FourBySixLong) <= SizeTolerance;
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
