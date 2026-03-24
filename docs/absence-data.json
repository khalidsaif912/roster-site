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

  // ── PREMIUM STYLES ───────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("abs-premium-styles")) return;
    var s = document.createElement("style");
    s.id = "abs-premium-styles";
    s.textContent = [
      /* --- الخطوط والاتجاه --- */
      ".abs-font { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; direction: rtl; }",

      /* --- النقطة الحمراء (Pulse Dot) --- */
      "#abs-dot { position: fixed; left: 20px; top: 20px; z-index: 999999; width: 14px; height: 14px; background: #ef4444; border-radius: 50%; cursor: pointer; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); display: none; border: 2px solid #fff; animation: absPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; transition: transform 0.2s ease; }",
      "#abs-dot:hover { transform: scale(1.2); }",
      "@keyframes absPulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }",

      /* --- النافذة الرئيسية (Main Modal) --- */
      "#abs-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 1000000; display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; animation: fadeIn 0.3s ease forwards; }",
      "@keyframes fadeIn { to { opacity: 1; } }",
      "#abs-modal { background: #ffffff; border-radius: 24px; max-width: 420px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; transform: scale(0.95); animation: scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }",
      "@keyframes scaleUp { to { transform: scale(1); } }",
      
      /* هيدر النافذة الرئيسية */
      "#abs-head { background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 32px 24px 24px; text-align: center; color: #fff; position: relative; }",
      "#abs-head::before { content: ''; position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: rgba(255, 255, 255, 0.1); border-radius: 50%; }",
      ".abs-icon-circle { width: 64px; height: 64px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1); position: relative; z-index: 1; }",
      "#abs-head h2 { margin: 0 0 8px; font-size: 22px; font-weight: 800; position: relative; z-index: 1; }",
      "#abs-head p { margin: 0; font-size: 14px; opacity: 0.9; font-weight: 500; position: relative; z-index: 1; }",

      /* محتوى النافذة الرئيسية */
      ".abs-body { padding: 24px; }",
      ".abs-greeting { font-size: 15px; color: #334155; margin-bottom: 16px; font-weight: 600; line-height: 1.5; }",
      ".abs-list { max-height: 180px; overflow-y: auto; margin-bottom: 24px; padding-left: 4px; }",
      ".abs-list::-webkit-scrollbar { width: 6px; }",
      ".abs-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }",
      
      /* صفوف الغياب */
      ".ab-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; margin-bottom: 10px; transition: transform 0.2s ease; }",
      ".ab-row:hover { transform: translateX(-4px); border-color: #fca5a5; }",
      ".ab-date { color: #b91c1c; font-size: 13px; font-weight: 800; background: #fecaca; padding: 6px 12px; border-radius: 8px; letter-spacing: 0.5px; }",
      ".ab-badge { color: #ef4444; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; }",

      /* زر الاختيار (Checkbox) */
      ".abs-checkbox-wrapper { display: flex; align-items: center; gap: 12px; padding: 16px; background: #f8fafc; border-radius: 14px; cursor: pointer; margin-bottom: 24px; border: 1px solid #e2e8f0; transition: all 0.2s ease; }",
      ".abs-checkbox-wrapper:hover { border-color: #cbd5e1; background: #f1f5f9; }",
      ".abs-checkbox-wrapper input { width: 20px; height: 20px; accent-color: #ef4444; cursor: pointer; }",
      ".abs-checkbox-text { font-size: 13px; color: #475569; font-weight: 600; user-select: none; }",

      /* زر الإغلاق الرئيسي */
      "#abs-main-close { width: 100%; padding: 16px; border-radius: 14px; border: none; background: linear-gradient(to right, #ef4444, #dc2626); color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 20px -6px rgba(239, 68, 68, 0.5); transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }",
      "#abs-main-close:hover { transform: translateY(-2px); box-shadow: 0 12px 24px -8px rgba(239, 68, 68, 0.6); }",
      "#abs-main-close:active { transform: translateY(0); scale: 0.98; }",

      /* --- النافذة المطوية (Sidebar) --- */
      "#abs-sb { position: fixed; left: -340px; top: 0; height: 100%; width: 320px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 10px 0 40px rgba(0, 0, 0, 0.1); transition: left 0.5s cubic-bezier(0.16, 1, 0.3, 1); z-index: 1000001; display: flex; flex-direction: column; border-right: 1px solid rgba(255, 255, 255, 0.5); }",
      "#abs-sb.open { left: 0; }",
      ".sb-header { padding: 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(226, 232, 240, 0.8); }",
      ".sb-title { font-size: 18px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }",
      ".sb-close-icon { background: #f1f5f9; border: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; font-size: 14px; font-weight: bold; transition: all 0.2s ease; }",
      ".sb-close-icon:hover { background: #e2e8f0; color: #0f172a; transform: rotate(90deg); }",
      ".sb-content { padding: 24px; flex: 1; overflow-y: auto; }",
      
      /* أزرار النافذة المطوية */
      ".sb-btn { width: 100%; padding: 14px; margin-top: 12px; border-radius: 12px; border: none; cursor: pointer; font-weight: 700; transition: all 0.2s ease; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; }",
      ".btn-main { background: #0f172a; color: #fff; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2); }",
      ".btn-main:hover { background: #1e293b; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(15, 23, 42, 0.3); }",
      ".btn-main:active { transform: translateY(0); scale: 0.98; }"
    ].join("");
    document.head.appendChild(s);
  }

  // ── UI BUILDERS ──────────────────────────────────────────────────────────
  function buildUI() {
    // 1. إنشاء النقطة (الخفية مبدئياً)
    var dot = document.createElement("div");
    dot.id = "abs-dot";
    document.body.appendChild(dot);

    // 2. إنشاء الشريط الجانبي المطوي
    var sb = document.createElement("div");
    sb.id = "abs-sb";
    sb.className = "abs-font";
    var rows = mState.absences.map(function(a){ 
      return '<div class="ab-row"><span class="ab-date">'+a.date+'</span><span class="ab-badge">غياب مسجل</span></div>'; 
    }).join("");
    
    sb.innerHTML = 
      '<div class="sb-header">' +
        '<div class="sb-title"><span style="color:#ef4444; font-size: 22px;">⚠️</span> تنبيه الغياب</div>' +
        '<button class="sb-close-icon" id="sb-close-btn">✕</button>' +
      '</div>' +
      '<div class="sb-content">' + 
        rows + 
        '<div style="margin-top: 32px;">' +
          '<button class="sb-btn btn-main" id="sb-restore">🔄 استعادة النافذة الرئيسية</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sb);

    // 3. التحقق من حالة العرض (هل المستخدم أخفاها سابقاً؟)
    var isDismissed = localStorage.getItem("absDismissed_" + mState.empId) === mState.hash;
    
    if (isDismissed) {
      dot.style.display = "block"; 
    } else {
      showMainModal(); 
    }

    // 4. ربط الأحداث (Events)
    dot.onclick = function() { sb.classList.add("open"); };
    document.getElementById("sb-close-btn").onclick = function() { sb.classList.remove("open"); };
    document.getElementById("sb-restore").onclick = function() {
      localStorage.removeItem("absDismissed_" + mState.empId); // إزالة الحظر
      sb.classList.remove("open"); // إغلاق الجانبية
      dot.style.display = "none"; // إخفاء النقطة
      setTimeout(showMainModal, 300); // إظهار الرئيسية بعد أن تُغلق الجانبية بانسيابية
    };
  }

  // دالة إظهار النافذة الكبيرة الاحترافية
  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;
    
    var ov = document.createElement("div");
    ov.id = "abs-overlay";
    ov.className = "abs-font";
    
    var rows = mState.absences.map(function(a){ 
      return '<div class="ab-row"><span class="ab-date">📅 '+a.date+'</span><span class="ab-badge">غياب غير مبرر</span></div>'; 
    }).join("");
    
    ov.innerHTML = 
      '<div id="abs-modal">' +
        '<div id="abs-head">' +
          '<div class="abs-icon-circle">⚠️</div>' +
          '<h2>تنبيه إداري</h2>' +
          '<p>يرجى مراجعة سجل الحضور الخاص بك</p>' +
        '</div>' +
        '<div class="abs-body">' +
          '<div class="abs-greeting">مرحباً <b>'+mState.empName.split(' ')[0]+'</b>، تم رصد غياب لك في التواريخ التالية:</div>' +
          '<div class="abs-list">' + rows + '</div>' +
          '<label class="abs-checkbox-wrapper">' +
            '<input type="checkbox" id="abs-hide-check">' +
            '<span class="abs-checkbox-text">عدم إظهار هذه النافذة مجدداً (تحويلها لنقطة تنبيه جانبية)</span>' +
          '</label>' +
          '<button id="abs-main-close">حسناً، فهمت</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    // حدث الإغلاق
    document.getElementById("abs-main-close").onclick = function() {
      var isChecked = document.getElementById("abs-hide-check").checked;
      
      // حركة خروج سلسة
      ov.style.animation = "fadeIn 0.3s ease reverse forwards";
      document.getElementById("abs-modal").style.animation = "scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards";
      
      setTimeout(function() {
        if (isChecked) {
          localStorage.setItem("absDismissed_" + mState.empId, mState.hash);
          document.getElementById("abs-dot").style.display = "block"; // إظهار النقطة الدائمة
        }
        ov.remove();
      }, 300);
    };
  }

  // ── تشغيل السكربت ────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
