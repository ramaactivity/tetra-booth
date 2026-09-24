using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace TetraCamera.Tests;

/// <summary>
/// Pembaca PDF minimal untuk uji geometri print: MediaBox, jumlah halaman, dan kotak tempat gambar
/// mendarat (unit square tiap `Do` dikali CTM hasil `q`/`Q`/`cm`). Cukup untuk output "Microsoft Print to PDF".
/// </summary>
public sealed partial class PdfInspector
{
    public sealed record Box(double MinX, double MinY, double MaxX, double MaxY)
    {
        public double Width => MaxX - MinX;
        public double Height => MaxY - MinY;
    }

    public required IReadOnlyList<Box> MediaBoxes { get; init; }
    public required int PageCount { get; init; }

    /// <summary>Gabungan kotak gambar per content stream yang menggambar (satu per halaman di Print to PDF).</summary>
    public required IReadOnlyList<Box> ImageBoxes { get; init; }

    public static PdfInspector Read(string path)
    {
        var bytes = File.ReadAllBytes(path);
        var text = Encoding.Latin1.GetString(bytes);

        var media = MediaBoxRegex().Matches(text).Select(m =>
        {
            var n = m.Groups[1].Value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Num).ToArray();
            return new Box(n[0], n[1], n[2], n[3]);
        }).ToList();

        var pages = PageRegex().Count(text);

        var boxes = new List<Box>();
        foreach (Match m in StreamRegex().Matches(text))
        {
            var start = m.Index + m.Length;
            var end = text.IndexOf("endstream", start, StringComparison.Ordinal);
            if (end < 0) continue;
            var content = Inflate(bytes.AsSpan(start, end - start).ToArray());
            if (content is null || !content.Contains(" Do", StringComparison.Ordinal)) continue;
            if (ImageBox(content) is { } b) boxes.Add(b);
        }
        return new PdfInspector { MediaBoxes = media, PageCount = pages, ImageBoxes = boxes };
    }

    private static string? Inflate(byte[] data)
    {
        try
        {
            using var z = new ZLibStream(new MemoryStream(data), CompressionMode.Decompress);
            using var r = new StreamReader(z, Encoding.Latin1);
            return r.ReadToEnd();
        }
        catch (InvalidDataException) { return null; }
    }

    /// <summary>Interpreter operator grafis secukupnya: q, Q, cm, Do.</summary>
    private static Box? ImageBox(string content)
    {
        var ctm = Identity;
        var stack = new Stack<double[]>();
        var operands = new List<double>();
        double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;
        var found = false;

        foreach (var tok in content.Split([' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries))
        {
            if (double.TryParse(tok, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) { operands.Add(v); continue; }
            switch (tok)
            {
                case "q": stack.Push(ctm); break;
                case "Q": ctm = stack.Count > 0 ? stack.Pop() : Identity; break;
                case "cm" when operands.Count >= 6:
                    ctm = Multiply(operands.Skip(operands.Count - 6).ToArray(), ctm);
                    break;
                case "Do":
                    foreach (var (x, y) in new[] { (0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0) })
                    {
                        var px = ctm[0] * x + ctm[2] * y + ctm[4];
                        var py = ctm[1] * x + ctm[3] * y + ctm[5];
                        (minX, maxX) = (Math.Min(minX, px), Math.Max(maxX, px));
                        (minY, maxY) = (Math.Min(minY, py), Math.Max(maxY, py));
                    }
                    found = true;
                    break;
            }
            operands.Clear();
        }
        return found ? new Box(minX, minY, maxX, maxY) : null;
    }

    private static readonly double[] Identity = [1, 0, 0, 1, 0, 0];

    /// <summary>PDF: CTM' = M × CTM (matriks [a b c d e f]).</summary>
    private static double[] Multiply(double[] m, double[] t) =>
    [
        m[0] * t[0] + m[1] * t[2], m[0] * t[1] + m[1] * t[3],
        m[2] * t[0] + m[3] * t[2], m[2] * t[1] + m[3] * t[3],
        m[4] * t[0] + m[5] * t[2] + t[4], m[4] * t[1] + m[5] * t[3] + t[5],
    ];

    private static double Num(string s) => double.Parse(s, CultureInfo.InvariantCulture);

    [GeneratedRegex(@"/MediaBox\s*\[([^\]]+)\]")]
    private static partial Regex MediaBoxRegex();

    [GeneratedRegex(@"/Type\s*/Page(?![s\w])")]
    private static partial Regex PageRegex();

    [GeneratedRegex(@"(?<!end)stream\r?\n")]
    private static partial Regex StreamRegex();
}
