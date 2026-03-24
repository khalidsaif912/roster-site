/**
 * absence-alert.js
 * ─────────────────────────────────────────────────────────────────────────────
 * يقرأ absence-data.json (المُولَّد بـ process_absence.py من ملف xlsb)
 * ويعرض للموظف المُعرَّف (savedEmpId) نافذة منبثقة + شريط جانبي منطوي.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // ── DATA URL ──────────────────────────────────────────────────────────────

  var DATA_URL = (function () {
    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/")
      ? origin + "/roster-site"
      : origin;
    return base + "/absence-data.json";
  })();

  // ── STATE ─────────────────────────────────────────────────────────────────
  
  var mState = {
    empName: "",
    absences: [],
    sourceFile: "",
    empId: "",
    hash: "",
    isAnimating: false
  };

  // ── HELPERS ───────────────────────────────────────────────────────────────

  function norm(s) {
    return (s || "").toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nameMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === nb) return true;
    var wa = na.split(" ").filter(function (w) { return w.length > 3; });
    var wb = nb.split(" ").filter(function (w) { return w.length > 3; });
    if (!wa.length || !wb.length) return false;
    return wa.filter(function (w) { return wb.indexOf(w) !== -1; }).length >= 2;
  }

  function findAbsences(empId, empName, records) {
    var results = [];
    var cleanName = (empName || "").replace(/-\s*\d+\s*$/, "").trim();

    records.forEach(function (rec) {
      var matchedByEmpNo = false;

      // محاولة 1: تطابق رقم الموظف
      if (empId && rec.empNos && rec.empNos.indexOf(String(empId)) !== -1) {
        var idx = rec.empNos.indexOf(String(empId));
        results.push({
          date: rec.date,
          absentName: rec.names[idx] || cleanName,
          section: rec.sections ? rec.sections[idx] : "",
          matchType: "empNo"
        });
        matchedByEmpNo = true;
      }

      // محاولة 2: تطابق الاسم
      if (!matchedByEmpNo && cleanName) {
        rec.names.forEach(function (n, idx) {
          if (nameMatch(cleanName, n)) {
            results.push({
              date: rec.date,
              absentName: n,
              section: rec.sections ? rec.sections[idx] : "",
              matchType: "name"
            });
          }
        });
      }
    });

    return results;
  }

  // ── MAIN ──────────────────────────────────────────────────────────────────

  function init() {
    var empId = localStorage.getItem("savedEmpId");
    if (!empId) return;

    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/")
      ? origin + "/roster-site/"
      : origin + "/";

    Promise.all([
      fetch(base + "schedules/" + empId + ".json")
        .then(function (r) { return r.ok ? r.json() : null; }),
      fetch(DATA_URL + "?v=" + Date.now())
        .then(function (r) { return r.ok ? r.json() : null; }),
    ]).then(function (res) {
      var emp = res[0], absData = res[1];
      if (!emp || !emp.name) return;
      if (!absData || !absData.records || !absData.records.length) return;

      var absences = findAbsences(empId, emp.name, absData.records);
      
      if (!absences.length) {
        localStorage.removeItem("absDismissed_" + empId);
        return;
      }

      var currentHash = absences.map(function(a){ return a.date; }).join("|");
      var dismissedHash = localStorage.getItem("absDismissed_" + empId);

      // حفظ البيانات في الحالة للوصول إليها لاحقاً
      mState.empName = emp.name;
      mState.absences = absences;
      mState.sourceFile = absData.source_file;
      mState.empId = empId;
      mState.hash = currentHash;

      injectStyles();
      buildSidebar();

      // عرض النافذة فقط إذا لم يقم المستخدم بإخفائها
      if (dismissedHash !== currentHash) {
        buildModal();
      } else {
        openSidebar();
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
      "#abs-notice{background:#fef3c7;border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:12px 14px;font-size:13px;color:#92400e;line-height:1.65;margin-bottom:16px}",
      "#abs-notice strong{font-weight:800}",
      ".abs-dont-show-wrap{margin-bottom:16px;text-align:center;}",
      ".abs-dont-show-wrap label{font-size:12px;color:#475569;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:600;-webkit-tap-highlight-color:transparent}",
      ".abs-dont-show-wrap input{width:16px;height:16px;accent-color:#dc2626;cursor:pointer}",
      "#abs-foot{padding:0 20px 20px;display:flex;gap:10px}",
      "#abs-foot button{flex:1;padding:13px;border-radius:14px;border:none;font-size:14px;font-weight:800;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent}",
      "#abs-btn-mail{background:linear-gradient(135deg,#1e40af,#1976d2);color:#fff;box-shadow:0 4px 14px rgba(30,64,175,.3)}",
      "#abs-btn-mail:hover{transform:translateY(-2px);box-shadow:0 7px 20px rgba(30,64,175,.4)}",
      "#abs-btn-x{background:#f1f5f9;color:#475569}",
      "#abs-btn-x:hover{background:#e2e8f0;color:#1e293b}",
      
      /* Sidebar - تم التعديل ليكون أعلى (top: 10vh) وفوق النافذة (z-index: 99999) */
      "#abs-sb{position:fixed;left:0;top:5vh;z-index:99999;display:flex;align-items:center}",
      "#abs-sb-panel{background:linear-gradient(160deg,#991b1b,#dc2626);border-radius:0 16px 16px 0;box-shadow:4px 0 28px rgba(185,28,28,.35);overflow:hidden;width:0;opacity:0;transition:width .4s cubic-bezier(.22,1,.36,1),opacity .3s ease;pointer-events:none;flex-shrink:0}",
      "#abs-sb.open #abs-sb-panel{width:260px;opacity:1;pointer-events:all}",
      "#abs-sb-inner{padding:16px;min-width:260px;color:#fff;position:relative}",
      "#abs-sb-inner h3{margin:0 0 3px;font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px}",
      ".sb-sub{font-size:11px;opacity:.75;margin-bottom:12px;font-weight:600}",
      ".sb-list{max-height:180px;overflow-y:auto}",
      ".sb-list::-webkit-scrollbar{width:3px}",
      ".sb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.3);border-radius:2px}",
      ".sb-row{background:rgba(255,255,255,.14);border-radius:9px;padding:8px 10px;margin-bottom:6px;border:1px solid rgba(255,255,255,.12)}",
      ".sb-row:last-child{margin-bottom:0}",
      ".sb-date{font-size:10px;font-weight:700;opacity:.8;margin-bottom:2px;text-transform:uppercase;letter-spacing:.3px}",
      ".sb-type{font-size:12px;font-weight:700}",
      ".sb-section{font-size:10px;opacity:.65;margin-top:2px}",
      ".abs-sb-btn{display:block;width:100%;margin-top:8px;padding:10px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.25);border-radius:10px;color:#fff;font-size:12px;font-weight:800;cursor:pointer;text-align:center;transition:all .15s;-webkit-tap-highlight-color:transparent}",
      ".abs-sb-btn:hover{background:rgba(255,255,255,.28)}",
      "#abs-sb-close{position:absolute;top:8px;right:10px;background:rgba(255,255,255,.2);border:none;border-radius:50%;width:22px;height:22px;color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;transition:background .15s;line-height:1}",
      "#abs-sb-close:hover{background:rgba(255,255,255,.35)}",
      
      /* الزر المطوي - تم التعديل ليكون شبه شفاف */
      "#abs-tab{background:linear-gradient(180deg, rgba(220,38,38,0.75), rgba(153,27,27,0.85));backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#fff;border:1px solid rgba(255,255,255,0.2);border-left:none;padding:12px 7px;border-radius:0 12px 12px 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;flex-shrink:0;transition:padding .2s;box-shadow:4px 0 14px rgba(185,28,28,.2);-webkit-tap-highlight-color:transparent;min-height:90px}",
      "#abs-tab:hover{padding-right:10px}",
      "#abs-tab .ti{font-size:17px}",
      "#abs-tab .tt{writing-mode:vertical-rl;text-orientation:mixed;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase}",
      
      /* Mobile Styles */
      "@media(max-width:480px){",
        "#abs-overlay{padding:16px;align-items:center;}",
        "#abs-modal{border-radius:18px;position:relative;max-width:100%;max-height:90vh;display:flex;flex-direction:column;}",
        "#abs-head{padding:16px 16px 12px;}",
        "#abs-head .ai{font-size:32px;margin-bottom:4px;}",
        "#abs-head h2{font-size:15px;}",
        "#abs-head p{font-size:12px;}",
        "#abs-body{padding:14px 16px 0;overflow-y:auto;}",
        ".ab-list{max-height:140px;margin-bottom:10px;}",
        "#abs-notice{font-size:12px;padding:10px;margin-bottom:14px;}",
        ".abs-dont-show-wrap{margin-bottom:12px;}",
        "#abs-foot{padding:12px 16px 16px;flex-direction:column;gap:8px;}",
        "#abs-foot button{padding:10px;font-size:13px;}",
      "}"
    ].join("");
    document.head.appendChild(s);
  }

  // ── MODAL ─────────────────────────────────────────────────────────────────

  function buildModal() {
    if (document.getElementById("abs-overlay") || mState.isAnimating) return;

    var ov = document.createElement("div");
    ov.id = "abs-overlay";

    var rows = mState.absences.map(function (a) {
      return '<div class="ab-row">'
        + '<span class="ab-date">📅 ' + a.date + '</span>'
        + '<span class="ab-type">Unauthorized Absence</span>'
        + '</div>';
    }).join("");

    var src = mState.sourceFile
      ? '<span style="font-size:11px;opacity:.7;display:block;margin-top:4px;">📄 ' + mState.sourceFile + "</span>"
      : "";
    var firstName = mState.empName.split(" ")[0];

    // التحقق مما إذا كانت النافذة مخفية من قبل المستخدم لضبط علامة الـ Checkbox
    var isDismissed = (localStorage.getItem("absDismissed_" + mState.empId) === mState.hash);
    var checkedAttr = isDismissed ? "checked" : "";

    ov.innerHTML =
      '<div id="abs-modal">'
      + '<div id="abs-head"><span class="ai">⚠️</span>'
      + '<h2>Important Notice from Management</h2>'
      + '<p>Please review your attendance records</p></div>'
      + '<div id="abs-body">'
        + '<div class="ab-badge">'
          + '<div class="ab-avatar">👤</div>'
          + '<div><div class="ab-name">' + mState.empName + '</div>'
          + '<div class="ab-lbl">Absent Employee</div></div>'
        + '</div>'
        + '<div class="ab-list">' + rows + '</div>'
        + '<div id="abs-notice">📋 Dear <strong>' + firstName + '</strong>, '
          + 'you have <strong>' + mState.absences.length + ' absence record(s)</strong> '
          + 'registered that require explanation.<br><br>'
          + 'Please <strong>visit the administration office</strong> or '
          + '<strong>send an email</strong> explaining your absence(s) as soon as possible.'
          + src + '</div>'
        + '<div class="abs-dont-show-wrap">'
          + '<label><input type="checkbox" id="abs-chk-dontshow" ' + checkedAttr + '> Do not show again until new update</label>'
        + '</div>'
      + '</div>'
      + '<div id="abs-foot">'
        + '<button id="abs-btn-mail">📧 Send Email</button>'
        + '<button id="abs-btn-x">✕ Close</button>'
      + '</div>'
      + '</div>';

    document.body.appendChild(ov);
    updateSidebarToggleBtn();

    document.getElementById("abs-btn-x").onclick = closeModal;
    document.getElementById("abs-btn-mail").onclick = function () {
      sendMail();
    };
    ov.onclick = function (e) {
      if (e.target === ov) closeModal();
    };
    document.addEventListener("keydown", function h(e) {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", h);
      }
    });
  }

  function closeModal() {
    if (mState.isAnimating) return;
    var ov = document.getElementById("abs-overlay");
    if (!ov) return;

    mState.isAnimating = true;

    // حفظ اختيار عدم الإظهار عند الإغلاق
    var chk = document.getElementById("abs-chk-dontshow");
    if (chk) {
      if (chk.checked) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
      } else {
        localStorage.removeItem("absDismissed_" + mState.empId);
      }
    }

    ov.style.animation = "absIn .15s ease reverse forwards";
    setTimeout(function () { 
      ov.remove(); 
      mState.isAnimating = false;
      updateSidebarToggleBtn();
      openSidebar(); 
    }, 150);
  }

  // ── SIDEBAR ───────────────────────────────────────────────────────────────

  var sbEl = null;

  function buildSidebar() {
    var sb = document.createElement("div");
    sb.id = "abs-sb";
    sbEl = sb;

    var rows = mState.absences.map(function (a) {
      return '<div class="sb-row">'
        + '<div class="sb-date">📅 ' + a.date + '</div>'
        + '<div class="sb-type">Unauthorized Absence</div>'
        + (a.section ? '<div class="sb-section">' + a.section + '</div>' : '')
        + '</div>';
    }).join("");

    sb.innerHTML =
      '<div id="abs-sb-panel"><div id="abs-sb-inner">'
        + '<button id="abs-sb-close">✕</button>'
        + '<h3>⚠️ Absence Notice</h3>'
        + '<div class="sb-sub">' + mState.absences.length + ' record(s) require your attention</div>'
        + '<div class="sb-list">' + rows + '</div>'
        + '<button class="abs-sb-btn" id="abs-sb-mail">📧 Send Explanation Email</button>'
        + '<button class="abs-sb-btn" id="abs-sb-toggle-modal" style="margin-top:5px; background:rgba(0,0,0,0.15);">👁️ Show Popup Window</button>'
      + '</div></div>'
      + '<button id="abs-tab"><span class="ti">⚠️</span><span class="tt">Absence</span></button>';

    document.body.appendChild(sb);
    updateSidebarToggleBtn();

    document.getElementById("abs-tab").onclick = function () { sb.classList.toggle("open"); };
    document.getElementById("abs-sb-close").onclick = function () { sb.classList.remove("open"); };
    document.getElementById("abs-sb-mail").onclick = function () { sendMail(); };
    
    // زر تشغيل وإغلاق النافذة المنبثقة من الشريط الجانبي
    document.getElementById("abs-sb-toggle-modal").onclick = function () {
      if (document.getElementById("abs-overlay")) {
        closeModal();
      } else {
        buildModal();
      }
    };
  }

  function openSidebar() {
    sbEl && setTimeout(function () { sbEl.classList.add("open"); }, 400);
  }

  function updateSidebarToggleBtn() {
    var btn = document.getElementById("abs-sb-toggle-modal");
    if (!btn) return;
    if (document.getElementById("abs-overlay")) {
      btn.innerHTML = "🚫 Hide Popup Window";
    } else {
      btn.innerHTML = "👁️ Show Popup Window";
    }
  }

  // ── EMAIL ─────────────────────────────────────────────────────────────────

  function sendMail() {
    var dates = mState.absences.map(function (a) { return "  - " + a.date; }).join("\n");
    window.location.href = "mailto:?subject="
      + encodeURIComponent("Absence Explanation - " + mState.empName)
      + "&body="
      + encodeURIComponent(
          "Dear Management,\n\nI am writing to explain my absence(s) on:\n\n"
          + dates
          + "\n\nExplanation:\n[Write here]\n\nThank you,\n" + mState.empName
        );
  }

  // ── INIT ──────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 700); });
  } else {
    setTimeout(init, 700);
  }

})();
