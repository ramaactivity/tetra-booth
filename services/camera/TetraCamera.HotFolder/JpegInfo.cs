namespace TetraCamera.HotFolder;

/// <summary>Baca ukuran piksel dari header JPEG (marker SOFn) tanpa decode dan tanpa library tambahan.</summary>
public static class JpegInfo
{
    public static (int Width, int Height)? ReadSize(Stream s)
    {
        if (s.ReadByte() != 0xFF || s.ReadByte() != 0xD8) return null;
        while (true)
        {
            int b;
            do { b = s.ReadByte(); } while (b != -1 && b != 0xFF);
            if (b == -1) return null;
            int marker;
            do { marker = s.ReadByte(); } while (marker == 0xFF);
            if (marker is -1 or 0xD9) return null;
            if (marker is 0x01 or >= 0xD0 and <= 0xD7) continue; // marker tanpa panjang
            var len = (s.ReadByte() << 8) | s.ReadByte();
            if (len < 2) return null;
            var isSof = marker is >= 0xC0 and <= 0xCF and not (0xC4 or 0xC8 or 0xCC);
            if (isSof)
            {
                s.ReadByte(); // precision
                var h = (s.ReadByte() << 8) | s.ReadByte();
                var w = (s.ReadByte() << 8) | s.ReadByte();
                return w > 0 && h > 0 ? (w, h) : null;
            }
            s.Seek(len - 2, SeekOrigin.Current);
        }
    }
}
