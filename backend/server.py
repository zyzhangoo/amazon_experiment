import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import unquote, urlparse

try:
    # Official Supabase Python client.
    from supabase import create_client, Client  # type: ignore
except Exception:  # pragma: no cover
    create_client = None
    Client = None


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))

_SUPABASE: Optional["Client"] = None


def _get_supabase() -> Optional["Client"]:
    global _SUPABASE
    if _SUPABASE is not None:
        return _SUPABASE

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_KEY", "").strip()
    if not url or not key:
        _SUPABASE = None
        return None

    if create_client is None:
        print("Supabase client not available. Install 'supabase' and retry.")
        _SUPABASE = None
        return None

    try:
        _SUPABASE = create_client(url, key)
    except Exception as e:
        print(f"Supabase init failed: {e}")
        _SUPABASE = None
    return _SUPABASE


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

        # Store in Supabase (best-effort; frontend always gets success).
        try:
            sb = _get_supabase()
            if sb is None:
                raise RuntimeError("Supabase not configured (missing SUPABASE_URL/SUPABASE_KEY).")

            sb.table("events").insert(
                {
                    "user_id": event_obj["userId"],
                    "session_id": event_obj.get("sessionId") or "",
                    "event_type": event_obj["eventType"],
                    "data": event_obj.get("data") or {},
                    "timestamp": event_obj["timestamp"],
                    "page": event_obj.get("page") or "",
                    "ip": event_obj.get("ip") or "",
                }
            ).execute()
        except Exception as e:
            print(f"Supabase insert failed: {e}")

        self.send_response(200)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/export-logs":
            # Optional: export recent events as NDJSON from Supabase.
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="logs.jsonl"')
            self.end_headers()
            try:
                sb = _get_supabase()
                if sb is None:
                    self.wfile.write(b"")
                    return
                res = (
                    sb.table("events")
                    .select("user_id,session_id,event_type,data,timestamp,page,ip")
                    .order("id", desc=False)
                    .limit(5000)
                    .execute()
                )
                rows = getattr(res, "data", None) or []
                for r in rows:
                    line = json.dumps(
                        {
                            "userId": r.get("user_id", "anonymous"),
                            "sessionId": r.get("session_id", ""),
                            "eventType": r.get("event_type", ""),
                            "data": r.get("data") if isinstance(r.get("data"), dict) else {},
                            "timestamp": r.get("timestamp"),
                            "page": r.get("page") or "",
                            "ip": r.get("ip") or "",
                        },
                        ensure_ascii=False,
                    )
                    self.wfile.write((line + "\n").encode("utf-8"))
            except Exception as e:
                print(f"Supabase export failed: {e}")
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
    host = "0.0.0.0"

    httpd = HTTPServer((host, port), Handler)
    print(f"AmazoLab Experiment server running at http://{host}:{port}/")
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_KEY"):
        print("Logging to: Supabase table events")
    else:
        print("Logging to: (disabled) set SUPABASE_URL + SUPABASE_KEY")
    httpd.serve_forever()


if __name__ == "__main__":
    main()

