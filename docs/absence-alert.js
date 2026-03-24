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

  // ── PREMIUM STYLES ───────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-premium-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-premium-styles";
    s.textContent = [
      ".abs-font { font-family: system-ui, -apple-system, sans-serif; direction: rtl; }",

      /* أيقونة المثلث - تم تصغيرها جداً */
      "#abs-alert-icon { position: fixed; left: 12px; top: 12px; z-index: 999999; font-size: 18px; cursor: pointer; display: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); animation: alertPulse 2s ease-in-out infinite; user-select: none; opacity: 0.9; }",
      "@keyframes alertPulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(1); } }",

      /* النافذة الرئيسية (Main Modal) - حجم مدمج */
      "#abs-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 1000000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.3s ease forwards; }",
      "#abs-modal { background: #fff; border-radius: 20px; max-width: 320px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; animation: scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }",
      "@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }",
      "@keyframes scaleUp { from { transform: scale(0.95); } to { transform: scale(1); } }",

      "#abs-head { background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 20px; text-align: center; color: #fff; }",
      ".abs-icon-circle { width: 44px; height: 44px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; margin: 0 auto 10px; }",
      "#abs-head h2 { margin: 0; font-size: 17px; font-weight: 800; }",

      ".abs-body { padding: 18px; }",
      ".ab-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 10px; margin-bottom: 6px; }",
      ".ab-date { color: #b91c1c; font-size: 11px; font-weight: 800; background: #fecaca; padding: 3px 8px; border-radius: 5px; }",

      ".abs-checkbox-wrapper { display: flex; align-items: center; gap: 8px; padding: 10px; background: #f8fafc; border-radius: 10px; cursor: pointer; margin-bottom: 18px; border: 1px solid #e2e8f0; }",
      ".abs-checkbox-text { font-size: 11px; color: #475569; font-weight: 600; }",

      "#abs-main-close { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #dc2626; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }",

      /* الشريط الجانبي المطوي */
      "#abs-sb { position: fixed; left: -320px; top: 0; height: 100%; width: 280px; background: rgba(255,255,255,0.9); backdrop-filter: blur(20px); box-shadow: 10px 0 30px rgba(0,0,0,0.1); transition: left 0.4s ease; z-index: 1000001; direction: rtl; }",
      "#abs-sb.open { left: 0; }",
      ".sb-header { padding: 20px; background: #f8fafc; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }",
      ".sb-content { padding: 20px; }",
      ".sb-btn { width: 100%; padding: 12px; margin-top: 10px; border-radius: 10px; border: none; cursor: pointer; font-weight: 700; font-size: 13px; }"
    ].join("");
    document.head.appendChild(s);
  }

  // ── UI BUILDERS ──────────────────────────────────────────────────────────
  function buildUI() {
    var alertIcon = document.createElement("div");
    alertIcon.id = "abs-alert-icon";
    alertIcon.innerHTML = "⚠️";
    document.body.appendChild(alertIcon);

    var sb = document.createElement("div");
    sb.id = "abs-sb";
    sb.className = "abs-font";
    var rows = mState.absences.map(function(a){ 
      return '<div class="ab-row"><span class="ab-date">'+a.date+'</span><span style="font-size:11px; color:#ef4444">تنبيه غياب</span></div>'; 
    }).join("");
    
    sb.innerHTML = '<div class="sb-header"><b>تنبيهات الغياب</b><button id="sb-close-btn" style="background:none; border:none; cursor:pointer">✕</button></div>' +
      '<div class="sb-content">' + rows + 
      '<button class="sb-btn" id="sb-restore" style="background:#0f172a; color:#fff">🔄 استعادة النافذة</button></div>';
    document.body.appendChild(sb);

    var isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    if (isDismissed) { alertIcon.style.display = "block"; } else { showMainModal(); }

    alertIcon.onclick = function() { sb.classList.add("open"); };
    document.getElementById("sb-close-btn").onclick = function() { sb.classList.remove("open"); };
    document.getElementById("sb-restore").onclick = function() {
      localStorage.removeItem("absDismissed_" + mState.empId);
      sb.classList.remove("open");
      alertIcon.style.display = "none";
      setTimeout(showMainModal, 300);
    };
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;
    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    var rows = mState.absences.map(function(a){ 
      return '<div class="ab-row"><span class="ab-date">📅 '+a.date+'</span><span style="font-size:11px; color:#ef4444">غياب غير مبرر</span></div>'; 
    }).join("");
    
    ov.innerHTML = '<div id="abs-modal">' +
      '<div id="abs-head"><div class="abs-icon-circle">⚠️</div><h2>تنبيه غياب</h2></div>' +
      '<div class="abs-body">' +
        '<div class="abs-greeting">مرحباً <b>'+mState.empName.split(' ')[0]+'</b>، تم رصد غياب:</div>' +
        '<div style="max-height:120px; overflow-y:auto; margin-bottom:15px">' + rows + '</div>' +
        '<label class="abs-checkbox-wrapper"><input type="checkbox" id="abs-hide-check"><span class="abs-checkbox-text">إخفاء (تحويل لمثلث صغير)</span></label>' +
        '<button id="abs-main-close">فهمت</button>' +
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
