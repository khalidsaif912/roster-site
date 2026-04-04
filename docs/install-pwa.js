// 🔥 Banner Picker بالصور المصغرة
(function () {
  const KEY = 'selectedBanner';
  const PATH = '/roster-site/assets/banners/';
  const BANNERS = [
    { file: 'banner1.jpg', label: 'بنر 1' },
    { file: 'banner2.jpg', label: 'بنر 2' },
    { file: 'banner3.jpg', label: 'بنر 3' },
    { file: 'banner4.jpg', label: 'بنر 4' },
    { file: 'banner5.jpg', label: 'بنر 5' }
  ];

  function setBanner(header, file) {
    header.style.backgroundImage =
      "linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.18)), url('" + PATH + file + "')";
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
    header.style.backgroundRepeat = 'no-repeat';
  }

  function closePanel(panel) {
    panel.style.display = 'none';
  }

  function createPicker(header) {
    const panel = document.createElement('div');
    panel.style.position = 'absolute';
    panel.style.top = '56px';
    panel.style.left = '12px';
    panel.style.width = '260px';
    panel.style.maxWidth = 'calc(100% - 24px)';
    panel.style.background = 'rgba(255,255,255,0.98)';
    panel.style.backdropFilter = 'blur(10px)';
    panel.style.border = '1px solid rgba(15,23,42,.08)';
    panel.style.borderRadius = '16px';
    panel.style.padding = '10px';
    panel.style.boxShadow = '0 12px 28px rgba(15,23,42,.18)';
    panel.style.display = 'none';
    panel.style.zIndex = '9999';
    panel.style.direction = 'rtl';

    const title = document.createElement('div');
    title.textContent = 'اختر البنر';
    title.style.fontSize = '13px';
    title.style.fontWeight = '800';
    title.style.color = '#0f172a';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    grid.style.gap = '8px';

    BANNERS.forEach(function (banner) {
      const card = document.createElement('button');
      card.type = 'button';
      card.style.border = '1px solid rgba(15,23,42,.08)';
      card.style.borderRadius = '12px';
      card.style.padding = '6px';
      card.style.background = '#fff';
      card.style.cursor = 'pointer';
      card.style.textAlign = 'center';

      const thumb = document.createElement('div');
      thumb.style.height = '56px';
      thumb.style.borderRadius = '8px';
      thumb.style.backgroundImage =
        "linear-gradient(rgba(0,0,0,0.12), rgba(0,0,0,0.12)), url('" + PATH + banner.file + "')";
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
      thumb.style.marginBottom = '6px';

      const label = document.createElement('div');
      label.textContent = banner.label;
      label.style.fontSize = '11px';
      label.style.fontWeight = '700';
      label.style.color = '#334155';

      card.appendChild(thumb);
      card.appendChild(label);

      card.onclick = function () {
        localStorage.setItem(KEY, banner.file);
        setBanner(header, banner.file);
        closePanel(panel);
      };

      grid.appendChild(card);
    });

    panel.appendChild(grid);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'إرجاع الافتراضي';
    resetBtn.style.marginTop = '10px';
    resetBtn.style.width = '100%';
    resetBtn.style.border = 'none';
    resetBtn.style.borderRadius = '10px';
    resetBtn.style.padding = '8px 10px';
    resetBtn.style.background = '#eef2ff';
    resetBtn.style.color = '#1e40af';
    resetBtn.style.fontWeight = '800';
    resetBtn.style.cursor = 'pointer';

    resetBtn.onclick = function () {
      localStorage.removeItem(KEY);
      setBanner(header, BANNERS[0].file);
      closePanel(panel);
    };

    panel.appendChild(resetBtn);

    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && !header.querySelector('.banner-picker-btn')?.contains(e.target)) {
        closePanel(panel);
      }
    });

    return panel;
  }

  function initBanner() {
    const header = document.querySelector('.header');
    if (!header) return;

    if (getComputedStyle(header).position === 'static') {
      header.style.position = 'relative';
    }

    const saved = localStorage.getItem(KEY) || BANNERS[0].file;
    setBanner(header, saved);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'banner-picker-btn';
    btn.textContent = '🎨';
    btn.title = 'تغيير البنر';
    btn.style.position = 'absolute';
    btn.style.left = '16px';
    btn.style.top = '14px';
    btn.style.zIndex = '10000';
    btn.style.width = '34px';
    btn.style.height = '34px';
    btn.style.border = '2px solid rgba(255,255,255,.22)';
    btn.style.borderRadius = '10px';
    btn.style.background = 'rgba(255,255,255,.18)';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '16px';
    btn.style.backdropFilter = 'blur(6px)';

    const panel = createPicker(header);

    btn.onclick = function (e) {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    header.appendChild(btn);
    header.appendChild(panel);
  }

  window.addEventListener('load', initBanner);
})();
