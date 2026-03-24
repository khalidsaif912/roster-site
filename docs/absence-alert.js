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
        results.push({ date: rec.date, absentName: rec.names[rec.empNos.indexOf(String(empId))], section: rec.sections ? rec.sections[rec.empNos.indexOf(String(empId))] : "" });
        m = true;
      }
      if (!m && cleanName) {
        rec.names.forEach(function (n, idx) { if (nameMatch(cleanName, n)) results.push({ date: rec.date, absentName: n, section: rec.sections ? rec.sections[idx] : "" }); });
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
      fetch(base + "schedules/" + empId + ".json").then(function (r) { return r.ok ? r.json() : null; }),
      fetch(DATA_URL + "?v=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }),
    ]).then(function (res) {
      var emp = res[0], absData = res[1];
      if (!emp || !emp.name || !absData || !absData.records) return;

      var absences = findAbsences(empId, emp.name, absData.records);
      if (!absences.length) return;

      mState = { empName: emp.name, absences: absences, empId: empId, hash: absences.map(function(a){return a.date}).join("|") };

      injectStyles();
      buildUI();
    }).catch(function () {});
  }

  // ── STYLES ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-premium-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-premium-styles";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');

      .abs-font * { box-sizing: border-box; margin: 0; padding: 0; }
      .abs-font { font-family: 'Tajawal', system-ui, sans-serif; direction: rtl; }

      /* ── Dot ── */
      #abs-dot {
        position: fixed;
        left: 16px;
        top: 16px;
        z-index: 999999;
        width: 32px;
        height: 32px;
        background: #dc2626;
        border-radius: 50%;
        cursor: pointer;
        display: none;
        box-shadow: 0 2px 10px rgba(220, 38, 38, 0.4);
        animation: absPulse 2.5s ease-in-out infinite;
      }
      #abs-dot::after {
        content: '!';
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 900;
      }
      @keyframes absPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }

      /* ── Overlay ── */
      #abs-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 1000000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* ── Modal ── */
      #abs-modal {
        background: #fff;
        border-radius: 20px;
        width: 90%;
        max-width: 380px;
        padding: 20px;
      }

      .ab-row {
        padding: 8px;
        margin-bottom: 6px;
        background: #f9f9f9;
        border-radius: 10px;
      }

      #abs-main-close {
        width: 100%;
        margin-top: 15px;
        padding: 10px;
        background: #dc2626;
        color: #fff;
        border: none;
        border-radius: 10px;
        font-weight: bold;
      }
    `;
    document.head.appendChild(s);
  }

  // ── UI BUILDERS ──────────────────────────────────────────────────────────
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

    // 🔥 هنا التعديل المهم
    dot.onclick = function() {
      showMainModal();
    };
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    var rows = mState.absences.map(function(a) {
      return '<div class="ab-row">' + a.date + '</div>';
    }).join("");

    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";

    ov.innerHTML =
      '<div id="abs-modal">' +
        '<h3>لديك غياب</h3>' +
        rows +
        '<label><input type="checkbox" id="abs-hide-check"> عدم الإظهار مرة أخرى</label>' +
        '<button id="abs-main-close">موافق</button>' +
      '</div>';

    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function() {
      var isChecked = document.getElementById("abs-hide-check").checked;

      if (isChecked) {
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
