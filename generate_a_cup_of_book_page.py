#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
from pathlib import Path

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


def discover_images(images_dir: Path) -> list[Path]:
    if not images_dir.exists():
        return []
    files = [p for p in images_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    return sorted(files, key=lambda p: p.name.lower())


def label_from_filename(path: Path, index: int) -> str:
    stem = path.stem.replace("_", " ").replace("-", " ").strip()
    if not stem:
        return f"Topic {index}"
    words = [w for w in stem.split() if w]
    return " ".join(words).title()


def build_html(
    title: str,
    image_labels: list[tuple[str, str]],
    cup_icon_url: str | None,
    training_url: str,
    roster_url: str,
    import_url: str,
) -> str:
    topic_buttons: list[str] = []
    topic_slides: list[str] = []

    for i, (src, label) in enumerate(image_labels, start=1):
        key = f"topic-{i}"
        active = " active" if i == 1 else ""
        topic_buttons.append(
            f'<button class="topicBtn{active}" data-target="{key}">{html.escape(label)}</button>'
        )
        topic_slides.append(
            (
                f'<div class="slide{active}" id="{key}">\n'
                f'  <div class="figure"><img src="{html.escape(src)}" alt="{html.escape(label)}"></div>\n'
                f'</div>'
            )
        )

    first_label = image_labels[0][1] if image_labels else "Topic"
    first_sub = "Select a topic button to switch between images." if image_labels else "No images found yet."

    hero_icon = (
        f'<img src="{html.escape(cup_icon_url)}" alt="Cup icon">'
        if cup_icon_url
        else '<div class="cupEmoji">☕</div>'
    )

    buttons_html = "\n      ".join(topic_buttons) or '<div class="emptyTopics">No topics found.</div>'
    slides_html = "\n      ".join(topic_slides) or (
        '<div class="slide active"><div class="emptyPanel">No images found in the folder.</div></div>'
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{html.escape(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&family=Sora:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg:#eef3fb;
      --panel:#fff;
      --text:#18243a;
      --muted:#6d7b97;
      --line:rgba(17,24,39,.08);
      --blue:#2d5cef;
      --blue2:#1d4fe0;
      --header:linear-gradient(135deg,#1438ad 0%,#2358e8 52%,#0d72c4 100%);
      --shadow:rgba(25,65,155,.12);
    }}
    * {{ box-sizing:border-box; margin:0; padding:0; }}
    body {{
      font-family:'DM Sans',Arial,sans-serif;
      background:
        radial-gradient(circle at top right,rgba(45,92,239,.08),transparent 22%),
        linear-gradient(180deg,#f4f8ff 0%,var(--bg) 100%);
      color:var(--text);
      min-height:100vh;
    }}
    .wrap {{
      max-width:900px;
      margin:0 auto;
      padding:18px 14px 40px;
    }}
    .banner {{
      position:relative;
      overflow:hidden;
      border-radius:26px;
      padding:26px 22px 18px;
      background:var(--header);
      box-shadow:0 18px 48px var(--shadow);
    }}
    .banner::before {{
      content:"";
      position:absolute;
      inset:0;
      pointer-events:none;
      background:
        radial-gradient(circle at 84% 18%,rgba(255,255,255,.18) 0%,transparent 34%),
        radial-gradient(circle at 14% 90%,rgba(255,255,255,.10) 0%,transparent 28%);
    }}
    .bubble {{
      position:absolute;
      border-radius:50%;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.12);
    }}
    .b1 {{ width:180px; height:180px; top:-70px; right:-50px; }}
    .b2 {{ width:110px; height:110px; bottom:-40px; right:120px; }}
    .b3 {{ width:72px; height:72px; top:-18px; left:38%; }}

    .hero {{
      position:relative;
      z-index:1;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:14px;
    }}
    .hero h1 {{
      color:#fff;
      font:900 30px/1.03 'Sora',sans-serif;
      letter-spacing:-.03em;
    }}
    .hero p {{
      margin-top:7px;
      color:rgba(255,255,255,.82);
      font-size:13px;
    }}
    .cupBox {{
      width:82px;
      height:82px;
      border-radius:22px;
      display:grid;
      place-items:center;
      background:rgba(255,255,255,.14);
      border:1px solid rgba(255,255,255,.18);
      backdrop-filter:blur(10px);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.07);
      flex:0 0 auto;
    }}
    .cupBox img {{
      width:62px;
      height:62px;
      object-fit:contain;
      filter:drop-shadow(0 5px 10px rgba(0,0,0,.12));
    }}
    .cupEmoji {{
      color:#fff;
      font-size:40px;
      line-height:1;
    }}

    .dock {{
      position:relative;
      z-index:1;
      display:grid;
      grid-template-columns:1fr 92px 92px 92px;
      gap:10px;
      margin-top:14px;
    }}
    .dockCard {{
      min-height:66px;
      border-radius:18px;
      background:rgba(255,255,255,.96);
      border:1px solid rgba(255,255,255,.96);
      box-shadow:0 6px 20px rgba(25,65,155,.10);
      text-decoration:none;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:10px 8px;
    }}
    .dockMain {{
      font-size:13px;
      font-weight:800;
      color:#243757;
      text-align:center;
      line-height:1.2;
    }}
    .dockMini {{
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:6px;
      text-align:center;
      width:100%;
    }}
    .dockMini span:first-child {{
      font-size:24px;
      line-height:1;
    }}
    .dockMini span:last-child {{
      color:var(--blue2);
      font-size:10px;
      font-weight:800;
      line-height:1.12;
      white-space:nowrap;
    }}

    .topicBar {{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin-top:16px;
    }}
    .topicBtn {{
      border:none;
      cursor:pointer;
      min-height:42px;
      padding:0 14px;
      border-radius:14px;
      background:#fff;
      border:1px solid var(--line);
      box-shadow:0 8px 22px rgba(25,65,155,.08);
      color:#2a3d63;
      font:800 13px/1 'DM Sans',sans-serif;
      transition:.18s ease;
    }}
    .topicBtn.active {{
      background:linear-gradient(135deg,#eff4ff,#dfe9ff);
      color:#1d4fe0;
      border-color:rgba(45,92,239,.22);
    }}
    .emptyTopics {{
      color:var(--muted);
      font-size:13px;
      font-weight:700;
      padding:4px 2px;
    }}

    .panel {{
      margin-top:14px;
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:22px;
      box-shadow:0 12px 28px rgba(25,65,155,.10);
      overflow:hidden;
    }}
    .panelHead {{
      padding:14px 16px;
      border-bottom:1px solid var(--line);
      background:#fbfdff;
    }}
    .panelTitle {{
      font:800 16px/1.1 'Sora',sans-serif;
      color:var(--text);
    }}
    .panelSub {{
      margin-top:6px;
      color:var(--muted);
      font-size:13px;
    }}
    .slide {{
      display:none;
      padding:14px;
    }}
    .slide.active {{
      display:block;
    }}
    .figure {{
      border-radius:18px;
      overflow:hidden;
      border:1px solid var(--line);
      background:#fff;
    }}
    .figure img {{
      display:block;
      width:100%;
      height:auto;
      background:#fff;
    }}
    .emptyPanel {{
      padding:30px 18px;
      text-align:center;
      color:var(--muted);
      font-size:14px;
      font-weight:700;
    }}

    @media (max-width:720px) {{
      .wrap {{ padding:12px 10px 28px; }}
      .banner {{ border-radius:22px; padding:22px 16px 16px; }}
      .hero h1 {{ font-size:25px; }}
      .cupBox {{ width:70px; height:70px; border-radius:20px; }}
      .cupBox img {{ width:52px; height:52px; }}
      .dock {{ grid-template-columns:1fr 80px 80px 80px; gap:8px; }}
      .dockCard {{ min-height:60px; border-radius:16px; padding:8px 6px; }}
      .dockMini span:first-child {{ font-size:22px; }}
      .dockMini span:last-child {{ font-size:9px; }}
      .topicBtn {{ min-height:40px; padding:0 12px; font-size:12px; }}
    }}
    @media (max-width:420px) {{
      .dock {{ grid-template-columns:1fr 72px 72px 72px; gap:6px; }}
      .dockMain {{ font-size:11px; }}
      .topicBar {{ gap:8px; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner">
      <div class="bubble b1"></div>
      <div class="bubble b2"></div>
      <div class="bubble b3"></div>

      <div class="hero">
        <div>
          <h1>{html.escape(title)}</h1>
          <p>Topics and image navigation</p>
        </div>
        <div class="cupBox">{hero_icon}</div>
      </div>

      <div class="dock">
        <div class="dockCard"><div class="dockMain">Browse images and topics</div></div>

        <a class="dockCard" href="{html.escape(training_url)}">
          <div class="dockMini"><span>📚</span><span>Training</span></div>
        </a>

        <a class="dockCard" href="{html.escape(roster_url)}">
          <div class="dockMini"><span>📤</span><span>Roster</span></div>
        </a>

        <a class="dockCard" href="{html.escape(import_url)}">
          <div class="dockMini"><span>📥</span><span>Import</span></div>
        </a>
      </div>
    </div>

    <div class="topicBar">
      {buttons_html}
    </div>

    <div class="panel">
      <div class="panelHead">
        <div class="panelTitle" id="topicTitle">{html.escape(first_label)}</div>
        <div class="panelSub" id="topicSub">{html.escape(first_sub)}</div>
      </div>

      {slides_html}
    </div>
  </div>

  <script>
    const btns = Array.from(document.querySelectorAll('.topicBtn'));
    const slides = Array.from(document.querySelectorAll('.slide'));
    const title = document.getElementById('topicTitle');
    const sub = document.getElementById('topicSub');

    btns.forEach(btn => {{
      btn.addEventListener('click', () => {{
        const target = btn.dataset.target;
        const label = btn.textContent.trim();
        btns.forEach(b => b.classList.toggle('active', b === btn));
        slides.forEach(s => s.classList.toggle('active', s.id === target));
        title.textContent = label;
        sub.textContent = "Selected topic image.";
      }});
    }});
  </script>
</body>
</html>"""


def render_page(
    images_dir: Path,
    output_dir: Path,
    title: str,
    training_url: str,
    roster_url: str,
    import_url: str,
    cup_icon_url: str | None,
) -> Path:
    images = discover_images(images_dir)
    image_labels: list[tuple[str, str]] = []
    for i, path in enumerate(images, start=1):
        rel = f"images/{path.name}"
        image_labels.append((rel, label_from_filename(path, i)))

    html_text = build_html(
        title=title,
        image_labels=image_labels,
        cup_icon_url=cup_icon_url,
        training_url=training_url,
        roster_url=roster_url,
        import_url=import_url,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / "index.html"
    target.write_text(html_text, encoding="utf-8")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate A Cup of Book page from local images.")
    parser.add_argument("--images-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--title", default="A Cup of Book")
    parser.add_argument("--training-url", default="https://khalidsaif912.github.io/roster-site/training/")
    parser.add_argument("--roster-url", default="https://khalidsaif912.github.io/roster-site/")
    parser.add_argument("--import-url", default="https://khalidsaif912.github.io/roster-site/import/")
    parser.add_argument("--cup-icon-url", default="")
    args = parser.parse_args()

    page = render_page(
        images_dir=args.images_dir,
        output_dir=args.output_dir,
        title=args.title,
        training_url=args.training_url,
        roster_url=args.roster_url,
        import_url=args.import_url,
        cup_icon_url=args.cup_icon_url or None,
    )
    print(f"[OK] page={page}")


if __name__ == "__main__":
    main()
