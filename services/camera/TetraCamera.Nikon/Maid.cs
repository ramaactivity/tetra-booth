using System.Runtime.InteropServices;

namespace TetraCamera.Nikon;

/// <summary>
/// Antarmuka MAID3 Nikon (Maid3.h + Maid3d1.h, Windows x64): hanya identifier dan tata letak struct, isi header tidak
/// disalin. Struct memakai pack(2) seperti header; ID capability yang dipakai sama di semua 40 modul paket SDK
/// (diperiksa 8 Okt 2026, DECISIONS #216).
/// </summary>
public static class Maid
{
    // eNkMAIDCommand
    public const uint CmdAsync = 0, CmdOpen = 1, CmdClose = 2, CmdGetCapCount = 3, CmdGetCapInfo = 4, CmdCapStart = 5,
        CmdCapSet = 6, CmdCapGet = 7, CmdCapGetArray = 9;

    // eNkMAIDDataType
    public const uint TypeNull = 0, TypeUnsigned = 3, TypeIntegerPtr = 5, TypeUnsignedPtr = 6, TypeStringPtr = 11,
        TypeCallbackPtr = 13, TypeRangePtr = 14, TypeArrayPtr = 15, TypeEnumPtr = 16, TypeObjectPtr = 17,
        TypeCapInfoPtr = 18;

    // eNkMAIDArrayType
    public const uint ArrayUnsigned = 2, ArrayPackedString = 7;

    // eNkMAIDCapability (dasar) & Maid3d1 (vendor, basis 0x8100)
    public const uint CapProgressProc = 2, CapEventProc = 3, CapDataProc = 4, CapUIRequestProc = 5, CapChildren = 7,
        CapName = 9, CapCapture = 17, CapAcquire = 20, CapAutoFocus = 30, CapBatteryLevel = 49;
    public const uint CapModuleMode = 0x8101, CapShutterSpeed = 0x8112, CapAperture = 0x8113, CapExposureComp = 0x8115,
        CapSensitivity = 0x8117, CapWBMode = 0x8118, CapLiveViewStatus = 0x823E, CapContrastAF = 0x8240,
        CapGetLiveViewImage = 0x8247, CapMFDriveStep = 0x8248, CapMFDrive = 0x8249, CapSaveMedia = 0x8305;

    public const uint ModuleModeController = 1, SaveMediaSdram = 1;
    public const uint ContrastAFStart = 0x00, ContrastAFInFocus = 0x10, ContrastAFOutOfFocus = 0x11;
    public const uint MFDriveToClosest = 0, MFDriveToInfinity = 1;

    // eNkMAIDEvent
    public const uint EventAddChild = 0, EventRemoveChild = 1;
    // eNkMAIDDataObjType, eNkMAIDFileDataTypes
    public const uint DataObjImage = 1, DataObjFile = 0x10, FileJpeg = 1;

    // eNkMAIDResult
    public const int NoError = 0, Pending = 1, NotSupported = -127, OutOfFocus = 137, DeviceBusy = 152, NotLiveView = 159;

    public static bool Ok(int r) => r is NoError or Pending;

    /// <summary>Muat DLL Nikon; dependensi (NkdPTP.dll, VC++ runtime) dicari di folder DLL lalu System32.</summary>
    public static IntPtr Load(string path)
    {
        try
        {
            return NativeLibrary.Load(path, typeof(Maid).Assembly,
                DllImportSearchPath.UseDllDirectoryForDependencies | DllImportSearchPath.System32);
        }
        catch (DllNotFoundException e)
        {
            throw new HotFolder.CameraFailure("nikon_missing",
                $"{Path.GetFileName(path)} tidak bisa dimuat ({e.Message}); pasang Microsoft Visual C++ Redistributable x64 (vc_redist.x64.exe)");
        }
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct Object
    {
        public uint Type, Id;
        public IntPtr RefClient, RefModule;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct Callback
    {
        public IntPtr Proc, Ref;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct Enum
    {
        public uint Type, Elements, Value, Default;
        public short PhysicalBytes;
        public IntPtr Data;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct Array
    {
        public uint Type, Elements, Dim1, Dim2, Dim3;
        public ushort PhysicalBytes, LogicalBits;
        public IntPtr Data;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct Range
    {
        public double Value, Default;
        public uint ValueIndex, DefaultIndex;
        public double Lower, Upper;
        public uint Steps;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct CapInfo
    {
        public uint Id, Type, Visibility, Operations;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public byte[] Description;
    }

    /// <summary>NkMAIDFileInfo: potongan file yang dikirim DataProc.</summary>
    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct FileInfo
    {
        public uint Type, FileDataType, TotalLength, Start, Length;
        public int DiskFile, RemoveObject;
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    public delegate int EntryProc(IntPtr obj, uint cmd, uint param, uint dataType, ulong data, IntPtr complete, IntPtr refComplete);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    public delegate void CompletionProc(IntPtr obj, uint cmd, uint param, uint dataType, ulong data, IntPtr refComplete, int result);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    public delegate void EventProc(IntPtr refClient, uint ev, ulong data);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    public delegate int DataProc(IntPtr refClient, IntPtr info, IntPtr data);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    public delegate uint UIRequestProc(IntPtr refProc, IntPtr request);

    /// <summary>Isi enum PackedString: string null-terminated berurutan.</summary>
    public static string[] PackedStrings(byte[] b) =>
        System.Text.Encoding.ASCII.GetString(b).Split('\0', StringSplitOptions.RemoveEmptyEntries);

    /// <summary>Frame live view = header (ukurannya beda per model) + JPEG; ambil mulai penanda SOI FF D8 FF.</summary>
    public static byte[]? JpegAfterHeader(ReadOnlySpan<byte> b)
    {
        var at = b.IndexOf([(byte)0xFF, (byte)0xD8, (byte)0xFF]);
        return at < 0 ? null : b[at..].ToArray();
    }
}
