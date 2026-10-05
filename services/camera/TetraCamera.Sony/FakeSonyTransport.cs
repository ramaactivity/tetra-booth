namespace TetraCamera.Sony;

/// <summary>
/// Kamera Sony palsu di tingkat PTP (`--sony fake` = A7 III v2, `--sony fake-v3` = A7 IV v3): menjawab GetDeviceInfo,
/// handshake SDIO, dan SDIO_GetAllExtDevicePropInfo dengan dataset biner, supaya parser & alur protokol teruji di Mac.
/// <see cref="Plugged"/> = false mensimulasikan kabel dicabut. Jepret & live view menyusul (S2/S3).
/// </summary>
public sealed class FakeSonyTransport(string model, ushort version, bool twoEnumLists) : IPtpTransport
{
    public static FakeSonyTransport A7III() => new("ILCE-7M3", SonyProfile.V2.Version, false);
    public static FakeSonyTransport A7IV() => new("ILCE-7M4", SonyProfile.V3.Version, true);

    public string Model { get; } = model;
    public volatile bool Plugged = true;
    /// <summary>Tiap operasi tertahan selama ini (ms): meniru panggilan driver yang tidak kembali.</summary>
    public volatile int HangMs;
    /// <summary>Bodi v2 lama: versi initiator di atas versinya dijawab 0xA101 (false = dijawab versinya sendiri).</summary>
    public bool RejectNewer { get; init; }
    /// <summary>Jumlah SDIO_GetExtDeviceInfo pertama yang datanya kosong (kamera belum siap).</summary>
    public int EmptyExtInfo { get; set; }
    /// <summary>Operasi yang diterima: (opcode, parameter 1).</summary>
    public List<(ushort Op, uint P1)> Log { get; } = [];
    public byte BatteryPercent { get; set; } = 80;

    private bool _open;
    private int _phase;

    public bool IsOpen
    {
        get
        {
            if (!Plugged) _open = false;
            return _open;
        }
    }

    public bool Open()
    {
        if (!Plugged) return false;
        _open = true;
        _phase = 0;
        return true;
    }

    public void Close() => _open = false;
    public void Dispose() => Close();

    public PtpResponse Execute(ushort op, uint[] args, bool read = false, byte[]? write = null)
    {
        if (HangMs > 0) Thread.Sleep(HangMs);
        if (!IsOpen) throw new IOException("kamera Sony palsu dicabut");
        var p1 = args.Length > 0 ? args[0] : 0;
        Log.Add((op, p1));
        return op switch
        {
            Ptp.GetDeviceInfo => Ok(DeviceInfo()),
            Ptp.SdioConnect when p1 == 1 || p1 == _phase + 1 => Phase(p1),
            Ptp.SdioGetExtDeviceInfo when _phase >= 2 => ExtInfo(p1),
            Ptp.SdioGetAllExtDevicePropInfo when _phase == 3 => Ok(Props()),
            Ptp.SdioConnect or Ptp.SdioGetExtDeviceInfo or Ptp.SdioGetAllExtDevicePropInfo => Res(Ptp.AuthenticationFailed),
            _ => Res(0x2005), // Operation_Not_Supported
        };
    }

    private static PtpResponse Res(ushort code, byte[]? data = null) => new(code, [], data ?? []);
    private static PtpResponse Ok(byte[] data) => Res(Ptp.Ok, data);

    private PtpResponse Phase(uint p)
    {
        _phase = (int)p;
        return Ok(new byte[8]); // UINT64 0
    }

    private PtpResponse ExtInfo(uint initiator)
    {
        if (RejectNewer && initiator / 100 > version / 100) return Res(Ptp.AuthenticationFailed);
        if (EmptyExtInfo > 0)
        {
            EmptyExtInfo--;
            return Ok([]);
        }
        return Ok(new PtpWriter().U16(version)
            .U16Array(0x5005, 0xD218, 0xD21E, 0xD221)
            .U16Array(0xD2C1, 0xD2C2).ToArray());
    }

    private byte[] DeviceInfo() => new PtpWriter()
        .U16(100).U32(0x00000011).U16(100).Str("Sony PTP Extensions").U16(0)
        .U16Array([0x1001, 0x1002, 0x1003, 0x1008, 0x1009, .. Ptp.RequiredVendorOps])
        .U16Array(0xC201, 0xC203)
        .U16Array(0x5005, 0xD218)
        .U16Array()
        .U16Array(0x3801)
        .Str("Sony Corporation").Str(Model).Str("1.00").Str("fake-sony")
        .ToArray();

    /// <summary>Baterai (INT8 range), ISO (UINT32 enum), WB (UINT16 enum), status live view (UINT8 tanpa form).</summary>
    private byte[] Props()
    {
        var w = new PtpWriter().U64(4);
        w.U16(0xD218).U16(0x0001).U8(0).U8(1).Value(0x0001, -1).Value(0x0001, BatteryPercent).U8(1)
            .Value(0x0001, -1).Value(0x0001, 100).Value(0x0001, 1);
        Enum(w, 0xD21E, 0x0006, 400, [100, 200, 400, 800, 1600]);
        Enum(w, 0x5005, 0x0004, 0x0002, [0x0002, 0x0004, 0x0011]);
        w.U16(0xD221).U16(0x0002).U8(0).U8(1).Value(0x0002, 0).Value(0x0002, 1).U8(0);
        return w.ToArray();
    }

    private void Enum(PtpWriter w, ushort code, ushort type, long current, long[] values)
    {
        w.U16(code).U16(type).U8(1).U8(1).Value(type, current).Value(type, current).U8(2);
        for (var k = 0; k < (twoEnumLists ? 2 : 1); k++)
        {
            w.U16((ushort)values.Length);
            foreach (var v in values) w.Value(type, v);
        }
    }
}
