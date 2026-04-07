import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import unquote, urlparse


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))
LOGS_PATH = os.path.join(BACKEND_DIR, "logs.jsonl")


def _append_log_line(event_obj):
    os.makedirs(BACKEND_DIR, exist_ok=True)
    line = json.dumps(event_obj, ensure_ascii=False)
    with open(LOGS_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _normalize_timestamp_iso(event: dict) -> Optional[str]:
    """Return ISO-8601 string or None if no usable timestamp in payload."""
    ts = event.get("timestamp")
    ts_ms = event.get("timestampMs")
    if isinstance(ts, str) and ts.strip():
        return ts.strip()
    if isinstance(ts, (int, float)):
        sec = float(ts) / 1000.0 if float(ts) > 1e12 else float(ts)
        try:
            return datetime.fromtimestamp(sec, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        except (OSError, OverflowError, ValueError):
            pass
    if isinstance(ts_ms, (int, float)):
        try:
            return datetime.fromtimestamp(float(ts_ms) / 1000.0, tz=timezone.utc).isoformat().replace(
                "+00:00", "Z"
            )
        except (OSError, OverflowError, ValueError):
            pass
    return None


def _get_client_ip(handler: BaseHTTPRequestHandler) -> str:
    # If behind a proxy, Prolific / hosting may set X-Forwarded-For.
    xff = handler.headers.get("X-Forwarded-For")
    if xff:
        # first hop is original client
        return xff.split(",")[0].strip()
    # Fall back to socket peer addr
    try:
        return handler.client_address[0]
    except Exception:
        return ""


class Handler(BaseHTTPRequestHandler):
    server_version = "AmazoLabExperiment/1.0"

    def _set_cors_headers(self):
        # Same-origin is preferred, but CORS makes it more tolerant for different launch styles.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/track":
            self.send_response(404)
            self._set_cors_headers()
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else b""

        try:
            event = json.loads(body.decode("utf-8") or "{}")
        except Exception:
            self.send_response(400)
            self._set_cors_headers()
            self.end_headers()
            return

        # Accept both new and legacy payloads.
        # New: { userId, sessionId, eventType, data, timestamp, page, ... }
        # Legacy: { type, data, timestamp }
        raw_type = event.get("eventType") or event.get("type")
        event_type = str(raw_type).strip() if raw_type is not None else ""
        raw_data = event.get("data")
        event_data = raw_data if isinstance(raw_data, dict) else {}
        timestamp_iso = _normalize_timestamp_iso(event)
        if not event_type or timestamp_iso is None:
            self.send_response(400)
            self._set_cors_headers()
            self.end_headers()
            return

        raw_uid = event.get("userId")
        user_id = str(raw_uid).strip() if raw_uid is not None and str(raw_uid).strip() else "anonymous"
        raw_sid = event.get("sessionId")
        session_id = "" if raw_sid is None else str(raw_sid)

        event_obj = {
            "userId": user_id,
            "sessionId": session_id,
            "eventType": event_type,
            "data": event_data,
            "timestamp": timestamp_iso,
            "page": str(event.get("page") or ""),
            "ip": _get_client_ip(self),
        }

        try:
            _append_log_line(event_obj)
        except Exception:
            # Still respond 200 to avoid breaking user flows.
            pass

        self.send_response(200)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/export-logs":
            # Download newline-delimited JSON (JSONL)
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="logs.jsonl"')
            self.end_headers()
            try:
                if os.path.exists(LOGS_PATH):
                    with open(LOGS_PATH, "rb") as f:
                        self.wfile.write(f.read())
                else:
                    self.wfile.write(b"")
            except Exception:
                # If something goes wrong, still return a valid response.
                pass
            return

        if path == "/":
            path = "/index.html"

        # Prevent directory traversal.
        clean = path.lstrip("/").replace("..", "")
        file_path = os.path.join(PROJECT_ROOT, clean)

        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_response(404)
            self._set_cors_headers()
            self.end_headers()
            return

        # Basic content types.
        if file_path.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        elif file_path.endswith(".css"):
            content_type = "text/css; charset=utf-8"
        elif file_path.endswith(".js"):
            content_type = "application/javascript; charset=utf-8"
        elif file_path.endswith(".json"):
            content_type = "application/json; charset=utf-8"
        elif file_path.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
            content_type = "image/*"
        else:
            content_type = "application/octet-stream"

        with open(file_path, "rb") as f:
            data = f.read()

        self.send_response(200)
        self._set_cors_headers()
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")

    httpd = HTTPServer((host, port), Handler)
    print(f"AmazoLab Experiment server running at http://{host}:{port}/")
    print(f"Logging to: {LOGS_PATH}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()

