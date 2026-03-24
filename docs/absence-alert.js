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

      .abs-r { font-family: 'Tajawal', system-ui, sans-serif; direction: rtl; }
      .abs-r * { box-sizing: border-box; margin: 0; padding: 0; }

      /* ══ زر الإشعار العائم ══ */
      #abs-fab {
        position: fixed;
        bottom: 22px; left: 16px;
        z-index: 999998;
        display: none;
        align-items: center;
        gap: 7px;
        background: #ffffff;
        border: 1.5px solid #e0e7ff;
        border-radius: 99px;
        padding: 8px 14px 8px 8px;
        box-shadow: 0 4px 18px rgba(59,96,217,0.18), 0 1px 4px rgba(0,0,0,0.08);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: box-shadow 0.2s, transform 0.2s;
      }
      #abs-fab.abs-on {
        display: flex;
        animation: fabIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      #abs-fab:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(59,96,217,0.22); }
      #abs-fab:active { transform: scale(0.96); }
      @keyframes fabIn {
        from { opacity:0; transform: scale(0.7) translateY(12px); }
        to   { opacity:1; transform: scale(1) translateY(0); }
      }
      .abs-fab-icon {
        width: 34px; height: 34px;
        background: linear-gradient(135deg, #f87171, #dc2626);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 17px; flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(220,38,38,0.3);
      }
      .abs-fab-text { line-height: 1; }
      .abs-fab-text strong {
        display: block; font-size: 12px; font-weight: 800;
        color: #1e293b;
      }
      .abs-fab-text span {
        display: block; font-size: 10px; font-weight: 600;
        color: #64748b; margin-top: 1px;
      }
      .abs-fab-count {
        background: #dc2626; color: #fff;
        font-size: 11px; font-weight: 800;
        min-width: 20px; height: 20px;
        border-radius: 99px; display: flex;
        align-items: center; justify-content: center;
        padding: 0 5px; margin-right: 2px;
        font-family: 'Tajawal', sans-serif;
      }

      /* ══ Overlay ══ */
      #abs-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(30, 41, 80, 0.45);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        display: flex; align-items: flex-end; justify-content: center;
        opacity: 0; animation: ovIn 0.25s ease forwards;
      }
      @media (min-width: 500px) { #abs-overlay { align-items: center; } }
      @keyframes ovIn { to { opacity: 1; } }

      /* ══ النافذة ══ */
      #abs-modal {
        width: 100%; max-width: 400px;
        background: #f0f4ff;
        border-radius: 24px 24px 0 0;
        overflow: hidden;
        box-shadow: 0 -4px 40px rgba(59,96,217,0.15);
        transform: translateY(100%);
        animation: sheetUp 0.42s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      @media (min-width: 500px) {
        #abs-modal {
          border-radius: 24px;
          transform: scale(0.9) translateY(20px);
          animation: modalIn 0.38s cubic-bezier(0.16,1,0.3,1) forwards;
          box-shadow: 0 20px 60px rgba(59,96,217,0.2);
        }
      }
      @keyframes sheetUp { to { transform: translateY(0); } }
      @keyframes modalIn { to { transform: scale(1) translateY(0); } }

      /* drag handle */
      #abs-modal::before {
        content: ''; display: block;
        width: 36px; height: 4px; background: #c7d2fe;
        border-radius: 99px; margin: 11px auto 0;
      }
      @media (min-width: 500px) { #abs-modal::before { display: none; } }

      /* ══ الهيدر — متدرج أزرق مثل الموقع ══ */
      #abs-head {
        background: linear-gradient(135deg, #3b60d9 0%, #1e40af 60%, #1d4ed8 100%);
        padding: 18px 18px 16px;
        position: relative; overflow: hidden;
      }
      #abs-head::before {
        content: ''; position: absolute;
        width: 180px; height: 180px;
        background: rgba(255,255,255,0.08);
        border-radius: 50%; top: -80px; right: -50px;
        pointer-events: none;
      }
      #abs-head::after {
        content: ''; position: absolute;
        width: 100px; height: 100px;
        background: rgba(255,255,255,0.06);
        border-radius: 50%; bottom: -40px; left: 10px;
        pointer-events: none;
      }
      .abs-head-top {
        display: flex; align-items: center;
        justify-content: space-between;
        margin-bottom: 10px; position: relative; z-index:1;
      }
      .abs-head-badge {
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 99px; padding: 4px 12px;
        font-size: 11px; font-weight: 700;
        color: #fff; letter-spacing: 0.2px;
        display: flex; align-items: center; gap: 5px;
      }
      .abs-xbtn {
        width: 28px; height: 28px;
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.25);
        border-radius: 50%; color: #fff;
        font-size: 13px; font-weight: 700; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s; font-family: 'Tajawal', sans-serif;
        -webkit-tap-highlight-color: transparent; flex-shrink: 0;
      }
      .abs-xbtn:hover { background: rgba(255,255,255,0.3); }
      .abs-head-title {
        font-size: 18px; font-weight: 800; color: #fff;
        position: relative; z-index:1; margin-bottom: 2px; line-height: 1.25;
      }
      .abs-head-sub {
        font-size: 12px; color: rgba(255,255,255,0.75);
        font-weight: 500; position: relative; z-index:1;
      }

      /* ══ جسم النافذة ══ */
      #abs-body { padding: 14px 14px 20px; display: flex; flex-direction: column; gap: 10px; }

      /* بطاقة السبب — نفس بطاقات الموقع */
      .abs-card {
        background: #fff;
        border-radius: 16px;
        padding: 13px 14px;
        box-shadow: 0 1px 6px rgba(59,96,217,0.07);
      }
      .abs-card-title {
        font-size: 10px; font-weight: 800; color: #6b7280;
        letter-spacing: 0.8px; text-transform: uppercase;
        margin-bottom: 8px; display: flex; align-items: center; gap: 5px;
      }

      /* سبب الظهور */
      .abs-reason-text {
        font-size: 12px; color: #374151; font-weight: 600; line-height: 1.65;
      }
      .abs-reason-text b { color: #1e40af; }

      /* صفوف التواريخ — نفس أسلوب شرائح الموقع */
      .ab-row {
        display: flex; align-items: center; justify-content: space-between;
        background: #fef2f2;
        border-radius: 12px;
        padding: 10px 13px;
        margin-bottom: 6px;
        border-right: 4px solid #dc2626;
        transition: transform 0.12s;
      }
      .ab-row:last-child { margin-bottom: 0; }
      .ab-row:hover { transform: translateX(-2px); }
      .ab-row-left { display: flex; align-items: center; gap: 8px; }
      .ab-row-emoji { font-size: 16px; line-height: 1; }
      .ab-row-date { font-size: 13px; font-weight: 800; color: #991b1b; }
      .ab-row-tag {
        background: #dc2626; color: #fff;
        font-size: 10px; font-weight: 700;
        padding: 3px 9px; border-radius: 99px;
      }

      /* زر الإيميل — نفس بطاقات الموقع الداكنة */
      #abs-email-btn {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        width: 100%; padding: 13px 14px;
        background: #1e293b; color: #fff;
        border-radius: 14px; font-size: 13px; font-weight: 800;
        font-family: 'Tajawal', sans-serif; text-decoration: none;
        box-shadow: 0 3px 12px rgba(15,23,42,0.18);
        transition: all 0.18s; border: none; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      #abs-email-btn:hover { background: #0f172a; transform: translateY(-1px); }
      #abs-email-btn:active { transform: scale(0.97); }

      /* خيارات */
      .abs-opt {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 10px 12px; background: #f8fafc;
        border: 1.5px solid #e2e8f0; border-radius: 12px;
        cursor: pointer; margin-bottom: 7px;
        transition: border-color 0.15s, background 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-opt:last-child { margin-bottom: 0; }
      .abs-opt:hover { border-color: #a5b4fc; background: #eef2ff; }
      .abs-opt input[type="checkbox"] {
        width: 17px; height: 17px; accent-color: #3b60d9;
        flex-shrink: 0; cursor: pointer; margin-top: 2px;
      }
      .abs-opt-txt { font-size: 12px; color: #374151; font-weight: 700; line-height: 1.4; user-select: none; }
      .abs-opt-txt span { display: block; font-size: 10px; color: #9ca3af; font-weight: 500; margin-top: 2px; }

      /* زر موافق — نفس لون هيدر الموقع */
      #abs-ok {
        width: 100%; padding: 13px;
        background: linear-gradient(135deg, #3b60d9, #1e40af);
        color: #fff; border: none; border-radius: 14px;
        font-size: 14px; font-weight: 800;
        font-family: 'Tajawal', sans-serif; cursor: pointer;
        box-shadow: 0 4px 16px rgba(59,96,217,0.3);
        transition: all 0.18s;
        -webkit-tap-highlight-color: transparent;
      }
      #abs-ok:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(59,96,217,0.38); }
      #abs-ok:active { transform: scale(0.97); }

      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        #abs-body { padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  function buildUI() {
    // الزر العائم
    const fab = document.createElement("div");
    fab.id = "abs-fab";
    fab.className = "abs-r";
    fab.innerHTML = `
      <div class="abs-fab-icon">🚨</div>
      <div class="abs-fab-text">
        <strong>غياب مسجّل</strong>
        <span>اضغط للتفاصيل</span>
      </div>
      <div class="abs-fab-count">${mState.absences.length}</div>
    `;
    document.body.appendChild(fab);

    const isModalDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    const isDotHidden      = localStorage.getItem("absHideDot_"   + mState.empId) === mState.hash;

    if (isDotHidden) return;
    if (isModalDismissed) fab.classList.add("abs-on");
    else showMainModal();

    fab.onclick = () => showMainModal();
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const firstName = mState.empName.split(" ")[0];
    const count     = mState.absences.length;

    const emailBody    = encodeURIComponent(
      `السلام عليكم،\n\nأفيدكم بأن الموظف ${mState.empName} (رقم: ${mState.empId}) لديه غياب مسجّل في التواريخ التالية:\n` +
      mState.absences.map(a => `• ${a.date}`).join("\n") +
      `\n\nأرجو مراجعة الأمر.\n\nشكراً`
    );
    const mailHref = `mailto:admin@school.edu.sa?subject=${encodeURIComponent("تنبيه غياب — " + mState.empName)}&body=${emailBody}`;

    const dateRows = mState.absences.map(a => `
      <div class="ab-row">
        <div class="ab-row-left">
          <span class="ab-row-emoji">📅</span>
          <span class="ab-row-date">${a.date}</span>
        </div>
        <span class="ab-row-tag">غياب</span>
      </div>`).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-r";
    ov.innerHTML = `
      <div id="abs-modal">

        <div id="abs-head">
          <div class="abs-head-top">
            <div class="abs-head-badge">🚨 تنبيه غياب</div>
            <button class="abs-xbtn" id="abs-xbtn">✕</button>
          </div>
          <div class="abs-head-title">مرحباً ${firstName} 👋</div>
          <div class="abs-head-sub">لديك ${count} ${count===1?"يوم غياب مسجّل":"أيام غياب مسجّلة"} في النظام</div>
        </div>

        <div id="abs-body">

          <!-- بطاقة السبب -->
          <div class="abs-card">
            <div class="abs-card-title">💡 لماذا تظهر هذه الرسالة؟</div>
            <div class="abs-reason-text">
              رصد <b>نظام الحضور</b> غياباً مسجّلاً باسمك.
              إن كان هناك خطأ يمكنك مراسلة <b>الإدارة</b> مباشرةً.
            </div>
          </div>

          <!-- بطاقة التواريخ -->
          <div class="abs-card">
            <div class="abs-card-title">📅 التواريخ المسجّلة</div>
            ${dateRows}
          </div>

          <!-- زر الإيميل -->
          <a id="abs-email-btn" href="${mailHref}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            مراسلة الإدارة عبر البريد
          </a>

          <!-- خيارات الإخفاء -->
          <div class="abs-card">
            <div class="abs-card-title">⚙️ خيارات العرض</div>
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
    ov.style.transition = "opacity 0.25s ease";
    ov.style.opacity = "0";
    const m = document.getElementById("abs-modal");
    if (m) { m.style.transition = "transform 0.25s ease"; m.style.transform = "translateY(100%)"; }
    setTimeout(() => {
      ov.remove();
      const fab = document.getElementById("abs-fab");
      if (!fab) return;
      if (hideDot) {
        localStorage.setItem("absHideDot_" + mState.empId, mState.hash);
        fab.style.display = "none";
      } else if (hideModal) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
        fab.classList.add("abs-on");
      } else {
        fab.classList.add("abs-on");
      }
    }, 280);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  else setTimeout(init, 500);
})();
