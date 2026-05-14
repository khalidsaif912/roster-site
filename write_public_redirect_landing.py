#!/usr/bin/env python3
"""Write static HTML that redirects GitHub Pages visitors to the new site."""

from __future__ import annotations

import json
import sys
from pathlib import Path

NEW_URL = "https://khalidsaif912.github.io/new/"


def redirect_html() -> str:
    js_url = json.dumps(NEW_URL)
    return f"""<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>جاري التحويل…</title>
  <meta http-equiv="refresh" content="0; url={NEW_URL}">
  <link rel="canonical" href="{NEW_URL}">
  <script>window.location.replace({js_url});</script>
</head>
<body>
  <p style="font-family:system-ui,sans-serif;text-align:center;margin-top:2rem">
    جاري التحويل إلى <a href="{NEW_URL}">الموقع الجديد</a>…
  </p>
</body>
</html>
"""


def write_paths(paths: list[Path]) -> None:
    html = redirect_html()
    for p in paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(html, encoding="utf-8")
        print("wrote", p.as_posix())


def main() -> None:
    mode = (sys.argv[1] if len(sys.argv) > 1 else "export").lower().strip()
    root = Path("docs")

    if mode == "export":
        write_paths(
            [
                root / "index.html",
                root / "now" / "index.html",
                root / "404.html",
            ]
        )
    elif mode == "import":
        write_paths(
            [
                root / "import" / "index.html",
                root / "import" / "now" / "index.html",
            ]
        )
    else:
        print("Usage: write_public_redirect_landing.py [export|import]", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
