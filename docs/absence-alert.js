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

      /* مثلث التنبيه الصغير ⚠️ */
      #abs-triangle {
        position: fixed; left: 15px; bottom: 15px; z-index: 999999;
        width: 0; height: 0;
        border-left: 12px solid transparent;
        border-right: 12px solid transparent;
        border-bottom: 20px solid #e11d48;
        cursor: pointer; display: none;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        animation: absPulse 2s infinite;
      }
      #abs-triangle::after {
        content: '!'; position: absolute; top: 3px; left: -3px;
        color: #fff; font-size: 12px; font-weight: bold;
      }

      @keyframes absPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }

      /* النافذة والغطاء */
      #abs-overlay {
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000000; backdrop-filter: blur(5px);
      }
      #abs-modal {
        background: #fff; border-radius: 20px; padding: 25px;
        width: 85%; max-width: 360px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
        text-align: center; border: 1px solid #f1f5f9;
        animation: modalFadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes modalFadeUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .abs-title { color: #e11d48; font-weight: 700; font-size: 1.2rem; margin-bottom: 15px; }
      .ab-row {
        background: #fff1f2; color: #9f1239; padding: 12px;
        border-radius: 12px; margin-bottom: 8px; font-weight: 500;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .abs-footer { margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
      
      .abs-check-label {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-size: 13px; color: #64748b; cursor: pointer; margin-bottom: 15px;
      }
      #abs-main-close {
        width: 100%; padding: 12px; background: #e11d48; color: #fff;
        border: none; border-radius: 10px; font-weight: 700; cursor: pointer;
        transition: transform 0.2s;
      }
      #abs-main-close:hover { transform: translateY(-2px); }
    `;
    document.head.appendChild(s);
  }

  // ─── واجهة المستخدم (UI) ──────────────────────────────────────────────────
  function buildUI() {
    const tri = document.createElement("div");
    tri.id = "abs-triangle";
    document.body.appendChild(tri);

    const isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    
    // إذا اختار المستخدم عدم الإظهار، نظهر المثلث فقط
    if (isDismissed) {
      tri.style.display = "block";
    } else {
      showMainModal();
    }

    tri.onclick = () => showMainModal();
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const rows = mState.absences.map(a => `
      <div class="ab-row">
        <span>⚠️</span> <span>تاريخ الغياب: ${a.date}</span>
      </div>
    `).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    ov.innerHTML = `
      <div id="abs-modal">
        <div class="abs-title">تنبيه تسجيل غياب</div>
        <div style="margin-bottom:15px; color:#475569; font-size:14px;">تم العثور على سجلات غياب للأسماء المطابقة:</div>
        <div class="abs-list">${rows}</div>
        <div class="abs-footer">
          <label class="abs-check-label">
            <input type="checkbox" id="abs-hide-check">
            عدم إظهار هذه النافذة مرة أخرى
          </label>
          <button id="abs-main-close">فهمت، إغلاق</button>
        </div>
      </div>
    `;

    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function () {
      const isChecked = document.getElementById("abs-hide-check").checked;
      
      if (isChecked) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
        document.getElementById("abs-triangle").style.display = "block";
      } else {
        // إذا لم يؤشر، المثلث يبقى مخفياً والنافذة ستظهر المرة القادمة
        document.getElementById("abs-triangle").style.display = "none";
      }
      
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
