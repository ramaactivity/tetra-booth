using System.Runtime.InteropServices;

namespace TetraCamera.Lumix;

/// <summary>
/// P/Invoke Lmxptpif.dll (Lumix Remote Control Library 1.00, Windows x64, ekspor C). Hanya identifier & tata letak
/// struct dari header Panasonic; isi header tidak disalin. Semua fungsi mengembalikan 1 = berhasil, kode error di
/// <c>err</c>.
/// </summary>
public static class Lmx
{
    public const string Dll = "Lmxptpif.dll";
    public const uint ConnectVersion = 0x00010001;

    // Event/callback (Lmx_event_id).
    public const uint EventObjectAdd = 0x10000040;
    public const uint EventObjectTransfer = 0x10000043;
    /// <summary>Handle tetap untuk jepretan yang dikirim ke PC (EventObjectTransfer).</summary>
    public const uint TransferHandle = 0x12345678;

    // Tag kontrol (LMX_STRUCT_REC_CTRL.CtrlID).
    public const uint TagReleaseOneShot = 0x03000011;
    public const uint TagAfOneShot = 0x03000024;
    public const uint TagLensMfBar = 0x03010011;
    public const uint MfStop = 0, MfFarFast = 1, MfFarSlow = 2, MfNearSlow = 3, MfNearFast = 4;

    public const uint FormatJpeg = 1;
    public const ushort TargetPcOnly = 1;

    // Error (Lmx_def_error_code).
    public const uint ErrDataBusy = 0x00040004;
    public const uint ErrSessionAlreadyOpened = 0x00041000;

    /// <summary>
    /// Kode yang berarti kamera hilang (dicabut / mati): kelompok device (0x3xxxx), kirim/terima perintah gagal, timeout,
    /// sambung ulang internal gagal, sesi belum terbuka.
    /// </summary>
    public static bool Lost(uint err) =>
        err is >= 0x00030000 and < 0x00040000 or 0x00040001 or 0x00040002 or 0x00040003 or 0x00040009 or 0x0004000B or 0x00041001;

    // Tata letak (header: tipe dasar tanpa pack, struct LMX_lib_def.h pack(1)).
    /// <summary>LMX_CONNECT_DEVICE_INFO: jumlah u32, 512 pointer, lalu 512 LMX_DEV_INFO @4104 (1036 byte per item).</summary>
    public const int DevInfoSize = 4104 + 512 * 1036;
    public const int DevInfoItems = 4104, DevInfoItemSize = 1036, DevInfoMaker = 4, DevInfoModel = 520;
    /// <summary>LMX_STRUCT_REC_CTRL: CtrlID u32, lalu FORM_ENUM_UINT32 (jumlah u16, nilai u32 @+4).</summary>
    public const int RecCtrlSize = 4 + 2056;
    /// <summary>Buffer struct capability (terbesar: WB 5150 byte).</summary>
    public const int CapaSize = 8192;
    public const int JpegMax = 1024 * 1024;

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    public delegate int Callback(uint type, uint param);

    [DllImport(Dll)] public static extern void LMX_func_api_Init();
    [DllImport(Dll)] public static extern byte LMX_func_api_Get_PnPDeviceInfo([Out] byte[] info, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Select_PnPDevice(uint index, [In, Out] byte[] info, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Open_Session(uint version, out uint deviceVersion, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Close_Session(out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Close_Device(out uint err);
    [DllImport(Dll)] public static extern uint LMX_func_api_Reg_NotifyCallback(uint type, Callback f);
    [DllImport(Dll)] public static extern uint LMX_func_api_Delete_CallBackInfo(uint type);
    [DllImport(Dll)] public static extern byte LMX_func_api_SetupFilesConfig_Set_Target(ushort target, out uint err);

    [DllImport(Dll)] public static extern byte LMX_func_api_ISO_Get_Capability([Out] byte[] capa, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_ISO_Get_Param(out uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_ISO_Set_Param(uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_SS_Get_Capability([Out] byte[] capa, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_SS_Get_Param(out uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_SS_Set_Param(uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Aperture_Get_Capability([Out] byte[] capa, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Aperture_Get_Param(out uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Aperture_Set_Param(uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_WB_Get_Capability([Out] byte[] capa, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_WB_Get_Param(out uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_WB_Set_Param(uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Exposure_Get_Capability([Out] byte[] capa, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Exposure_Get_Param(out uint value, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Exposure_Set_Param(uint value, out uint err);

    [DllImport(Dll)] public static extern byte LMX_func_api_Rec_Ctrl_Release([In, Out] byte[] ctrl, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Rec_Ctrl_AF_AE([In, Out] byte[] ctrl, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Rec_Ctrl_Lens([In, Out] byte[] ctrl, out uint err);

    [DllImport(Dll)] public static extern byte LMX_func_api_Get_Object_FormatType(uint handle, out uint format, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Get_Object_DataSize(uint handle, out ulong size, out uint err);
    [DllImport(Dll)]
    public static extern byte LMX_func_api_Get_Partial_ObjectEx(
        uint handle, [Out] byte[] buf, ulong offset, uint count, out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Skip_Object_Transfer(uint handle, out uint err);

    [DllImport(Dll)] public static extern byte LMX_func_api_Ctrl_LiveView_Start(out uint err);
    [DllImport(Dll)] public static extern byte LMX_func_api_Ctrl_LiveView_Stop(out uint err);
    [DllImport(Dll)]
    public static extern byte LMX_func_api_Get_LiveView_data(
        [Out] byte[] hist, ref uint histSize,
        [Out] byte[] posture, ref uint postureSize,
        [Out] byte[] level, ref uint levelSize,
        [Out] byte[] jpeg, ref uint jpegSize,
        out uint err);

    /// <summary>
    /// Isi capability FORM_ENUM: jumlah u16 di <paramref name="at"/>, nilai mulai @+4 (u32) atau @+2 (u16).
    /// Jumlah &gt; 512 = tata letak struct tidak cocok dengan DLL.
    /// </summary>
    public static uint[] Enum(byte[] b, int at, bool wide)
    {
        int n = BitConverter.ToUInt16(b, at);
        if (n > 512) throw new HotFolder.CameraFailure("lumix_error", $"capability Lumix tidak terbaca (jumlah {n})");
        return [.. Enumerable.Range(0, n).Select(i =>
            wide ? BitConverter.ToUInt32(b, at + 4 + i * 4) : BitConverter.ToUInt16(b, at + 2 + i * 2))];
    }
}
