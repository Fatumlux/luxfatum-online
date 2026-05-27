using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class LuxFatumLauncher
{
    private const int Port = 8787;
    private const string LocalUrl = "http://localhost:8787";
    private const string OnlineUrl = "https://luxfatum-online.onrender.com";

    [STAThread]
    private static void Main(string[] args)
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string serverJs = Path.Combine(appDir, "server.js");
        string logDir = Path.Combine(appDir, "runtime_logs");
        Directory.CreateDirectory(logDir);

        try
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            if (!HasArg(args, "--local"))
            {
                Process.Start(new ProcessStartInfo(OnlineUrl) { UseShellExecute = true });
                return;
            }

            if (!File.Exists(serverJs))
            {
                MessageBox.Show("線上伺服器暫時連不上，也找不到離線版 server.js。\n請確認網路連線，或重新下載完整遊戲包。", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!IsServerReady())
            {
                string node = FindNode(appDir);
                if (node == null)
                {
                    MessageBox.Show("找不到 Node.js，無法啟動本機版。\n\n請安裝 Node.js，或使用線上 Render 版本遊玩。", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                StartServer(node, appDir, logDir);
                if (!WaitForServer())
                {
                    MessageBox.Show("線上伺服器暫時連不上，離線本機伺服器也啟動失敗。\n請查看 runtime_logs 資料夾內的 launcher/server log。", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
            }

            Process.Start(new ProcessStartInfo(LocalUrl) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            File.AppendAllText(Path.Combine(logDir, "launcher.log"), DateTime.Now + " " + ex + Environment.NewLine);
            MessageBox.Show(ex.Message, "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Error);
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

    private static string FindNode(string appDir)
    {
        string bundled = Path.Combine(appDir, "runtime", "node.exe");
        if (File.Exists(bundled)) return bundled;

        string common = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(common)) return common;

        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(Path.PathSeparator))
        {
            try
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                string candidate = Path.Combine(dir.Trim(), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }
        return null;
    }

    private static void StartServer(string node, string appDir, string logDir)
    {
        string stdout = Path.Combine(logDir, "server-launcher-out.log");
        string stderr = Path.Combine(logDir, "server-launcher-err.log");
        ProcessStartInfo psi = new ProcessStartInfo(node, "server.js")
        {
            WorkingDirectory = appDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        Process p = Process.Start(psi);
        if (p == null) return;
        p.OutputDataReceived += (sender, args) => { if (args.Data != null) File.AppendAllText(stdout, args.Data + Environment.NewLine); };
        p.ErrorDataReceived += (sender, args) => { if (args.Data != null) File.AppendAllText(stderr, args.Data + Environment.NewLine); };
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
    }

    private static bool WaitForServer()
    {
        for (int i = 0; i < 40; i += 1)
        {
            if (IsServerReady()) return true;
            Thread.Sleep(250);
        }
        return false;
    }

    private static bool IsServerReady()
    {
        return IsUrlReady(LocalUrl + "/api/health") || IsUrlReady(LocalUrl);
    }

    private static bool IsUrlReady(string url)
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = 2500;
            req.Method = "GET";
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
            {
                return (int)res.StatusCode >= 200 && (int)res.StatusCode < 500;
            }
        }
        catch
        {
            return false;
        }
    }
}
