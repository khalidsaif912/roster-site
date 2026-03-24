(function () {
  "use strict";

  // ─── الإعدادات والبيانات ──────────────────────────────────────────────────
  const PATH_ROSTER = "/roster-site/";
  const DATA_URL = (function () {
    const origin = location.origin;
    const base = location.pathname.includes(PATH_ROSTER) ? origin + PATH_ROSTER : origin;
    return base + "/absence-data.json";
  })();

  let mState = { empName: "", absences: [], empId: "", hash: "" };

  // ─── وظائف المساعدة ──────────────────────────────────────────────────────
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
        results.push({ date: rec.date });
        matched = true;
      }
      if (!matched && cleanName) {
        rec.names.forEach(n => { if (nameMatch(cleanName, n)) results.push({ date: rec.date }); });
      }
    });
    return results;
  }

  // ─── التهيئة ──────────────────────────────────────────────────────────────
  function init() {
    const empId = localStorage.getItem("savedEmpId");
    if (!empId) return;

    const base = location.pathname.includes(PATH_ROSTER) ? location.origin + PATH_ROSTER : location.origin + "/";

    Promise.all([
      fetch(`${base}schedules/${empId}.json`).then(r => r.ok ? r.json() : null),
      fetch(`${DATA_URL}?v=${Date.now()}`).then(r => r.ok ? r.json() : null),
    ]).then(res => {
      const [emp, absData] = res;
      if (!emp || !emp.name || !absData || !absData.records) return;

      const absences = findAbsences(empId, emp.name, absData.records);
      if (!absences.length) return;

      mState = {
        empName: emp.name,
        absences: absences,
        empId: empId,
        hash: absences.map(a => a.date).join("|")
      };

      injectStyles();
      buildUI();
    });
  }

  // ─── التنسيقات ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-styles")) return;
    const s = document.createElement("style");
    s.id = "abs-styles";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');

      .abs-font, .abs-font * { box-sizing: border-box; font-family: 'Tajawal', sans-serif; direction: rtl; }

      /* ════════════════════════════════
         الزر العائم (FAB)
      ════════════════════════════════ */
      #abs-fab {
        position: fixed;
        left: 20px;
        bottom: 24px;
        z-index: 999999;
        width: 46px;
        height: 46px;
        background: #dc2626;
        border-radius: 50%;
        cursor: pointer;
        display: none;
        box-shadow: 0 4px 16px rgba(220,38,38,0.45);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      #abs-fab::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: center;
        background-size: 24px;
      }
      #abs-fab-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #1e293b;
        color: #fff;
        font-size: 10px;
        font-weight: 900;
        min-width: 18px;
        height: 18px;
        border-radius: 99px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        border: 2px solid #fff;
        font-family: 'Tajawal', sans-serif;
        line-height: 1;
      }
      #abs-fab:hover { transform: scale(1.08); box-shadow: 0 6px 22px rgba(220,38,38,0.55); }
      #abs-fab:active { transform: scale(0.95); }
      @keyframes fabPop {
        0% { transform: scale(0); opacity: 0; }
        80% { transform: scale(1.12); }
        100% { transform: scale(1); opacity: 1; }
      }
      #abs-fab.show { display: block; animation: fabPop 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }

      /* ════════════════════════════════
         Overlay
      ════════════════════════════════ */
      #abs-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000000;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        background: rgba(8,12,24,0.6);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        opacity: 0;
        animation: ovIn 0.3s ease forwards;
      }
      @media (min-width: 540px) { #abs-overlay { align-items: center; } }
      @keyframes ovIn { to { opacity: 1; } }

      /* ════════════════════════════════
         النافذة
      ════════════════════════════════ */
      #abs-modal {
        background: #fff;
        width: 100%;
        max-width: 420px;
        border-radius: 28px 28px 0 0;
        overflow: hidden;
        transform: translateY(110%);
        animation: sheetUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        max-height: 92dvh;
        display: flex;
        flex-direction: column;
      }
      @media (min-width: 540px) {
        #abs-modal {
          border-radius: 28px;
          transform: scale(0.92) translateY(16px);
          animation: modalIn 0.45s cubic-bezier(0.16,1,0.3,1) forwards;
          max-height: 88dvh;
        }
      }
      @keyframes sheetUp { to { transform: translateY(0); } }
      @keyframes modalIn { to { transform: scale(1) translateY(0); } }

      /* drag handle */
      #abs-modal::before {
        content: '';
        display: block;
        flex-shrink: 0;
        width: 36px; height: 4px;
        background: #dde3ec;
        border-radius: 99px;
        margin: 12px auto 0;
      }
      @media (min-width: 540px) { #abs-modal::before { display: none; } }

      /* ════════════════════════════════
         هيدر أحمر
      ════════════════════════════════ */
      #abs-modal-header {
        flex-shrink: 0;
        background: linear-gradient(150deg, #b91c1c 0%, #7f1d1d 100%);
        padding: 20px 18px 16px;
        position: relative;
        overflow: hidden;
      }
      #abs-modal-header::before {
        content: '';
        position: absolute;
        width: 200px; height: 200px;
        background: rgba(255,255,255,0.06);
        border-radius: 50%;
        top: -80px; left: -50px;
        pointer-events: none;
      }
      #abs-modal-header::after {
        content: '';
        position: absolute;
        width: 130px; height: 130px;
        background: rgba(255,255,255,0.05);
        border-radius: 50%;
        bottom: -60px; right: -20px;
        pointer-events: none;
      }

      .abs-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        position: relative; z-index: 1;
      }
      .abs-header-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(255,255,255,0.15);
        border: 1px solid rgba(255,255,255,0.25);
        border-radius: 99px;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 700;
        color: rgba(255,255,255,0.95);
        letter-spacing: 0.3px;
      }
      .abs-close-x {
        width: 28px; height: 28px;
        background: rgba(255,255,255,0.15);
        border: none;
        border-radius: 50%;
        color: rgba(255,255,255,0.85);
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
        font-family: 'Tajawal', sans-serif;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-close-x:hover { background: rgba(255,255,255,0.28); }

      .abs-header-title {
        font-size: 19px;
        font-weight: 900;
        color: #fff;
        line-height: 1.25;
        margin-bottom: 3px;
        position: relative; z-index: 1;
      }
      .abs-header-sub {
        font-size: 12px;
        color: rgba(255,255,255,0.72);
        font-weight: 500;
        position: relative; z-index: 1;
        margin-bottom: 14px;
      }

      .abs-count-strip {
        display: flex;
        gap: 8px;
        position: relative; z-index: 1;
      }
      .abs-count-card {
        flex: 1;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 12px;
        padding: 9px 10px;
        text-align: center;
      }
      .abs-count-num {
        font-size: 20px;
        font-weight: 900;
        color: #fff;
        line-height: 1;
        display: block;
      }
      .abs-count-lbl {
        font-size: 10px;
        color: rgba(255,255,255,0.65);
        font-weight: 600;
        margin-top: 3px;
        display: block;
      }

      /* ════════════════════════════════
         جسم النافذة
      ════════════════════════════════ */
      #abs-modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px 14px 20px;
        scrollbar-width: thin;
        scrollbar-color: #e2e8f0 transparent;
      }
      #abs-modal-body::-webkit-scrollbar { width: 4px; }
      #abs-modal-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }

      .abs-section-label {
        font-size: 10px;
        font-weight: 800;
        color: #94a3b8;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 8px;
        padding-right: 2px;
      }

      /* ── بوكس "لماذا تظهر" ── */
      .abs-why-box {
        background: #fffbeb;
        border: 1.5px solid #fde68a;
        border-radius: 13px;
        padding: 12px 13px;
        margin-bottom: 14px;
        display: flex;
        gap: 9px;
        align-items: flex-start;
      }
      .abs-why-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
      .abs-why-text { font-size: 12px; color: #78350f; font-weight: 600; line-height: 1.65; }
      .abs-why-text b { color: #92400e; }

      /* ── قائمة التواريخ ── */
      .abs-dates-list { margin-bottom: 14px; }
      .ab-row {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 12px;
        background: #fef2f2;
        border: 1.5px solid #fecaca;
        border-radius: 11px;
        margin-bottom: 6px;
        transition: transform 0.15s ease;
      }
      .ab-row:last-child { margin-bottom: 0; }
      .ab-row:hover { transform: translateX(-2px); }
      .ab-row-dot { width: 7px; height: 7px; background: #dc2626; border-radius: 50%; flex-shrink: 0; }
      .ab-row-date { font-size: 13px; font-weight: 800; color: #991b1b; flex: 1; }
      .ab-row-tag {
        font-size: 10px; color: #dc2626;
        background: #fff; border: 1px solid #fca5a5;
        border-radius: 6px; padding: 2px 7px; font-weight: 700; flex-shrink: 0;
      }

      /* ── زر الإيميل ── */
      #abs-email-btn {
        width: 100%;
        padding: 13px 14px;
        background: #0f172a;
        color: #fff;
        border: none;
        border-radius: 13px;
        font-size: 13px;
        font-weight: 800;
        font-family: 'Tajawal', sans-serif;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-bottom: 14px;
        text-decoration: none;
        box-shadow: 0 4px 14px rgba(15,23,42,0.2);
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }
      #abs-email-btn:hover { background: #1e293b; transform: translateY(-1px); }
      #abs-email-btn:active { transform: scale(0.97); }

      /* ── فاصل ── */
      .abs-sep {
        height: 1px;
        background: linear-gradient(to right, transparent, #e2e8f0, transparent);
        margin: 12px 0;
      }

      /* ── خيارات الإخفاء ── */
      .abs-options { margin-bottom: 12px; }
      .abs-opt-label {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        background: #f8fafc;
        border: 1.5px solid #e8eef4;
        border-radius: 11px;
        cursor: pointer;
        margin-bottom: 7px;
        transition: all 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-opt-label:last-child { margin-bottom: 0; }
      .abs-opt-label:hover { background: #f1f5f9; border-color: #cbd5e1; }
      .abs-opt-label input[type="checkbox"] {
        width: 17px; height: 17px; accent-color: #dc2626;
        flex-shrink: 0; cursor: pointer; margin-top: 2px;
      }
      .abs-opt-text { font-size: 12px; color: #475569; font-weight: 700; line-height: 1.4; user-select: none; }
      .abs-opt-text span { display: block; font-size: 11px; color: #94a3b8; font-weight: 500; margin-top: 2px; }

      /* ── زر موافق ── */
      #abs-main-close {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #ef4444, #b91c1c);
        color: #fff;
        border: none;
        border-radius: 13px;
        font-size: 14px;
        font-weight: 800;
        font-family: 'Tajawal', sans-serif;
        cursor: pointer;
        box-shadow: 0 5px 16px -4px rgba(220,38,38,0.45);
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }
      #abs-main-close:hover { transform: translateY(-2px); box-shadow: 0 8px 22px -5px rgba(220,38,38,0.5); }
      #abs-main-close:active { transform: scale(0.97); }

      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        #abs-modal-body { padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── بناء الواجهة ─────────────────────────────────────────────────────────
  function buildUI() {
    const fab = document.createElement("div");
    fab.id = "abs-fab";
    fab.className = "abs-font";
    fab.innerHTML = `<div id="abs-fab-badge">${mState.absences.length}</div>`;
    document.body.appendChild(fab);

    const isModalDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    const isDotHidden      = localStorage.getItem("absHideDot_"   + mState.empId) === mState.hash;

    if (isDotHidden) return;
    if (isModalDismissed) {
      fab.classList.add("show");
    } else {
      showMainModal();
    }

    fab.onclick = () => showMainModal();
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const firstName = mState.empName.split(" ")[0];
    const count     = mState.absences.length;

    const dateRows = mState.absences.map(a => `
      <div class="ab-row">
        <div class="ab-row-dot"></div>
        <div class="ab-row-date">${a.date}</div>
        <div class="ab-row-tag">غياب</div>
      </div>
    `).join("");

    const emailBody = encodeURIComponent(
      `السلام عليكم،\n\nأفيدكم بأن الموظف ${mState.empName} (رقم: ${mState.empId}) لديه غياب مسجّل في التواريخ التالية:\n` +
      mState.absences.map(a => `• ${a.date}`).join("\n") +
      `\n\nأرجو مراجعة هذا الأمر واتخاذ الإجراء المناسب.\n\nشكراً`
    );
    const emailSubject = encodeURIComponent(`تنبيه غياب — ${mState.empName}`);
    const mailtoHref   = `mailto:admin@school.edu.sa?subject=${emailSubject}&body=${emailBody}`;

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    ov.innerHTML = `
      <div id="abs-modal">

        <div id="abs-modal-header">
          <div class="abs-header-top">
            <div class="abs-header-chip">⚠️ تنبيه رسمي</div>
            <button class="abs-close-x" id="abs-x-btn">✕</button>
          </div>
          <div class="abs-header-title">مرحباً ${firstName}،<br>لديك غياب مسجّل</div>
          <div class="abs-header-sub">يرجى مراجعة سجل الحضور الخاص بك</div>
          <div class="abs-count-strip">
            <div class="abs-count-card">
              <span class="abs-count-num">${count}</span>
              <span class="abs-count-lbl">${count === 1 ? "يوم غياب" : "أيام غياب"}</span>
            </div>
            <div class="abs-count-card">
              <span class="abs-count-num" style="font-size:17px;padding-top:2px;">🗓️</span>
              <span class="abs-count-lbl">آخر تحديث اليوم</span>
            </div>
          </div>
        </div>

        <div id="abs-modal-body">

          <div class="abs-section-label">سبب ظهور هذا التنبيه</div>
          <div class="abs-why-box">
            <div class="abs-why-icon">💡</div>
            <div class="abs-why-text">
              رصد <b>نظام الحضور</b> غياباً مسجّلاً باسمك في التواريخ أدناه.
              إن اعتقدت بوجود خطأ، يمكنك <b>مراسلة الإدارة</b> مباشرةً عبر الزر أدناه.
            </div>
          </div>

          <div class="abs-section-label">التواريخ المسجّلة</div>
          <div class="abs-dates-list">${dateRows}</div>

          <a id="abs-email-btn" href="${mailtoHref}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            مراسلة الإدارة عبر البريد
          </a>

          <div class="abs-sep"></div>

          <div class="abs-section-label">خيارات العرض</div>
          <div class="abs-options">
            <label class="abs-opt-label">
              <input type="checkbox" id="abs-hide-check">
              <div class="abs-opt-text">
                عدم إظهار النافذة تلقائياً
                <span>ستبقى أيقونة التنبيه ظاهرة في الشاشة</span>
              </div>
            </label>
            <label class="abs-opt-label">
              <input type="checkbox" id="abs-hide-dot-check">
              <div class="abs-opt-text">
                إخفاء كل شيء حتى التحديث القادم
                <span>لن يظهر أي تنبيه إلا عند تسجيل غياب جديد</span>
              </div>
            </label>
          </div>

          <button id="abs-main-close">حسناً، فهمت ✓</button>

        </div>
      </div>
    `;
    document.body.appendChild(ov);

    document.getElementById("abs-x-btn").onclick = () => closeModal(ov, false, false);
    document.getElementById("abs-main-close").onclick = function () {
      closeModal(ov,
        document.getElementById("abs-hide-check").checked,
        document.getElementById("abs-hide-dot-check").checked
      );
    };
  }

  function closeModal(ov, hideModal, hideDot) {
    ov.style.transition = "opacity 0.3s ease";
    ov.style.opacity = "0";
    const modal = document.getElementById("abs-modal");
    if (modal) {
      modal.style.transition = "transform 0.3s cubic-bezier(0.4,0,1,1)";
      modal.style.transform  = "translateY(110%)";
    }
    setTimeout(() => {
      ov.remove();
      const fab = document.getElementById("abs-fab");
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
    }, 320);
  }

  // ─── تشغيل ────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
})();
