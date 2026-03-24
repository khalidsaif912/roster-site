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

  // ─── التهيئة (Init) ──────────────────────────────────────────────────────
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

  // ─── التنسيقات (Styles) ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-premium-styles")) return;
    const s = document.createElement("style");
    s.id = "abs-premium-styles";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
      .abs-font { font-family: 'Tajawal', sans-serif; direction: rtl; }

      /* الحاوية الكبيرة للأيقونة المتحركة */
      #abs-trigger-container {
        position: fixed; left: 30px; bottom: 30px; z-index: 999999;
        width: 60px; height: 60px; cursor: pointer; display: none;
      }

      /* النقاط التي تدور حول المركز */
      .abs-orbit-dots {
        position: absolute; width: 100%; height: 100%;
        animation: absRotate 4s linear infinite;
      }
      .abs-dot {
        position: absolute; width: 6px; height: 6px;
        background: #dc2626; border-radius: 50%;
      }
      .abs-dot:nth-child(1) { top: 0; left: 50%; transform: translateX(-50%); }
      .abs-dot:nth-child(2) { bottom: 0; left: 50%; transform: translateX(-50%); }
      .abs-dot:nth-child(3) { left: 0; top: 50%; transform: translateY(-50%); }
      .abs-dot:nth-child(4) { right: 0; top: 50%; transform: translateY(-50%); }

      /* الدائرة المركزية */
      .abs-center-circle {
        position: absolute; inset: 12px;
        background: #dc2626; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 10px rgba(220, 38, 38, 0.3);
        z-index: 10; animation: absPulse 2s ease-in-out infinite;
      }

      /* تبديل الرموز ! و ? */
      .abs-center-circle::after {
        content: '!'; color: white; font-weight: bold; font-size: 20px;
        animation: absSymbolChange 3s step-end infinite;
      }

      @keyframes absRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      
      @keyframes absPulse { 
        0%, 100% { transform: scale(1); } 
        50% { transform: scale(1.1); } 
      }

      @keyframes absSymbolChange {
        0%, 45% { content: '!'; }
        50%, 95% { content: '?'; }
      }

      /* النافذة والغطاء */
      #abs-overlay {
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000000; backdrop-filter: blur(8px);
      }
      #abs-modal {
        background: #fff; border-radius: 24px; padding: 25px;
        width: 90%; max-width: 380px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
        text-align: center; animation: absPopUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes absPopUp { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }

      .abs-title { color: #1e293b; font-weight: 700; font-size: 1.3rem; margin-bottom: 15px; }
      .ab-row {
        background: #fef2f2; color: #9f1239; padding: 12px;
        border-radius: 12px; margin-bottom: 8px; font-weight: 600;
        border: 1px solid #fecdd3;
      }
      
      .abs-footer { margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
      .abs-check-label {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-size: 14px; color: #64748b; cursor: pointer; margin-bottom: 15px;
      }
      #abs-main-close {
        width: 100%; padding: 14px; background: #dc2626; color: #fff;
        border: none; border-radius: 12px; font-weight: 700; cursor: pointer;
      }
    `;
    document.head.appendChild(s);
  }

  // ─── واجهة المستخدم (UI) ──────────────────────────────────────────────────
  function buildUI() {
    const container = document.createElement("div");
    container.id = "abs-trigger-container";
    container.innerHTML = `
      <div class="abs-orbit-dots">
        <div class="abs-dot"></div>
        <div class="abs-dot"></div>
        <div class="abs-dot"></div>
        <div class="abs-dot"></div>
      </div>
      <div class="abs-center-circle"></div>
    `;
    document.body.appendChild(container);

    const isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    
    if (isDismissed) {
      container.style.display = "block";
    } else {
      showMainModal();
    }

    container.onclick = () => showMainModal();
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const rows = mState.absences.map(a => `<div class="ab-row">🗓️ غياب يوم: ${a.date}</div>`).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    ov.innerHTML = `
      <div id="abs-modal">
        <div class="abs-title">تنبيه الغياب</div>
        <div class="abs-list">${rows}</div>
        <div class="abs-footer">
          <label class="abs-check-label">
            <input type="checkbox" id="abs-hide-check"> عدم الإظهار تلقائياً مرة أخرى
          </label>
          <button id="abs-main-close">موافق</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function () {
      if (document.getElementById("abs-hide-check").checked) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
      }
      document.getElementById("abs-trigger-container").style.display = "block";
      ov.remove();
    };
  }

  // التشغيل
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
})();
