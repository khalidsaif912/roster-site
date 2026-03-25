(function () {
  "use strict";

  const PATH_ROSTER = "/roster-site/";
  const PATH_IMPORT = "/roster-site/import";
  const PAGE_KEY = location.pathname.includes(PATH_IMPORT) ? "import" : "export";
  const STORAGE_EMP_ID = PAGE_KEY === "import" ? "importSavedEmpId" : "savedEmpId";
  const STORAGE_LANG = "appLang";

  const DATA_URL = (function () {
    const origin = location.origin;
    const base = location.pathname.includes(PATH_ROSTER) ? origin + PATH_ROSTER : origin;
    return base + "/absence-data.json";
  })();

  let mState = { empName: "", absences: [], empId: "", hash: "" };

  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").replace(/\s+/g, " ").trim();

  const I18N = {
    ar: {
      langButton: "EN",
      daysAbsence: (n) => `${n} ${n === 1 ? "يوم غياب" : "أيام غياب"}`,
      daysOnly: (n) => `${n} ${n === 1 ? "يوم" : "أيام"}`,
      recordedAbsence: "🔔 غياب مسجّل",
      detailsBtn: "عرض التفاصيل والخيارات",
      hello: (name) => `مرحباً ${name} 👋`,
      systemHas: (n) => `لديك ${n} ${n === 1 ? "يوم غياب" : "أيام غياب"} مسجّلة في النظام`,
      reason:
        "رصد نظام الحضور غياباً باسمك في التواريخ أدناه. إن اعتقدت بوجود خطأ، راسل الإدارة مباشرةً.",
      absenceTag: "غياب",
      email: "بريد",
      whatsapp: "واتساب",
      hideModal: "عدم إظهار النافذة تلقائياً",
      hideModalSub: "ستبقى أيقونة التنبيه ظاهرة",
      hideDot: "إخفاء كل شيء حتى التحديث القادم",
      hideDotSub: "لن يظهر التنبيه إلا عند وجود غياب جديد",
      ok: "حسناً، فهمت ✓",
      subject: (name) => `تنبيه غياب — ${name}`,
      adminMailBody: (name, empId, dates) =>
        `السلام عليكم،\n\nأفيدكم بأن الموظف ${name} (رقم: ${empId}) لديه غياب مسجّل في التواريخ التالية:\n${dates}\n\nأرجو مراجعة الأمر.\n\nشكراً`,
      waBody: (name, empId, dates) =>
        `السلام عليكم، أنا ${name} (رقم: ${empId})\nلديّ غياب مسجّل في التواريخ التالية:\n${dates}\nأرجو المراجعة. شكراً`,
      closeLabel: "إغلاق",
      dir: "rtl"
    },
    en: {
      langButton: "ع",
      daysAbsence: (n) => `${n} ${n === 1 ? "absence day" : "absence days"}`,
      daysOnly: (n) => `${n} ${n === 1 ? "day" : "days"}`,
      recordedAbsence: "🔔 Recorded absence",
      detailsBtn: "View details and options",
      hello: (name) => `Hello ${name} 👋`,
      systemHas: (n) => `You have ${n} ${n === 1 ? "absence day" : "absence days"} recorded in the system`,
      reason:
        "The attendance system detected an absence under your name on the dates below. If you believe this is an error, please contact administration directly.",
      absenceTag: "Absence",
      email: "Email",
      whatsapp: "WhatsApp",
      hideModal: "Do not show this window automatically",
      hideModalSub: "The alert icon will remain visible",
      hideDot: "Hide everything until the next update",
      hideDotSub: "No alert will appear unless there is a new absence",
      ok: "OK, got it ✓",
      subject: (name) => `Absence Alert — ${name}`,
      adminMailBody: (name, empId, dates) =>
        `Hello,\n\nThis is to inform you that employee ${name} (ID: ${empId}) has recorded absences on the following dates:\n${dates}\n\nPlease review the matter.\n\nThank you.`,
      waBody: (name, empId, dates) =>
        `Hello, I am ${name} (ID: ${empId}).\nI have recorded absences on the following dates:\n${dates}\nPlease review. Thank you.`,
      closeLabel: "Close",
      dir: "ltr"
    }
  };

  function getLang() {
    const stored = localStorage.getItem(STORAGE_LANG);
    if (stored === "ar" || stored === "en") return stored;
    localStorage.setItem(STORAGE_LANG, "ar");
    return "ar";
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_LANG, lang === "en" ? "en" : "ar");
    applyLang();
  }

  function toggleLang() {
    setLang(getLang() === "ar" ? "en" : "ar");
    rerenderUI();
  }

  function t() {
    return I18N[getLang()] || I18N.ar;
  }

  function applyLang() {
    const lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    if (document.body) {
      document.body.classList.toggle("ar", lang === "ar");
    }
  }

  function nameMatch(a, b) {
    const na = norm(a), nb = norm(b);
    if (na === nb) return true;
    const wa = na.split(" ").filter(w => w.length > 3);
    const wb = nb.split(" ").filter(w => w.length > 3);
    return wa.length && wb.length && wa.filter(w => wb.indexOf(w) !== -1).length >= 2;
  }

  function findAbsences(empId, empName, records) {
    const results = [];
    const cleanName = (empName || "").replace(/-\s*\d+\s*$/, "").trim();
    records.forEach(rec => {
      let matched = false;
      if (empId && rec.empNos && rec.empNos.indexOf(String(empId)) !== -1) {
        results.push({ date: rec.date });
        matched = true;
      }
      if (!matched && cleanName) {
        rec.names.forEach(n => {
          if (nameMatch(cleanName, n)) results.push({ date: rec.date });
        });
      }
    });
    return results;
  }

  function injectStyles() {
    if (document.getElementById("abs-styles")) return;
    const s = document.createElement("style");
    s.id = "abs-styles";
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Tajawal:wght@400;600;700;800&display=swap');

      .abs-r, .abs-r * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: 'Inter', 'Tajawal', system-ui, sans-serif;
      }
      .abs-r[data-lang="ar"], .abs-r[data-lang="ar"] * {
        font-family: 'Tajawal', 'Inter', system-ui, sans-serif;
        direction: rtl;
        text-align: right;
      }
      .abs-r[data-lang="en"], .abs-r[data-lang="en"] * {
        direction: ltr;
        text-align: left;
      }


      #abs-dot {
        position: fixed;
        bottom: 26px;
        left: 16px;
        z-index: 999998;
        display: none;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      #abs-dot.abs-on {
        display: flex;
        animation: dotIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      @keyframes dotIn {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .abs-dot-emoji {
        font-size: 34px;
        line-height: 1;
        display: block;
        animation: envShake 3.5s ease-in-out infinite;
        transform-origin: top center;
        filter: drop-shadow(0 3px 7px rgba(153,27,27,0.4));
      }
      @keyframes envShake {
        0%,100% { transform: rotate(0deg) translateY(0); }
        8% { transform: rotate(-14deg) translateY(-3px); }
        16% { transform: rotate(11deg) translateY(-3px); }
        24% { transform: rotate(-8deg) translateY(-1px); }
        32% { transform: rotate(5deg) translateY(-1px); }
        40% { transform: rotate(0deg) translateY(0); }
        70% { transform: rotate(0deg) translateY(0); }
        76% { transform: rotate(-6deg) translateY(-2px); }
        82% { transform: rotate(6deg) translateY(-2px); }
        88% { transform: rotate(0deg) translateY(0); }
      }
      .abs-dot-badge {
        margin-top: 4px;
        background: #991b1b;
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 99px;
        box-shadow: 0 2px 6px rgba(153,27,27,0.4);
        white-space: nowrap;
        letter-spacing: 0.2px;
      }

      #abs-card {
        position: fixed;
        bottom: 90px;
        left: 14px;
        z-index: 999997;
        width: 240px;
        background: #fff;
        border-radius: 16px;
        padding: 11px 12px 12px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.13), 0 2px 6px rgba(0,0,0,0.06);
        border: 1px solid #fecaca;
        display: none;
        flex-direction: column;
        gap: 7px;
        transform-origin: bottom left;
      }
      #abs-card.abs-open {
        display: flex;
        animation: cardIn 0.3s cubic-bezier(0.16,1,0.3,1);
      }
      #abs-card::after {
        content: '';
        position: absolute;
        bottom: -7px;
        left: 22px;
        width: 14px;
        height: 7px;
        background: #fff;
        clip-path: polygon(0 0,100% 0,50% 100%);
        filter: drop-shadow(0 2px 2px rgba(0,0,0,0.06));
      }
      @keyframes cardIn {
        from { opacity: 0; transform: scale(0.9) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      .abs-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #fee2e2;
        padding-bottom: 7px;
      }
      .abs-card-title {
        font-size: 12px;
        font-weight: 800;
        color: #991b1b;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .abs-card-x {
        background: none;
        border: none;
        font-size: 13px;
        color: #94a3b8;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        -webkit-tap-highlight-color: transparent;
        transition: color 0.15s;
      }
      .abs-card-x:hover { color: #374151; }

      .abs-card-name {
        font-size: 11px;
        font-weight: 700;
        color: #374151;
      }
      .abs-card-name span { color: #991b1b; }

      .abs-card-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        color: #374151;
        padding: 5px 8px;
        background: #fef2f2;
        border-radius: 8px;
        border-inline-start: 3px solid #dc2626;
      }

      .abs-card-btn {
        width: 100%;
        padding: 8px;
        background: #991b1b;
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        transition: opacity 0.15s;
        -webkit-tap-highlight-color: transparent;
        margin-top: 1px;
      }
      .abs-card-btn:hover { opacity: 0.88; }
      .abs-card-btn:active { opacity: 0.7; }

      #abs-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: rgba(15,23,42,0.5);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        animation: ovIn 0.22s ease forwards;
      }
      @keyframes ovIn { to { opacity: 1; } }

      #abs-modal {
        width: 100%;
        max-width: 360px;
        background: #fff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        transform: scale(0.88) translateY(16px);
        opacity: 0;
        animation: mIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      @keyframes mIn {
        to { transform: scale(1) translateY(0); opacity: 1; }
      }

      #abs-mhead {
        background: #991b1b;
        padding: 14px 14px 11px;
        position: relative;
        overflow: hidden;
      }
      #abs-mhead::before {
        content: '';
        position: absolute;
        width: 120px;
        height: 120px;
        background: rgba(255,255,255,0.06);
        border-radius: 50%;
        top: -50px;
        left: -20px;
        pointer-events: none;
      }
      .abs-mhead-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
        position: relative;
        z-index: 1;
      }
      .abs-mtitle { font-size: 15px; font-weight: 800; color: #fff; }
      .abs-mxbtn {
        width: 24px;
        height: 24px;
        background: rgba(255,255,255,0.18);
        border: none;
        border-radius: 50%;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s;
      }
      .abs-mxbtn:hover { background: rgba(255,255,255,0.3); }
      .abs-msub {
        font-size: 11px;
        color: rgba(255,255,255,0.82);
        font-weight: 500;
        position: relative;
        z-index: 1;
        line-height: 1.5;
      }

      #abs-mbody {
        padding: 11px 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .abs-reason {
        font-size: 11px;
        color: #475569;
        font-weight: 600;
        line-height: 1.65;
        padding: 9px 11px;
        background: #fef2f2;
        border-radius: 10px;
        border-inline-start: 3px solid #991b1b;
      }

      .ab-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 9px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        margin-bottom: 5px;
      }
      .ab-row:last-child { margin-bottom: 0; }
      .ab-date { font-size: 12px; font-weight: 800; color: #7f1d1d; }
      .ab-tag {
        font-size: 10px;
        font-weight: 700;
        color: #991b1b;
        background: #fff;
        border: 1px solid #fca5a5;
        border-radius: 99px;
        padding: 2px 8px;
        white-space: nowrap;
      }

      .abs-contact-row {
        display: flex;
        gap: 7px;
      }
      .abs-contact-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 8px;
        border-radius: 11px;
        font-size: 12px;
        font-weight: 800;
        text-decoration: none;
        border: none;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      .abs-contact-btn:active { transform: scale(0.96); opacity: 0.85; }
      .abs-btn-email {
        background: #fef2f2;
        color: #991b1b;
        border: 1.5px solid #fecaca;
      }
      .abs-btn-email:hover { background: #fee2e2; }
      .abs-btn-wa {
        background: #dcfce7;
        color: #166534;
        border: 1.5px solid #bbf7d0;
      }
      .abs-btn-wa:hover { background: #bbf7d0; }

      .abs-opt {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        padding: 8px 10px;
        background: #fafafa;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        cursor: pointer;
        margin-bottom: 5px;
        -webkit-tap-highlight-color: transparent;
        transition: border-color 0.15s;
      }
      .abs-opt:last-child { margin-bottom: 0; }
      .abs-opt:hover { border-color: #fca5a5; }
      .abs-opt input {
        width: 15px;
        height: 15px;
        accent-color: #991b1b;
        flex-shrink: 0;
        margin-top: 2px;
        cursor: pointer;
      }
      .abs-opt-t {
        font-size: 11px;
        color: #374151;
        font-weight: 700;
        line-height: 1.4;
        user-select: none;
      }
      .abs-opt-t span {
        display: block;
        font-size: 10px;
        color: #9ca3af;
        font-weight: 500;
        margin-top: 1px;
      }

      #abs-ok {
        width: 100%;
        padding: 12px;
        background: #991b1b;
        color: #fff;
        border: none;
        border-radius: 11px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(153,27,27,0.3);
        transition: opacity 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      #abs-ok:hover { opacity: 0.88; }
      #abs-ok:active { opacity: 0.75; }

      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        #abs-mbody { padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(s);
  }

  function applyLangMeta(el) {
    const lang = getLang();
    el.setAttribute("data-lang", lang);
    el.setAttribute("dir", t().dir);
    return el;
  }

  function clearUI() {
    ["abs-dot", "abs-card", "abs-overlay"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function buildUI() {
    const dict = t();
    const count = mState.absences.length;

    const dot = applyLangMeta(document.createElement("div"));
    dot.id = "abs-dot";
    dot.className = "abs-r";
    dot.innerHTML = `
      <span class="abs-dot-emoji">📩</span>
      <span class="abs-dot-badge">${dict.daysAbsence(count)}</span>
    `;
    document.body.appendChild(dot);

    const card = applyLangMeta(document.createElement("div"));
    card.id = "abs-card";
    card.className = "abs-r";

    const cardRows = mState.absences.map(a =>
      `<div class="abs-card-row">📅 ${a.date}</div>`
    ).join("");

    const firstName = (mState.empName || "").split(" ")[0] || mState.empName;

    card.innerHTML = `
      <div class="abs-card-top">
        <span class="abs-card-title">${dict.recordedAbsence}</span>
        <button class="abs-card-x" id="abs-card-x" aria-label="${dict.closeLabel}">✕</button>
      </div>
      <div class="abs-card-name">${firstName} — <span>${dict.daysOnly(count)}</span></div>
      ${cardRows}
      <button class="abs-card-btn" id="abs-card-detail">${dict.detailsBtn}</button>
    `;
    document.body.appendChild(card);

    const isModalDismissed = localStorage.getItem("absDismissed_" + mState.empId + "_" + PAGE_KEY) === mState.hash;
    const isDotHidden = localStorage.getItem("absHideDot_" + mState.empId + "_" + PAGE_KEY) === mState.hash;

    if (isDotHidden) return;

    if (isModalDismissed) {
      dot.classList.add("abs-on");
    } else {
      showMainModal();
    }

    dot.onclick = () => {
      card.classList.toggle("abs-open");
    };

    document.getElementById("abs-card-x").onclick = (e) => {
      e.stopPropagation();
      card.classList.remove("abs-open");
    };

    document.getElementById("abs-card-detail").onclick = (e) => {
      e.stopPropagation();
      card.classList.remove("abs-open");
      showMainModal();
    };
  }

  function showMainModal() {
    if (document.getElementById("abs-overlay")) return;

    const dict = t();
    const firstName = (mState.empName || "").split(" ")[0] || mState.empName;
    const count = mState.absences.length;
    const datesBullets = mState.absences.map(a => `• ${a.date}`).join("\n");

    const mailBody = encodeURIComponent(dict.adminMailBody(mState.empName, mState.empId, datesBullets));
    const mailHref = `mailto:admin@school.edu.sa?subject=${encodeURIComponent(dict.subject(mState.empName))}&body=${mailBody}`;

    const waText = encodeURIComponent(dict.waBody(mState.empName, mState.empId, datesBullets));
    const waHref = `https://wa.me/96872777087?text=${waText}`;

    const dateRows = mState.absences.map(a => `
      <div class="ab-row">
        <span class="ab-date">📅 ${a.date}</span>
        <span class="ab-tag">${dict.absenceTag}</span>
      </div>`).join("");

    const ov = applyLangMeta(document.createElement("div"));
    ov.id = "abs-overlay";
    ov.className = "abs-r";
    ov.innerHTML = `
      <div id="abs-modal">
        <div id="abs-mhead">
          <div class="abs-mhead-row">
            <button class="abs-mxbtn" id="abs-lang-btn" type="button" aria-label="Change language" style="width:auto;height:28px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:800;">
              ${dict.langButton}
            </button>
            <div class="abs-mtitle" style="flex:1;text-align:center;">${dict.hello(firstName)}</div>
            <button class="abs-mxbtn" id="abs-xbtn" aria-label="${dict.closeLabel}">✕</button>
          </div>
          <div class="abs-msub">${dict.systemHas(count)}</div>
        </div>

        <div id="abs-mbody">
          <div class="abs-reason">${dict.reason}</div>
          <div>${dateRows}</div>

          <div class="abs-contact-row">
            <a class="abs-contact-btn abs-btn-email" href="${mailHref}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              ${dict.email}
            </a>
            <a class="abs-contact-btn abs-btn-wa" href="${waHref}" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              ${dict.whatsapp}
            </a>
          </div>

          <div>
            <label class="abs-opt">
              <input type="checkbox" id="abs-hide-check">
              <div class="abs-opt-t">${dict.hideModal}<span>${dict.hideModalSub}</span></div>
            </label>
            <label class="abs-opt">
              <input type="checkbox" id="abs-hide-dot">
              <div class="abs-opt-t">${dict.hideDot}<span>${dict.hideDotSub}</span></div>
            </label>
          </div>

          <button id="abs-ok">${dict.ok}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    document.getElementById("abs-lang-btn").onclick = (e) => {
      e.stopPropagation();
      toggleLang();
    };
    document.getElementById("abs-xbtn").onclick = () => closeModal(ov, false, false);
    document.getElementById("abs-ok").onclick = () => closeModal(
      ov,
      document.getElementById("abs-hide-check").checked,
      document.getElementById("abs-hide-dot").checked
    );
  }

  function closeModal(ov, hideModal, hideDot) {
    ov.style.transition = "opacity 0.2s ease";
    ov.style.opacity = "0";
    setTimeout(() => {
      ov.remove();
      const dot = document.getElementById("abs-dot");
      if (!dot) return;
      if (hideDot) {
        localStorage.setItem("absHideDot_" + mState.empId + "_" + PAGE_KEY, mState.hash);
        dot.style.display = "none";
      } else if (hideModal) {
        localStorage.setItem("absDismissed_" + mState.empId + "_" + PAGE_KEY, mState.hash);
        dot.classList.add("abs-on");
      } else {
        dot.classList.add("abs-on");
      }
    }, 220);
  }

  function rerenderUI() {
    applyLang();
    clearUI();
    if (mState.absences && mState.absences.length) {
      buildUI();
    }
  }

  function init() {
    applyLang();
    const empId = localStorage.getItem(STORAGE_EMP_ID);
    if (!empId) return;

    const base = location.pathname.includes(PATH_ROSTER)
      ? location.origin + PATH_ROSTER
      : location.origin + "/";

    const scheduleUrl = PAGE_KEY === "import"
      ? `${base}import/schedules/${empId}.json`
      : `${base}schedules/${empId}.json`;

    Promise.all([
      fetch(scheduleUrl).then(r => r.ok ? r.json() : null),
      fetch(`${DATA_URL}?v=${Date.now()}`).then(r => r.ok ? r.json() : null),
    ]).then(([emp, absData]) => {
      if (!emp || !emp.name || !absData || !absData.records) return;
      const absences = findAbsences(empId, emp.name, absData.records);
      if (!absences.length) return;
      mState = { empName: emp.name, absences, empId, hash: absences.map(a => a.date).join("|") };
      injectStyles();
      buildUI();
    }).catch(err => {
      console.error("absence-alert init failed:", err);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
})();
