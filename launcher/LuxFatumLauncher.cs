using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
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
        LocalStaticServer staticServer = null;

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
                string webRoot = FindWebRoot(appDir);
                if (webRoot == null)
                {
                    MessageBox.Show("LuxFatum desktop package is incomplete. Missing web-build\\index.html.", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                int port = GetFreePort();
                staticServer = new LocalStaticServer(webRoot, port, logDir);
                staticServer.Start();
                url = "http://127.0.0.1:" + port + "/?desktop=1";
                if (!WaitForUrl(url))
                {
                    staticServer.Dispose();
                    MessageBox.Show("LuxFatum desktop runtime failed to start. Check runtime_logs for details.", "LuxFatum", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
            }

            using (GameForm form = new GameForm(url, appDir, server, staticServer))
            {
                staticServer = null;
                Application.Run(form);
            }
        }
        catch (Exception ex)
        {
            TryKill(server);
            if (staticServer != null) staticServer.Dispose();
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

    private static string FindWebRoot(string appDir)
    {
        string builtIndex = Path.Combine(appDir, "web-build", "index.html");
        if (File.Exists(builtIndex)) return Path.Combine(appDir, "web-build");

        string rootIndex = Path.Combine(appDir, "index.html");
        if (File.Exists(rootIndex)) return appDir;

        return null;
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

    private static bool WaitForUrl(string localUrl)
    {
        for (int i = 0; i < 60; i += 1)
        {
            if (IsUrlReady(localUrl)) return true;
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
        private readonly IDisposable staticServer;
        private readonly WebView2 webView;
        private readonly Icon appIcon;
        private bool fullscreen;
        private FormBorderStyle savedBorder;
        private FormWindowState savedState;
        private Rectangle savedBounds;

        public GameForm(string url, string appDir, Process server, IDisposable staticServer)
        {
            this.url = url;
            this.appDir = appDir;
            this.server = server;
            this.staticServer = staticServer;
            Text = "LuxFatum";
            BackColor = Color.FromArgb(8, 9, 12);
            ClientSize = new Size(1366, 820);
            MinimumSize = new Size(980, 620);
            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;
            appIcon = LoadAppIcon(appDir);
            if (appIcon != null) Icon = appIcon;

            webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(8, 9, 12)
            };
            Controls.Add(webView);

            Load += async (sender, args) => await InitWebView();
            FormClosed += (sender, args) =>
            {
                TryKill(server);
                if (staticServer != null) staticServer.Dispose();
            };
            KeyDown += (sender, args) =>
            {
                if (args.KeyCode == Keys.F11)
                {
                    ToggleFullscreen();
                    args.Handled = true;
                }
            };
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                if (appIcon != null) appIcon.Dispose();
                if (staticServer != null) staticServer.Dispose();
            }
            base.Dispose(disposing);
        }

        private static Icon LoadAppIcon(string appDir)
        {
            string[] candidates =
            {
                Path.Combine(appDir, "assets", "ui", "luxfatum-app.ico"),
                Path.Combine(appDir, "public", "assets", "ui", "luxfatum-app.ico"),
                Path.Combine(appDir, "web-build", "assets", "ui", "luxfatum-app.ico")
            };
            foreach (string candidate in candidates)
            {
                try
                {
                    if (File.Exists(candidate)) return new Icon(candidate);
                }
                catch { }
            }
            return null;
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

    private sealed class LocalStaticServer : IDisposable
    {
        private readonly string webRoot;
        private readonly string logDir;
        private readonly int port;
        private TcpListener listener;
        private Thread thread;
        private volatile bool running;

        public LocalStaticServer(string webRoot, int port, string logDir)
        {
            this.webRoot = Path.GetFullPath(webRoot);
            this.port = port;
            this.logDir = logDir;
        }

        public void Start()
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            running = true;
            thread = new Thread(ListenLoop);
            thread.IsBackground = true;
            thread.Start();
        }

        private void ListenLoop()
        {
            while (running)
            {
                try
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(state => HandleClient((TcpClient)state), client);
                }
                catch (Exception ex)
                {
                    if (running) Log(ex);
                }
            }
        }

        private void HandleClient(TcpClient client)
        {
            using (client)
            {
                try
                {
                    NetworkStream stream = client.GetStream();
                    StreamReader reader = new StreamReader(stream, Encoding.ASCII);
                    string requestLine = reader.ReadLine();
                    if (string.IsNullOrEmpty(requestLine)) return;

                    string line;
                    while (!string.IsNullOrEmpty(line = reader.ReadLine())) { }

                    string[] parts = requestLine.Split(' ');
                    if (parts.Length < 2 || parts[0] != "GET")
                    {
                        WriteText(stream, 405, "Method Not Allowed", "Method not allowed.");
                        return;
                    }

                    string filePath = ResolvePath(parts[1]);
                    if (filePath == null || !File.Exists(filePath))
                    {
                        WriteText(stream, 404, "Not Found", "Not found.");
                        return;
                    }

                    byte[] data = File.ReadAllBytes(filePath);
                    string header = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: " + MimeFor(filePath) + "\r\n" +
                        "Content-Length: " + data.Length + "\r\n" +
                        "Cache-Control: no-store\r\n" +
                        "Connection: close\r\n\r\n";
                    byte[] headerBytes = Encoding.ASCII.GetBytes(header);
                    stream.Write(headerBytes, 0, headerBytes.Length);
                    stream.Write(data, 0, data.Length);
                }
                catch (Exception ex)
                {
                    Log(ex);
                }
            }
        }

        private string ResolvePath(string rawUrl)
        {
            string pathOnly = rawUrl.Split('?')[0].Trim();
            if (pathOnly == "/" || pathOnly.Length == 0) pathOnly = "/index.html";
            pathOnly = Uri.UnescapeDataString(pathOnly).TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            string full = Path.GetFullPath(Path.Combine(webRoot, pathOnly));
            string rootPrefix = webRoot.EndsWith(Path.DirectorySeparatorChar.ToString()) ? webRoot : webRoot + Path.DirectorySeparatorChar;
            if (!full.Equals(webRoot, StringComparison.OrdinalIgnoreCase) && !full.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)) return null;
            return full;
        }

        private static string MimeFor(string file)
        {
            string ext = Path.GetExtension(file).ToLowerInvariant();
            if (ext == ".html") return "text/html; charset=utf-8";
            if (ext == ".js" || ext == ".mjs") return "text/javascript; charset=utf-8";
            if (ext == ".css") return "text/css; charset=utf-8";
            if (ext == ".json") return "application/json; charset=utf-8";
            if (ext == ".png") return "image/png";
            if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
            if (ext == ".ico") return "image/x-icon";
            if (ext == ".svg") return "image/svg+xml";
            if (ext == ".mp3") return "audio/mpeg";
            if (ext == ".woff2") return "font/woff2";
            return "application/octet-stream";
        }

        private static void WriteText(NetworkStream stream, int code, string status, string text)
        {
            byte[] data = Encoding.UTF8.GetBytes(text);
            string header = "HTTP/1.1 " + code + " " + status + "\r\n" +
                "Content-Type: text/plain; charset=utf-8\r\n" +
                "Content-Length: " + data.Length + "\r\n" +
                "Connection: close\r\n\r\n";
            byte[] headerBytes = Encoding.ASCII.GetBytes(header);
            stream.Write(headerBytes, 0, headerBytes.Length);
            stream.Write(data, 0, data.Length);
        }

        private void Log(Exception ex)
        {
            try
            {
                File.AppendAllText(Path.Combine(logDir, "static-server.log"), DateTime.Now + " " + ex + Environment.NewLine);
            }
            catch { }
        }

        public void Dispose()
        {
            running = false;
            try
            {
                if (listener != null) listener.Stop();
            }
            catch { }
        }
    }
}
