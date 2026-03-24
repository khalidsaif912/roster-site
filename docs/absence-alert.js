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
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800;900&display=swap');
      .abs-font, .abs-font * { box-sizing: border-box; font-family: 'Tajawal', sans-serif; direction: rtl; }

      /* ══ الدائرة المدارية ══ */
      #abs-fab-wrap {
        position: fixed; left: 22px; bottom: 26px;
        z-index: 999999; width: 56px; height: 56px;
        cursor: pointer; display: none;
      }
      #abs-fab-wrap.show { display: block; animation: fabAppear 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
      @keyframes fabAppear { from { opacity:0; transform:scale(0.4); } to { opacity:1; transform:scale(1); } }

      .abs-orbit {
        position: absolute; inset: 0;
        animation: orbitSpin 4s linear infinite;
      }
      .abs-orbit-dot {
        position: absolute; width: 6px; height: 6px;
        background: #dc2626; border-radius: 50%;
      }
      .abs-orbit-dot:nth-child(1) { top: 0;   left: 50%; transform: translateX(-50%); }
      .abs-orbit-dot:nth-child(2) { bottom: 0; left: 50%; transform: translateX(-50%); }
      .abs-orbit-dot:nth-child(3) { left: 0;  top: 50%;  transform: translateY(-50%); }
      .abs-orbit-dot:nth-child(4) { right: 0; top: 50%;  transform: translateY(-50%); }
      @keyframes orbitSpin { to { transform: rotate(360deg); } }

      .abs-fab-core {
        position: absolute; inset: 10px;
        background: #dc2626; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 3px 10px rgba(220,38,38,0.4);
        animation: corePulse 2s ease-in-out infinite;
        z-index: 1;
      }
      .abs-fab-core::after {
        content: '!'; color: #fff;
        font-size: 18px; font-weight: 900;
        font-family: 'Tajawal', sans-serif;
        animation: symbolFlip 4s step-end infinite;
      }
      @keyframes corePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
      @keyframes symbolFlip { 0%,49%{content:'!'} 50%,99%{content:'?'} }

      .abs-fab-badge {
        position: absolute; top: -2px; right: -2px;
        background: #1e293b; color: #fff;
        font-size: 9px; font-weight: 900;
        min-width: 17px; height: 17px;
        border-radius: 99px; display: flex;
        align-items: center; justify-content: center;
        padding: 0 3px; border: 2px solid #fff;
        font-family: 'Tajawal', sans-serif; line-height: 1;
        z-index: 2;
      }

      /* ══ Overlay ══ */
      #abs-overlay {
        position: fixed; inset: 0; z-index: 1000000;
        display: flex; align-items: flex-end; justify-content: center;
        background: rgba(8,12,24,0.55);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        opacity: 0; animation: ovIn 0.28s ease forwards;
      }
      @media (min-width: 520px) { #abs-overlay { align-items: center; } }
      @keyframes ovIn { to { opacity:1; } }

      /* ══ النافذة — مضغوطة ══ */
      #abs-modal {
        background: #fff; width: 100%; max-width: 370px;
        border-radius: 22px 22px 0 0; overflow: hidden;
        transform: translateY(100%);
        animation: shUp 0.42s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      @media (min-width: 520px) {
        #abs-modal {
          border-radius: 22px;
          transform: scale(0.93) translateY(12px);
          animation: mIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
        }
      }
      @keyframes shUp { to { transform: translateY(0); } }
      @keyframes mIn  { to { transform: scale(1) translateY(0); } }

      /* drag handle */
      #abs-modal::before {
        content: ''; display: block;
        width: 32px; height: 3px; background: #e2e8f0;
        border-radius: 99px; margin: 10px auto 0;
      }
      @media (min-width: 520px) { #abs-modal::before { display:none; } }

      /* ── هيدر أحمر مضغوط ── */
      #abs-mhead {
        background: linear-gradient(135deg, #c81e1e 0%, #7f1d1d 100%);
        padding: 14px 16px 12px;
        position: relative; overflow: hidden;
      }
      #abs-mhead::before {
        content: ''; position: absolute;
        width: 160px; height: 160px; background: rgba(255,255,255,0.06);
        border-radius: 50%; top: -70px; left: -40px; pointer-events: none;
      }
      .abs-mhead-row {
        display: flex; align-items: center;
        justify-content: space-between; margin-bottom: 8px; position: relative; z-index:1;
      }
      .abs-chip {
        display: inline-flex; align-items: center; gap: 4px;
        background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.22);
        border-radius: 99px; padding: 3px 10px;
        font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.92); letter-spacing: 0.3px;
      }
      .abs-xbtn {
        width: 26px; height: 26px; background: rgba(255,255,255,0.15);
        border: none; border-radius: 50%; color: rgba(255,255,255,0.85);
        font-size: 13px; font-weight: 700; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.18s; font-family: 'Tajawal', sans-serif;
        -webkit-tap-highlight-color: transparent; flex-shrink: 0;
      }
      .abs-xbtn:hover { background: rgba(255,255,255,0.28); }
      .abs-mhead-title {
        font-size: 16px; font-weight: 900; color: #fff;
        line-height: 1.2; position: relative; z-index:1; margin-bottom: 2px;
      }
      .abs-mhead-sub {
        font-size: 11px; color: rgba(255,255,255,0.68);
        font-weight: 500; position: relative; z-index:1;
      }

      /* ── جسم النافذة ── */
      #abs-mbody { padding: 12px 14px 16px; }

      /* بوكس السبب */
      .abs-why {
        display: flex; gap: 8px; align-items: flex-start;
        background: #fffbeb; border: 1.5px solid #fde68a;
        border-radius: 11px; padding: 10px 11px; margin-bottom: 12px;
      }
      .abs-why-ico { font-size: 15px; flex-shrink:0; margin-top:1px; }
      .abs-why-txt { font-size: 11px; color: #78350f; font-weight: 600; line-height: 1.6; }
      .abs-why-txt b { color: #92400e; }

      /* صفوف التواريخ */
      .abs-dates { margin-bottom: 12px; }
      .ab-row {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 11px; background: #fef2f2;
        border: 1.5px solid #fecaca; border-radius: 10px; margin-bottom: 5px;
        transition: transform 0.12s ease;
      }
      .ab-row:last-child { margin-bottom: 0; }
      .ab-row:hover { transform: translateX(-2px); }
      .ab-dot { width: 6px; height: 6px; background: #dc2626; border-radius: 50%; flex-shrink:0; }
      .ab-date { font-size: 12px; font-weight: 800; color: #991b1b; flex:1; }
      .ab-tag {
        font-size: 10px; color: #dc2626; background: #fff;
        border: 1px solid #fca5a5; border-radius: 5px;
        padding: 1px 6px; font-weight: 700; flex-shrink:0;
      }

      /* زر الإيميل */
      #abs-email-btn {
        display: flex; align-items: center; justify-content: center; gap: 7px;
        width: 100%; padding: 11px 14px;
        background: #0f172a; color: #fff; text-decoration: none;
        border-radius: 11px; font-size: 12px; font-weight: 800;
        font-family: 'Tajawal', sans-serif;
        box-shadow: 0 3px 12px rgba(15,23,42,0.2);
        transition: all 0.18s ease; margin-bottom: 10px;
        -webkit-tap-highlight-color: transparent;
        border: none; cursor: pointer;
      }
      #abs-email-btn:hover { background:#1e293b; transform:translateY(-1px); }
      #abs-email-btn:active { transform:scale(0.97); }

      /* فاصل */
      .abs-sep { height:1px; background: linear-gradient(to right,transparent,#e2e8f0,transparent); margin: 10px 0; }

      /* خيارات الإخفاء */
      .abs-opts { margin-bottom: 10px; }
      .abs-opt {
        display: flex; align-items: flex-start; gap: 9px;
        padding: 9px 11px; background: #f8fafc;
        border: 1.5px solid #e8eef4; border-radius: 10px;
        cursor: pointer; margin-bottom: 6px;
        transition: all 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-opt:last-child { margin-bottom: 0; }
      .abs-opt:hover { background:#f1f5f9; border-color:#cbd5e1; }
      .abs-opt input[type="checkbox"] {
        width:16px; height:16px; accent-color:#dc2626;
        flex-shrink:0; cursor:pointer; margin-top:2px;
      }
      .abs-opt-txt { font-size: 11px; color:#475569; font-weight:700; line-height:1.4; user-select:none; }
      .abs-opt-txt span { display:block; font-size:10px; color:#94a3b8; font-weight:500; margin-top:1px; }

      /* زر موافق */
      #abs-ok {
        width:100%; padding: 12px;
        background: linear-gradient(135deg, #ef4444, #b91c1c);
        color:#fff; border:none; border-radius:11px;
        font-size:13px; font-weight:800;
        font-family:'Tajawal',sans-serif; cursor:pointer;
        box-shadow: 0 4px 14px -3px rgba(220,38,38,0.45);
        transition: all 0.18s ease;
        -webkit-tap-highlight-color: transparent;
      }
      #abs-ok:hover { transform:translateY(-1px); box-shadow:0 7px 18px -4px rgba(220,38,38,0.5); }
      #abs-ok:active { transform:scale(0.97); }

      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        #abs-mbody { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  function buildUI() {
    // الدائرة المدارية
    const wrap = document.createElement("div");
    wrap.id = "abs-fab-wrap";
    wrap.className = "abs-font";
    wrap.innerHTML = `
      <div class="abs-orbit">
        <div class="abs-orbit-dot"></div>
        <div class="abs-orbit-dot"></div>
        <div class="abs-orbit-dot"></div>
        <div class="abs-orbit-dot"></div>
      </div>
      <div class="abs-fab-core"></div>
      <div class="abs-fab-badge">${mState.absences.length}</div>
    `;
    document.body.appendChild(wrap);

    const isModalDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    const isDotHidden      = localStorage.getItem("absHideDot_"   + mState.empId) === mState.hash;

    if (isDotHidden) return;
    if (isModalDismissed) wrap.classList.add("show");
    else showMainModal();

    wrap.onclick = () => showMainModal();
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const firstName = mState.empName.split(" ")[0];
    const count     = mState.absences.length;

    const emailBody    = encodeURIComponent(
      `السلام عليكم،\n\nأفيدكم بأن الموظف ${mState.empName} (رقم: ${mState.empId}) لديه غياب مسجّل في التواريخ التالية:\n` +
      mState.absences.map(a => `• ${a.date}`).join("\n") +
      `\n\nأرجو مراجعة هذا الأمر.\n\nشكراً`
    );
    const emailSubject = encodeURIComponent(`تنبيه غياب — ${mState.empName}`);
    const mailHref     = `mailto:admin@school.edu.sa?subject=${emailSubject}&body=${emailBody}`;

    const dateRows = mState.absences.map(a => `
      <div class="ab-row">
        <div class="ab-dot"></div>
        <div class="ab-date">${a.date}</div>
        <div class="ab-tag">غياب</div>
      </div>`).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    ov.innerHTML = `
      <div id="abs-modal">

        <div id="abs-mhead">
          <div class="abs-mhead-row">
            <div class="abs-chip">⚠️ تنبيه رسمي</div>
            <button class="abs-xbtn" id="abs-xbtn">✕</button>
          </div>
          <div class="abs-mhead-title">مرحباً ${firstName}، لديك ${count} ${count===1?"يوم غياب":"أيام غياب"}</div>
          <div class="abs-mhead-sub">يرجى مراجعة سجل الحضور الخاص بك</div>
        </div>

        <div id="abs-mbody">

          <div class="abs-why">
            <div class="abs-why-ico">💡</div>
            <div class="abs-why-txt">
              رصد <b>نظام الحضور</b> غياباً مسجّلاً باسمك.
              إن اعتقدت بوجود خطأ، راسل <b>الإدارة</b> مباشرةً.
            </div>
          </div>

          <div class="abs-dates">${dateRows}</div>

          <a id="abs-email-btn" href="${mailHref}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            مراسلة الإدارة عبر البريد
          </a>

          <div class="abs-sep"></div>

          <div class="abs-opts">
            <label class="abs-opt">
              <input type="checkbox" id="abs-hide-check">
              <div class="abs-opt-txt">
                عدم إظهار النافذة تلقائياً
                <span>ستبقى أيقونة التنبيه ظاهرة</span>
              </div>
            </label>
            <label class="abs-opt">
              <input type="checkbox" id="abs-hide-dot-check">
              <div class="abs-opt-txt">
                إخفاء كل شيء حتى التحديث القادم
                <span>لن يظهر أي تنبيه إلا عند غياب جديد</span>
              </div>
            </label>
          </div>

          <button id="abs-ok">حسناً، فهمت ✓</button>

        </div>
      </div>`;
    document.body.appendChild(ov);

    document.getElementById("abs-xbtn").onclick = () => closeModal(ov, false, false);
    document.getElementById("abs-ok").onclick = () => closeModal(ov,
      document.getElementById("abs-hide-check").checked,
      document.getElementById("abs-hide-dot-check").checked
    );
  }

  function closeModal(ov, hideModal, hideDot) {
    ov.style.transition = "opacity 0.28s ease";
    ov.style.opacity = "0";
    const m = document.getElementById("abs-modal");
    if (m) { m.style.transition = "transform 0.28s ease"; m.style.transform = "translateY(100%)"; }
    setTimeout(() => {
      ov.remove();
      const fab = document.getElementById("abs-fab-wrap");
      if (!fab) return;
      if (hideDot) {
        localStorage.setItem("absHideDot_" + mState.empId, mState.hash);
        fab.style.display = "none";
      } else if (hideModal) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
        fab.classList.add("show");
      } else {
        fab.classList.add("show");
      }
    }, 300);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  else setTimeout(init, 500);
})();
