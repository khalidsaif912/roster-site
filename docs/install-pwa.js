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

  function resetDismissIfInstallAvailable() {
    if (deferredPrompt) {
      localStorage.removeItem(DISMISS_KEY);
    }
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
      transform:translateX(-50%) translateY(20px);
      opacity:0;
      background:rgba(20,20,24,0.94);
      border:1px solid rgba(201,168,76,0.28);
      border-radius:16px;
      padding:10px 12px;
      z-index:9999;
      display:flex;
      align-items:center;
      gap:10px;
      direction:rtl;
      min-width:260px;
      max-width:calc(100vw - 24px);
      box-shadow:0 10px 30px rgba(0,0,0,0.28);
      backdrop-filter:blur(12px);
      transition:opacity .25s ease, transform .25s ease;
    `;

    banner.innerHTML = `
      <div style="width:32px;height:32px;border-radius:10px;background:rgba(201,168,76,0.10);display:flex;align-items:center;justify-content:center;">📱</div>
      <div style="flex:1;">
        <div style="color:#fff;font-size:13px;font-weight:700;">إضافة الروستر</div>
        <div style="color:#b8a57a;font-size:11px;">افتحه مثل التطبيق</div>
      </div>
      <button id="installBtn">طريقة التثبيت</button>
      <button id="closeBtn">✕</button>
    `;

    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      banner.style.opacity = '1';
      banner.style.transform = 'translateX(-50%) translateY(0)';
    });

    document.getElementById('closeBtn').onclick = () => banner.remove();
  }

  window.addEventListener('load', () => {
    setTimeout(createBanner, 3000);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js?v=8');
  }

})();


// 🔥🔥🔥 BANNER FEATURE (لا تلمس هذا الجزء)
window.addEventListener('load', function () {

  const KEY = 'selectedBanner';
  const PATH = '/roster-site/assets/banners/';

  const header = document.querySelector('.header');
  if (!header) {
    console.log('❌ header not found');
    return;
  }

  console.log('✅ Banner system active');

  function setBanner(file) {
    header.style.backgroundImage =
      "linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)), url('" + PATH + file + "')";
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
  }

  const saved = localStorage.getItem(KEY) || 'banner1.jpg';
  setBanner(saved);

  const btn = document.createElement('button');
  btn.innerText = '🎨';

  btn.style.position = 'absolute';
  btn.style.left = '16px';
  btn.style.top = '14px';
  btn.style.zIndex = '99999';
  btn.style.background = '#000';
  btn.style.color = '#fff';
  btn.style.border = '2px solid #fff';
  btn.style.borderRadius = '10px';
  btn.style.padding = '8px';
  btn.style.cursor = 'pointer';

  header.appendChild(btn);

  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.top = '60px';
  panel.style.left = '10px';
  panel.style.background = '#fff';
  panel.style.borderRadius = '12px';
  panel.style.padding = '10px';
  panel.style.display = 'none';
  panel.style.zIndex = '99999';
  panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';

  const banners = ['banner1.jpg','banner2.jpg','banner3.jpg'];

  banners.forEach(file => {
    const img = document.createElement('div');

    img.style.width = '100px';
    img.style.height = '50px';
    img.style.marginBottom = '6px';
    img.style.cursor = 'pointer';
    img.style.borderRadius = '8px';
    img.style.backgroundImage = `url(${PATH}${file})`;
    img.style.backgroundSize = 'cover';

    img.onclick = () => {
      localStorage.setItem(KEY, file);
      setBanner(file);
      panel.style.display = 'none';
    };

    panel.appendChild(img);
  });

  header.appendChild(panel);

  btn.onclick = () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };

});
