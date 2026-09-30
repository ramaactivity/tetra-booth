using System.Runtime.InteropServices;

namespace TetraCamera.Canon;

/// <summary>
/// Deklarasi P/Invoke Canon EDSDK 13.x (hanya yang dipakai), ditulis dari header SDK (`EDSDK.h`, `EDSDKTypes.h`).
/// DLL tidak ada di repo (lisensi Canon): dicari di folder `--edsdk-dir` (lihat <see cref="EdsdkDriver"/>).
/// Semua pemanggilan wajib dari satu thread (<see cref="CanonCamera"/>).
/// </summary>
internal static class Edsdk
{
    public const string Dll = "EDSDK.dll";

    public const uint ErrOk = 0x00000000;
    public const uint ErrDeviceBusy = 0x00000081;
    public const uint ErrObjectNotReady = 0x0000A102;

    public const uint PropProductName = 0x00000002;
    public const uint PropBatteryLevel = 0x00000008;
    public const uint PropSaveTo = 0x0000000b;
    public const uint PropEvfOutputDevice = 0x00000500;
    public const uint PropEvfMode = 0x00000501;
    public const uint PropEvfZoomPosition = 0x00000508;
    public const uint PropEvfCoordinateSystem = 0x00000540;
    public const uint PropEvfAFMode = 0x0000050E;

    public const uint SaveToHost = 2;
    public const uint EvfOutputDevicePc = 2;

    public const uint CmdTakePicture = 0x00000000;
    public const uint CmdExtendShutDownTimer = 0x00000001;
    public const uint CmdDoEvfAf = 0x00000102;
    public const uint CmdDriveLensEvf = 0x00000103;

    public const uint ObjectEventAll = 0x00000200;
    public const uint ObjectEventDirItemRequestTransfer = 0x00000208;
    public const uint StateEventAll = 0x00000300;
    public const uint StateEventShutdown = 0x00000301;
    public const uint StateEventWillSoonShutDown = 0x00000303;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DeviceInfo
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string PortName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string DeviceDescription;
        public uint DeviceSubType;
        public uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DirectoryItemInfo
    {
        public ulong Size;
        public int IsFolder;
        public uint GroupId;
        public uint Option;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string FileName;
        public uint Format;
        public uint DateTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Capacity
    {
        public int NumberOfFreeClusters;
        public int BytesPerSector;
        public int Reset;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Size
    {
        public int Width;
        public int Height;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PropertyDesc
    {
        public int Form;
        public int Access;
        public int NumElements;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 128)] public int[] PropDesc;
    }

    public delegate uint ObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);
    public delegate uint StateEventHandler(uint inEvent, uint inEventData, IntPtr inContext);

    [DllImport(Dll)] public static extern uint EdsInitializeSDK();
    [DllImport(Dll)] public static extern uint EdsTerminateSDK();
    [DllImport(Dll)] public static extern uint EdsRelease(IntPtr inRef);
    [DllImport(Dll)] public static extern uint EdsGetCameraList(out IntPtr outCameraListRef);
    [DllImport(Dll)] public static extern uint EdsGetChildCount(IntPtr inRef, out uint outCount);
    [DllImport(Dll)] public static extern uint EdsGetChildAtIndex(IntPtr inRef, int inIndex, out IntPtr outRef);
    [DllImport(Dll)] public static extern uint EdsGetDeviceInfo(IntPtr inCameraRef, out DeviceInfo outDeviceInfo);
    [DllImport(Dll)] public static extern uint EdsOpenSession(IntPtr inCameraRef);
    [DllImport(Dll)] public static extern uint EdsCloseSession(IntPtr inCameraRef);
    [DllImport(Dll)] public static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);
    [DllImport(Dll)] public static extern uint EdsSetPropertyData(IntPtr inRef, uint inPropertyId, int inParam, uint inPropertySize, ref uint inPropertyData);
    [DllImport(Dll)] public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyId, int inParam, uint inPropertySize, out uint outPropertyData);
    [DllImport(Dll)] public static extern uint EdsSetPropertyData(IntPtr inRef, uint inPropertyId, int inParam, uint inPropertySize, ref Point inPropertyData);
    [DllImport(Dll)] public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyId, int inParam, uint inPropertySize, out Size outPropertyData);
    [DllImport(Dll)] public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyId, int inParam, uint inPropertySize, out Point outPropertyData);
    [DllImport(Dll)] public static extern uint EdsGetPropertyDesc(IntPtr inRef, uint inPropertyId, out PropertyDesc outPropertyDesc);
    [DllImport(Dll)] public static extern uint EdsSetCapacity(IntPtr inCameraRef, Capacity inCapacity);
    [DllImport(Dll)] public static extern uint EdsSetObjectEventHandler(IntPtr inCameraRef, uint inEvent, ObjectEventHandler inHandler, IntPtr inContext);
    [DllImport(Dll)] public static extern uint EdsSetCameraStateEventHandler(IntPtr inCameraRef, uint inEvent, StateEventHandler inHandler, IntPtr inContext);
    [DllImport(Dll)] public static extern uint EdsGetDirectoryItemInfo(IntPtr inDirItemRef, out DirectoryItemInfo outDirItemInfo);
    [DllImport(Dll)] public static extern uint EdsCreateMemoryStream(ulong inBufferSize, out IntPtr outStream);
    [DllImport(Dll)] public static extern uint EdsDownload(IntPtr inDirItemRef, ulong inReadSize, IntPtr outStream);
    [DllImport(Dll)] public static extern uint EdsDownloadComplete(IntPtr inDirItemRef);
    [DllImport(Dll)] public static extern uint EdsGetPointer(IntPtr inStream, out IntPtr outPointer);
    [DllImport(Dll)] public static extern uint EdsGetLength(IntPtr inStream, out ulong outLength);
    [DllImport(Dll)] public static extern uint EdsCreateEvfImageRef(IntPtr inStreamRef, out IntPtr outEvfImageRef);
    [DllImport(Dll)] public static extern uint EdsDownloadEvfImage(IntPtr inCameraRef, IntPtr inEvfImageRef);
    [DllImport(Dll)] public static extern uint EdsGetEvent();
}
