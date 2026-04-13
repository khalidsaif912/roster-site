#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

MONTH_NAMES_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]

CSS = r'''
:root {
  --bg:#f0f4fa;
  --panel:rgba(255,255,255,.97);
  --panel2:rgba(255,255,255,.92);
  --border:rgba(0,0,0,.07);
  --border2:rgba(0,0,0,.11);
  --text:#18243a;
  --muted:#6b7a96;
  --blue:#2d5cef;
  --blue2:#1a3ec4;
  --teal:#0a9f83;
  --violet:#7c4fcc;
  --shadow:rgba(30,60,130,.10);
  --header-grad:linear-gradient(135deg,#1233a0 0%,#2358e8 52%,#0d72c4 100%);
  --row-alt:rgba(0,0,0,.025);
  --row-fav:rgba(10,159,131,.08);
  --emp-no-bg:#eef2ff;
  --emp-no-c:#5570aa;
  --emp-code:#18243a;
  --emp-name:#2a3a58;
  --row-border:rgba(0,0,0,.06);
  --today-badge-bg:#dce7ff;
  --today-badge-c:#1a3ec4;
  --search-bg:#fff;
  --search-border:rgba(0,0,0,.13);
  --clear-bg:#e8edf8;
  --clear-c:#445;
  --empty-bg:rgba(255,255,255,.8);
  --empty-border:rgba(0,0,0,.12);
  --footer-c:#9aa5bd;
  --footer-strong:#7a87a0;
  --past-opacity:.40;
  --past-filter:saturate(.4) brightness(1.04);
}
* { box-sizing:border-box; margin:0; padding:0; }
body {
  background:var(--bg); color:var(--text);
  font-family:'IBM Plex Sans Arabic','DM Sans',Tahoma,sans-serif;
  min-height:100vh; direction:rtl; -webkit-font-smoothing:antialiased;
}
.wrap { max-width:860px; margin:0 auto; padding:18px 14px 48px; }

.header {
  position:relative; overflow:hidden;
  padding:28px 22px 24px; border-radius:24px;
  background:var(--header-grad);
  border:1px solid rgba(255,255,255,.10);
  box-shadow:0 0 0 1px rgba(45,92,239,.18), 0 24px 64px var(--shadow);
}
.header::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(circle at 85% 20%,rgba(255,255,255,.15) 0%,transparent 40%),
    radial-gradient(circle at 10% 80%,rgba(255,255,255,.08) 0%,transparent 35%);
}
.hCircle { position:absolute; border-radius:50%; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.09); }
.hCircle1 { width:220px; height:220px; right:-70px; top:-80px; }
.hCircle2 { width:140px; height:140px; right:80px; bottom:-60px; }
.hCircle3 { width:80px; height:80px; left:40%; top:-20px; }
.header h1 {
  position:relative; z-index:1; margin:0;
  font:900 32px/1.05 'Sora',sans-serif; letter-spacing:-.04em; color:#fff;
}
.headerSub {
  position:relative; z-index:1; margin-top:8px;
  font-size:13.5px; color:rgba(255,255,255,.72);
}
.dateTag {
  position:relative; z-index:1; display:inline-flex; align-items:center; gap:8px;
  margin-top:18px; padding:8px 14px; border-radius:999px;
  background:rgba(255,255,255,.11); border:1px solid rgba(255,255,255,.20);
  color:rgba(255,255,255,.95); font-size:12px; font-weight:700; backdrop-filter:blur(10px);
}
.headerRow {
  position:relative; z-index:1; margin-top:16px;
  display:flex; gap:10px; flex-wrap:wrap;
}
.monthPicker,.archiveBtn {
  appearance:none; border:none; border-radius:999px; padding:10px 14px;
  background:rgba(255,255,255,.14); color:#fff; text-decoration:none; font-weight:700;
  border:1px solid rgba(255,255,255,.20); backdrop-filter:blur(10px);
}
.monthPicker { cursor:pointer; min-width:190px; }

.topDock {
  display:grid; grid-template-columns:1.3fr .72fr .72fr 1.15fr;
  gap:10px; margin-top:14px; align-items:stretch;
}
.dockCard {
  min-width:0; width:100%; padding:11px 10px; border-radius:18px;
  background:var(--panel2); border:1px solid var(--border2);
  box-shadow:0 6px 20px var(--shadow);
  transition:transform .22s, box-shadow .22s, background .35s, border-color .35s;
  text-align:center;
}
.dockCard:hover { transform:translateY(-2px); box-shadow:0 12px 28px var(--shadow); }
.dockValue { font-size:20px; font-weight:900; line-height:1.1; color:var(--blue); font-family:'Sora',sans-serif; letter-spacing:-.03em; }
.dockLabel { margin-top:4px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); white-space:nowrap; }
.flipChip { perspective:900px; }
.flipInner { position:relative; width:100%; height:44px; transform-style:preserve-3d; transition:transform .7s cubic-bezier(.4,0,.2,1); }
.flipInner.flipped { transform:rotateX(180deg); }
.flipFace { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; backface-visibility:hidden; }
.flipBack { transform:rotateX(180deg); }
.dockAction { cursor:pointer; border:none; font-family:inherit; }
.savedChip {
  display:flex; align-items:center; gap:10px; text-align:start; cursor:pointer;
  padding-inline:12px;
  background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(246,249,255,.96));
}
.savedChip:hover { box-shadow:0 14px 30px rgba(45,92,239,.12); }
.savedIcon {
  width:38px; height:38px; flex:0 0 38px; border-radius:14px; display:grid; place-items:center;
  background:linear-gradient(135deg,rgba(45,92,239,.18),rgba(10,159,131,.14));
  font-size:18px; border:1px solid var(--border2);
}
.savedLines { min-width:0; flex:1; }
.savedName {
  font-size:14px; line-height:1.02; font-weight:900; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.savedNo {
  margin-top:3px; font-size:10px; font-weight:700; color:var(--muted);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.savedEmpty .savedName { color:var(--blue); font-size:12px; font-weight:800; }

.filters {
  display:none; margin-top:12px; padding:12px; border-radius:18px;
  background:var(--panel2); border:1px solid var(--border2); box-shadow:0 6px 20px var(--shadow);
}
.filters.active { display:block; }
.searchRow { display:flex; align-items:center; gap:8px; }
.searchRow input {
  flex:1; min-width:0; padding:11px 14px; border-radius:14px;
  border:1px solid var(--search-border); background:var(--search-bg);
  font-size:13px; outline:none; color:var(--text); font-family:inherit;
}
.searchRow input::placeholder { color:var(--muted); opacity:.7; }
.searchBtn,.clearBtn { border:none; border-radius:14px; padding:11px 14px; font-size:12px; font-weight:800; cursor:pointer; font-family:inherit; }
.searchBtn { background:linear-gradient(135deg,var(--blue2),var(--blue)); color:#fff; min-width:80px; box-shadow:0 4px 14px rgba(45,92,239,.30); }
.clearBtn { background:var(--clear-bg); color:var(--clear-c); }

.cards { margin-top:14px; display:flex; flex-direction:column; gap:12px; }
.pastLabel {
  display:flex; align-items:center; gap:10px;
  margin:6px 0 2px; color:var(--muted); font-size:10px; font-weight:800;
  text-transform:uppercase; letter-spacing:.09em;
}
.pastLabel::before,.pastLabel::after { content:''; flex:1; height:1px; background:var(--border2); }

.courseCard {
  background:var(--panel); border:1px solid var(--border2); border-radius:20px; overflow:hidden;
  box-shadow:0 8px 24px var(--shadow);
  transition:background .35s,border-color .35s,box-shadow .35s,opacity .25s,filter .25s,transform .22s;
}
.courseCard[open] { transform:translateY(-1px); box-shadow:0 14px 36px var(--shadow); }
.courseCard.is-today { border-color:rgba(45,92,239,.32); box-shadow:0 0 0 1px rgba(45,92,239,.16),0 14px 40px rgba(45,92,239,.12); }
.courseCard.is-saved { border-color:rgba(10,159,131,.30); }
.courseCard.is-past { opacity:var(--past-opacity); filter:var(--past-filter); }

.courseHead {
  position:relative; display:grid; grid-template-columns:40px minmax(0,1fr) auto;
  gap:10px; align-items:center; padding:11px 13px; cursor:pointer; list-style:none;
  background:
    radial-gradient(circle at top right,rgba(255,255,255,.88),transparent 34%),
    linear-gradient(180deg,var(--surface,#f5f8ff),var(--surface2,#dfe8ff));
  border-inline-start:4px solid var(--accent,var(--blue));
  box-shadow:0 6px 18px rgba(0,0,0,.12);
  transition:background .35s, box-shadow .35s;
}
.courseCard[open] .courseHead { box-shadow:0 10px 24px rgba(0,0,0,.16); }
.courseHead::-webkit-details-marker { display:none; }
.headGlow { position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(255,255,255,.30),transparent 36%); }
.courseIcon {
  position:relative; z-index:1; width:40px; height:40px; border-radius:14px; display:grid; place-items:center; font-size:19px;
  background:linear-gradient(180deg,rgba(255,255,255,.60),var(--pill,rgba(45,92,239,.20)));
  border:1px solid rgba(255,255,255,.75);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.75), 0 8px 18px rgba(0,0,0,.07);
}
.courseTitleWrap { position:relative; z-index:1; min-width:0; }
.courseTitle { font-size:16px; font-weight:900; letter-spacing:-.025em; color:var(--text-on-acc,var(--text)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:'Sora',sans-serif; }
.courseSubRow { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px; font-size:10px; color:var(--muted); }
.miniMeta strong { color:var(--text-on-acc,var(--text)); margin-inline-end:3px; font-weight:700; opacity:.75; }
.miniDot { color:var(--border2); font-weight:900; }
.courseBadges {
  position:relative; z-index:1; display:flex; flex-direction:row; gap:6px; align-items:center; justify-content:flex-end; flex-wrap:wrap;
}
.badge {
  display:inline-flex; align-items:center; justify-content:center; gap:5px;
  padding:5px 10px; border-radius:999px; font-size:10px; font-weight:900; letter-spacing:.03em;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.72);
}
.dateBadge { background:linear-gradient(180deg,rgba(255,255,255,.75),var(--pill,rgba(45,92,239,.20))); color:var(--text-on-acc,var(--blue2)); }
.peopleBadge { background:rgba(255,255,255,.92); color:#334155; }
.todayBadge { background:var(--today-badge-bg); color:var(--today-badge-c); }

.courseBody { padding:14px 13px 13px; }
.courseCard[open] .courseBody { padding-top:18px; }
.rowsWrap { border:1px solid var(--border2); border-radius:12px; overflow:hidden; }
.empRow { display:grid; grid-template-columns:22px 80px 1fr; gap:8px; align-items:center; padding:8px 10px; background:var(--panel); border-top:1px solid var(--row-border); }
.empRow:first-child { border-top:none; }
.empRowAlt { background:var(--row-alt); }
.empRow.favorite { background:var(--row-fav); }
.empNo { display:inline-flex; align-items:center; justify-content:center; min-width:18px; width:18px; height:18px; border-radius:50%; background:var(--emp-no-bg); color:var(--emp-no-c); font-size:8px; font-weight:800; }
.empCode { font-size:11px; font-weight:800; color:var(--emp-code); letter-spacing:.01em; }
.empName { min-width:0; font-size:12px; font-weight:700; color:var(--emp-name); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.favBadge { padding:2px 7px; border-radius:999px; font-size:8px; font-weight:800; background:rgba(10,159,131,.16); color:#097a63; }

.emptyState { display:none; margin-top:14px; padding:26px; text-align:center; color:var(--muted); border-radius:18px; background:var(--empty-bg); border:1px dashed var(--empty-border); }
.footer { margin-top:20px; padding:10px 8px; text-align:center; color:var(--footer-c); font-size:11px; line-height:1.9; }
.footer strong { color:var(--footer-strong); }
.archiveGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-top:16px; }
.archiveCard { display:block; text-decoration:none; color:var(--text); background:var(--panel); border:1px solid var(--border2); border-radius:20px; padding:18px; box-shadow:0 8px 24px var(--shadow); }
.archiveMonth { font-size:18px; font-weight:900; font-family:'Sora',sans-serif; }
.archiveMeta { margin-top:8px; color:var(--muted); font-size:12px; }
.archiveLatest { display:inline-flex; margin-top:10px; padding:5px 9px; border-radius:999px; background:#e8efff; color:#1a3ec4; font-size:10px; font-weight:800; }

@media(max-width:720px){
  .topDock{grid-template-columns:1fr 1fr}
  .courseHead{grid-template-columns:34px minmax(0,1fr) auto}
  .courseIcon{width:34px;height:34px;font-size:17px}
  .courseTitle{font-size:14px}
}
'''


def month_label(month_id: str) -> str:
    year, month = month_id.split('-')
    return f"{MONTH_NAMES_AR[int(month)-1]} {year}"


def date_label(iso_value: str) -> str:
    _, month, day = iso_value.split('-')
    return f"{day} {MONTH_NAMES_AR[int(month)-1]}"


def month_range_label(courses: list[dict]) -> str:
    days = sorted(int(c['date'].split('-')[2]) for c in courses)
    if not days:
        return ''
    month = int(courses[0]['date'].split('-')[1])
    if days[0] == days[-1]:
        return f"{days[0]:02d} {MONTH_NAMES_AR[month-1]}"
    return f"{days[0]:02d} – {days[-1]:02d} {MONTH_NAMES_AR[month-1]}"


def load_data(path: Path) -> dict:
    data = json.loads(path.read_text(encoding='utf-8'))
    if 'months' not in data or not isinstance(data['months'], list):
        raise ValueError('JSON must contain months list')
    return data


def latest_month_id(data: dict) -> str:
    return max(item['month_id'] for item in data['months'])


def count_types(courses: list[dict]) -> int:
    return len({c['title'].strip().lower() for c in courses})


def count_venues(courses: list[dict]) -> int:
    return len({c['venue'].strip().lower() for c in courses})


def count_staff(courses: list[dict]) -> int:
    return sum(len(c.get('staff', [])) for c in courses)


def month_options(months: list[dict], selected: str, in_archive: bool) -> str:
    parts = []
    for month in sorted(months, key=lambda x: x['month_id']):
        href = f"{month['month_id']}.html" if in_archive else f"archive/{month['month_id']}.html"
        sel = ' selected' if month['month_id'] == selected else ''
        parts.append(f'<option value="{href}"{sel}>{month_label(month["month_id"])}</option>')
    return ''.join(parts)


def render_course(course: dict, today_iso: str) -> str:
    rows = []
    for i, member in enumerate(course.get('staff', []), start=1):
        alt = ' empRowAlt' if i % 2 == 0 else ''
        rows.append(
            f'<div class="empRow{alt}"><span class="empNo">{i}</span><span class="empCode">{member["no"]}</span><span class="empName">{member["name"]}</span></div>'
        )
    is_today = course['date'] == today_iso
    past_cls = ' is-past' if course['date'] < today_iso else ''
    open_attr = ' open' if is_today else ''
    search_text = ' '.join(
        [course['title'], course.get('code', ''), course['venue'], course['time']]
        + [f"{m['no']} {m['name']}" for m in course.get('staff', [])]
    ).lower()
    today_badge = '<span class="badge todayBadge">اليوم</span>' if is_today else ''
    return f'''
<details class="courseCard{past_cls}" data-search="{search_text}" data-attendees="{len(course.get('staff', []))}"{open_attr}>
  <summary class="courseHead" style="--accent:{course['accent']};--surface:{course['surface']};--surface2:{course['surface2']};--pill:{course['pill']};--text-on-acc:{course['text_on_acc']};">
    <div class="headGlow"></div>
    <div class="courseIcon">{course['icon']}</div>
    <div class="courseTitleWrap">
      <div class="courseTitle">{course['title']}</div>
      <div class="courseSubRow"><span class="miniMeta"><strong>الموقع</strong> {course['venue']}</span><span class="miniDot">•</span><span class="miniMeta"><strong>الوقت</strong> {course['time']}</span></div>
    </div>
    <div class="courseBadges">
      {today_badge}
      <span class="badge dateBadge">{date_label(course['date'])}</span>
      <span class="badge peopleBadge">👥 {len(course.get('staff', []))}</span>
    </div>
  </summary>
  <div class="courseBody"><div class="rowsWrap">{''.join(rows)}</div></div>
</details>
'''


def build_stats_card(courses: list[dict]) -> str:
    items = [
        (len(courses), 'الجلسات', 'var(--blue)'),
        (count_types(courses), 'الأنواع', 'var(--teal)'),
        (count_staff(courses), 'الموظفون', 'var(--blue)'),
        (count_venues(courses), 'المواقع', 'var(--violet)'),
    ]
    faces = []
    for idx, (value, label, color) in enumerate(items):
        extra = ' flipBack' if idx % 2 else ''
        # two faces only; js will replace content instead of 4 physical faces
    return f'''
<div class="dockCard flipChip">
  <div class="flipInner" id="statsCardInner">
    <div class="flipFace"><div class="dockValue" id="statsValue">{items[0][0]}</div><div class="dockLabel" id="statsLabel">{items[0][1]}</div></div>
    <div class="flipFace flipBack"><div class="dockValue" id="statsValueBack" style="color:{items[1][2]};">{items[1][0]}</div><div class="dockLabel" id="statsLabelBack">{items[1][1]}</div></div>
  </div>
</div>
'''


PAGE_JS = r'''
(function(){
  const SAVED_QUERY_KEY = 'trainingSavedQuery';
  const cards = Array.from(document.querySelectorAll('.courseCard'));
  const searchToggle = document.getElementById('searchToggle');
  const filtersBox = document.getElementById('filtersBox');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearFilters');
  const savedChip = document.getElementById('savedChip');
  const savedName = document.getElementById('savedName');
  const savedNo = document.getElementById('savedNo');
  const emptyState = document.getElementById('emptyState');
  const monthPicker = document.getElementById('monthPicker');
  const pastSep = document.getElementById('pastSep');
  const statsInner = document.getElementById('statsCardInner');
  const frontValue = document.getElementById('statsValue');
  const frontLabel = document.getElementById('statsLabel');
  const backValue = document.getElementById('statsValueBack');
  const backLabel = document.getElementById('statsLabelBack');
  const statsData = JSON.parse(document.getElementById('statsData').textContent);

  function norm(v){ return (v || '').toLowerCase().trim(); }
  function firstName(name){
    const cleaned = (name || '').replace(/^(mr|mrs|ms|dr)\.?\s+/i,'').trim();
    return cleaned ? cleaned.split(/\s+/)[0] : '';
  }
  function allRows(){ return Array.from(document.querySelectorAll('.empRow')); }
  function matchSaved(raw){
    const q = norm(raw);
    if(!q) return null;
    for(const row of allRows()){
      const code = norm(row.querySelector('.empCode')?.textContent || '');
      const name = norm(row.querySelector('.empName')?.textContent || '');
      if(code === q || name.includes(q) || q.includes(code)){
        return { row, code: row.querySelector('.empCode')?.textContent?.trim() || '', name: row.querySelector('.empName')?.childNodes[0]?.textContent?.trim() || row.querySelector('.empName')?.textContent?.trim() || '', card: row.closest('.courseCard') };
      }
    }
    return null;
  }
  function refreshSaved(){
    document.querySelectorAll('.empRow.favorite').forEach(r => r.classList.remove('favorite'));
    document.querySelectorAll('.favBadge').forEach(b => b.remove());
    cards.forEach(c => c.classList.remove('is-saved'));

    const raw = localStorage.getItem(SAVED_QUERY_KEY) || '';
    const match = matchSaved(raw);

    if(match){
      match.row.classList.add('favorite');
      const nameCell = match.row.querySelector('.empName');
      if(nameCell && !nameCell.querySelector('.favBadge')){
        const b = document.createElement('span');
        b.className = 'favBadge';
        b.textContent = 'محفوظ';
        nameCell.appendChild(b);
      }
      if(match.card) match.card.classList.add('is-saved');
      savedChip.classList.remove('savedEmpty');
      savedName.textContent = firstName(match.name) || match.name;
      savedNo.textContent = match.code;
    } else if(raw){
      savedChip.classList.remove('savedEmpty');
      savedName.textContent = raw;
      savedNo.textContent = 'الموظف المحفوظ';
    } else {
      savedChip.classList.add('savedEmpty');
      savedName.textContent = 'حفظ موظف';
      savedNo.textContent = 'الموظف المحفوظ';
    }
  }
  function applyFilters(){
    const q = norm(searchInput.value);
    let visible = 0;
    let visiblePast = false;
    cards.forEach(card => {
      const ok = !q || (card.dataset.search || '').includes(q);
      card.style.display = ok ? '' : 'none';
      if(ok){ visible += 1; if(card.classList.contains('is-past')) visiblePast = true; }
    });
    if(pastSep) pastSep.style.display = visiblePast ? '' : 'none';
    emptyState.style.display = visible ? 'none' : 'block';
  }
  searchToggle?.addEventListener('click', () => {
    const active = filtersBox.classList.toggle('active');
    searchToggle.setAttribute('aria-expanded', active ? 'true' : 'false');
    if(active) searchInput.focus();
  });
  searchBtn?.addEventListener('click', applyFilters);
  searchInput?.addEventListener('input', applyFilters);
  searchInput?.addEventListener('keydown', e => { if(e.key === 'Enter') applyFilters(); });
  clearBtn?.addEventListener('click', () => { searchInput.value = ''; applyFilters(); });
  savedChip?.addEventListener('click', () => {
    const current = localStorage.getItem(SAVED_QUERY_KEY) || '';
    const value = window.prompt('اكتب رقم الموظف أو الاسم للحفظ. اتركه فارغًا للمسح.', current);
    if(value === null) return;
    const trimmed = value.trim();
    if(trimmed) localStorage.setItem(SAVED_QUERY_KEY, trimmed); else localStorage.removeItem(SAVED_QUERY_KEY);
    refreshSaved();
    applyFilters();
  });
  monthPicker?.addEventListener('change', () => { window.location.href = monthPicker.value; });

  let statIndex = 0;
  function rotateStats(){
    const front = statsData[statIndex % statsData.length];
    const back = statsData[(statIndex + 1) % statsData.length];
    frontValue.textContent = front.value;
    frontLabel.textContent = front.label;
    backValue.textContent = back.value;
    backLabel.textContent = back.label;
    backValue.style.color = back.color;
    statsInner.classList.toggle('flipped');
    statIndex = (statIndex + 1) % statsData.length;
  }

  refreshSaved();
  applyFilters();
  setInterval(rotateStats, 2400);
})();
'''


def render_month_page(data: dict, selected: str, in_archive: bool) -> str:
    months = sorted(data['months'], key=lambda x: x['month_id'])
    month = next(m for m in months if m['month_id'] == selected)
    courses = sorted(month.get('courses', []), key=lambda x: x['date'])
    today_iso = date.today().isoformat()
    upcoming = [c for c in courses if c['date'] >= today_iso]
    past = sorted([c for c in courses if c['date'] < today_iso], key=lambda x: x['date'], reverse=True)
    cards = ''.join(render_course(c, today_iso) for c in upcoming)
    if past:
        cards += '<div class="pastLabel" id="pastSep">الجلسات السابقة</div>'
        cards += ''.join(render_course(c, today_iso) for c in past)
    archive_href = 'index.html' if in_archive else 'archive/index.html'
    stats_json = json.dumps([
        {'value': len(courses), 'label': 'الجلسات', 'color': 'var(--blue)'},
        {'value': count_types(courses), 'label': 'الأنواع', 'color': 'var(--teal)'},
        {'value': count_staff(courses), 'label': 'الموظفون', 'color': 'var(--blue)'},
        {'value': count_venues(courses), 'label': 'المواقع', 'color': 'var(--violet)'},
    ], ensure_ascii=False)
    return f'''<!doctype html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>دورات التدريب - {month_label(selected)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&family=Sora:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>{CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="hCircle hCircle1"></div>
    <div class="hCircle hCircle2"></div>
    <div class="hCircle hCircle3"></div>
    <h1>دورات التدريب</h1>
    <div class="headerSub">الجدول الشهري للدورات التدريبية</div>
    <div class="dateTag">📅 {month_range_label(courses)}</div>
    <div class="headerRow">
      <select id="monthPicker" class="monthPicker">{month_options(months, selected, in_archive)}</select>
      <a class="archiveBtn" href="{archive_href}">الأرشيف</a>
    </div>
  </div>

  <div class="topDock">
    {build_stats_card(courses)}
    <button class="dockCard dockAction" id="searchToggle" type="button" aria-expanded="false"><div class="dockValue">🔎</div><div class="dockLabel">بحث</div></button>
    <button class="dockCard dockAction" id="otherPageBtn" type="button"><div class="dockValue">➕</div><div class="dockLabel">صفحة أخرى</div></button>
    <button class="dockCard savedChip savedEmpty" id="savedChip" type="button"><div class="savedIcon">👋</div><div class="savedLines"><div class="savedName" id="savedName">حفظ موظف</div><div class="savedNo" id="savedNo">الموظف المحفوظ</div></div></button>
  </div>

  <div class="filters" id="filtersBox">
    <div class="searchRow">
      <input id="searchInput" type="text" placeholder="ابحث برقم الموظف أو الاسم أو اسم الدورة">
      <button id="searchBtn" class="searchBtn" type="button">بحث</button>
      <button id="clearFilters" class="clearBtn" type="button">مسح</button>
    </div>
  </div>

  <div class="cards">{cards}</div>
  <div class="emptyState" id="emptyState">لا توجد دورات مطابقة للبحث الحالي.</div>
  <div class="footer"><strong>المصدر:</strong> أرشيف GitHub الشهري<br><strong>تم الإنشاء:</strong> {date.today().isoformat()}</div>
</div>
<script id="statsData" type="application/json">{stats_json}</script>
<script>{PAGE_JS}</script>
</body>
</html>'''


def render_archive_index(data: dict) -> str:
    months = sorted(data['months'], key=lambda x: x['month_id'], reverse=True)
    latest = latest_month_id(data)
    cards = []
    for month in months:
        courses = month.get('courses', [])
        latest_badge = '<span class="archiveLatest">الأحدث</span>' if month['month_id'] == latest else ''
        cards.append(
            f'<a class="archiveCard" href="{month["month_id"]}.html"><div class="archiveMonth">{month_label(month["month_id"])}</div><div class="archiveMeta">{len(courses)} جلسة • 👥 {count_staff(courses)} • {count_venues(courses)} موقع</div>{latest_badge}</a>'
        )
    return f'''<!doctype html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>أرشيف الدورات</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&family=Sora:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>{CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="hCircle hCircle1"></div>
    <div class="hCircle hCircle2"></div>
    <div class="hCircle hCircle3"></div>
    <h1>أرشيف الدورات</h1>
    <div class="headerSub">كل شهر في صفحة مستقلة</div>
    <div class="headerRow"><a class="archiveBtn" href="../index.html">أحدث شهر</a></div>
  </div>
  <div class="archiveGrid">{''.join(cards)}</div>
  <div class="footer"><strong>المصدر:</strong> أرشيف GitHub الشهري<br><strong>تم الإنشاء:</strong> {date.today().isoformat()}</div>
</div>
</body>
</html>'''


def build_site(data: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    archive = out_dir / 'archive'
    archive.mkdir(parents=True, exist_ok=True)
    latest = latest_month_id(data)
    (out_dir / 'index.html').write_text(render_month_page(data, latest, in_archive=False), encoding='utf-8')
    (archive / 'index.html').write_text(render_archive_index(data), encoding='utf-8')
    for month in sorted(data['months'], key=lambda x: x['month_id']):
        (archive / f"{month['month_id']}.html").write_text(render_month_page(data, month['month_id'], in_archive=True), encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate archive pages site')
    parser.add_argument('data_file', type=Path)
    parser.add_argument('-o', '--output-dir', type=Path, default=Path('.'))
    args = parser.parse_args()
    data = load_data(args.data_file)
    build_site(data, args.output_dir)
    print(f"[OK] built site in {args.output_dir.resolve()}")


if __name__ == '__main__':
    main()
