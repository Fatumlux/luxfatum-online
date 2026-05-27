using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class LuxFatumLauncher
{
    private const string OnlineUrl = "https://luxfatum-online.onrender.com";

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string logDir = Path.Combine(appDir, "runtime_logs");
        Directory.CreateDirectory(logDir);
        Process server = null;

        try
        {
            if (HasArg(args, "--web"))
            {
                Process.Start(new ProcessStartInfo(OnlineUrl) { UseShellExecute = true });
                return;
            }

            string url;
            if (HasArg(args, "--local-server"))
            {
                url = StartLocalServer(appDir, logDir, out server);
                if (url == null) return;
            }
            else
            {
                string index = Path.Combine(appDir, "index.html");
                if (!File.Exists(index))
                {
                    MessageBox.Show("LuxFatum desktop package is incomplete. Missing index.html.", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                url = new Uri(index).AbsoluteUri;
            }

            using (GameForm form = new GameForm(url, appDir, server))
            {
                Application.Run(form);
            }
        }
        catch (Exception ex)
        {
            TryKill(server);
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

    private static string StartLocalServer(string appDir, string logDir, out Process server)
    {
        server = null;
        string serverJs = Path.Combine(appDir, "server.js");
        if (!File.Exists(serverJs))
        {
            MessageBox.Show("LuxFatum desktop package is incomplete. Missing server.js.", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return null;
        }

        string node = FindNode(appDir);
        if (node == null)
        {
            MessageBox.Show("LuxFatum local-server mode needs runtime/node.exe or Node.js.", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return null;
        }

        int port = GetFreePort();
        string localUrl = "http://127.0.0.1:" + port;
        server = StartServer(node, appDir, logDir, port);
        if (server == null || !WaitForServer(localUrl))
        {
            TryKill(server);
            MessageBox.Show("LuxFatum local game runtime failed to start. Check runtime_logs for details.", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return null;
        }
        return localUrl;
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

    private static int GetFreePort()
    {
        TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static Process StartServer(string node, string appDir, string logDir, int port)
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
        psi.EnvironmentVariables["PORT"] = port.ToString();
        psi.EnvironmentVariables["LUXFATUM_API_BASE"] = OnlineUrl;
        psi.EnvironmentVariables["LUXFATUM_DESKTOP"] = "1";

        Process p = Process.Start(psi);
        if (p == null) return null;
        p.OutputDataReceived += (sender, args) => { if (args.Data != null) File.AppendAllText(stdout, args.Data + Environment.NewLine); };
        p.ErrorDataReceived += (sender, args) => { if (args.Data != null) File.AppendAllText(stderr, args.Data + Environment.NewLine); };
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return p;
    }

    private static bool WaitForServer(string localUrl)
    {
        for (int i = 0; i < 60; i += 1)
        {
            if (IsUrlReady(localUrl + "/api/health")) return true;
            Thread.Sleep(250);
        }
        return false;
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

    private static void TryKill(Process process)
    {
        try
        {
            if (process != null && !process.HasExited) process.Kill();
        }
        catch { }
    }

    private sealed class GameForm : Form
    {
        private readonly string url;
        private readonly string appDir;
        private readonly Process server;
        private readonly WebView2 webView;
        private bool fullscreen;
        private FormBorderStyle savedBorder;
        private FormWindowState savedState;
        private Rectangle savedBounds;

        public GameForm(string url, string appDir, Process server)
        {
            this.url = url;
            this.appDir = appDir;
            this.server = server;
            Text = "LuxFatum";
            BackColor = Color.FromArgb(8, 9, 12);
            ClientSize = new Size(1366, 820);
            MinimumSize = new Size(980, 620);
            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;

            webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(8, 9, 12)
            };
            Controls.Add(webView);

            Load += async (sender, args) => await InitWebView();
            FormClosed += (sender, args) => TryKill(server);
            KeyDown += (sender, args) =>
            {
                if (args.KeyCode == Keys.F11)
                {
                    ToggleFullscreen();
                    args.Handled = true;
                }
            };
        }

        private async Task InitWebView()
        {
            try
            {
                string userData = Path.Combine(appDir, "runtime", "webview2-user-data");
                Directory.CreateDirectory(userData);
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userData);
                await webView.EnsureCoreWebView2Async(env);

                webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
                webView.CoreWebView2.NewWindowRequested += (sender, args) =>
                {
                    args.Handled = true;
                    webView.CoreWebView2.Navigate(args.Uri);
                };
                webView.CoreWebView2.Navigate(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Microsoft Edge WebView2 Runtime is required to run LuxFatum as a desktop app.\n\n" + ex.Message, "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        private void ToggleFullscreen()
        {
            if (!fullscreen)
            {
                savedBorder = FormBorderStyle;
                savedState = WindowState;
                savedBounds = Bounds;
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Maximized;
                fullscreen = true;
                return;
            }

            FormBorderStyle = savedBorder;
            WindowState = savedState;
            Bounds = savedBounds;
            fullscreen = false;
        }
    }
}
