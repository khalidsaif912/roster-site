#!/usr/bin/env python3
"""Write static HTML that redirects legacy roster-site Pages URLs to new/docs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

CANONICAL_DOCS_BASE = "https://khalidsaif912.github.io/new/docs/"
LEGACY_PREFIX = "/roster-site/"


def redirect_html(title: str = "جاري التحويل…") -> str:
    canonical = json.dumps(CANONICAL_DOCS_BASE)
    legacy = json.dumps(LEGACY_PREFIX)
    return f"""<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="canonical" href="{CANONICAL_DOCS_BASE}">
  <meta http-equiv="refresh" content="0; url={CANONICAL_DOCS_BASE}">
  <script>
  (function () {{
    var canonicalBase = {canonical};
    var legacyPrefix = {legacy};
    var path = location.pathname || "";
    var rest = "";
    var idx = path.indexOf(legacyPrefix);
    if (idx >= 0) {{
      rest = path.slice(idx + legacyPrefix.length);
    }} else if (/\/roster-site\/?$/.test(path)) {{
      rest = "";
    }} else {{
      rest = path.replace(/^\\//, "");
    }}
    rest = rest.replace(/^\\//, "");
    if (rest === "index.html") rest = "";
    var target = canonicalBase + rest;
    if (rest && !/\\.[a-z0-9]+$/i.test(rest) && target.charAt(target.length - 1) !== "/") {{
      target += "/";
    }}
    location.replace(target + location.search + location.hash);
  }})();
  </script>
</head>
<body>
  <p style="font-family:system-ui,sans-serif;text-align:center;margin-top:2rem">
    جاري التحويل إلى <a href="{CANONICAL_DOCS_BASE}">الموقع الحالي</a>…
  </p>
</body>
</html>
"""


EXPORT_SKIP_TOP_LEVEL = {
    "import",
    "QuickList",
    "calculator",
    "assets",
    "a-cup-of-book",
}


def collect_export_targets(root: Path) -> list[Path]:
    targets = {
        root / "index.html",
        root / "now" / "index.html",
        root / "404.html",
        root / "my-schedules" / "index.html",
        root / "training" / "index.html",
        root / "roster-diff" / "index.html",
        root / "subscribe" / "index.html",
    }
    if root.is_dir():
        for page in root.rglob("index.html"):
            rel = page.relative_to(root)
            if not rel.parts or rel.parts[0] in EXPORT_SKIP_TOP_LEVEL:
                continue
            targets.add(page)
    return sorted(targets)


def collect_import_targets(root: Path) -> list[Path]:
    import_root = root / "import"
    targets = {
        import_root / "index.html",
        import_root / "now" / "index.html",
        import_root / "fallback" / "index.html",
    }
    if import_root.is_dir():
        for page in import_root.rglob("index.html"):
            targets.add(page)
    return sorted(targets)


def write_paths(paths: list[Path], title: str = "جاري التحويل…") -> int:
    html = redirect_html(title=title)
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding="utf-8")
        print(f"wrote {path.as_posix()}")
    return len(paths)


def main() -> int:
    mode = (sys.argv[1] if len(sys.argv) > 1 else "export").lower().strip()
    root = Path("docs")
    if not root.is_dir():
        print(f"::error::docs folder not found: {root.resolve()}", file=sys.stderr)
        return 1

    if mode in {"export", "export-all", "all"}:
        count = write_paths(collect_export_targets(root), title="Export Duty Roster")
        print(f"export redirects: {count}")
    if mode in {"import", "all"}:
        count = write_paths(collect_import_targets(root), title="Import Duty Roster")
        print(f"import redirects: {count}")
    if mode not in {"export", "export-all", "import", "all"}:
        print(
            "Usage: write_public_redirect_landing.py [export|export-all|import|all]",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
