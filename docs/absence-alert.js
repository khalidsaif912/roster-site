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
        width: 54px; height: 54px;
        background: #1e293b;
        border-radius: 50%;
        display: none;
        align-items: center; justify-content: center;
        font-size: 26px;
        line-height: 1;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        cursor: pointer;
        border: 3px solid #fff;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.18s;
        animation: dotPulse 2.5s ease-in-out infinite;
      }
      #abs-dot.abs-on { display: flex; animation: dotIn 0.35s cubic-bezier(0.16,1,0.3,1), dotPulse 2.5s ease-in-out 0.35s infinite; }
      #abs-dot:active { transform: scale(0.9); }
      @keyframes dotIn {
        from { opacity:0; transform:scale(0.4); }
        to   { opacity:1; transform:scale(1); }
      }
      @keyframes dotPulse {
        0%,100% { box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
        50%     { box-shadow: 0 4px 24px rgba(0,0,0,0.35); transform: scale(1.05); }
      }

      /* ══ البطاقة ══ */
      #abs-card {
        position: fixed;
        bottom: 88px; left: 14px;
        z-index: 999997;
        width: 220px;
        background: #fff;
        border-radius: 16px;
        padding: 12px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.12);
        border: 1px solid #e2e8f0;
        display: none;
        flex-direction: column;
        gap: 6px;
        transform-origin: bottom left;
      }
      #abs-card.abs-open {
        display: flex;
        animation: cardIn 0.28s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes cardIn {
        from { opacity:0; transform:scale(0.88) translateY(8px); }
        to   { opacity:1; transform:scale(1) translateY(0); }
      }

      .abs-card-top {
        display:flex; align-items:center; justify-content:space-between;
      }
      .abs-card-label {
        font-size: 12px; font-weight: 800; color: #1e293b;
      }
      .abs-card-x {
        background: none; border: none; font-size: 14px;
        color: #94a3b8; cursor: pointer; padding: 0 2px;
        font-family: 'Tajawal',sans-serif; line-height:1;
        -webkit-tap-highlight-color: transparent;
      }

      .abs-card-sub {
        font-size: 11px; color: #64748b; font-weight: 600;
        padding-bottom: 4px; border-bottom: 1px solid #f1f5f9;
      }

      .abs-card-row {
        font-size: 12px; font-weight: 700; color: #374151;
        padding: 5px 0;
        border-bottom: 1px dashed #f1f5f9;
        display: flex; align-items: center; gap: 6px;
      }
      .abs-card-row:last-of-type { border-bottom: none; }

      .abs-card-btn {
        margin-top: 2px;
        width: 100%; padding: 9px;
        background: #1e293b; color: #fff;
        border: none; border-radius: 10px;
        font-size: 12px; font-weight: 800;
        font-family: 'Tajawal',sans-serif;
        cursor: pointer; transition: opacity 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-card-btn:hover { opacity: 0.88; }
      .abs-card-btn:active { opacity: 0.75; }

      /* ══ Overlay ══ */
      #abs-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(15,23,42,0.45);
        backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
        display: flex; align-items: flex-end; justify-content: center;
        opacity: 0; animation: ovIn 0.22s ease forwards;
      }
      @media (min-width:500px) { #abs-overlay { align-items:center; } }
      @keyframes ovIn { to { opacity:1; } }

      /* ══ النافذة ══ */
      #abs-modal {
        width: 100%; max-width: 340px;
        background: #fff;
        border-radius: 20px 20px 0 0;
        overflow: hidden;
        box-shadow: 0 -2px 20px rgba(0,0,0,0.1);
        transform: translateY(100%);
        animation: shUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      @media (min-width:500px) {
        #abs-modal {
          border-radius: 20px;
          transform: scale(0.92) translateY(12px);
          animation: mIn 0.32s cubic-bezier(0.16,1,0.3,1) forwards;
        }
      }
      @keyframes shUp { to { transform:translateY(0); } }
      @keyframes mIn  { to { transform:scale(1) translateY(0); } }

      /* drag handle */
      #abs-modal::before {
        content:''; display:block;
        width:30px; height:3px; background:#e2e8f0;
        border-radius:99px; margin:8px auto 0;
      }
      @media (min-width:500px) { #abs-modal::before { display:none; } }

      /* هيدر النافذة — لون واحد فقط */
      #abs-mhead {
        background: #1e293b;
        padding: 12px 14px 10px;
      }
      .abs-mhead-row {
        display:flex; align-items:center;
        justify-content:space-between; margin-bottom:5px;
      }
      .abs-mtitle { font-size:14px; font-weight:800; color:#fff; }
      .abs-mxbtn {
        width:22px; height:22px;
        background:rgba(255,255,255,0.15); border:none;
        border-radius:50%; color:#fff; font-size:12px;
        font-weight:700; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        font-family:'Tajawal',sans-serif; flex-shrink:0;
        -webkit-tap-highlight-color:transparent;
      }
      .abs-msub { font-size:11px; color:rgba(255,255,255,0.6); font-weight:500; }

      /* جسم النافذة */
      #abs-mbody { padding:10px 12px 14px; display:flex; flex-direction:column; gap:8px; }

      /* سبب */
      .abs-reason {
        font-size:11px; color:#475569; font-weight:600;
        line-height:1.65; padding:10px 11px;
        background:#f8fafc; border-radius:11px;
        border-right:3px solid #1e293b;
      }

      /* صفوف التواريخ */
      .ab-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:8px 10px; border-radius:10px;
        background:#f8fafc; border:1px solid #e2e8f0;
        margin-bottom:5px;
      }
      .ab-row:last-child { margin-bottom:0; }
      .ab-date { font-size:12px; font-weight:800; color:#1e293b; }
      .ab-tag {
        font-size:10px; font-weight:700; color:#64748b;
        background:#e2e8f0; border-radius:99px; padding:2px 8px;
      }

      /* زر إيميل */
      #abs-email {
        display:flex; align-items:center; justify-content:center; gap:7px;
        width:100%; padding:11px;
        background:#f1f5f9; color:#1e293b;
        border-radius:11px; font-size:12px; font-weight:800;
        font-family:'Tajawal',sans-serif; text-decoration:none;
        border:1.5px solid #e2e8f0; cursor:pointer;
        transition:background 0.15s; -webkit-tap-highlight-color:transparent;
      }
      #abs-email:hover { background:#e2e8f0; }

      /* خيارات */
      .abs-opt {
        display:flex; align-items:flex-start; gap:9px;
        padding:9px 10px; background:#f8fafc;
        border:1px solid #e2e8f0; border-radius:10px;
        cursor:pointer; margin-bottom:5px;
        -webkit-tap-highlight-color:transparent;
      }
      .abs-opt:last-child { margin-bottom:0; }
      .abs-opt input { width:16px; height:16px; accent-color:#1e293b; flex-shrink:0; margin-top:1px; cursor:pointer; }
      .abs-opt-t { font-size:11px; color:#374151; font-weight:700; line-height:1.4; user-select:none; }
      .abs-opt-t span { display:block; font-size:10px; color:#9ca3af; font-weight:500; margin-top:1px; }

      /* زر موافق */
      #abs-ok {
        width:100%; padding:12px;
        background:#1e293b; color:#fff;
        border:none; border-radius:11px;
        font-size:13px; font-weight:800;
        font-family:'Tajawal',sans-serif; cursor:pointer;
        transition:opacity 0.15s; -webkit-tap-highlight-color:transparent;
      }
      #abs-ok:hover { opacity:0.88; }
      #abs-ok:active { opacity:0.75; }

      @supports (padding-bottom:env(safe-area-inset-bottom)) {
        #abs-mbody { padding-bottom:calc(14px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  function buildUI() {
    // الدائرة
    const dot = document.createElement("div");
    dot.id = "abs-dot";
    dot.className = "abs-r";
    dot.textContent = "❓";
    document.body.appendChild(dot);

    // البطاقة
    const card = document.createElement("div");
    card.id = "abs-card";
    card.className = "abs-r";

    const cardRows = mState.absences.map(a =>
      `<div class="abs-card-row">📅 ${a.date}</div>`
    ).join("");

    card.innerHTML = `
      <div class="abs-card-top">
        <span class="abs-card-label">غياب مسجّل</span>
        <button class="abs-card-x" id="abs-card-x">✕</button>
      </div>
      <div class="abs-card-sub">${mState.absences.length} ${mState.absences.length===1?"يوم":"أيام"} — ${mState.empName.split(" ")[0]}</div>
      ${cardRows}
      <button class="abs-card-btn" id="abs-card-detail">التفاصيل والخيارات</button>
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

    // ضغطة أولى → بطاقة، ضغطة ثانية → نافذة
    dot.onclick = () => {
      if (card.classList.contains("abs-open")) {
        card.classList.remove("abs-open");
        showMainModal();
      } else {
        card.classList.add("abs-open");
      }
    };

    document.getElementById("abs-card-x").onclick = (e) => {
      e.stopPropagation();
      card.classList.remove("abs-open");
    };

    document.getElementById("abs-card-detail").onclick = (e) => {
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
        <span class="ab-date">📅 ${a.date}</span>
        <span class="ab-tag">غياب</span>
      </div>`).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-r";
    ov.innerHTML = `
      <div id="abs-modal">
        <div id="abs-mhead">
          <div class="abs-mhead-row">
            <div class="abs-mtitle">مرحباً ${firstName} 👋</div>
            <button class="abs-mxbtn" id="abs-xbtn">✕</button>
          </div>
          <div class="abs-msub">لديك ${count} ${count===1?"يوم غياب":"أيام غياب"} مسجّلة في النظام</div>
        </div>

        <div id="abs-mbody">

          <div class="abs-reason">
            رصد نظام الحضور غياباً باسمك في التواريخ أدناه.
            إن اعتقدت بوجود خطأ راسل الإدارة مباشرةً.
          </div>

          <div>${dateRows}</div>

          <a id="abs-email" href="${mailHref}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            مراسلة الإدارة
          </a>

          <div>
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
    ov.style.transition = "opacity 0.2s ease";
    ov.style.opacity = "0";
    const m = document.getElementById("abs-modal");
    if (m) { m.style.transition = "transform 0.2s ease"; m.style.transform = "translateY(100%)"; }
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
    }, 230);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  else setTimeout(init, 500);
})();
