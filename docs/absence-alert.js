(function () {
  "use strict";

  const PATH_ROSTER = "/roster-site/";
  const DATA_URL = (function () {
    const origin = location.origin;
    const base = location.pathname.includes(PATH_ROSTER) ? origin + PATH_ROSTER : origin;
    return base + "/absence-data.json";
  })();

  let mState = { empName: "", absences: [], empId: "", hash: "" };

  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").replace(/\s+/g, " ").trim();

  function nameMatch(a, b) {
    const na = norm(a), nb = norm(b);
    if (na === nb) return true;
    const wa = na.split(" ").filter(w => w.length > 3);
    const wb = nb.split(" ").filter(w => w.length > 3);
    return wa.length && wb.length && wa.filter(w => wb.indexOf(w) !== -1).length >= 2;
  }

  function findAbsences(empId, empName, records) {
    const results = [];
    const cleanName = (empName || "").replace(/-\s*\d+\s*$/, "").trim();
    records.forEach(rec => {
      let matched = false;
      if (empId && rec.empNos && rec.empNos.indexOf(String(empId)) !== -1) {
        results.push({ date: rec.date }); matched = true;
      }
      if (!matched && cleanName)
        rec.names.forEach(n => { if (nameMatch(cleanName, n)) results.push({ date: rec.date }); });
    });
    return results;
  }

  function init() {
    const empId = localStorage.getItem("savedEmpId");
    if (!empId) return;
    const base = location.pathname.includes(PATH_ROSTER) ? location.origin + PATH_ROSTER : location.origin + "/";
    Promise.all([
      fetch(`${base}schedules/${empId}.json`).then(r => r.ok ? r.json() : null),
      fetch(`${DATA_URL}?v=${Date.now()}`).then(r => r.ok ? r.json() : null),
    ]).then(([emp, absData]) => {
      if (!emp?.name || !absData?.records) return;
      const absences = findAbsences(empId, emp.name, absData.records);
      if (!absences.length) return;
      mState = { empName: emp.name, absences, empId, hash: absences.map(a => a.date).join("|") };
      injectStyles();
      buildUI();
    });
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-styles")) return;
    const s = document.createElement("style");
    s.id = "abs-styles";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap');
      .abs-r { font-family:'Tajawal',system-ui,sans-serif; direction:rtl; }
      .abs-r * { box-sizing:border-box; margin:0; padding:0; }

      /* ══ الدائرة ══ */
      #abs-dot {
        position: fixed;
        bottom: 24px; left: 20px;
        z-index: 999998;
        width: 52px; height: 52px;
        background: linear-gradient(135deg, #ef4444, #b91c1c);
        border-radius: 50%;
        display: none;
        align-items: center; justify-content: center;
        box-shadow: 0 4px 16px rgba(220,38,38,0.4);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.18s, box-shadow 0.18s;
        font-size: 22px;
        border: 3px solid #fff;
      }
      #abs-dot.abs-on { display: flex; animation: dotPop 0.35s cubic-bezier(0.16,1,0.3,1); }
      #abs-dot:hover  { transform: scale(1.1); box-shadow: 0 6px 22px rgba(220,38,38,0.5); }
      #abs-dot:active { transform: scale(0.93); }
      @keyframes dotPop {
        from { opacity:0; transform:scale(0.5); }
        to   { opacity:1; transform:scale(1); }
      }

      /* ══ البطاقة المنسدلة ══ */
      #abs-card {
        position: fixed;
        bottom: 84px; left: 14px;
        z-index: 999997;
        width: 230px;
        background: #fff;
        border-radius: 18px;
        padding: 14px 14px 10px;
        box-shadow: 0 8px 28px rgba(59,96,217,0.18), 0 2px 8px rgba(0,0,0,0.08);
        border: 1.5px solid #e0e7ff;
        display: none;
        flex-direction: column;
        gap: 6px;
        transform-origin: bottom left;
      }
      #abs-card.abs-open {
        display: flex;
        animation: cardIn 0.3s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes cardIn {
        from { opacity:0; transform:scale(0.85) translateY(10px); }
        to   { opacity:1; transform:scale(1) translateY(0); }
      }

      .abs-card-header {
        display: flex; align-items: center;
        justify-content: space-between; margin-bottom: 4px;
      }
      .abs-card-title-text {
        font-size: 13px; font-weight: 800; color: #1e293b;
      }
      .abs-card-close {
        background: #f1f5f9; border: none; width: 22px; height: 22px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-size: 11px; color: #64748b; cursor: pointer; font-weight: 700;
        font-family: 'Tajawal',sans-serif;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s;
      }
      .abs-card-close:hover { background:#e2e8f0; }

      .abs-card-sub {
        font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 6px;
      }

      .abs-card-row {
        display: flex; align-items: center; justify-content: space-between;
        background: #fef2f2; border-radius: 10px; padding: 7px 10px;
        border-right: 3px solid #dc2626; margin-bottom: 4px;
      }
      .abs-card-row:last-of-type { margin-bottom: 0; }
      .abs-card-date { font-size: 12px; font-weight: 800; color: #991b1b; }
      .abs-card-tag {
        font-size: 9px; font-weight: 700; color: #dc2626;
        background: #fff; border: 1px solid #fca5a5;
        border-radius: 99px; padding: 2px 7px;
      }

      .abs-card-btn {
        width: 100%; margin-top: 8px; padding: 9px;
        background: linear-gradient(135deg, #3b60d9, #1e40af);
        color: #fff; border: none; border-radius: 10px;
        font-size: 12px; font-weight: 800;
        font-family: 'Tajawal',sans-serif; cursor: pointer;
        box-shadow: 0 3px 10px rgba(59,96,217,0.28);
        transition: all 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-card-btn:hover { transform:translateY(-1px); }
      .abs-card-btn:active { transform:scale(0.97); }

      /* ══ Overlay ══ */
      #abs-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(30,41,80,0.4);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        display: flex; align-items: flex-end; justify-content: center;
        opacity: 0; animation: ovIn 0.22s ease forwards;
      }
      @media (min-width:500px) { #abs-overlay { align-items:center; } }
      @keyframes ovIn { to { opacity:1; } }

      /* ══ النافذة المنبثقة — مضغوطة ══ */
      #abs-modal {
        width: 100%; max-width: 360px;
        background: #f0f4ff;
        border-radius: 22px 22px 0 0;
        overflow: hidden;
        box-shadow: 0 -4px 30px rgba(59,96,217,0.15);
        transform: translateY(100%);
        animation: shUp 0.38s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      @media (min-width:500px) {
        #abs-modal {
          border-radius: 22px;
          transform: scale(0.9) translateY(16px);
          animation: mIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
        }
      }
      @keyframes shUp { to { transform:translateY(0); } }
      @keyframes mIn  { to { transform:scale(1) translateY(0); } }

      #abs-modal::before {
        content:''; display:block;
        width:32px; height:3px; background:#c7d2fe;
        border-radius:99px; margin:9px auto 0;
      }
      @media (min-width:500px) { #abs-modal::before { display:none; } }

      /* هيدر أزرق مضغوط */
      #abs-mhead {
        background: linear-gradient(135deg,#3b60d9,#1e40af);
        padding: 12px 14px 10px;
        position: relative; overflow: hidden;
      }
      #abs-mhead::before {
        content:''; position:absolute;
        width:140px; height:140px; background:rgba(255,255,255,0.08);
        border-radius:50%; top:-60px; right:-30px; pointer-events:none;
      }
      .abs-mhead-row {
        display:flex; align-items:center; justify-content:space-between;
        margin-bottom:6px; position:relative; z-index:1;
      }
      .abs-mbadge {
        background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.28);
        border-radius:99px; padding:3px 10px;
        font-size:10px; font-weight:700; color:#fff;
      }
      .abs-mxbtn {
        width:24px; height:24px; background:rgba(255,255,255,0.18);
        border:1px solid rgba(255,255,255,0.25); border-radius:50%;
        color:#fff; font-size:12px; font-weight:700; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        font-family:'Tajawal',sans-serif; transition:background 0.15s;
        -webkit-tap-highlight-color:transparent; flex-shrink:0;
      }
      .abs-mxbtn:hover { background:rgba(255,255,255,0.3); }
      .abs-mtitle {
        font-size:15px; font-weight:800; color:#fff;
        position:relative; z-index:1; margin-bottom:1px;
      }
      .abs-msub {
        font-size:11px; color:rgba(255,255,255,0.72);
        font-weight:500; position:relative; z-index:1;
      }

      /* جسم النافذة */
      #abs-mbody { padding:10px 12px 16px; display:flex; flex-direction:column; gap:8px; }

      /* بطاقة صغيرة */
      .abs-mc {
        background:#fff; border-radius:14px; padding:10px 12px;
        box-shadow:0 1px 4px rgba(59,96,217,0.07);
      }
      .abs-mc-title {
        font-size:9px; font-weight:800; color:#9ca3af;
        letter-spacing:0.7px; text-transform:uppercase; margin-bottom:6px;
        display:flex; align-items:center; gap:4px;
      }

      .abs-reason {
        font-size:11px; color:#374151; font-weight:600; line-height:1.6;
      }
      .abs-reason b { color:#1e40af; }

      .ab-row {
        display:flex; align-items:center; justify-content:space-between;
        background:#fef2f2; border-radius:10px; padding:8px 10px;
        margin-bottom:5px; border-right:3px solid #dc2626;
      }
      .ab-row:last-child { margin-bottom:0; }
      .ab-left { display:flex; align-items:center; gap:6px; }
      .ab-emoji { font-size:14px; }
      .ab-date { font-size:12px; font-weight:800; color:#991b1b; }
      .ab-tag {
        font-size:9px; font-weight:700; color:#dc2626;
        background:#fff; border:1px solid #fca5a5;
        border-radius:99px; padding:2px 7px;
      }

      /* زر إيميل */
      #abs-email {
        display:flex; align-items:center; justify-content:center; gap:7px;
        width:100%; padding:11px;
        background:#1e293b; color:#fff;
        border-radius:12px; font-size:12px; font-weight:800;
        font-family:'Tajawal',sans-serif; text-decoration:none;
        border:none; cursor:pointer;
        box-shadow:0 3px 10px rgba(15,23,42,0.18);
        transition:all 0.15s; -webkit-tap-highlight-color:transparent;
      }
      #abs-email:hover { background:#0f172a; transform:translateY(-1px); }
      #abs-email:active { transform:scale(0.97); }

      /* خيارات */
      .abs-opt {
        display:flex; align-items:flex-start; gap:9px;
        padding:9px 10px; background:#f8fafc;
        border:1.5px solid #e2e8f0; border-radius:11px;
        cursor:pointer; margin-bottom:5px; transition:border-color 0.15s,background 0.15s;
        -webkit-tap-highlight-color:transparent;
      }
      .abs-opt:last-child { margin-bottom:0; }
      .abs-opt:hover { border-color:#a5b4fc; background:#eef2ff; }
      .abs-opt input { width:16px; height:16px; accent-color:#3b60d9; flex-shrink:0; cursor:pointer; margin-top:1px; }
      .abs-opt-t { font-size:11px; color:#374151; font-weight:700; line-height:1.4; user-select:none; }
      .abs-opt-t span { display:block; font-size:10px; color:#9ca3af; font-weight:500; margin-top:1px; }

      /* زر موافق */
      #abs-ok {
        width:100%; padding:12px;
        background:linear-gradient(135deg,#3b60d9,#1e40af);
        color:#fff; border:none; border-radius:12px;
        font-size:13px; font-weight:800;
        font-family:'Tajawal',sans-serif; cursor:pointer;
        box-shadow:0 4px 14px rgba(59,96,217,0.28);
        transition:all 0.15s; -webkit-tap-highlight-color:transparent;
      }
      #abs-ok:hover { transform:translateY(-1px); box-shadow:0 7px 20px rgba(59,96,217,0.35); }
      #abs-ok:active { transform:scale(0.97); }

      @supports (padding-bottom:env(safe-area-inset-bottom)) {
        #abs-mbody { padding-bottom:calc(16px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  function buildUI() {
    // الدائرة
    const dot = document.createElement("div");
    dot.id  = "abs-dot";
    dot.className = "abs-r";
    dot.textContent = "🚨";
    document.body.appendChild(dot);

    // البطاقة
    const card = document.createElement("div");
    card.id = "abs-card";
    card.className = "abs-r";

    const cardRows = mState.absences.map(a => `
      <div class="abs-card-row">
        <span class="abs-card-date">📅 ${a.date}</span>
        <span class="abs-card-tag">غياب</span>
      </div>`).join("");

    card.innerHTML = `
      <div class="abs-card-header">
        <span class="abs-card-title-text">🚨 غياب مسجّل</span>
        <button class="abs-card-close" id="abs-card-close">✕</button>
      </div>
      <div class="abs-card-sub">${mState.absences.length} ${mState.absences.length===1?"يوم":"أيام"} — ${mState.empName.split(" ")[0]}</div>
      ${cardRows}
      <button class="abs-card-btn" id="abs-card-open-modal">عرض التفاصيل والخيارات ←</button>
    `;
    document.body.appendChild(card);

    const isModalDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    const isDotHidden      = localStorage.getItem("absHideDot_"   + mState.empId) === mState.hash;

    if (isDotHidden) return;

    if (isModalDismissed) {
      dot.classList.add("abs-on");
    } else {
      showMainModal();
    }

    // ضغطة أولى على الدائرة → فتح البطاقة
    dot.onclick = () => {
      if (card.classList.contains("abs-open")) {
        showMainModal();
      } else {
        card.classList.add("abs-open");
      }
    };

    // إغلاق البطاقة
    document.getElementById("abs-card-close").onclick = (e) => {
      e.stopPropagation();
      card.classList.remove("abs-open");
    };

    // زر "عرض التفاصيل" داخل البطاقة → فتح النافذة
    document.getElementById("abs-card-open-modal").onclick = (e) => {
      e.stopPropagation();
      card.classList.remove("abs-open");
      showMainModal();
    };
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const firstName = mState.empName.split(" ")[0];
    const count     = mState.absences.length;

    const mailBody = encodeURIComponent(
      `السلام عليكم،\n\nأفيدكم بأن الموظف ${mState.empName} (رقم: ${mState.empId}) لديه غياب مسجّل في التواريخ التالية:\n` +
      mState.absences.map(a => `• ${a.date}`).join("\n") +
      `\n\nأرجو مراجعة الأمر.\n\nشكراً`
    );
    const mailHref = `mailto:admin@school.edu.sa?subject=${encodeURIComponent("تنبيه غياب — " + mState.empName)}&body=${mailBody}`;

    const dateRows = mState.absences.map(a => `
      <div class="ab-row">
        <div class="ab-left"><span class="ab-emoji">📅</span><span class="ab-date">${a.date}</span></div>
        <span class="ab-tag">غياب</span>
      </div>`).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-r";
    ov.innerHTML = `
      <div id="abs-modal">

        <div id="abs-mhead">
          <div class="abs-mhead-row">
            <div class="abs-mbadge">🚨 تنبيه غياب</div>
            <button class="abs-mxbtn" id="abs-xbtn">✕</button>
          </div>
          <div class="abs-mtitle">مرحباً ${firstName} 👋</div>
          <div class="abs-msub">لديك ${count} ${count===1?"يوم غياب":"أيام غياب"} مسجّلة</div>
        </div>

        <div id="abs-mbody">

          <div class="abs-mc">
            <div class="abs-mc-title">💡 سبب ظهور التنبيه</div>
            <div class="abs-reason">رصد <b>نظام الحضور</b> غياباً باسمك. إن كان خطأ راسل <b>الإدارة</b>.</div>
          </div>

          <div class="abs-mc">
            <div class="abs-mc-title">📅 التواريخ</div>
            ${dateRows}
          </div>

          <a id="abs-email" href="${mailHref}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            مراسلة الإدارة عبر البريد
          </a>

          <div class="abs-mc">
            <div class="abs-mc-title">⚙️ خيارات العرض</div>
            <label class="abs-opt">
              <input type="checkbox" id="abs-hide-check">
              <div class="abs-opt-t">عدم إظهار النافذة تلقائياً<span>ستبقى أيقونة التنبيه</span></div>
            </label>
            <label class="abs-opt">
              <input type="checkbox" id="abs-hide-dot">
              <div class="abs-opt-t">إخفاء كل شيء حتى التحديث القادم<span>لن يظهر تنبيه إلا عند غياب جديد</span></div>
            </label>
          </div>

          <button id="abs-ok">حسناً، فهمت ✓</button>

        </div>
      </div>`;
    document.body.appendChild(ov);

    document.getElementById("abs-xbtn").onclick = () => closeModal(ov, false, false);
    document.getElementById("abs-ok").onclick = () => closeModal(ov,
      document.getElementById("abs-hide-check").checked,
      document.getElementById("abs-hide-dot").checked
    );
  }

  function closeModal(ov, hideModal, hideDot) {
    ov.style.transition = "opacity 0.22s ease";
    ov.style.opacity = "0";
    const m = document.getElementById("abs-modal");
    if (m) { m.style.transition = "transform 0.22s ease"; m.style.transform = "translateY(100%)"; }
    setTimeout(() => {
      ov.remove();
      const dot = document.getElementById("abs-dot");
      if (!dot) return;
      if (hideDot) {
        localStorage.setItem("absHideDot_" + mState.empId, mState.hash);
        dot.style.display = "none";
      } else if (hideModal) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
        dot.classList.add("abs-on");
      } else {
        dot.classList.add("abs-on");
      }
    }, 250);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  else setTimeout(init, 500);
})();
