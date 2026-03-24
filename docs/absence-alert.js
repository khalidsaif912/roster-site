(function () {
  "use strict";

  // ─── الإعدادات والبيانات الأساسية ──────────────────────────────────────────
  
  const PATH_ROSTER = "/roster-site/";
  const DATA_URL = (function () {
    const origin = location.origin;
    const base = location.pathname.includes(PATH_ROSTER) ? origin + PATH_ROSTER : origin;
    return base + "/absence-data.json";
  })();

  let mState = {
    empName: "",
    absences: [],
    empId: "",
    hash: ""
  };

  // ─── وظائف المساعدة (Helpers) ──────────────────────────────────────────────
  
  const norm = (s) => (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
      // البحث عن طريق الرقم الوظيفي
      if (empId && rec.empNos && rec.empNos.indexOf(String(empId)) !== -1) {
        results.push({ date: rec.date });
        matched = true;
      }
      // البحث عن طريق الاسم إذا لم يتطابق الرقم
      if (!matched && cleanName) {
        rec.names.forEach(n => {
          if (nameMatch(cleanName, n)) results.push({ date: rec.date });
        });
      }
    });
    return results;
  }

  // ─── التشغيل والتحميل (Init) ────────────────────────────────────────────────
  
  function init() {
    const empId = localStorage.getItem("savedEmpId");
    if (!empId) return;

    const base = location.pathname.includes(PATH_ROSTER) 
                 ? location.origin + PATH_ROSTER 
                 : location.origin + "/";

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

  // ─── التنسيقات الجمالية (Styles) ───────────────────────────────────────────
  
  function injectStyles() {
    if (document.getElementById("abs-premium-styles")) return;
    const s = document.createElement("style");
    s.id = "abs-premium-styles";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
      
      .abs-font { font-family: 'Tajawal', sans-serif; direction: rtl; }

      /* أيقونة التنبيه العائمة */
      #abs-dot {
        position: fixed; left: 20px; bottom: 20px; z-index: 999999;
        width: 45px; height: 45px; background: #dc2626;
        border-radius: 50%; cursor: pointer; display: none;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
        animation: absPulse 2s infinite;
        display: flex; align-items: center; justify-content: center;
      }
      #abs-dot::before {
        content: '!'; color: white; font-weight: bold; font-size: 24px;
      }

      @keyframes absPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4); }
        50% { transform: scale(1.1); box-shadow: 0 4px 20px rgba(220, 38, 38, 0.6); }
      }

      /* الغطاء الخلفي */
      #abs-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000000; backdrop-filter: blur(4px);
      }

      /* النافذة المنبثقة */
      #abs-modal {
        background: #fff; border-radius: 24px; padding: 25px;
        width: 90%; max-width: 380px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
        animation: modalShow 0.3s ease-out;
      }

      @keyframes modalShow {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .abs-header { text-align: center; margin-bottom: 20px; }
      .abs-header h3 { margin: 0; color: #dc2626; font-size: 20px; }
      
      .ab-row {
        padding: 12px 15px; margin-bottom: 10px;
        background: #fef2f2; border-right: 4px solid #dc2626;
        border-radius: 8px; font-weight: 500; color: #444;
      }

      .abs-footer { margin-top: 20px; }
      
      .abs-hide-option {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 15px; font-size: 14px; color: #666; cursor: pointer;
      }

      #abs-main-close {
        width: 100%; padding: 12px; background: #dc2626;
        color: #fff; border: none; border-radius: 12px;
        font-weight: bold; font-size: 16px; cursor: pointer;
        transition: background 0.2s;
      }
      #abs-main-close:hover { background: #b91c1c; }
    `;
    document.head.appendChild(s);
  }

  // ─── واجهة المستخدم (UI) ───────────────────────────────────────────────────
  
  function buildUI() {
    const dot = document.createElement("div");
    dot.id = "abs-dot";
    document.body.appendChild(dot);

    const isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    
    if (isDismissed) {
      dot.style.display = "flex";
    } else {
      showMainModal();
    }

    dot.onclick = () => showMainModal();
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const rows = mState.absences.map(a => `
      <div class="ab-row">
        📅 تاريخ الغياب: ${a.date}
      </div>
    `).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    ov.innerHTML = `
      <div id="abs-modal">
        <div class="abs-header">
          <h3>تنبيه غياب جديد</h3>
        </div>
        <div class="abs-body">
          ${rows}
        </div>
        <div class="abs-footer">
          <label class="abs-hide-option">
            <input type="checkbox" id="abs-hide-check">
            عدم الإظهار لهذا الغياب مرة أخرى
          </label>
          <button id="abs-main-close">إغلاق التنبيه</button>
        </div>
      </div>
    `;

    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function () {
      const checked = document.getElementById("abs-hide-check").checked;
      if (checked) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
      }
      // دائماً نظهر الأيقونة بعد إغلاق النافذة للرجوع إليها
      document.getElementById("abs-dot").style.display = "flex";
      ov.remove();
    };
  }

  // التحميل النهائي
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }

})();
