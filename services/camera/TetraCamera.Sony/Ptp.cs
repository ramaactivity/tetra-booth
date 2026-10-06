using System.Buffers.Binary;
using System.Text;

namespace TetraCamera.Sony;

/// <summary>
/// Jalur PTP ke kamera: satu operasi = fase operasi (opcode + ≤5 parameter) → fase data opsional → fase respons.
/// Semua method dipanggil dari satu thread (thread kamera <see cref="SonyCamera"/>).
/// Implementasi: <see cref="WpdTransport"/> (Windows, driver MTP bawaan) dan <see cref="FakeSonyTransport"/> (Mac/CI/uji).
/// Kamera hilang (kabel dicabut) = <see cref="IOException"/> dan <see cref="IsOpen"/> jadi false.
/// </summary>
public interface IPtpTransport : IDisposable
{
    /// <summary>Buka kamera Sony pertama; false = tidak ada. Session PTP dibuka transport (WPD membukanya sendiri).</summary>
    bool Open();
    bool IsOpen { get; }
    void Close();
    /// <param name="read">true = operasi punya fase data kamera → PC.</param>
    /// <param name="write">Data PC → kamera (null = tanpa fase data tulis).</param>
    PtpResponse Execute(ushort op, uint[] args, bool read = false, byte[]? write = null);
}

/// <summary>Fase respons (+ data yang dibaca, kosong kalau tidak ada).</summary>
public readonly record struct PtpResponse(ushort Code, uint[] Params, byte[] Data)
{
    public bool Ok => Code == Ptp.Ok;
}

/// <summary>Respons PTP selain OK (kamera menjawab, tapi menolak).</summary>
public sealed class PtpError(ushort op, ushort code)
    : Exception($"PTP 0x{op:X4} dijawab 0x{code:X4}")
{
    public ushort Op { get; } = op;
    public ushort Code { get; } = code;
}

/// <summary>Opcode & kode respons PTP standar + vendor Sony (identifier saja, docs/PLAN-SONY.md §3).</summary>
public static class Ptp
{
    public const ushort GetDeviceInfo = 0x1001, GetObjectInfo = 0x1008, GetObject = 0x1009;
    public const ushort SdioConnect = 0x9201, SdioGetExtDeviceInfo = 0x9202, SdioSetExtDevicePropValue = 0x9205,
        SdioControlDevice = 0x9207, SdioGetAllExtDevicePropInfo = 0x9209;
    public const ushort Ok = 0x2001, OperationNotSupported = 0x2005, ParameterNotSupported = 0x2006,
        InvalidObjectHandle = 0x2009, AccessDenied = 0x200F, DeviceBusy = 0x2019;
    public const ushort AuthenticationFailed = 0xA101, TemporaryStorageFull = 0xA105, CameraStatusError = 0xA106;
    /// <summary>ObjectFormat di ObjectInfo: JPEG (Exif / JFIF); RAW 0xB101 & HEIF 0xB110 dibuang.</summary>
    public const ushort FormatJpeg = 0x3801, FormatJfif = 0x3808, FormatRaw = 0xB101;
    /// <summary>Handle khusus: file jepretan di buffer kamera / frame live view.</summary>
    public const uint ShotHandle = 0xFFFFC001, LiveViewHandle = 0xFFFFC002;
    /// <summary>Opcode vendor yang wajib diteruskan driver (W-037).</summary>
    public static readonly ushort[] RequiredVendorOps =
        [SdioConnect, SdioGetExtDeviceInfo, SdioSetExtDevicePropValue, SdioControlDevice, SdioGetAllExtDevicePropInfo];

    /// <summary>Jalankan; respons selain OK = <see cref="PtpError"/>.</summary>
    public static PtpResponse Call(this IPtpTransport t, ushort op, uint[] args, bool read = false, byte[]? write = null)
    {
        var r = t.Execute(op, args, read, write);
        return r.Ok ? r : throw new PtpError(op, r.Code);
    }
}

/// <summary>Pembaca dataset PTP (little-endian). Data terpotong = <see cref="FormatException"/>.</summary>
public ref struct PtpReader(ReadOnlySpan<byte> data)
{
    private readonly ReadOnlySpan<byte> _d = data;
    public int Pos { get; private set; }
    public readonly int Left => _d.Length - Pos;

    private ReadOnlySpan<byte> Take(int n)
    {
        if (n < 0 || n > Left) throw new FormatException($"dataset PTP terpotong di byte {Pos}");
        var s = _d.Slice(Pos, n);
        Pos += n;
        return s;
    }

    public byte U8() => Take(1)[0];
    public ushort U16() => BinaryPrimitives.ReadUInt16LittleEndian(Take(2));
    public uint U32() => BinaryPrimitives.ReadUInt32LittleEndian(Take(4));
    public ulong U64() => BinaryPrimitives.ReadUInt64LittleEndian(Take(8));
    public void Skip(int n) => Take(n);

    /// <summary>String PTP: jumlah karakter UTF-16 (u8, termasuk NUL) lalu karakternya.</summary>
    public string Str()
    {
        var n = U8();
        return Encoding.Unicode.GetString(Take(n * 2)).TrimEnd('\0');
    }

    public ushort[] U16Array()
    {
        var n = U32();
        if (n > Left / 2) throw new FormatException($"array PTP {n} elemen melebihi data");
        var a = new ushort[n];
        for (var i = 0; i < n; i++) a[i] = U16();
        return a;
    }

    /// <summary>Satu nilai integer bertipe PTP (0x0001–0x000A); 128-bit = 64 bit bawah.</summary>
    public long Value(ushort type) => type switch
    {
        0x0001 => (sbyte)U8(),
        0x0002 => U8(),
        0x0003 => (short)U16(),
        0x0004 => U16(),
        0x0005 => (int)U32(),
        0x0006 => U32(),
        0x0007 or 0x0008 => (long)U64(),
        0x0009 or 0x000A => Low64(),
        _ => throw new FormatException($"tipe data PTP 0x{type:X4} tidak dikenal"),
    };

    private long Low64()
    {
        var v = (long)U64();
        Skip(8);
        return v;
    }

    public static int Size(ushort type) => type switch
    {
        0x0001 or 0x0002 => 1,
        0x0003 or 0x0004 => 2,
        0x0005 or 0x0006 => 4,
        0x0007 or 0x0008 => 8,
        0x0009 or 0x000A => 16,
        _ => throw new FormatException($"tipe data PTP 0x{type:X4} tidak dikenal"),
    };
}

/// <summary>Penulis dataset PTP (dipakai kamera palsu & uji; S4 untuk nilai SetExtDevicePropValue).</summary>
public sealed class PtpWriter
{
    private readonly MemoryStream _s = new();
    public byte[] ToArray() => _s.ToArray();

    public PtpWriter U8(byte v) { _s.WriteByte(v); return this; }
    public PtpWriter U16(ushort v) { Span<byte> b = stackalloc byte[2]; BinaryPrimitives.WriteUInt16LittleEndian(b, v); _s.Write(b); return this; }
    public PtpWriter U32(uint v) { Span<byte> b = stackalloc byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(b, v); _s.Write(b); return this; }
    public PtpWriter U64(ulong v) { Span<byte> b = stackalloc byte[8]; BinaryPrimitives.WriteUInt64LittleEndian(b, v); _s.Write(b); return this; }

    public PtpWriter Raw(byte[] v) { _s.Write(v); return this; }

    public PtpWriter Str(string v)
    {
        if (v.Length == 0) return U8(0);
        U8((byte)(v.Length + 1));
        _s.Write(Encoding.Unicode.GetBytes(v + "\0"));
        return this;
    }

    public PtpWriter U16Array(params ushort[] a)
    {
        U32((uint)a.Length);
        foreach (var v in a) U16(v);
        return this;
    }

    public PtpWriter Value(ushort type, long v)
    {
        switch (PtpReader.Size(type))
        {
            case 1: U8((byte)v); break;
            case 2: U16((ushort)v); break;
            case 4: U32((uint)v); break;
            case 8: U64((ulong)v); break;
            default: U64((ulong)v); U64(0); break;
        }
        return this;
    }
}

/// <summary>GetDeviceInfo (0x1001), field yang dipakai saja.</summary>
public sealed record PtpDeviceInfo(
    string Manufacturer, string Model, string Version, string Serial, ushort[] Operations, ushort[] Properties)
{
    public static PtpDeviceInfo Parse(ReadOnlySpan<byte> data)
    {
        var r = new PtpReader(data);
        r.U16(); // StandardVersion
        r.U32(); // VendorExtensionID
        r.U16(); // VendorExtensionVersion
        r.Str(); // VendorExtensionDesc
        r.U16(); // FunctionalMode
        var ops = r.U16Array();
        r.U16Array(); // EventsSupported
        var props = r.U16Array();
        r.U16Array(); // CaptureFormats
        r.U16Array(); // ImageFormats
        return new(r.Str(), r.Str(), r.Str(), r.Str(), ops, props);
    }
}

/// <summary>ObjectInfo (GetObjectInfo 0x1008, PIMA 15740), field yang dipakai saja.</summary>
public sealed record PtpObjectInfo(ushort Format, uint Size, string FileName)
{
    public bool IsJpeg => Format is Ptp.FormatJpeg or Ptp.FormatJfif;

    public static PtpObjectInfo Parse(ReadOnlySpan<byte> data)
    {
        var r = new PtpReader(data);
        r.U32(); // StorageID
        var format = r.U16();
        r.U16(); // ProtectionStatus
        var size = r.U32();
        r.U16(); // ThumbFormat
        r.Skip(7 * 4); // ThumbCompressedSize … ParentObject
        r.U16(); // AssociationType
        r.Skip(2 * 4); // AssociationDesc, SequenceNumber
        return new(format, size, r.Str());
    }

    public byte[] ToBytes() => new PtpWriter()
        .U32(0x00010001).U16(Format).U16(0).U32(Size).U16(0)
        .U32(0).U32(0).U32(0).U32(0).U32(0).U32(0).U32(0).U16(0).U32(0).U32(0)
        .Str(FileName).Str("").Str("").Str("").ToArray();
}

/// <summary>Dataset SDIO_GetExtDeviceInfo (0x9202): versi protokol + properti & kontrol yang benar-benar ada di bodi.</summary>
public sealed record SonyExtDeviceInfo(ushort Version, ushort[] Properties, ushort[] Controls)
{
    public static SonyExtDeviceInfo Parse(ReadOnlySpan<byte> data)
    {
        var r = new PtpReader(data);
        return new(r.U16(), r.U16Array(), r.U16Array());
    }
}

/// <summary>
/// Satu properti dari SDIO_GetAllExtDevicePropInfo (0x9209). Integer di <see cref="Current"/>, string di
/// <see cref="Text"/> (array tidak disimpan, belum dipakai). Enum: <see cref="SetValues"/> = nilai yang boleh dikirim,
/// <see cref="GetSetValues"/> = nilai yang bisa terbaca (dataset satu daftar: keduanya sama).
/// </summary>
public sealed record SonyProp(
    ushort Code, ushort DataType, bool Settable, byte Enabled, long Current, string? Text,
    (long Min, long Max, long Step)? Range, long[] SetValues, long[] GetSetValues)
{
    /// <summary>
    /// Dataset array. Dokumen PTP 2/3 menyebut dua daftar enum (Set, Get/Set), tapi contoh PTP 2 Sony membaca satu.
    /// Dicoba dua daftar dulu; tidak pas tepat sampai byte terakhir = diurai ulang sebagai satu daftar.
    /// <see cref="PropSet.TwoEnumLists"/> dicatat probe W-037 supaya bentuk A7 III ketahuan.
    /// </summary>
    public static PropSet ParseAll(ReadOnlySpan<byte> data)
    {
        try { return new(ParseAll(data, true), true); }
        catch (FormatException) { return new(ParseAll(data, false), false); }
    }

    private static Dictionary<ushort, SonyProp> ParseAll(ReadOnlySpan<byte> data, bool twoLists)
    {
        var r = new PtpReader(data);
        var n = r.U64();
        if (n > (ulong)r.Left) throw new FormatException($"jumlah properti {n} melebihi data");
        var all = new Dictionary<ushort, SonyProp>((int)n);
        for (var i = 0ul; i < n; i++)
        {
            var p = Parse(ref r, twoLists);
            all[p.Code] = p;
        }
        if (r.Left != 0) throw new FormatException($"{r.Left} byte sisa setelah {n} properti");
        return all;
    }

    private static SonyProp Parse(ref PtpReader r, bool twoLists)
    {
        var code = r.U16();
        var type = r.U16();
        var settable = r.U8() == 1;
        var enabled = r.U8();
        long cur = 0;
        string? text = null;
        var scalar = type is >= 0x0001 and <= 0x000A;
        if (type == 0xFFFF)
        {
            r.Str();
            text = r.Str();
        }
        else if ((type & 0x4000) != 0)
        {
            var size = PtpReader.Size((ushort)(type & 0xFF));
            for (var k = 0; k < 2; k++) r.Skip(checked((int)r.U32() * size)); // default, current
        }
        else
        {
            r.Value(type);
            cur = r.Value(type);
        }
        var form = r.U8();
        if (form != 0 && !scalar) throw new FormatException($"properti 0x{code:X4}: form 0x{form:X2} untuk tipe 0x{type:X4}");
        (long, long, long)? range = null;
        long[] set = [], getSet = [];
        switch (form)
        {
            case 0: break;
            case 1: range = (r.Value(type), r.Value(type), r.Value(type)); break;
            case 2:
                set = List(ref r, type);
                getSet = twoLists ? List(ref r, type) : set;
                break;
            default: throw new FormatException($"properti 0x{code:X4}: form 0x{form:X2} tidak dikenal");
        }
        return new(code, type, settable, enabled, cur, text, range, set, getSet);
    }

    private static long[] List(ref PtpReader r, ushort type)
    {
        var n = r.U16();
        if (n * PtpReader.Size(type) > r.Left) throw new FormatException($"daftar enum {n} melebihi data");
        var a = new long[n];
        for (var i = 0; i < n; i++) a[i] = r.Value(type);
        return a;
    }
}

public sealed record PropSet(IReadOnlyDictionary<ushort, SonyProp> Props, bool TwoEnumLists);
