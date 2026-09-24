using TetraCamera.Print;

namespace TetraCamera.Tests;

/// <summary>M-020: pemotong DNP per job lewat PrintTicket. Bagian XML murni (tanpa driver/P/Invoke), jalan di semua OS.</summary>
public class CutterTicketTests
{
    // Potongan tiket asli driver DS-RX1 1.2.3.0 di laptop booth (W-022), dipendekkan.
    private const string Dnp = """
        <?xml version="1.0"?>
        <psf:PrintTicket xmlns:psf="http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework" version="1"
            xmlns:ns0000="http://schemas.microsoft.com/windows/printing/oemdriverpt/DS_RX1/10.0.22621.3810/"
            xmlns:psk="http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords">
          <psf:Feature name="psk:PageMediaSize"><psf:Option name="ns0000:PC" /></psf:Feature>
          <psf:Feature name="ns0000:DocumentOVERCOATTYPE"><psf:Option name="ns0000:OPTYPE_LUSTER" /></psf:Feature>
          <psf:Feature name="ns0000:DocumentCUTTERCONTROL"><psf:Option name="ns0000:CUT_STANDARD" /></psf:Feature>
        </psf:PrintTicket>
        """;

    [Theory]
    [InlineData("2x6x2", "CUT_2INCH")]
    [InlineData("4R", "CUT_STANDARD")]
    public void Preset_menentukan_opsi(string preset, string option) =>
        Assert.Equal(option, CutterTicket.OptionFor(preset));

    [Fact]
    public void Opsi_diganti_dengan_prefix_dari_tiket()
    {
        Assert.Equal("CUT_STANDARD", CutterTicket.Read(Dnp));
        var two = CutterTicket.WithCutter(Dnp, CutterTicket.TwoInch)!;
        Assert.Equal("CUT_2INCH", CutterTicket.Read(two));
        Assert.Contains("name=\"ns0000:CUT_2INCH\"", two);
        // Fitur lain tidak berubah.
        Assert.Contains("name=\"ns0000:OPTYPE_LUSTER\"", two);
        Assert.Contains("name=\"ns0000:PC\"", two);
        Assert.Equal("CUT_STANDARD", CutterTicket.Read(CutterTicket.WithCutter(two, CutterTicket.Standard)!));
    }

    [Fact]
    public void Prefix_lain_tetap_dipakai()
    {
        // Driver/versi Windows lain bisa memberi prefix berbeda (mis. ns0001).
        var other = Dnp.Replace("ns0000", "ns0001").Replace("10.0.22621.3810", "10.0.26100.1");
        var two = CutterTicket.WithCutter(other, CutterTicket.TwoInch)!;
        Assert.Contains("name=\"ns0001:CUT_2INCH\"", two);
        Assert.DoesNotContain("ns0000", two);
    }

    [Fact]
    public void Driver_tanpa_pemotong_dilewati()
    {
        const string pdf = """
            <psf:PrintTicket xmlns:psf="http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework" version="1"
                xmlns:psk="http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords">
              <psf:Feature name="psk:PageMediaSize"><psf:Option name="psk:ISOA5" /></psf:Feature>
            </psf:PrintTicket>
            """;
        Assert.Null(CutterTicket.WithCutter(pdf, CutterTicket.TwoInch));
        Assert.Null(CutterTicket.Read(pdf));
    }

    [Fact]
    public void Fitur_tanpa_elemen_opsi_diberi_opsi()
    {
        var bare = Dnp.Replace("<psf:Option name=\"ns0000:CUT_STANDARD\" />", "");
        Assert.Equal("CUT_2INCH", CutterTicket.Read(CutterTicket.WithCutter(bare, CutterTicket.TwoInch)!));
    }
}
