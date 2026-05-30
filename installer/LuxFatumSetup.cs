using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class LuxFatumSetup
{
    private const string AppVersion = "v5.0.0";
    private const string AppTitle = "LuxFatum Setup";
    private static readonly byte[] Magic = Encoding.ASCII.GetBytes("LUXFATUMSETUP001");

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            string exePath = Application.ExecutablePath;
            byte[] self = File.ReadAllBytes(exePath);
            PayloadInfo payload = ReadPayloadInfo(self);
            if (payload == null)
            {
                MessageBox.Show("Installer payload is missing. Please download the latest LuxFatum setup again.", AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LuxFatum");
            Directory.CreateDirectory(installDir);
            ExtractStoredZip(self, payload.ZipOffset, payload.ZipLength, installDir);

            if (payload.WebViewLength > 0)
            {
                string webViewDir = Path.Combine(installDir, "installer");
                Directory.CreateDirectory(webViewDir);
                File.WriteAllBytes(Path.Combine(webViewDir, "MicrosoftEdgeWebView2Setup.exe"), Slice(self, payload.WebViewOffset, payload.WebViewLength));
            }

            CreateDesktopShortcut(installDir);
            MessageBox.Show("LuxFatum " + AppVersion + " installed successfully.", AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);

            string app = Path.Combine(installDir, "LuxFatum.exe");
            if (File.Exists(app) && !HasArg(args, "--no-launch"))
            {
                Process.Start(new ProcessStartInfo(app) { WorkingDirectory = installDir, UseShellExecute = true });
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("LuxFatum " + AppVersion + " installation failed.\n\n" + ex.Message, AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static bool HasArg(string[] args, string value)
    {
        foreach (string arg in args)
        {
            if (string.Equals(arg, value, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static PayloadInfo ReadPayloadInfo(byte[] self)
    {
        int tail = self.Length - Magic.Length;
        if (tail < 16) return null;
        for (int i = 0; i < Magic.Length; i += 1)
        {
            if (self[tail + i] != Magic[i]) return null;
        }

        int lengthsOffset = tail - 16;
        long zipLength = BitConverter.ToInt64(self, lengthsOffset);
        long webViewLength = BitConverter.ToInt64(self, lengthsOffset + 8);
        long zipOffset = lengthsOffset - webViewLength - zipLength;
        long webViewOffset = zipOffset + zipLength;
        if (zipLength <= 0 || webViewLength < 0 || zipOffset <= 0 || webViewOffset < zipOffset) return null;
        return new PayloadInfo((int)zipOffset, (int)zipLength, (int)webViewOffset, (int)webViewLength);
    }

    private static void ExtractStoredZip(byte[] source, int offset, int length, string destination)
    {
        int cursor = offset;
        int end = offset + length;
        while (cursor + 30 <= end && ReadUInt32(source, cursor) == 0x04034b50)
        {
            ushort method = ReadUInt16(source, cursor + 8);
            uint compressedSize = ReadUInt32(source, cursor + 18);
            uint uncompressedSize = ReadUInt32(source, cursor + 22);
            ushort nameLength = ReadUInt16(source, cursor + 26);
            ushort extraLength = ReadUInt16(source, cursor + 28);
            int nameOffset = cursor + 30;
            int dataOffset = nameOffset + nameLength + extraLength;
            if (nameOffset + nameLength > end || dataOffset + compressedSize > end) throw new InvalidDataException("Invalid installer package.");
            if (method != 0 || compressedSize != uncompressedSize) throw new InvalidDataException("Unsupported installer package compression.");

            string name = Encoding.UTF8.GetString(source, nameOffset, nameLength).Replace('/', Path.DirectorySeparatorChar);
            if (!string.IsNullOrWhiteSpace(name) && !name.EndsWith(Path.DirectorySeparatorChar.ToString()))
            {
                string full = SafePath(destination, name);
                Directory.CreateDirectory(Path.GetDirectoryName(full));
                File.WriteAllBytes(full, Slice(source, dataOffset, (int)compressedSize));
            }

            cursor = dataOffset + (int)compressedSize;
        }
    }

    private static string SafePath(string root, string relative)
    {
        string full = Path.GetFullPath(Path.Combine(root, relative));
        string prefix = root.EndsWith(Path.DirectorySeparatorChar.ToString()) ? root : root + Path.DirectorySeparatorChar;
        if (!full.Equals(root, StringComparison.OrdinalIgnoreCase) && !full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("Invalid package path.");
        }
        return full;
    }

    private static byte[] Slice(byte[] source, int offset, int count)
    {
        byte[] output = new byte[count];
        Buffer.BlockCopy(source, offset, output, 0, count);
        return output;
    }

    private static ushort ReadUInt16(byte[] source, int offset)
    {
        return BitConverter.ToUInt16(source, offset);
    }

    private static uint ReadUInt32(byte[] source, int offset)
    {
        return BitConverter.ToUInt32(source, offset);
    }

    private static void CreateDesktopShortcut(string installDir)
    {
        try
        {
            string app = Path.Combine(installDir, "LuxFatum.exe");
            if (!File.Exists(app)) return;
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string shortcutPath = Path.Combine(desktop, "LuxFatum.lnk");
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { app });
            shortcutType.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { installDir });
            shortcutType.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { app + ",0" });
            shortcutType.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, shortcut, null);
        }
        catch
        {
            // Shortcut creation is a convenience; installation itself is complete without it.
        }
    }

    private sealed class PayloadInfo
    {
        public readonly int ZipOffset;
        public readonly int ZipLength;
        public readonly int WebViewOffset;
        public readonly int WebViewLength;

        public PayloadInfo(int zipOffset, int zipLength, int webViewOffset, int webViewLength)
        {
            ZipOffset = zipOffset;
            ZipLength = zipLength;
            WebViewOffset = webViewOffset;
            WebViewLength = webViewLength;
        }
    }
}
