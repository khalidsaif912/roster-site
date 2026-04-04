(function () {
  const BANNER_KEY = 'roster_banner_choice';
  const BANNERS_PATH = 'https://khalidsaif912.github.io/roster-site/assets/banners/';

  // عدّل هذه القائمة بأسماء الصور الفعلية في مجلد assets/banners/
  const availableBanners = [
    'banner1.jpg',
    'banner2.jpg',
    'banner3.jpg',
  ];

  function getSavedBanner() {
    return localStorage.getItem(BANNER_KEY) || null;
  }

  function saveBannerChoice(name) {
    localStorage.setItem(BANNER_KEY, name);
  }

  function applyBanner(name) {
    const headerEl = document.querySelector('.header');
    if (!headerEl) return;
    headerEl.style.backgroundImage = `url('${BANNERS_PATH + name}')`;
    headerEl.style.backgroundSize = 'cover';
    headerEl.style.backgroundPosition = 'center';
    headerEl.style.backgroundRepeat = 'no-repeat';
  }

  function clearBanner() {
    const headerEl = document.querySelector('.header');
    if (!headerEl) return;
    headerEl.style.backgroundImage = '';
    headerEl.style.backgroundSize = '';
    headerEl.style.backgroundPosition = '';
    headerEl.style.backgroundRepeat = '';
  }

  function createChangerBtn() {
    if (document.getElementById('banner-changer-btn')) return;
    const headerEl = document.querySelector('.header');
    if (!headerEl) return;

    const btn = document.createElement('button');
    btn.id = 'banner-changer-btn';
    btn.textContent = '🖼️';
    btn.title = 'تغيير خلفية الهيدر';
    btn.style.cssText = `
      position:absolute;top:8px;left:8px;z-index:999;
      background:transparent;border:none;
      color:#fff;padding:8px;
      font-size:16px;cursor:pointer;line-height:1;
      opacity:0.85;
      -webkit-tap-highlight-color:transparent;
      touch-action:manipulation;
      min-width:36px;min-height:36px;
      display:flex;align-items:center;justify-content:center;
    `;

    if (getComputedStyle(headerEl).position === 'static') {
      headerEl.style.position = 'relative';
    }

    headerEl.appendChild(btn);
    btn.onclick = (e) => { e.stopPropagation(); showBannerPicker(); };
  }

  function showBannerPicker() {
    if (document.getElementById('banner-picker')) return;

    const overlay = document.createElement('div');
    overlay.id = 'banner-picker';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.65);
      z-index:10000;display:flex;align-items:flex-end;justify-content:center;
      font-family:system-ui,-apple-system,sans-serif;
    `;

    const sheet = document.createElement('div');
    sheet.style.cssText = `
      background:#17181d;border-top-left-radius:20px;border-top-right-radius:20px;
      padding:18px 16px 28px;width:100%;max-width:480px;direction:rtl;
    `;

    const current = getSavedBanner();

    sheet.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <span style="color:#f5ead8;font-size:15px;font-weight:700;">اختر خلفية الهيدر</span>
        <button id="closePicker" style="background:rgba(255,255,255,0.06);border:none;color:#b8a57a;width:28px;height:28px;border-radius:8px;font-size:15px;cursor:pointer;">✕</button>
      </div>
      <div id="bannerGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;"></div>
      <button id="resetBanner" style="
        margin-top:12px;width:100%;border:none;border-radius:12px;padding:10px;
        font-size:13px;font-weight:700;cursor:pointer;color:#b8a57a;
        background:rgba(255,255,255,0.05);
      ">إعادة الخلفية الافتراضية</button>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const grid = document.getElementById('bannerGrid');

    availableBanners.forEach(name => {
      const wrap = document.createElement('div');
      wrap.style.cssText = `
        border-radius:10px;overflow:hidden;cursor:pointer;
        border:2px solid ${name === current ? '#e0bd63' : 'transparent'};
        transition:border .15s;
      `;
      const img = document.createElement('img');
      img.src = BANNERS_PATH + name;
      img.style.cssText = `width:100%;height:70px;object-fit:cover;display:block;`;
      img.onerror = () => { wrap.style.display = 'none'; };
      wrap.appendChild(img);
      grid.appendChild(wrap);

      wrap.onclick = () => {
        saveBannerChoice(name);
        applyBanner(name);
        overlay.remove();
      };
    });

    document.getElementById('resetBanner').onclick = () => {
      localStorage.removeItem(BANNER_KEY);
      clearBanner();
      overlay.remove();
    };

    document.getElementById('closePicker').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  function init() {
    const saved = getSavedBanner();
    if (saved) applyBanner(saved);
    createChangerBtn();
  }

  function waitForHeader() {
    if (document.querySelector('.header')) {
      init();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector('.header')) {
        observer.disconnect();
        init();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForHeader);
  } else {
    waitForHeader();
  }

})();