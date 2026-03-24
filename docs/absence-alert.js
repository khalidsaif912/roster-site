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

      /* أيقونة التنبيه ⚠️ الصغيرة */
      #abs-trigger-icon {
        position: fixed; left: 15px; bottom: 15px; z-index: 999999;
        font-size: 24px; cursor: pointer; display: none;
        user-select: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        animation: absShake 3s infinite;
      }

      @keyframes absShake {
        0%, 90%, 100% { transform: scale(1); }
        93% { transform: scale(1.2) rotate(5deg); }
        95% { transform: scale(1.2) rotate(-5deg); }
        97% { transform: scale(1.2) rotate(5deg); }
      }

      /* النافذة والغطاء */
      #abs-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000000; backdrop-filter: blur(4px);
      }
      #abs-modal {
        background: #fff; border-radius: 24px; padding: 25px;
        width: 85%; max-width: 380px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);
        text-align: center; animation: absPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes absPop {
        from { opacity: 0; transform: scale(0.8); }
        to { opacity: 1; transform: scale(1); }
      }

      .abs-title { color: #1e293b; font-weight: 700; font-size: 1.25rem; margin: 10px 0; }
      .abs-emoji-big { font-size: 40px; margin-bottom: 5px; }
      
      .ab-row {
        background: #fff1f2; color: #be123c; padding: 12px;
        border-radius: 12px; margin-bottom: 8px; font-weight: 600;
        border: 1px solid #fecdd3;
      }
      
      .abs-footer { margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
      
      .abs-check-label {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-size: 14px; color: #64748b; cursor: pointer; margin-bottom: 15px;
      }
      
      #abs-main-close {
        width: 100%; padding: 14px; background: #e11d48; color: #fff;
        border: none; border-radius: 12px; font-weight: 700; font-size: 16px; 
        cursor: pointer; transition: background 0.2s;
      }
      #abs-main-close:hover { background: #be123c; }
    `;
    document.head.appendChild(s);
  }

  // ─── واجهة المستخدم (UI) ──────────────────────────────────────────────────
  function buildUI() {
    const icon = document.createElement("div");
    icon.id = "abs-trigger-icon";
    icon.innerHTML = "⚠️";
    document.body.appendChild(icon);

    const isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    
    if (isDismissed) {
      icon.style.display = "block";
    } else {
      showMainModal();
    }

    icon.onclick = () => showMainModal();
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const rows = mState.absences.map(a => `
      <div class="ab-row">📅 غياب يوم: ${a.date}</div>
    `).join("");

    const ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    ov.innerHTML = `
      <div id="abs-modal">
        <div class="abs-emoji-big">⚠️</div>
        <div class="abs-title">تنبيه غياب</div>
        <p style="color:#64748b; font-size:14px; margin-bottom:15px;">تم رصد أيام غياب مسجلة باسمك في النظام:</p>
        <div class="abs-list">${rows}</div>
        <div class="abs-footer">
          <label class="abs-check-label">
            <input type="checkbox" id="abs-hide-check">
            عدم إظهار التنبيه تلقائياً مرة أخرى
          </label>
          <button id="abs-main-close">حسناً، فهمت</button>
        </div>
      </div>
    `;

    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function () {
      const isChecked = document.getElementById("abs-hide-check").checked;
      
      if (isChecked) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
      }
      
      // بمجرد الإغلاق، تظهر الأيقونة الصغيرة في الزاوية دائماً للرجوع إليها
      document.getElementById("abs-trigger-icon").style.display = "block";
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
