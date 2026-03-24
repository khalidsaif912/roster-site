(function () {
  "use strict";

  var DATA_URL = (function () {
    var origin = location.origin;
    var base = location.pathname.includes("/roster-site/") ? origin + "/roster-site" : origin;
    return base + "/absence-data.json";
  })();

  var mState = { empName: "", absences: [], empId: "", hash: "" };

  // دالة المزامنة والبحث (نفس المنطق السابق)
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
        rec.names.forEach(function (n) { if (nameMatch(cleanName, n)) results.push({ date: rec.date, absentName: n }); });
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
      if (!absences.length) return;

      var currentHash = absences.map(function(a){ return a.date; }).join("|");
      mState = { empName: emp.name, absences: absences, empId: empId, hash: currentHash };

      injectStyles();
      buildUI();
    }).catch(function () {});
  }

  function injectStyles() {
    if (document.getElementById("abs-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-styles";
    s.textContent = [
      /* النقطة الحمراء - ثابتة ولا تختفي */
      "#abs-dot{position:fixed; left:12px; top:12px; z-index:999999; width:10px; height:10px; background:#ff0000; border-radius:50%; cursor:pointer; border:2px solid #fff; box-shadow:0 0 5px rgba(0,0,0,0.2); animation:absBackPulse 2.5s infinite;}",
      "@keyframes absBackPulse{ 0%{transform:scale(1); opacity:1} 50%{transform:scale(1.2); opacity:0.7} 100%{transform:scale(1); opacity:1} }",

      /* اللوحة الجانبية */
      "#abs-panel{ position:fixed; left:-300px; top:0; height:100%; width:280px; background:rgba(255,255,255,0.95); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); box-shadow:5px 0 25px rgba(0,0,0,0.15); transition:left 0.4s ease; z-index:1000000; display:flex; flex-direction:column; border-right:1px solid rgba(0,0,0,0.1); font-family:sans-serif; }",
      "#abs-panel.open{ left:0; }",
      "#abs-header{ background:#dc2626; color:#fff; padding:20px; position:relative; }",
      "#abs-close-btn{ position:absolute; right:15px; top:15px; background:none; border:none; color:#fff; font-size:22px; cursor:pointer; }",
      "#abs-content{ padding:20px; flex:1; overflow-y:auto; direction:rtl; }",
      ".abs-card{ background:#fff1f1; border:1px solid #fecaca; padding:12px; border-radius:10px; margin-bottom:10px; font-size:13px; color:#991b1b; }",
      
      /* الأزرار */
      ".abs-action-btn{ width:100%; padding:12px; margin-top:10px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; transition:0.2s; }",
      "#btn-dismiss-temp{ background:#f1f5f9; color:#475569; font-size:12px; }",
      "#btn-dismiss-temp:hover{ background:#e2e8f0; }",
      
      /* النافذة المنبثقة (Popup) */
      "#abs-popup-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000001; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); }",
      "#abs-popup-box{ background:#fff; padding:25px; border-radius:20px; max-width:340px; width:90%; text-align:center; box-shadow:0 15px 40px rgba(0,0,0,0.3); direction:rtl; }"
    ].join("");
    document.head.appendChild(s);
  }

  function buildUI() {
    // 1. إنشاء النقطة الحمراء (الدائمة)
    var dot = document.createElement("div");
    dot.id = "abs-dot";
    dot.title = "يوجد تنبيه غياب - اضغط للتفاصيل";
    document.body.appendChild(dot);

    // 2. إنشاء اللوحة الجانبية
    var panel = document.createElement("div");
    panel.id = "abs-panel";
    var rows = mState.absences.map(function(a){ return '<div class="abs-card">📅 '+a.date+'<br><b>تسجيل غياب غير مبرر</b></div>'; }).join("");
    
    panel.innerHTML = 
      '<div id="abs-header"><button id="abs-close-btn">×</button><h3 style="margin:0; font-size:18px;">تنبيهات الغياب</h3></div>' +
      '<div id="abs-content">' +
        '<p style="font-size:14px; color:#444; margin-bottom:15px;">مرحباً <b>'+mState.empName.split(' ')[0]+'</b>، تم رصد غياب في التواريخ التالية:</p>' +
        rows +
        '<hr style="border:0; border-top:1px solid #eee; margin:15px 0;">' +
        '<button id="btn-show-modal" class="abs-action-btn" style="background:#dc2626; color:#fff;">عرض النافذة الرئيسية</button>' +
        '<button id="btn-dismiss-temp" class="abs-action-btn">إخفاء اللوحة (تبقى النقطة)</button>' +
      '</div>';
    
    document.body.appendChild(panel);

    // 3. التحكم في الظهور
    var dismissedHash = localStorage.getItem("absDismissed_" + mState.empId);

    // إذا لم يسبق الإخفاء، نظهر النافذة المنبثقة تلقائياً أول مرة
    if (dismissedHash !== mState.hash) {
      showPopup();
    }

    // الأحداث
    dot.onclick = function() { panel.classList.toggle("open"); };
    document.getElementById("abs-close-btn").onclick = function() { panel.classList.remove("open"); };
    document.getElementById("btn-dismiss-temp").onclick = function() { 
        panel.classList.remove("open"); 
        // نحفظ الإخفاء لكي لا تظهر النافذة المنبثقة المزعجة، لكن النقطة تبقى
        localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
    };
    document.getElementById("btn-show-modal").onclick = function() { showPopup(); panel.classList.remove("open"); };
  }

  function showPopup() {
    if (document.getElementById("abs-popup-overlay")) return;
    var ov = document.createElement("div");
    ov.id = "abs-popup-overlay";
    ov.innerHTML = '<div id="abs-popup-box">' +
      '<h2 style="color:#dc2626; margin-top:0;">⚠️ تنبيه غياب</h2>' +
      '<p>تم رصد غياب غير مبرر في سجلاتك. يرجى مراجعة الإدارة أو تقديم عذر عبر البريد.</p>' +
      '<button onclick="this.closest(\'#abs-popup-overlay\').remove()" style="background:#dc2626; color:#fff; border:none; padding:12px 25px; border-radius:10px; cursor:pointer; font-weight:bold; width:100%;">فهمت</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.onclick = function(e) { if(e.target === ov) ov.remove(); };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
