(function () {
  let deferredPrompt = null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const DISMISS_KEY = 'roster_pwa_banner_dismissed_v1';

  function bannerDismissed() {
    return localStorage.getItem(DISMISS_KEY) === '1';
  }

  function setBannerDismissed() {
    localStorage.setItem(DISMISS_KEY, '1');
  }

  function createBanner() {
    if (document.getElementById('install-banner')) return;
    if (isStandalone) return;
    if (bannerDismissed()) return;

    const banner = document.createElement('div');
    banner.id = 'install-banner';

    banner.style.cssText = `
      position:fixed;
      bottom:16px;
      left:50%;
      transform:translateX(-50%);
      background:rgba(20,20,24,0.94);
      border-radius:16px;
      padding:10px 12px;
      z-index:9999;
      display:flex;
      align-items:center;
      gap:10px;
      direction:rtl;
      box-shadow:0 10px 30px rgba(0,0,0,0.28);
    `;

    banner.innerHTML = `
      <div style="font-size:15px;">📱</div>
      <div style="color:#fff;font-size:13px;font-weight:700;">إضافة الروستر</div>
      <button id="closeBtn">✕</button>
    `;

    document.body.appendChild(banner);

    document.getElementById('closeBtn').onclick = () => {
      banner.remove();
      setBannerDismissed();
    };
  }

  setTimeout(createBanner, 3000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js?v=11');
  }
})();


// ============================
// 🎨 BANNER SYSTEM (FINAL)
// ============================

(function () {

  const KEY = 'selectedBanner';
  const PATH = '/roster-site/assets/banners/';
  const BANNERS = ['banner1.jpg','banner2.jpg','banner3.jpg'];

  function applyBanner(header, file) {
    header.style.backgroundImage =
      "linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url('" + PATH + file + "')";
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
  }

  function init() {
    const header = document.querySelector('.header');
    if (!header) return false;

    if (document.getElementById('banner-btn')) return true;

    const saved = localStorage.getItem(KEY) || BANNERS[0];
    applyBanner(header, saved);

    // 🔘 زر صغير واضح
    const btn = document.createElement('div');
    btn.id = 'banner-btn';
    btn.textContent = '🎨';

    btn.style.position = 'absolute';
    btn.style.left = '12px';
    btn.style.top = '12px';
    btn.style.zIndex = '99999';
    btn.style.width = '26px';
    btn.style.height = '26px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.borderRadius = '50%';
    btn.style.background = 'rgba(0,0,0,0.35)';
    btn.style.color = '#fff';
    btn.style.fontSize = '13px';
    btn.style.cursor = 'pointer';

    header.appendChild(btn);

    // 🖼️ لوحة الصور
    const panel = document.createElement('div');
    panel.style.position = 'absolute';
    panel.style.top = '44px';
    panel.style.left = '10px';
    panel.style.background = '#fff';
    panel.style.borderRadius = '12px';
    panel.style.padding = '6px';
    panel.style.display = 'none';
    panel.style.zIndex = '99999';
    panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.25)';

    BANNERS.forEach(file => {
      const item = document.createElement('div');

      item.style.width = '90px';
      item.style.height = '45px';
      item.style.marginBottom = '5px';
      item.style.borderRadius = '8px';
      item.style.cursor = 'pointer';
      item.style.backgroundImage = `url(${PATH}${file})`;
      item.style.backgroundSize = 'cover';

      item.onclick = () => {
        localStorage.setItem(KEY, file);
        applyBanner(header, file);
        panel.style.display = 'none';
      };

      panel.appendChild(item);
    });

    header.appendChild(panel);

    btn.onclick = (e) => {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.style.display = 'none';
      }
    });

    return true;
  }

  // 🔁 retry قوي (يحل كل مشاكل المتصفحات)
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (init() || tries > 30) {
      clearInterval(timer);
    }
  }, 300);

})();
