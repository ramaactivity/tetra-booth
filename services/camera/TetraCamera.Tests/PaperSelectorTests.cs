using TetraCamera.Print;

namespace TetraCamera.Tests;

/// <summary>Kriteria uji M4 poin 1 (PLAN-FASE-1): pemilihan kertas, jalan di semua OS.</summary>
public class PaperSelectorTests
{
    // Daftar persis "Microsoft Print to PDF" dari W-003 (tanpa 4x6).
    private static readonly PaperOption[] PrintToPdf =
    [
        new("Letter", 850, 1100), new("Tabloid", 1100, 1700), new("Legal", 850, 1400),
        new("Statement", 550, 850), new("Executive", 725, 1050), new("A3", 1169, 1654),
        new("A4", 827, 1169), new("A5", 583, 827), new("B4 (JIS)", 1012, 1433), new("B5 (JIS)", 717, 1012),
    ];

    private static readonly PaperConfig NoConfig = new();

    private static string FailCode(Action act) => Assert.Throws<PrintFailure>(act).Code;

    [Fact]
    public void Nama_dari_config_menang_walau_ada_ukuran_4x6()
    {
        PaperOption[] driver = [new("PC 4x6", 400, 600), new("Custom Tetra", 583, 827)];
        var p = PaperSelector.Select(driver, "4R", new PaperConfig(Paper4R: "Custom Tetra"));
        Assert.Equal("Custom Tetra", p.Name);
    }

    [Theory]
    [InlineData(400, 600)]
    [InlineData(600, 400)]
    [InlineData(402, 598)]
    [InlineData(598, 402)]
    public void _4R_cocok_ukuran_4x6_di_kedua_orientasi_dengan_toleransi(int w, int h)
    {
        PaperOption[] driver = [new("Letter", 850, 1100), new("(4x6)", w, h)];
        Assert.Equal("(4x6)", PaperSelector.Select(driver, "4R", NoConfig).Name);
    }

    [Theory]
    [InlineData(397, 600)]   // kurang > 2
    [InlineData(400, 618)]   // lebih > 17 (overscan DNP maks +15)
    [InlineData(500, 700)]
    public void _4R_tidak_cocok_di_luar_toleransi(int w, int h)
    {
        PaperOption[] driver = [new("Hampir", w, h)];
        Assert.Equal(PrintErrors.PaperNotSupported, FailCode(() => PaperSelector.Select(driver, "4R", NoConfig)));
    }

    [Fact]
    public void Tanpa_4x6_dan_tanpa_config_gagal_paper_not_supported_bukan_letter()
    {
        Assert.Equal(PrintErrors.PaperNotSupported, FailCode(() => PaperSelector.Select(PrintToPdf, "4R", NoConfig)));
    }

    [Fact]
    public void _2x6x2_tanpa_config_gagal_walau_ada_4x6()
    {
        PaperOption[] driver = [new("(4x6)", 400, 600)];
        Assert.Equal(PrintErrors.PaperNotSupported, FailCode(() => PaperSelector.Select(driver, "2x6x2", NoConfig)));
    }

    [Fact]
    public void _2x6x2_hanya_lewat_nama_config()
    {
        PaperOption[] driver = [new("(4x6)", 400, 600), new("(4x6) x 2", 400, 600)];
        var p = PaperSelector.Select(driver, "2x6x2", new PaperConfig(Paper2x6x2: "(4x6) x 2"));
        Assert.Equal("(4x6) x 2", p.Name);
    }

    [Fact]
    public void Nama_config_harus_persis_termasuk_huruf_besar_kecil()
    {
        Assert.Equal(PrintErrors.PaperNotSupported,
            FailCode(() => PaperSelector.Select(PrintToPdf, "4R", new PaperConfig(Paper4R: "a5"))));
    }

    [Fact]
    public void Nama_config_tidak_ada_4R_tetap_boleh_cocok_ukuran()
    {
        PaperOption[] driver = [new("(4x6)", 400, 600)];
        Assert.Equal("(4x6)", PaperSelector.Select(driver, "4R", new PaperConfig(Paper4R: "Salah")).Name);
    }

    [Fact]
    public void Preset_tidak_dikenal_gagal_bad_paper()
    {
        Assert.Equal(PrintErrors.BadPaper, FailCode(() => PaperSelector.Select(PrintToPdf, "A4", NoConfig)));
    }

    [Theory]
    [InlineData(400, 600, true)]        // pas
    [InlineData(600, 400, true)]        // orientasi lain
    [InlineData(398.5, 598.5, true)]    // sedikit margin driver
    [InlineData(412, 618, true)]        // overscan borderless
    [InlineData(390, 590, false)]       // margin besar: bukan borderless
    [InlineData(850, 1100, false)]      // driver diam-diam pakai Letter (W-006)
    public void PrintableArea_harus_sesuai_kertas_terpilih(double w, double h, bool ok)
    {
        Assert.Equal(ok, PaperSelector.PrintableAreaMatches(new PaperOption("(4x6)", 400, 600), w, h));
    }

    [Theory]
    [InlineData(803.3, 1145.8, true)]   // Epson L121 A4 (W-018)
    [InlineData(1145.8, 803.3, true)]   // orientasi melebar
    [InlineData(400, 600, true)]
    [InlineData(399, 600, false)]
    [InlineData(583, 590, false)]       // A5 pendek < 600
    public void Mode_ber_margin_cukup_memuat_4x6(double w, double h, bool ok) =>
        Assert.Equal(ok, PaperSelector.PrintableAreaFitsFourBySix(w, h));

    [Theory]
    [InlineData(413, 615, true)]   // DNP DS-RX1 "PR (4x6)" (W-021)
    [InlineData(615, 413, true)]   // DNP "(6x4)"
    [InlineData(400, 600, true)]
    [InlineData(398, 598, true)]
    [InlineData(420, 620, false)]  // terlalu besar
    [InlineData(363, 516, false)]  // 3.5x5
    public void Ukuran_4x6_dengan_overscan_dikenali(int w, int h, bool ok) =>
        Assert.Equal(ok, PaperSelector.IsFourBySix(new PaperOption("x", w, h)));

    [Fact]
    public void Cover_menutup_seluruh_halaman_DNP_tanpa_tepi_putih()
    {
        // Halaman (6x4) DNP 614,67×413,33, gambar 4×6 melebar 600×400.
        var (x, y, w, h) = PaperSelector.CoverRect(614.67, 413.33, 600, 400);
        Assert.True(x <= 0 && y <= 0);
        Assert.True(x + w >= 614.67 - 0.01 && y + h >= 413.33 - 0.01);
        Assert.Equal(1.5, w / h, 3);                 // rasio tetap
        Assert.Equal(-x, x + w - 614.67, 3);         // di tengah
        Assert.True(w / 600 < 1.04);                  // pembesaran kecil (≈3,3%)
    }

    [Fact]
    public void Tepat_4x6_default_di_tengah_halaman_DNP()
    {
        var (x, y, w, h) = PaperSelector.ExactRect(614.67, 413.33, 600, 400);
        Assert.Equal((600.0, 400.0), (w, h));          // tanpa skala: margin desain (mm) terjaga
        Assert.Equal(7.335, x, 3);
        Assert.Equal(6.665, y, 3);
    }

    [Fact]
    public void Tepat_4x6_memakai_offset_kalibrasi()
    {
        var (x, y, w, h) = PaperSelector.ExactRect(614.67, 413.33, 600, 400, (5.5, 8.25));
        Assert.Equal((5.5, 8.25, 600.0, 400.0), (x, y, w, h));
    }

    [Theory]
    [InlineData("7.3,6.7", 7.3, 6.7)]
    [InlineData(" 5 , -1.5 ", 5, -1.5)]
    [InlineData("0,0", 0, 0)]
    [InlineData("7,3", 7, 3)] // koma selalu pemisah x,y; desimal pakai titik
    public void Offset_dari_flag(string value, double x, double y) =>
        Assert.Equal((x, y), PaperSelector.ParseOffset(value));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("7;3")]
    [InlineData("a,b")]
    [InlineData("1,2,3")]
    public void Offset_tidak_valid(string? value) => Assert.Null(PaperSelector.ParseOffset(value));
}
