"""Local dev server that never lets the browser cache files.

Python's built-in server sends no cache headers, so browsers keep running old
copies of the JavaScript modules after you edit them. This one marks every
response no-store.

    python tools/serve.py          # http://127.0.0.1:8123
    python tools/serve.py 9000     # another port
"""

import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f"Serving {ROOT} at http://127.0.0.1:{port}")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()


if __name__ == "__main__":
    main()
