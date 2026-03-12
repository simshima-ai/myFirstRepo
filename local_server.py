import json
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(ROOT_DIR, "debug_console.log")


class SCadHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def do_POST(self):
        if self.path != "/__debuglog":
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except Exception:
            length = 0
        data = self.rfile.read(max(0, length))
        text = data.decode("utf-8", errors="replace")
        with open(LOG_PATH, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/__debuglog_status":
            exists = os.path.exists(LOG_PATH)
            size = os.path.getsize(LOG_PATH) if exists else 0
            payload = {
                "ok": True,
                "log_path": LOG_PATH,
                "exists": exists,
                "size": size,
            }
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/__debuglog":
            if not os.path.exists(LOG_PATH):
                self.send_response(404)
                self.end_headers()
                return
            with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            body = text.encode("utf-8", errors="replace")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def end_headers(self):
        # Disable cache only for debug-log API responses.
        if self.path.startswith("/__debuglog"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), SCadHandler)
    print(f"S-CAD local server running at http://localhost:{port}/index.html")
    print(f"Debug log path: {LOG_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
