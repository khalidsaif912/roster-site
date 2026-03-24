/**
 * absence-alert.js  (Dynamic Version)
 * ─────────────────────────────────────────────────────────────────────────────
 * يجلب بيانات الغياب من /absence-data.json (يُولَّد بـ process_absence.py)
 * ويعرض للموظف المُعرَّف (savedEmpId) نافذة منبثقة + شريط جانبي منطوي.
 *
 * الإضافة: سطر واحد فقط قبل </body> في page_shell_html:
 *   <script src="/absence-alert.js"></script>
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  var DATA_URL = (function () {
    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/")
      ? origin + "/roster-site"
      : origin;
    return base + "/absence-data.json";
  })();

  var STORAGE_KEY = "absence_modal_dismissed";
  var LAST_DATA_KEY = "absence_last_data_hash";

  // ── HELPERS ───────────────────────────────────────────────────────────────

  function norm(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").replace(/\s+/g, " ").trim();
  }

  function nameMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === nb) return true;
    var wa = na.split(" ").filter(function (w) { return w.length > 3; });
    var wb = nb.split(" ").filter(function (w) { return w.length > 3; });
    if (!wa.length || !wb.length) return false;
    return wa.filter(function (w) { return wb.indexOf(w) !== -1; }).length >= 2;
  }

  function findAbsences(rosterName, records) {
    var cleanName = rosterName.replace(/-\s*\d+\s*$/, "").trim();
    var results = [];
    records.forEach(function (rec) {
      rec.names.forEach(function (n) {
        if (nameMatch(cleanName, n)) results.push({ date: rec.date, absentName: n });
      });
    });
    return results;
  }

  // Generate a hash of absence data to detect changes
  function getAbsenceHash(absences) {
    if (!absences || !absences.length) return "";
    var dates = absences.map(function(a) { return a.date; }).sort().join("|");
    return dates;
  }

  // Check if modal should be shown (new data or never dismissed)
  function shouldShowModal(absences) {
    var dismissed = localStorage.getItem(STORAGE_KEY);
    var lastHash = localStorage.getItem(LAST_DATA_KEY);
    var currentHash = getAbsenceHash(absences);
    
    // If no dismiss record, show modal
    if (!dismissed) return true;
    
    // If data has changed, show modal again (reset dismiss state)
    if (currentHash && currentHash !== lastHash) {
      // Clear the dismiss state since there's new data
      localStorage.removeItem(STORAGE_KEY);
      return true;
    }
    
    return false;
  }

  // Mark modal as dismissed
  function dismissModal(absences) {
    var currentHash = getAbsenceHash(absences);
    if (currentHash) {
      localStorage.setItem(STORAGE_KEY, "true");
      localStorage.setItem(LAST_DATA_KEY, currentHash);
    }
  }

  // ── MAIN ──────────────────────────────────────────────────────────────────

  function init() {
    var empId = localStorage.getItem("savedEmpId");
    if (!empId) return;

    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/") ? origin + "/roster-site/" : origin + "/";

    Promise.all([
      fetch(base + "schedules/" + empId + ".json").then(function (r) { return r.ok ? r.json() : null; }),
      fetch(DATA_URL + "?v=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }),
    ]).then(function (res) {
      var emp = res[0], absData = res[1];
      if (!emp || !emp.name) return;
      if (!absData || !absData.records || !absData.records.length) return;
      var absences = findAbsences(emp.name, absData.records);
      if (!absences.length) return;
      
      injectStyles();
      buildSidebar(emp.name, absences);
      
      // Only show modal if not dismissed or data has changed
      if (shouldShowModal(absences)) {
        buildModal(emp.name, absences, absData.source_file);
      }
    }).catch(function () {});
  }

  // ── STYLES ────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById("abs-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-styles";
    s.textContent = [
      "#abs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;animation:absIn .2s ease}",
      "@keyframes absIn{from{opacity:0}to{opacity:1}}",
      "#abs-modal{background:#fff;border-radius:22px;max-width:440px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.22);overflow:hidden;animation:absUp .3s cubic-bezier(.22,1,.36,1)}",
      "@keyframes absUp{from{transform:translateY(28px);opacity:0}to{transform:translateY(0);opacity:1}}",
      "#abs-head{background:linear-gradient(135deg,#991b1b,#dc2626,#f87171);padding:24px 20px 18px;text-align:center;position:relative;overflow:hidden}",
      "#abs-head::before{content:'';position:absolute;top:-50px;right:-50px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.08)}",
      "#abs-head::after{content:'';position:absolute;bottom:-60px;left:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.06)}",
      "#abs-head .ai{font-size:40px;display:block;margin-bottom:8px;position:relative;z-index:1;animation:absPulse 2s ease-in-out infinite}",
      "@keyframes absPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}",
      "#abs-head h2{margin:0;color:#fff;font-size:18px;font-weight:800;position:relative;z-index:1}",
      "#abs-head p{margin:5px 0 0;color:rgba(255,255,255,.82);font-size:13px;position:relative;z-index:1}",
      "#abs-body{padding:18px 20px 0}",
      ".ab-badge{display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;margin-bottom:14px}",
      ".ab-avatar{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0}",
      ".ab-name{font-size:14px;font-weight:800;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".ab-lbl{font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-top:1px}",
      ".ab-list{max-height:200px;overflow-y:auto;margin-bottom:14px}",
      ".ab-list::-webkit-scrollbar{width:4px}",
      ".ab-list::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:2px}",
      ".ab-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:11px;background:#fff5f5;border:1px solid #fecaca;margin-bottom:7px}",
      ".ab-row:last-child{margin-bottom:0}",
      ".ab-date{background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:8px;white-space:nowrap;flex-shrink:0}",
      ".ab-type{font-size:13px;color:#7f1d1d;font-weight:600;flex:1}",
      "#abs-notice{background:#fef3c7;border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:12px 14px;font-size:13px;color:#92400e;line-height:1.65;margin-bottom:18px}",
      "#abs-notice strong{font-weight:800}",
      "#abs-foot{padding:0 20px 20px;display:flex;gap:10px}",
      "#abs-foot button{flex:1;padding:13px;border-radius:14px;border:none;font-size:14px;font-weight:800;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent}",
      "#abs-btn-mail{background:linear-gradient(135deg,#1e40af,#1976d2);color:#fff;box-shadow:0 4px 14px rgba(30,64,175,.3)}",
      "#abs-btn-mail:hover{transform:translateY(-2px);box-shadow:0 7px 20px rgba(30,64,175,.4)}",
      "#abs-btn-x{background:#f1f5f9;color:#475569}",
      "#abs-btn-x:hover{background:#e2e8f0;color:#1e293b}",
      /* Sidebar - moved higher up */
      "#abs-sb{position:fixed;left:0;top:20%;transform:translateY(-50%);z-index:99997;display:flex;align-items:center}",
      "#abs-sb-panel{background:linear-gradient(160deg,#991b1b,#dc2626);border-radius:0 16px 16px 0;box-shadow:4px 0 28px rgba(185,28,28,.35);overflow:hidden;width:0;opacity:0;transition:width .4s cubic-bezier(.22,1,.36,1),opacity .3s ease;pointer-events:none;flex-shrink:0}",
      "#abs-sb.open #abs-sb-panel{width:250px;opacity:1;pointer-events:all}",
      "#abs-sb-inner{padding:16px;min-width:250px;color:#fff;position:relative}",
      "#abs-sb-inner h3{margin:0 0 3px;font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px}",
      ".sb-sub{font-size:11px;opacity:.75;margin-bottom:12px;font-weight:600}",
      ".sb-list{max-height:220px;overflow-y:auto}",
      ".sb-list::-webkit-scrollbar{width:3px}",
      ".sb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.3);border-radius:2px}",
      ".sb-row{background:rgba(255,255,255,.14);border-radius:9px;padding:8px 10px;margin-bottom:6px;border:1px solid rgba(255,255,255,.12)}",
      ".sb-row:last-child{margin-bottom:0}",
      ".sb-date{font-size:10px;font-weight:700;opacity:.8;margin-bottom:2px;text-transform:uppercase;letter-spacing:.3px}",
      ".sb-type{font-size:12px;font-weight:700}",
      "#abs-sb-mail{display:block;width:100%;margin-top:12px;padding:10px;background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.35);border-radius:10px;color:#fff;font-size:12px;font-weight:800;cursor:pointer;text-align:center;transition:background .15s;-webkit-tap-highlight-color:transparent}",
      "#abs-sb-mail:hover{background:rgba(255,255,255,.28)}",
      "#abs-sb-close{position:absolute;top:8px;right:10px;background:rgba(255,255,255,.2);border:none;border-radius:50%;width:22px;height:22px;color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;transition:background .15s;line-height:1}",
      "#abs-sb-close:hover{background:rgba(255,255,255,.35)}",
      "#abs-tab{background:linear-gradient(180deg,#dc2626,#991b1b);color:#fff;border:none;padding:12px 7px;border-radius:0 12px 12px 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;flex-shrink:0;transition:padding .2s;box-shadow:4px 0 14px rgba(185,28,28,.35);-webkit-tap-highlight-color:transparent;min-height:90px}",
      "#abs-tab:hover{padding-right:10px}",
      "#abs-tab .ti{font-size:17px}",
      "#abs-tab .tt{writing-mode:vertical-rl;text-orientation:mixed;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase}",
      "@media(max-width:480px){#abs-modal{border-radius:20px 20px 0 0;position:fixed;bottom:0;left:0;right:0;max-width:100%}#abs-overlay{align-items:flex-end;padding:0}#abs-foot{flex-direction:column}}",
    ].join("");
    document.head.appendChild(s);
  }

  // ── MODAL ─────────────────────────────────────────────────────────────────

  function buildModal(empName, absences, sourceFile) {
    var ov = document.createElement("div");
    ov.id = "abs-overlay";

    var rows = absences.map(function (a) {
      return '<div class="ab-row"><span class="ab-date">📅 ' + a.date + '</span><span class="ab-type">Unauthorized Absence</span></div>';
    }).join("");

    var src = sourceFile ? '<span style="font-size:11px;opacity:.7;display:block;margin-top:4px;">📄 ' + sourceFile + "</span>" : "";
    var firstName = empName.split(" ")[0];

    ov.innerHTML =
      '<div id="abs-modal">'
      + '<div id="abs-head"><span class="ai">⚠️</span><h2>Important Notice from Management</h2><p>Please review your attendance records</p></div>'
      + '<div id="abs-body">'
        + '<div class="ab-badge"><div class="ab-avatar">👤</div><div><div class="ab-name">' + empName + '</div><div class="ab-lbl">Absent Employee</div></div></div>'
        + '<div class="ab-list">' + rows + '</div>'
        + '<div id="abs-notice">📋 Dear <strong>' + firstName + '</strong>, you have <strong>' + absences.length + ' absence record(s)</strong> registered that require explanation.<br><br>Please <strong>visit the administration office</strong> or <strong>send an email</strong> explaining your absence(s) as soon as possible.' + src + '</div>'
      + '</div>'
      + '<div id="abs-foot"><button id="abs-btn-mail">📧 Send Email</button><button id="abs-btn-x">✕ Close</button></div>'
      + '</div>';

    document.body.appendChild(ov);

    document.getElementById("abs-btn-x").onclick = function () {
      ov.style.animation = "absIn .15s ease reverse forwards";
      setTimeout(function () { 
        ov.remove(); 
        openSidebar();
        // Mark modal as dismissed when user clicks close
        dismissModal(absences);
      }, 150);
    };
    document.getElementById("abs-btn-mail").onclick = function () { 
      sendMail(empName, absences); 
    };
    ov.onclick = function (e) { if (e.target === ov) document.getElementById("abs-btn-x").click(); };
    document.addEventListener("keydown", function h(e) {
      if (e.key === "Escape") { document.getElementById("abs-btn-x") && document.getElementById("abs-btn-x").click(); document.removeEventListener("keydown", h); }
    });
  }

  // ── SIDEBAR ───────────────────────────────────────────────────────────────

  var sbEl = null;

  function buildSidebar(empName, absences) {
    var sb = document.createElement("div");
    sb.id = "abs-sb";
    sbEl = sb;

    var rows = absences.map(function (a) {
      return '<div class="sb-row"><div class="sb-date">📅 ' + a.date + '</div><div class="sb-type">Unauthorized Absence</div></div>';
    }).join("");

    sb.innerHTML =
      '<div id="abs-sb-panel"><div id="abs-sb-inner">'
        + '<button id="abs-sb-close">✕</button>'
        + '<h3>⚠️ Absence Notice</h3>'
        + '<div class="sb-sub">' + absences.length + ' record(s) require your attention</div>'
        + '<div class="sb-list">' + rows + '</div>'
        + '<button id="abs-sb-mail">📧 Send Explanation Email</button>'
      + '</div></div>'
      + '<button id="abs-tab"><span class="ti">⚠️</span><span class="tt">Absence</span></button>';

    document.body.appendChild(sb);

    document.getElementById("abs-tab").onclick = function () { sb.classList.toggle("open"); };
    document.getElementById("abs-sb-close").onclick = function () { sb.classList.remove("open"); };
    document.getElementById("abs-sb-mail").onclick = function () { sendMail(empName, absences); };
  }

  function openSidebar() {
    sbEl && setTimeout(function () { sbEl.classList.add("open"); }, 400);
  }

  // ── EMAIL ─────────────────────────────────────────────────────────────────

  function sendMail(empName, absences) {
    var dates = absences.map(function (a) { return "  - " + a.date; }).join("\n");
    window.location.href = "mailto:?subject="
      + encodeURIComponent("Absence Explanation - " + empName)
      + "&body="
      + encodeURIComponent(
          "Dear Management,\n\nI am writing to explain my absence(s) on:\n\n"
          + dates
          + "\n\nExplanation:\n[Write here]\n\nThank you,\n" + empName
        );
  }

  // ── INIT ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 700); });
  } else {
    setTimeout(init, 700);
  }
})();
