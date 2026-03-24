(function () {
  "use strict";

  // ── DATA URL ──────────────────────────────────────────────────────────────
  var DATA_URL = (function () {
    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/") ? origin + "/roster-site" : origin;
    return base + "/absence-data.json";
  })();

  var mState = { empName: "", absences: [], empId: "", hash: "" };

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function norm(s) { return (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").replace(/\s+/g, " ").trim(); }
  function nameMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === nb) return true;
    var wa = na.split(" ").filter(function (w) { return w.length > 3; });
    var wb = nb.split(" ").filter(function (w) { return w.length > 3; });
    return wa.length && wb.length && wa.filter(function (w) { return wb.indexOf(w) !== -1; }).length >= 2;
  }

  function findAbsences(empId, empName, records) {
    var results = [];
    var cleanName = (empName || "").replace(/-\s*\d+\s*$/, "").trim();
    records.forEach(function (rec) {
      var m = false;
      if (empId && rec.empNos && rec.empNos.indexOf(String(empId)) !== -1) {
        results.push({ date: rec.date });
        m = true;
      }
      if (!m && cleanName) {
        rec.names.forEach(function (n, idx) { if (nameMatch(cleanName, n)) results.push({ date: rec.date }); });
      }
    });
    return results;
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init() {
    var empId = localStorage.getItem("savedEmpId");
    if (!empId) return;

    var base = location.pathname.includes("/roster-site/") ? location.origin + "/roster-site/" : location.origin + "/";

    Promise.all([
      fetch(base + "schedules/" + empId + ".json").then(r => r.ok ? r.json() : null),
      fetch(DATA_URL + "?v=" + Date.now()).then(r => r.ok ? r.json() : null),
    ]).then(function (res) {
      var emp = res[0], absData = res[1];
      if (!emp || !emp.name || !absData || !absData.records) return;

      var absences = findAbsences(empId, emp.name, absData.records);
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

  // ── STYLES ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-premium-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-premium-styles";
    s.textContent = `
      .abs-font { font-family: 'Tajawal', sans-serif; direction: rtl; }

      /* 🔺 Triangle Icon */
      #abs-dot {
        position: fixed;
        left: 16px;
        top: 16px;
        z-index: 999999;
        width: 0;
        height: 0;
        border-left: 14px solid transparent;
        border-right: 14px solid transparent;
        border-bottom: 24px solid #dc2626;
        cursor: pointer;
        display: none;
        animation: pulse 2s infinite;
      }
      #abs-dot::after {
        content: '!';
        position: absolute;
        top: 6px;
        left: -4px;
        color: #fff;
        font-weight: bold;
      }
      @keyframes pulse {
        0%,100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }

      /* Overlay */
      #abs-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:1000000;
      }

      /* Modal */
      #abs-modal {
        background:#fff;
        border-radius:20px;
        padding:20px;
        width:90%;
        max-width:380px;
      }

      .ab-row {
        padding:10px;
        margin-bottom:8px;
        background:#f5f5f5;
        border-radius:10px;
      }

      #abs-main-close {
        width:100%;
        margin-top:15px;
        padding:12px;
        background:#dc2626;
        color:#fff;
        border:none;
        border-radius:12px;
        font-weight:bold;
      }
    `;
    document.head.appendChild(s);
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  function buildUI() {
    var dot = document.createElement("div");
    dot.id = "abs-dot";
    document.body.appendChild(dot);

    var isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;

    if (isDismissed) {
      dot.style.display = "block";
    } else {
      showMainModal();
    }

    // 🔥 التعديل: يفتح النافذة مباشرة
    dot.onclick = function () {
      showMainModal();
    };
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    var rows = mState.absences.map(a => `<div class="ab-row">📅 ${a.date}</div>`).join("");

    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";

    ov.innerHTML = `
      <div id="abs-modal">
        <h3>تنبيه غياب</h3>
        ${rows}
        <label>
          <input type="checkbox" id="abs-hide-check">
          عدم الإظهار مرة أخرى
        </label>
        <button id="abs-main-close">موافق</button>
      </div>
    `;

    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function () {
      var checked = document.getElementById("abs-hide-check").checked;

      if (checked) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
        document.getElementById("abs-dot").style.display = "block";
      }

      ov.remove();
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }

})();
