(function () {
  const DATA_URL = "https://script.google.com/macros/s/AKfycbx.../exec"; // نفس رابطك
  const PATH_ROSTER = "/roster-site/";

  let mState = null;

  function findAbsences(empId, empName, records) {
    return records.filter(r => {
      const idMatch = String(r.empId || "").trim() === String(empId).trim();
      const nameMatch = String(r.name || "").trim() === String(empName).trim();
      return idMatch || nameMatch;
    });
  }

  function init() {
    // ✅ تحديد نوع الصفحة (وارد / صادر)
    const isImportPage =
      location.pathname.includes("/import") ||
      location.pathname.includes("/roster-site/import");

    // ✅ اختيار ID الصحيح
    const empId = isImportPage
      ? localStorage.getItem("importSavedEmpId")
      : localStorage.getItem("savedEmpId");

    if (!empId) return;

    const base = location.pathname.includes(PATH_ROSTER)
      ? location.origin + PATH_ROSTER
      : location.origin + "/";

    // ✅ تحديد مصدر البيانات الصحيح
    const scheduleUrl = isImportPage
      ? `${base}import/schedules/${empId}.json`
      : `${base}schedules/${empId}.json`;

    Promise.all([
      fetch(scheduleUrl).then(r => (r.ok ? r.json() : null)),
      fetch(`${DATA_URL}?v=${Date.now()}`).then(r => (r.ok ? r.json() : null)),
    ]).then(([emp, absData]) => {
      if (!emp?.name || !absData?.records) return;

      const absences = findAbsences(empId, emp.name, absData.records);
      if (!absences.length) return;

      mState = {
        empName: emp.name,
        absences,
        empId,
        hash: absences.map(a => a.date).join("|"),
      };

      injectStyles();
      buildUI();
    });
  }

  function injectStyles() {
    if (document.getElementById("abs-style")) return;
    const style = document.createElement("style");
    style.id = "abs-style";
    style.innerHTML = `
      .abs-popup {
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        border-radius: 12px;
        padding: 15px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        z-index: 9999;
        width: 260px;
        font-family: sans-serif;
      }
      .abs-title {
        font-weight: bold;
        margin-bottom: 10px;
        color: #b91c1c;
      }
      .abs-item {
        margin: 5px 0;
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  function buildUI() {
    const div = document.createElement("div");
    div.className = "abs-popup";

    const title = document.createElement("div");
    title.className = "abs-title";
    title.textContent = `غياب مسجل - ${mState.empName}`;

    div.appendChild(title);

    mState.absences.forEach(a => {
      const item = document.createElement("div");
      item.className = "abs-item";
      item.textContent = `${a.date}`;
      div.appendChild(item);
    });

    document.body.appendChild(div);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
