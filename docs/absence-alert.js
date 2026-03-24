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

  // ── STYLES (Original Look + New Features) ────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-styles";
    s.textContent = [
      /* النقطة الحمراء الصغيرة */
      "#abs-dot{position:fixed; left:15px; top:15px; z-index:999999; width:10px; height:10px; background:#ff0000; border-radius:50%; cursor:pointer; border:2px solid #fff; box-shadow:0 0 8px rgba(255,0,0,0.5); display:none; animation:absPulse 2s infinite;}",
      "@keyframes absPulse{ 0%{box-shadow:0 0 0 0 rgba(255,0,0,0.7)} 70%{box-shadow:0 0 0 8px rgba(255,0,0,0)} 100%{box-shadow:0 0 0 0 rgba(255,0,0,0)} }",

      /* النافذة الرئيسية الأصلية */
      "#abs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(5px);z-index:1000000;display:flex;align-items:center;justify-content:center;padding:16px;}",
      "#abs-modal{background:#fff;border-radius:22px;max-width:440px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:hidden;direction:rtl;font-family:sans-serif;}",
      "#abs-head{background:linear-gradient(135deg,#991b1b,#dc2626);padding:24px;text-align:center;color:#fff;}",
      ".ab-row{display:flex;align-items:center;gap:10px;padding:10px;background:#fff5f5;border:1px solid #fecaca;border-radius:12px;margin-bottom:8px;}",
      ".ab-date{background:#dc2626;color:#fff;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:bold;}",

      /* النافذة المطوية (الشريط الجانبي) */
      "#abs-sb{position:fixed;left:-300px;top:0;height:100%;width:280px;background:#fff;box-shadow:5px 0 25px rgba(0,0,0,0.2);transition:left 0.3s ease;z-index:1000001;display:flex;flex-direction:column;direction:rtl;}",
      "#abs-sb.open{left:0;}",
      ".sb-header{background:#991b1b;color:#fff;padding:20px;font-weight:bold;}",
      ".sb-content{padding:15px;flex:1;overflow-y:auto;}",
      ".sb-btn{width:100%;padding:10px;margin-top:10px;border-radius:8px;border:none;cursor:pointer;font-weight:bold; transition: 0.2s;}",
      ".btn-main{background:#dc2626;color:#fff;}",
      ".btn-sec{background:#f1f5f9;color:#475569;font-size:11px;}"
    ].join("");
    document.head.appendChild(s);
  }

  // ── UI BUILDERS ──────────────────────────────────────────────────────────
  function buildUI() {
    // 1. إنشاء النقطة
    var dot = document.createElement("div");
    dot.id = "abs-dot";
    document.body.appendChild(dot);

    // 2. إنشاء الشريط الجانبي
    var sb = document.createElement("div");
    sb.id = "abs-sb";
    var rows = mState.absences.map(function(a){ return '<div class="ab-row"><span class="ab-date">'+a.date+'</span><span style="font-size:13px">غياب غير مبرر</span></div>'; }).join("");
    sb.innerHTML = '<div class="sb-header">تنبيه الغياب</div>' +
      '<div class="sb-content">' + rows + 
      '<button class="sb-btn btn-main" id="sb-restore">إظهار النافذة الرئيسية</button>' +
      '<button class="sb-btn btn-sec" id="sb-close-btn">إغلاق القائمة</button></div>';
    document.body.appendChild(sb);

    // التحقق من حالة العرض
    var isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    
    if (isDismissed) {
      dot.style.display = "block"; // إذا عطلها تظهر النقطة فقط
    } else {
      showMainModal(); // إذا لم يعطلها تظهر النافذة الأصلية
    }

    // الأحداث
    dot.onclick = function() { sb.classList.add("open"); };
    document.getElementById("sb-close-btn").onclick = function() { sb.classList.remove("open"); };
    document.getElementById("sb-restore").onclick = function() {
      localStorage.removeItem("absDismissed_" + mState.empId);
      sb.classList.remove("open");
      dot.style.display = "none";
      showMainModal();
    };
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;
    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    var rows = mState.absences.map(function(a){ return '<div class="ab-row"><span class="ab-date">📅 '+a.date+'</span><span style="flex:1">غياب غير مبرر</span></div>'; }).join("");
    
    ov.innerHTML = '<div id="abs-modal">' +
      '<div id="abs-head"><h2 style="margin:0">⚠️ تنبيه إداري</h2><p style="opacity:0.8">يرجى مراجعة سجل الحضور</p></div>' +
      '<div style="padding:20px">' +
        '<div style="margin-bottom:15px; font-size:14px">مرحباً <b>'+mState.empName+'</b>، تم تسجيل التواريخ التالية:</div>' +
        '<div style="max-height:150px; overflow-y:auto; margin-bottom:15px">' + rows + '</div>' +
        '<label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#666; cursor:pointer">' +
          '<input type="checkbox" id="abs-hide-check"> عدم إظهار هذه النافذة مجدداً (تحويل لنقطة تنبيه)</label>' +
      '</div>' +
      '<div style="padding:0 20px 20px; display:flex; gap:10px">' +
        '<button id="abs-main-close" style="flex:1; padding:12px; border-radius:10px; border:none; background:#dc2626; color:#fff; font-weight:bold; cursor:pointer">إغلاق</button>' +
      '</div></div>';

    document.body.appendChild(ov);

    document.getElementById("abs-main-close").onclick = function() {
      if (document.getElementById("abs-hide-check").checked) {
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
