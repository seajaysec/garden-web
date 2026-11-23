#!/usr/bin/env python3
"""Serve out/web on 127.0.0.1 on a free port (the last one used when it is free), and print its address."""
import functools, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

root = Path(sys.argv[1]).resolve()
kept = Path(__file__).resolve().parent.parent / ".build" / "web-port"


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = functools.partial(Quiet, directory=str(root))
wanted = []
try:
    wanted.append(int(kept.read_text()))
except (OSError, ValueError):
    pass
for port in wanted + [0]:
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
        break
    except OSError:
        continue
kept.parent.mkdir(exist_ok=True)
kept.write_text(str(server.server_address[1]))
print("http://127.0.0.1:%d/" % server.server_address[1], flush=True)
server.serve_forever()
