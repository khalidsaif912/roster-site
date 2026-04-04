from pathlib import Path

HEAD_INJECT = """
<link rel="manifest" href="/roster-site/docs/manifest.json">
<meta name="theme-color" content="#1a1208">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
"""

BODY_INJECT = """
<script src="/roster-site/docs/install-pwa.js"></script>
<script src="/roster-site/docs/banner-changer.js"></script>
"""

def patch_html_file(path: Path):
    html = path.read_text(encoding="utf-8")
    if 'rel="manifest"' not in html and "</head>" in html:
        html = html.replace("</head>", HEAD_INJECT + "\n</head>")
    if 'install-pwa.js' not in html and "</body>" in html:
        html = html.replace("</body>", BODY_INJECT + "\n</body>")
    path.write_text(html, encoding="utf-8")
    print(f"Patched: {path}")

def main():
    docs = Path("docs")
    for path in docs.rglob("*.html"):
        patch_html_file(path)

if __name__ == "__main__":
    main()
