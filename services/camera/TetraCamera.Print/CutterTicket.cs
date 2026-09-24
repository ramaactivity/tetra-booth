using System.Xml;

namespace TetraCamera.Print;

/// <summary>
/// Pemotong kertas driver DNP per job (M-020, DECISIONS #52). Driver menyimpan pemotong di DEVMODE,
/// terlihat di PrintTicket sebagai fitur <c>&lt;prefix&gt;:DocumentCUTTERCONTROL</c> dengan opsi
/// <c>CUT_STANDARD</c> / <c>CUT_2INCH</c>. Prefix menunjuk namespace yang memuat versi Windows
/// (mis. <c>…/oemdriverpt/DS_RX1/10.0.22621.3810/</c>), jadi dibaca dari tiket, tidak ditulis mati.
/// Logika XML murni di sini (teruji di CI); konversi DEVMODE ↔ tiket ada di TetraCamera.Print.Windows.
/// </summary>
public static class CutterTicket
{
    public const string FeatureSuffix = ":DocumentCUTTERCONTROL";
    public const string TwoInch = "CUT_2INCH";
    public const string Standard = "CUT_STANDARD";

    private const string Psf = "http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework";

    /// <summary>2x6x2 dipotong dua (2 inci); preset lain lembar utuh.</summary>
    public static string OptionFor(string preset) => preset == Presets.TwoBySixByTwo ? TwoInch : Standard;

    /// <summary>
    /// Tiket dengan opsi pemotong diganti <paramref name="option"/>, atau <c>null</c> kalau driver tidak punya
    /// fitur pemotong (Print to PDF, inkjet): job dicetak dengan DEVMODE apa adanya.
    /// </summary>
    public static string? WithCutter(string ticketXml, string option)
    {
        var doc = new XmlDocument();
        doc.LoadXml(ticketXml);
        var found = false;
        foreach (XmlElement feature in doc.GetElementsByTagName("Feature", Psf))
        {
            var name = feature.GetAttribute("name");
            if (!name.EndsWith(FeatureSuffix, StringComparison.Ordinal) || name.IndexOf(':') <= 0) continue;
            var prefix = name[..name.IndexOf(':')];
            var opt = feature.GetElementsByTagName("Option", Psf).OfType<XmlElement>().FirstOrDefault();
            if (opt is null)
            {
                opt = doc.CreateElement(feature.Prefix, "Option", Psf);
                feature.AppendChild(opt);
            }
            opt.SetAttribute("name", $"{prefix}:{option}");
            found = true;
        }
        return found ? doc.OuterXml : null;
    }

    /// <summary>Opsi pemotong di tiket tanpa prefix (mis. <c>CUT_2INCH</c>), atau <c>null</c> kalau tidak ada.</summary>
    public static string? Read(string ticketXml)
    {
        var doc = new XmlDocument();
        doc.LoadXml(ticketXml);
        foreach (XmlElement feature in doc.GetElementsByTagName("Feature", Psf))
        {
            if (!feature.GetAttribute("name").EndsWith(FeatureSuffix, StringComparison.Ordinal)) continue;
            var opt = feature.GetElementsByTagName("Option", Psf).OfType<XmlElement>().FirstOrDefault()?.GetAttribute("name");
            return opt is null ? null : opt[(opt.IndexOf(':') + 1)..];
        }
        return null;
    }
}
