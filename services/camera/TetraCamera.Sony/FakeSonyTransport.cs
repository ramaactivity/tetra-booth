using static TetraCamera.Sony.SonyProps;

namespace TetraCamera.Sony;

/// <summary>
/// Kamera Sony palsu di tingkat PTP (`--sony fake` = A7 III v2, `--sony fake-v3` = A7 IV v3), meniru perilaku yang
/// dijelaskan dokumen Sony supaya parser & alur protokol teruji di Mac/CI tanpa kamera:
/// handshake; dataset properti (v2 satu daftar enum, setelan eksposur hanya-baca + kontrol langkah; v3 dua daftar,
/// nilai absolut, Position Key, kartu, panas); jepret S1/S2 → file muncul di buffer setelah <see cref="ShotMs"/> dan
/// terbaca lewat polling Shooting File Info (tanpa event); GetObjectInfo/GetObject 0xFFFFC001 (JPEG, + RAW kalau
/// <see cref="RawPlusJpeg"/>); live view 0xFFFFC002 (header offset/ukuran, v3 + Focal Frame Info, 0x200F kalau diminta
/// lebih rapat dari 33 ms); Device_Busy; kabel dicabut (juga di tengah unduhan); kamera tidur lalu bangun.
/// </summary>
public sealed class FakeSonyTransport : IPtpTransport
{
    public static readonly byte[] Shot = Resource("fake-sony.jpg"), LiveFrame = Resource("fake-sony-lv.jpg");
    private static byte[] Resource(string name)
    {
        using var s = typeof(FakeSonyTransport).Assembly.GetManifestResourceStream($"TetraCamera.Sony.{name}")!;
        using var m = new MemoryStream();
        s.CopyTo(m);
        return m.ToArray();
    }

    public static FakeSonyTransport A7III() => new("ILCE-7M3", SonyProfile.V2.Version, false);
    public static FakeSonyTransport A7IV() => new("ILCE-7M4", SonyProfile.V3.Version, true);

    private readonly ushort _version;
    private readonly bool _v3, _twoLists;

    public FakeSonyTransport(string model, ushort version, bool twoEnumLists)
    {
        Model = model;
        _version = version;
        _v3 = version >= SonyProfile.V3.Version;
        _twoLists = twoEnumLists;
        _props = Defaults(_v3);
    }

    public string Model { get; }
    private volatile bool _plugged = true;
    /// <summary>false = kabel dicabut. Juga false selama file <see cref="UnplugFile"/> ada (e2e booth).</summary>
    public bool Plugged
    {
        get => _plugged && !(UnplugFile is { } f && File.Exists(f));
        set => _plugged = value;
    }
    /// <summary>Kalau file ini ada, kamera dianggap dicabut (env `TETRA_SONY_FAKE_UNPLUG` di Host, untuk e2e).</summary>
    public string? UnplugFile { get; init; }
    /// <summary>Tiap operasi tertahan selama ini (ms): meniru panggilan driver yang tidak kembali.</summary>
    public volatile int HangMs;
    /// <summary>Bodi v2 lama: versi initiator di atas versinya dijawab 0xA101 (false = dijawab versinya sendiri).</summary>
    public bool RejectNewer { get; init; }
    /// <summary>Jumlah SDIO_GetExtDeviceInfo pertama yang datanya kosong (kamera belum siap).</summary>
    public int EmptyExtInfo { get; set; }
    /// <summary>Operasi yang diterima: (opcode, parameter 1).</summary>
    public List<(ushort Op, uint P1)> Log { get; } = [];
    /// <summary>Kontrol yang diterima: (kode, nilai).</summary>
    public List<(ushort Code, long Value)> Controls { get; } = [];
    public byte BatteryPercent { get => (byte)_props[Battery].Current; set => _props[Battery].Current = value; }

    /// <summary>Jeda S2 → file siap di buffer (ms). A7 III nyata ±0,5–1 s.</summary>
    public int ShotMs { get; set; } = 300;
    /// <summary>Jeda S1 → fokus terkunci (ms).</summary>
    public int AfMs { get; set; } = 80;
    /// <summary>Fokus gagal (kontras rendah): Focus Indication 0x03.</summary>
    public bool AfFails { get; set; }
    public bool RawPlusJpeg { get; set; }
    /// <summary>Rana ditekan tapi tidak ada file (lensa lepas / mode salah).</summary>
    public bool NoFile { get; set; }
    /// <summary>Operasi berikutnya sebanyak ini dijawab Device_Busy (0x2019).</summary>
    public int BusyCount { get; set; }
    /// <summary>Kabel dicabut di tengah GetObject foto.</summary>
    public bool PullDuringTransfer { get; set; }
    /// <summary>File di buffer sebelum jepret (mis. crew menekan rana di kamera).</summary>
    public void AddStrayFile() => _pending.Enqueue((Ptp.FormatJpeg, Shot));
    public int Shots { get; private set; }

    private bool _open;
    private int _phase;
    private readonly Dictionary<ushort, FakeProp> _props;
    private readonly Queue<(ushort Format, byte[] Data)> _pending = new();
    private long _s1At = -1, _shotAt = -1, _lastFrame;
    private bool _s1;
    private int _fileNo = 1;

    /// <summary>Kamera tidur (power save): hilang dari USB seperti dicabut.</summary>
    public void Sleep() => Plugged = false;
    /// <summary>Bangun: muncul lagi, beberapa SDIO_GetExtDeviceInfo pertama kosong (kamera belum siap).</summary>
    public void Wake()
    {
        EmptyExtInfo = 2;
        Plugged = true;
    }

    /// <summary>Ubah status (uji): kartu, sisa foto, panas, simpan ke, dll.</summary>
    public void SetStatus(ushort code, long value) => _props[code].Current = value;
    public long Get(ushort code) => _props[code].Current;

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
        if (_v3) _props[PositionKey].Current = 0; // kembali ke prioritas kamera tiap sesi baru
        return true;
    }

    public void Close() => _open = false;
    public void Dispose() => Close();

    public PtpResponse Execute(ushort op, uint[] args, bool read = false, byte[]? write = null)
    {
        if (HangMs > 0) Thread.Sleep(HangMs);
        if (!IsOpen) throw new IOException("kamera Sony palsu dicabut");
        var p1 = args.Length > 0 ? args[0] : 0;
        lock (Log) Log.Add((op, p1));
        if (BusyCount > 0 && _phase == 3)
        {
            BusyCount--;
            return Res(Ptp.DeviceBusy);
        }
        Tick();
        return op switch
        {
            Ptp.GetDeviceInfo => Ok(DeviceInfo()),
            Ptp.SdioConnect when p1 == 1 || p1 == _phase + 1 => Phase(p1),
            Ptp.SdioGetExtDeviceInfo when _phase >= 2 => ExtInfo(p1),
            Ptp.SdioGetAllExtDevicePropInfo when _phase == 3 => Ok(Props()),
            Ptp.SdioSetExtDevicePropValue when _phase == 3 => SetProp((ushort)p1, write),
            Ptp.SdioControlDevice when _phase == 3 => Control((ushort)p1, write),
            Ptp.GetObjectInfo when _phase == 3 => ObjectInfo(p1),
            Ptp.GetObject when _phase == 3 => GetObject(p1),
            Ptp.SdioConnect or Ptp.SdioGetExtDeviceInfo or Ptp.SdioGetAllExtDevicePropInfo => Res(Ptp.AuthenticationFailed),
            _ => Res(Ptp.OperationNotSupported),
        };
    }

    private static PtpResponse Res(ushort code, byte[]? data = null) => new(code, [], data ?? []);
    private static PtpResponse Ok(byte[]? data = null) => Res(Ptp.Ok, data);
    private static long Now => Environment.TickCount64;

    /// <summary>Waktu berjalan: fokus terkunci setelah AfMs, file masuk buffer setelah ShotMs.</summary>
    private void Tick()
    {
        if (_s1 && _s1At >= 0 && Now - _s1At >= AfMs) _props[FocusIndication].Current = AfFails ? 0x03 : 0x02;
        if (_shotAt >= 0 && Now - _shotAt >= ShotMs)
        {
            _shotAt = -1;
            if (!NoFile)
            {
                Shots++;
                _pending.Enqueue((Ptp.FormatJpeg, Shot));
                if (RawPlusJpeg) _pending.Enqueue((Ptp.FormatRaw, new byte[4096]));
            }
        }
        _props[ShootingFileInfo].Current = _pending.Count == 0 ? 0 : 0x8000 | _pending.Count;
    }

    private PtpResponse Phase(uint p)
    {
        _phase = (int)p;
        return Ok(new byte[8]); // UINT64 0
    }

    private PtpResponse ExtInfo(uint initiator)
    {
        if (RejectNewer && initiator / 100 > _version / 100) return Res(Ptp.AuthenticationFailed);
        if (EmptyExtInfo > 0)
        {
            EmptyExtInfo--;
            return Ok([]);
        }
        ushort[] controls = _v3
            ? [S1, S2, NearFar, AfAreaPosition, 0xD2E6]
            // v2: ISO/shutter/F/EV hanya bisa diubah lewat kontrol langkah berkode sama dengan propertinya.
            : [S1, S2, 0xD2C7, FNumber, ExposureComp, Shutter, Iso];
        return Ok(new PtpWriter().U16(_version)
            .U16Array([.. _props.Keys])
            .U16Array(controls).ToArray());
    }

    private PtpResponse SetProp(ushort code, byte[]? data)
    {
        if (!_props.TryGetValue(code, out var p) || data is null) return Res(Ptp.ParameterNotSupported);
        if (!p.Settable) return Res(Ptp.OperationNotSupported);
        var v = new PtpReader(data).Value(p.Type);
        if (p.Values.Length > 0 && !p.Values.Contains(v)) return Res(Ptp.ParameterNotSupported);
        // v3 dengan Position Key = kamera: dial yang menang, nilai dari PC diabaikan (respons tetap OK).
        if (_v3 && code != PositionKey && code != LiveViewQuality && _props[PositionKey].Current != 0x01) return Ok();
        p.Current = v;
        return Ok();
    }

    private PtpResponse Control(ushort code, byte[]? data)
    {
        if (data is null) return Res(Ptp.ParameterNotSupported);
        var type = code switch
        {
            S1 or S2 or 0xD2C7 or 0xD2E6 => (ushort)0x0004,
            NearFar => (ushort)0x0003,
            AfAreaPosition => (ushort)0x0006,
            _ => (ushort)0x0001, // notch
        };
        var v = new PtpReader(data).Value(type);
        lock (Controls) Controls.Add((code, v));
        switch (code)
        {
            case S1:
                _s1 = v == Down;
                _s1At = _s1 ? Now : -1;
                if (!_s1) _props[FocusIndication].Current = 0x01;
                break;
            case S2 when v == Down:
                _shotAt = Now;
                break;
            case FNumber or ExposureComp or Shutter or Iso when !_v3:
                // Langkah notch: geser indeks di daftar enum (urutan dial), dijepit di ujung.
                var p = _props[code];
                var i = Array.IndexOf(p.Values, p.Current);
                p.Current = p.Values[Math.Clamp(i + (int)v, 0, p.Values.Length - 1)];
                break;
        }
        return Ok(); // seperti kamera asli: kontrol selalu OK walau rana tidak jalan
    }

    private PtpResponse ObjectInfo(uint handle)
    {
        if (handle == Ptp.LiveViewHandle)
            return _props[LiveViewStatus].Current == 0x01
                ? Ok(new PtpObjectInfo(Ptp.FormatJpeg, 512 * 1024, "").ToBytes())
                : Res(Ptp.InvalidObjectHandle);
        if (handle != Ptp.ShotHandle || _pending.Count == 0) return Res(Ptp.InvalidObjectHandle);
        var (fmt, data) = _pending.Peek();
        return Ok(new PtpObjectInfo(fmt, (uint)data.Length, $"DSC{_fileNo:00000}.{(fmt == Ptp.FormatRaw ? "ARW" : "JPG")}").ToBytes());
    }

    private PtpResponse GetObject(uint handle)
    {
        if (handle == Ptp.LiveViewHandle) return LiveView();
        if (handle != Ptp.ShotHandle || _pending.Count == 0) return Res(Ptp.InvalidObjectHandle);
        if (PullDuringTransfer)
        {
            PullDuringTransfer = false;
            Plugged = false;
            throw new IOException("kamera Sony palsu dicabut saat unduh");
        }
        var (fmt, data) = _pending.Dequeue();
        if (fmt != Ptp.FormatRaw || _pending.Count == 0) _fileNo++;
        Tick();
        return Ok(data);
    }

    /// <summary>v2: offset+ukuran lalu JPEG. v3: + offset/ukuran Focal Frame Info, cadangan, JPEG, info fokus.</summary>
    private PtpResponse LiveView()
    {
        if (_props[LiveViewStatus].Current != 0x01) return Res(Ptp.InvalidObjectHandle);
        if (Now - _lastFrame < 33) return Res(Ptp.AccessDenied, new byte[8]);
        _lastFrame = Now;
        var w = new PtpWriter();
        if (!_v3)
        {
            w.U32(16).U32((uint)LiveFrame.Length).U32(0).U32(0);
            w.Raw(LiveFrame);
            return Ok(w.ToArray());
        }
        var header = 32u;
        w.U32(header).U32((uint)LiveFrame.Length).U32(header + (uint)LiveFrame.Length).U32(8)
            .U32(0).U32(0).U32(0).U32(0);
        w.Raw(LiveFrame).U32(0x00010001).U32(0);
        return Ok(w.ToArray());
    }

    private byte[] DeviceInfo() => new PtpWriter()
        .U16(100).U32(0x00000011).U16(100).Str("Sony PTP Extensions").U16(0)
        .U16Array([0x1001, 0x1002, 0x1003, 0x1008, 0x1009, .. Ptp.RequiredVendorOps])
        .U16Array(0xC201, 0xC203)
        .U16Array(WhiteBalance, Battery)
        .U16Array()
        .U16Array(Ptp.FormatJpeg)
        .Str("Sony Corporation").Str(Model).Str("1.00").Str("fake-sony")
        .ToArray();

    private sealed class FakeProp(ushort type, bool settable, long current, long[] values, (long, long, long)? range = null)
    {
        public ushort Type { get; } = type;
        public bool Settable { get; } = settable;
        public long Current { get; set; } = current;
        public long[] Values { get; } = values;
        public (long Min, long Max, long Step)? Range { get; } = range;
    }

    /// <summary>
    /// Setelan awal kedua bodi: v2 eksposur hanya-baca (diubah lewat kontrol langkah), WB absolut; v3 semua absolut +
    /// status kartu/panas/error + Position Key & kualitas live view. Simpan ke = PC saja (hanya-baca di kedua versi).
    /// </summary>
    private static Dictionary<ushort, FakeProp> Defaults(bool v3)
    {
        var d = new Dictionary<ushort, FakeProp>
        {
            [Battery] = new(0x0001, false, 80, [], (-1, 100, 1)),
            [Iso] = new(0x0006, v3, 400, [0x00FFFFFF, 100, 200, 400, 800, 1600, 3200, 6400]),
            [Shutter] = new(0x0006, v3, 0x0001007D, [0x0001001E, 0x0001003C, 0x0001007D, 0x000100FA, 0x000101F4, 0x000F000A]),
            [FNumber] = new(0x0004, v3, 560, [280, 350, 400, 560, 800, 1100]),
            [ExposureComp] = new(0x0003, v3, 0, [-1000, -700, -300, 0, 300, 700, 1000]),
            [WhiteBalance] = new(0x0004, true, 0x0002, [0x0002, 0x0004, 0x8010, 0x8011, 0x0006, 0x0005, 0x0007]),
            [FocusIndication] = new(0x0002, false, 0x01, [0x01, 0x02, 0x03, 0x05, 0x06, 0x07]),
            [ShootingFileInfo] = new(0x0004, false, 0, [], (0, 0xFFFF, 1)),
            [LiveViewStatus] = new(0x0002, false, 0x01, [0x00, 0x01, 0x02]),
            [SaveDestination] = new(0x0004, false, SaveToPc, [SaveToPc, SaveToCard, SaveToBoth]),
            [NearFarEnabled] = new(0x0002, false, 0x01, [0x00, 0x01]),
        };
        if (!v3) return d;
        d[MediaStatus] = new(0x0002, false, 0x01, [0x01, 0x02, 0x03, 0x09]);
        d[MediaShots] = new(0x0006, false, 812, [], (0, 0xFFFFFFFF, 1));
        d[Overheating] = new(0x0002, false, 0x00, [], (0, 2, 1));
        d[CameraError] = new(0x0002, false, 0x01, [0x01, 0x02]);
        d[PositionKey] = new(0x0002, true, 0x00, [0x00, 0x01]);
        d[LiveViewQuality] = new(0x0002, true, 0x01, [0x01, 0x02]);
        return d;
    }

    private byte[] Props()
    {
        var w = new PtpWriter().U64((ulong)_props.Count);
        foreach (var (code, p) in _props)
        {
            w.U16(code).U16(p.Type).U8(p.Settable ? (byte)1 : (byte)0).U8(1).Value(p.Type, p.Current).Value(p.Type, p.Current);
            if (p.Range is { } r)
            {
                w.U8(1).Value(p.Type, r.Min).Value(p.Type, r.Max).Value(p.Type, r.Step);
                continue;
            }
            if (p.Values.Length == 0)
            {
                w.U8(0);
                continue;
            }
            w.U8(2);
            for (var k = 0; k < (_twoLists ? 2 : 1); k++)
            {
                w.U16((ushort)p.Values.Length);
                foreach (var v in p.Values) w.Value(p.Type, v);
            }
        }
        return w.ToArray();
    }
}
