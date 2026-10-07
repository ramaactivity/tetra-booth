using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace TetraCamera.Sony;

/// <summary>
/// PTP lewat Windows Portable Devices, perintah MTP extension (API publik Microsoft, driver bawaan "MTP USB Device";
/// docs/PLAN-SONY.md §2, DECISIONS #169). Hanya Windows: dibuat Host saat <c>OperatingSystem.IsWindows()</c>, seperti
/// EdsdkDriver/WindowsPrinterAdapter. Driver yang membuka session PTP. Belum diuji di hardware: W-037 (`--sony-probe wpd`).
/// Dipanggil dari satu thread MTA (thread kamera / probe); objek COM pakai free-threaded marshaler.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WpdTransport : IPtpTransport
{
    private const int ChunkBytes = 256 * 1024;
    private IPortableDevice? _dev;

    public bool IsOpen => _dev is not null;

    /// <summary>Semua perangkat WPD: "nama | pabrikan | deskripsi | id" (probe).</summary>
    public static IEnumerable<string> Devices()
    {
        var m = (IPortableDeviceManager)new PortableDeviceManager();
        foreach (var id in Ids(m))
            yield return $"{Text(m.GetDeviceFriendlyName, id)} | {Text(m.GetDeviceManufacturer, id)} | {Text(m.GetDeviceDescription, id)} | {id}";
    }

    public bool Open()
    {
        Close();
        var m = (IPortableDeviceManager)new PortableDeviceManager();
        m.RefreshDeviceList();
        var id = Ids(m).FirstOrDefault(i => Text(m.GetDeviceManufacturer, i).Contains("Sony", StringComparison.OrdinalIgnoreCase));
        if (id is null) return false;
        var client = Values();
        client.SetStringValue(Keys.ClientName, "Tetra Booth");
        var dev = (IPortableDevice)new PortableDeviceFtm();
        dev.Open(id, client);
        _dev = dev;
        return true;
    }

    public void Close()
    {
        var d = _dev;
        _dev = null;
        if (d is null) return;
        try { d.Close(); } catch (COMException) { /* perangkat sudah hilang */ }
        Marshal.ReleaseComObject(d);
    }

    public void Dispose() => Close();

    /// <summary>WPD_COMMAND_MTP_EXT_GET_SUPPORTED_VENDOR_OPCODES: opcode vendor yang mau diteruskan driver.</summary>
    public ushort[] VendorOpcodes()
    {
        var r = Send(Command(Keys.CmdGetVendorOpcodes));
        r.GetIPortableDevicePropVariantCollectionValue(Keys.VendorOpcodes, out var c);
        return UInts(c).Select(v => (ushort)v).ToArray();
    }

    public PtpResponse Execute(ushort op, uint[] args, bool read = false, byte[]? write = null)
    {
        try
        {
            if (write is not null) return Write(op, args, write);
            if (!read) return Response(Send(Operation(Keys.CmdExecNoData, op, args)));
            var start = Send(Operation(Keys.CmdExecRead, op, args));
            start.GetStringValue(Keys.TransferContext, out var ctx);
            start.GetUnsignedLargeIntegerValue(Keys.TransferTotalSize, out var total);
            var data = new MemoryStream();
            while (total == 0 || (ulong)data.Length < total)
            {
                var want = (uint)Math.Min(ChunkBytes, total == 0 ? ChunkBytes : total - (ulong)data.Length);
                var p = Command(Keys.CmdReadData);
                p.SetStringValue(Keys.TransferContext, ctx);
                p.SetUnsignedIntegerValue(Keys.TransferBytesToRead, want);
                p.SetBufferValue(Keys.TransferData, new byte[want], want);
                var r = Send(p);
                r.GetUnsignedIntegerValue(Keys.TransferBytesRead, out var got);
                if (got == 0) break;
                r.GetBufferValue(Keys.TransferData, out var buf, out var len);
                try
                {
                    var chunk = new byte[Math.Min(got, len)];
                    Marshal.Copy(buf, chunk, 0, chunk.Length);
                    data.Write(chunk);
                }
                finally { Marshal.FreeCoTaskMem(buf); }
                if (got < want) break;
            }
            var end = End(ctx);
            return end with { Data = data.ToArray() };
        }
        catch (COMException e)
        {
            // Perangkat hilang (kabel dicabut / kamera tidur): tutup supaya thread kamera menyambung ulang.
            Close();
            throw new IOException($"WPD 0x{op:X4} gagal: 0x{e.HResult:X8} {e.Message}", e);
        }
    }

    private PtpResponse Write(ushort op, uint[] args, byte[] data)
    {
        var p = Operation(Keys.CmdExecWrite, op, args);
        p.SetUnsignedLargeIntegerValue(Keys.TransferTotalSize, (ulong)data.Length);
        Send(p).GetStringValue(Keys.TransferContext, out var ctx);
        var w = Command(Keys.CmdWriteData);
        w.SetStringValue(Keys.TransferContext, ctx);
        w.SetUnsignedIntegerValue(Keys.TransferBytesToWrite, (uint)data.Length);
        w.SetBufferValue(Keys.TransferData, data, (uint)data.Length);
        Send(w);
        return End(ctx);
    }

    private PtpResponse End(string ctx)
    {
        var p = Command(Keys.CmdEndTransfer);
        p.SetStringValue(Keys.TransferContext, ctx);
        return Response(Send(p));
    }

    private static PtpResponse Response(IPortableDeviceValues r)
    {
        r.GetUnsignedIntegerValue(Keys.ResponseCode, out var code);
        uint[] ps = [];
        try
        {
            r.GetIPortableDevicePropVariantCollectionValue(Keys.ResponseParams, out var c);
            ps = UInts(c);
        }
        catch (COMException) { /* tanpa parameter respons */ }
        return new((ushort)code, ps, []);
    }

    private IPortableDeviceValues Send(IPortableDeviceValues p)
    {
        var dev = _dev ?? throw new IOException("kamera Sony belum dibuka");
        dev.SendCommand(0, p, out var r);
        r.GetErrorValue(Keys.CommonHresult, out var hr);
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        return r;
    }

    private static IPortableDeviceValues Command(uint id)
    {
        var p = Values();
        var cat = Keys.MtpExt;
        p.SetGuidValue(Keys.CommandCategory, ref cat);
        p.SetUnsignedIntegerValue(Keys.CommandId, id);
        return p;
    }

    private static IPortableDeviceValues Operation(uint cmd, ushort op, uint[] args)
    {
        var p = Command(cmd);
        p.SetUnsignedIntegerValue(Keys.OperationCode, op);
        var c = (IPortableDevicePropVariantCollection)new PortableDevicePropVariantCollection();
        foreach (var a in args)
        {
            var v = new PropVariant { vt = VtUi4, ulVal = a };
            c.Add(ref v);
        }
        p.SetIPortableDevicePropVariantCollectionValue(Keys.OperationParams, c);
        return p;
    }

    private static IPortableDeviceValues Values() => (IPortableDeviceValues)new PortableDeviceValues();

    private static uint[] UInts(IPortableDevicePropVariantCollection c)
    {
        c.GetCount(out var n);
        var a = new uint[n];
        for (uint i = 0; i < n; i++)
        {
            var v = new PropVariant();
            c.GetAt(i, ref v);
            a[i] = v.ulVal;
        }
        return a;
    }

    private static string[] Ids(IPortableDeviceManager m)
    {
        uint n = 0;
        m.GetDevices(IntPtr.Zero, ref n);
        if (n == 0) return [];
        var buf = Marshal.AllocHGlobal(IntPtr.Size * (int)n);
        try
        {
            m.GetDevices(buf, ref n);
            var ids = new string[n];
            for (var i = 0; i < n; i++)
            {
                var s = Marshal.ReadIntPtr(buf, i * IntPtr.Size);
                ids[i] = Marshal.PtrToStringUni(s) ?? "";
                Marshal.FreeCoTaskMem(s);
            }
            return ids;
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    private delegate void TextGetter(string id, IntPtr buf, ref uint len);

    private static string Text(TextGetter get, string id)
    {
        try
        {
            uint len = 0;
            get(id, IntPtr.Zero, ref len);
            if (len == 0) return "";
            var buf = Marshal.AllocHGlobal((int)len * 2);
            try
            {
                get(id, buf, ref len);
                return Marshal.PtrToStringUni(buf) ?? "";
            }
            finally { Marshal.FreeHGlobal(buf); }
        }
        catch (COMException) { return ""; }
    }

    private const ushort VtUi4 = 19;

    /// <summary>PROPVARIANT x64 (24 byte); hanya VT_UI4 yang dipakai.</summary>
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public uint ulVal;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey(Guid fmtid, uint pid)
    {
        public Guid Fmtid = fmtid;
        public uint Pid = pid;
    }

    /// <summary>PROPERTYKEY & id perintah WPD (PortableDevice.h).</summary>
    private static class Keys
    {
        public static readonly Guid MtpExt = new("4d545058-1a2e-4106-a357-771e0819fc56");
        private static readonly Guid Common = new("f0422a9c-5dc8-4440-b5bd-5df28835658a");
        private static readonly Guid Client = new("204d9f0c-2292-4080-9f42-40664e70f859");
        public static PropertyKey CommandCategory => new(Common, 1001);
        public static PropertyKey CommandId => new(Common, 1002);
        public static PropertyKey CommonHresult => new(Common, 1003);
        public static PropertyKey ClientName => new(Client, 2);
        public const uint CmdGetVendorOpcodes = 11, CmdExecNoData = 12, CmdExecRead = 13, CmdExecWrite = 14,
            CmdReadData = 15, CmdWriteData = 16, CmdEndTransfer = 17;
        public static PropertyKey OperationCode => new(MtpExt, 1001);
        public static PropertyKey OperationParams => new(MtpExt, 1002);
        public static PropertyKey ResponseCode => new(MtpExt, 1003);
        public static PropertyKey ResponseParams => new(MtpExt, 1004);
        public static PropertyKey VendorOpcodes => new(MtpExt, 1005);
        public static PropertyKey TransferContext => new(MtpExt, 1006);
        public static PropertyKey TransferTotalSize => new(MtpExt, 1007);
        public static PropertyKey TransferBytesToRead => new(MtpExt, 1008);
        public static PropertyKey TransferBytesRead => new(MtpExt, 1009);
        public static PropertyKey TransferBytesToWrite => new(MtpExt, 1010);
        public static PropertyKey TransferData => new(MtpExt, 1012);
    }

    [ComImport, Guid("0af10cec-2ecd-4b92-9581-34f6ae0637f3")]
    private class PortableDeviceManager;

    [ComImport, Guid("f7c0039a-4762-488a-b4b3-760ef9a1ba9b")]
    private class PortableDeviceFtm;

    [ComImport, Guid("0c15d503-d017-47ce-9016-7b3f978721cc")]
    private class PortableDeviceValues;

    [ComImport, Guid("08a99e2f-6d6d-4b80-af5a-baf2bcbe4cb9")]
    private class PortableDevicePropVariantCollection;

    [ComImport, Guid("a1567595-4c2f-4574-a6fa-ecef917b9a40"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPortableDeviceManager
    {
        void GetDevices(IntPtr ids, ref uint count);
        void RefreshDeviceList();
        void GetDeviceFriendlyName([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr name, ref uint len);
        void GetDeviceDescription([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr desc, ref uint len);
        void GetDeviceManufacturer([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr manufacturer, ref uint len);
    }

    [ComImport, Guid("625e2df8-6392-4cf0-9ad1-3cfa5f17775c"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPortableDevice
    {
        void Open([MarshalAs(UnmanagedType.LPWStr)] string id, IPortableDeviceValues clientInfo);
        void SendCommand(uint flags, IPortableDeviceValues parameters, out IPortableDeviceValues results);
        void Content(out IntPtr content);
        void Capabilities(out IntPtr capabilities);
        void Cancel();
        void Close();
    }

    [ComImport, Guid("89b2e422-4f1b-4316-bcef-a44afea83eb3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPortableDevicePropVariantCollection
    {
        void GetCount(out uint count);
        void GetAt(uint index, ref PropVariant value);
        void Add(ref PropVariant value);
    }

    /// <summary>Urutan vtable IPortableDeviceValues lengkap sampai method terakhir yang dipakai.</summary>
    [ComImport, Guid("6848f6f2-3155-4f86-b6f5-263eeeab3143"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPortableDeviceValues
    {
        void GetCount(out uint count);
        void GetAt(uint index, IntPtr key, IntPtr value);
        void SetValue(in PropertyKey key, IntPtr value);
        void GetValue(in PropertyKey key, IntPtr value);
        void SetStringValue(in PropertyKey key, [MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetStringValue(in PropertyKey key, [MarshalAs(UnmanagedType.LPWStr)] out string value);
        void SetUnsignedIntegerValue(in PropertyKey key, uint value);
        void GetUnsignedIntegerValue(in PropertyKey key, out uint value);
        void SetSignedIntegerValue(in PropertyKey key, int value);
        void GetSignedIntegerValue(in PropertyKey key, out int value);
        void SetUnsignedLargeIntegerValue(in PropertyKey key, ulong value);
        void GetUnsignedLargeIntegerValue(in PropertyKey key, out ulong value);
        void SetSignedLargeIntegerValue(in PropertyKey key, long value);
        void GetSignedLargeIntegerValue(in PropertyKey key, out long value);
        void SetFloatValue(in PropertyKey key, float value);
        void GetFloatValue(in PropertyKey key, out float value);
        void SetErrorValue(in PropertyKey key, int value);
        void GetErrorValue(in PropertyKey key, out int value);
        void SetKeyValue(in PropertyKey key, in PropertyKey value);
        void GetKeyValue(in PropertyKey key, out PropertyKey value);
        void SetBoolValue(in PropertyKey key, int value);
        void GetBoolValue(in PropertyKey key, out int value);
        void SetIUnknownValue(in PropertyKey key, [MarshalAs(UnmanagedType.IUnknown)] object value);
        void GetIUnknownValue(in PropertyKey key, [MarshalAs(UnmanagedType.IUnknown)] out object value);
        void SetGuidValue(in PropertyKey key, ref Guid value);
        void GetGuidValue(in PropertyKey key, out Guid value);
        void SetBufferValue(in PropertyKey key, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 2)] byte[] value, uint size);
        void GetBufferValue(in PropertyKey key, out IntPtr value, out uint size);
        void SetIPortableDeviceValuesValue(in PropertyKey key, IPortableDeviceValues value);
        void GetIPortableDeviceValuesValue(in PropertyKey key, out IPortableDeviceValues value);
        void SetIPortableDevicePropVariantCollectionValue(in PropertyKey key, IPortableDevicePropVariantCollection value);
        void GetIPortableDevicePropVariantCollectionValue(in PropertyKey key, out IPortableDevicePropVariantCollection value);
    }
}
