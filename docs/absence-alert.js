(function () {
  "use strict";

  var DATA_URL = (function () {
    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/") ? origin + "/roster-site" : origin;
    return base + "/absence-data.json";
  })();

  var mState = { empName: "", absences: [], sourceFile: "", empId: "", hash: "", isAnimating: false };

  function norm(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").replace(/\s+/g, " ").trim();
  }

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
      var matched = false;
      if (empId && rec.empNos && rec.empNos.indexOf(String(empId)) !== -1) {
        var idx = rec.empNos.indexOf(String(empId));
        results.push({ date: rec.date, absentName: rec.names[idx] || cleanName, section: rec.sections ? rec.sections[idx] : "" });
        matched = true;
      }
      if (!matched && cleanName) {
        rec.names.forEach(function (n, idx) {
          if (nameMatch(cleanName, n)) {
            results.push({ date: rec.date, absentName: n, section: rec.sections ? rec.sections[idx] : "" });
          }
        });
      }
    });
    return results;
  }

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
      if (!absences.length) {
        localStorage.removeItem("absDismissed_" + empId);
        return;
      }

      var currentHash = absences.map(function(a){ return a.date; }).join("|");
      var dismissedHash = localStorage.getItem("absDismissed_" + empId);

      mState = { empName: emp.name, absences: absences, sourceFile: absData.source_file, empId: empId, hash: currentHash };

      injectStyles();
      
      // إذا لم يقم المستخدم بإخفاء هذا التحديث، نظهر الشريط الجانبي (مغلقاً)
      if (dismissedHash !== currentHash) {
        buildSidebar();
        // ملاحظة: تم إزالة buildModal() من هنا لكي لا تظهر تلقائياً
      }
    }).catch(function () {});
  }

  function injectStyles() {
    if (document.getElementById("abs-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-styles";
    s.textContent = [
      "#abs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:15px;}",
      "#abs-modal{background:#fff;border-radius:18px;max-width:400px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,0.3);overflow:hidden;animation:absUp .3s ease;}",
      "@keyframes absUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}",
      "#abs-head{background:#dc2626;padding:15px;text-align:center;color:#fff;}",
      "#abs-body{padding:15px;}",
      ".ab-row{background:#fff5f5;border:1px solid #feb2b2;padding:8px;border-radius:8px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between;}",
      "#abs-foot{padding:15px;display:flex;gap:8px;}",
      "#abs-foot button{flex:1;padding:10px;border-radius:10px;border:none;font-weight:bold;cursor:pointer;}",
      
      /* Sidebar - أصغر ومرتفع وشفاف */
      "#abs-sb{position:fixed;left:0;top:5vh;z-index:99999;display:flex;align-items:center;}",
      "#abs-sb-panel{background:linear-gradient(160deg,#991b1b,#dc2626);border-radius:0 15px 15px 0;width:0;opacity:0;transition:all .3s;overflow:hidden;pointer-events:none;}",
      "#abs-sb.open #abs-sb-panel{width:240px;opacity:1;pointer-events:all;}",
      "#abs-sb-inner{padding:15px;min-width:240px;color:#fff;}",
      ".abs-sb-btn{width:100%;margin-top:8px;padding:8px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;font-size:12px;cursor:pointer;}",
      
      /* الزر المطوي - شفاف جداً وأصغر */
      "#abs-tab{background:rgba(220,38,38,0.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;border:1px solid rgba(255,255,255,0.1);border-left:none;padding:8px 5px;border-radius:0 10px 10px 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;box-shadow:2px 0 10px rgba(0,0,0,0.1);}",
      "#abs-tab .ti{font-size:14px;}",
      "#abs-tab .tt{writing-mode:vertical-rl;font-size:9px;font-weight:bold;opacity:0.8;}"
    ].join("");
    document.head.appendChild(s);
  }

  function buildModal() {
    if (document.getElementById("abs-overlay")) return;
    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    var rows = mState.absences.map(function(a){ return '<div class="ab-row"><span>📅 '+a.date+'</span><b>Absent</b></div>'; }).join("");
    ov.innerHTML = '<div id="abs-modal"><div id="abs-head"><b>Attendance Notice</b></div>' +
      '<div id="abs-body"><p style="font-size:14px;">Hi <b>'+mState.empName.split(' ')[0]+'</b>, you have records for:</p>'+rows+'</div>' +
      '<div id="abs-foot"><button onclick="this.closest(\'#abs-overlay\').remove()" style="background:#eee;">Dismiss</button></div></div>';
    document.body.appendChild(ov);
  }

  function buildSidebar() {
    var sb = document.createElement("div");
    sb.id = "abs-sb";
    sb.innerHTML = '<div id="abs-sb-panel"><div id="abs-sb-inner">' +
      '<h4 style="margin:0;">⚠️ Absence</h4><p style="font-size:11px;opacity:0.8;">You have '+mState.absences.length+' records</p>' +
      '<button class="abs-sb-btn" id="abs-show-pop">👁️ Show Details</button>' +
      '<button class="abs-sb-btn" id="abs-hide-forever" style="background:rgba(0,0,0,0.2);">🚫 Hide Until Next Update</button>' +
      '</div></div>' +
      '<button id="abs-tab"><span class="ti">⚠️</span><span class="tt">ABSENCE</span></button>';

    document.body.appendChild(sb);

    document.getElementById("abs-tab").onclick = function() { sb.classList.toggle("open"); };
    document.getElementById("abs-show-pop").onclick = function() { buildModal(); sb.classList.remove("open"); };
    
    // خيار الإخفاء التام حتى التحديث القادم
    document.getElementById("abs-hide-forever").onclick = function() {
      localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
      sb.remove();
      alert("Notice hidden. It will only reappear if new absences are added.");
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
