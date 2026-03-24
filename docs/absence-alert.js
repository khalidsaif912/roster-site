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
        results.push({ date: rec.date, absentName: rec.names[rec.empNos.indexOf(String(empId))] });
        m = true;
      }
      if (!m && cleanName) {
        rec.names.forEach(function (n, idx) { if (nameMatch(cleanName, n)) results.push({ date: rec.date, absentName: n }); });
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

  // ── STYLES (Modern Modal + Original Sidebar) ──────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-final-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-final-styles";
    s.textContent = [
      /* النقطة (المثلث الصغير جداً) */
      "#abs-alert-icon { position: fixed; left: 12px; top: 12px; z-index: 999999; font-size: 18px; cursor: pointer; display: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); animation: alertPulse 2s ease-in-out infinite; user-select: none; }",
      "@keyframes alertPulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }",

      /* النافذة المنبثقة (المصغرة والاحترافية) */
      "#abs-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 1000000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: absFadeIn 0.3s ease forwards; }",
      "#abs-modal { background: #fff; border-radius: 20px; max-width: 320px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; direction: rtl; font-family: sans-serif; }",
      "#abs-head { background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 20px; text-align: center; color: #fff; }",
      ".abs-icon-circle { width: 44px; height: 44px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; margin: 0 auto 10px; color: #dc2626; }",
      ".abs-body { padding: 18px; }",
      ".ab-row-mod { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 10px; margin-bottom: 6px; font-size: 11px; }",
      ".abs-checkbox-wrapper { display: flex; align-items: center; gap: 8px; padding: 10px; background: #f8fafc; border-radius: 10px; cursor: pointer; margin-bottom: 15px; border: 1px solid #e2e8f0; font-size: 11px; color: #475569; }",
      "#abs-main-close { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #dc2626; color: #fff; font-size: 14px; font-weight: bold; cursor: pointer; }",
      "@keyframes absFadeIn { from { opacity: 0; } to { opacity: 1; } }",

      /* --- القائمة الجانبية (تصميمك الأصلي تماماً) --- */
      "#abs-sb { position: fixed; left: -320px; top: 0; bottom: 0; width: 300px; background: #fff; box-shadow: 2px 0 10px rgba(0,0,0,0.2); transition: left 0.4s ease; z-index: 1000001; display: flex; flex-direction: column; font-family: sans-serif; direction: rtl; }",
      "#abs-sb.open { left: 0; }",
      "#abs-sb-head { background: #dc2626; color: #fff; padding: 15px; position: relative; }",
      "#abs-sb-close { position: absolute; right: 10px; top: 10px; background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; }",
      "#abs-sb-body { flex: 1; overflow-y: auto; padding: 15px; }",
      ".ab-item { background: #fff5f5; border: 1px solid #fecaca; padding: 10px; border-radius: 6px; margin-bottom: 10px; font-size: 13px; }",
      ".ab-item .d { font-weight: bold; color: #dc2626; }",
      "#abs-sb-mail { width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-bottom: 8px; }",
      "#abs-sb-restore { width: 100%; padding: 10px; background: #f1f5f9; color: #475569; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }"
    ].join("");
    document.head.appendChild(s);
  }

  // ── UI BUILDERS ──────────────────────────────────────────────────────────
  function buildUI() {
    // 1. المثلث (أيقونة التنبيه)
    var alertIcon = document.createElement("div");
    alertIcon.id = "abs-alert-icon";
    alertIcon.innerHTML = "⚠️";
    document.body.appendChild(alertIcon);

    // 2. القائمة الجانبية (تصميمك الأصلي)
    var sb = document.createElement("div");
    sb.id = "abs-sb";
    var rows = mState.absences.map(function(a){ 
      return '<div class="ab-item"><div class="d">📅 ' + a.date + '</div><div>غياب غير مبرر</div></div>'; 
    }).join("");
    
    sb.innerHTML = 
      '<div id="abs-sb-head"><button id="abs-sb-close">×</button><h3 style="margin:0">سجل الغياب</h3></div>' +
      '<div id="abs-sb-body">' + 
        rows + 
        '<button id="abs-sb-mail">📧 إرسال تبرير غياب</button>' +
        '<button id="abs-sb-restore">🔄 عرض النافذة الرئيسية</button>' +
      '</div>';
    document.body.appendChild(sb);

    // التحقق من حالة العرض
    var isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    if (isDismissed) { alertIcon.style.display = "block"; } else { showMainModal(); }

    // الأحداث
    alertIcon.onclick = function() { sb.classList.toggle("open"); };
    document.getElementById("abs-sb-close").onclick = function() { sb.classList.remove("open"); };
    document.getElementById("abs-sb-restore").onclick = function() {
      localStorage.removeItem("absDismissed_" + mState.empId);
      sb.classList.remove("open");
      alertIcon.style.display = "none";
      setTimeout(showMainModal, 300);
    };
    document.getElementById("abs-sb-mail").onclick = function() { 
        var dates = mState.absences.map(function(a){ return a.date }).join(", ");
        window.location.href = "mailto:?subject=تبرير غياب - " + mState.empName + "&body=التواريخ: " + dates;
    };
  }

  // النافذة الرئيسية (المنبثقة الاحترافية المصغرة)
  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;
    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    var rows = mState.absences.map(function(a){ 
      return '<div class="ab-row-mod"><span style="color:#b91c1c;font-weight:bold">📅 '+a.date+'</span><span>تنبيه غياب</span></div>'; 
    }).join("");
    
    ov.innerHTML = '<div id="abs-modal">' +
      '<div id="abs-head"><div class="abs-icon-circle">⚠️</div><h2 style="margin:0">تنبيه غياب</h2></div>' +
      '<div class="abs-body">' +
        '<div style="font-size:13px; margin-bottom:12px">مرحباً <b>'+mState.empName.split(' ')[0]+'</b>، تم رصد غياب:</div>' +
        '<div style="max-height:100px; overflow-y:auto; margin-bottom:15px">' + rows + '</div>' +
        '<label class="abs-checkbox-wrapper"><input type="checkbox" id="abs-hide-check"><span>إخفاء التنبيه (تحويل لمثلث صغير)</span></label>' +
        '<button id="abs-main-close">حسناً، فهمت</button>' +
      '</div></div>';

    document.body.appendChild(ov);
    document.getElementById("abs-main-close").onclick = function() {
      if (document.getElementById("abs-hide-check").checked) {
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
        document.getElementById("abs-alert-icon").style.display = "block";
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
