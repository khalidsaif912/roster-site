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
      transform:translateX(-50%) translateY(20px);
      opacity:0;
      background:rgba(20,20,24,0.94);
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
      <div style="font-size:15px;">📱</div>
      <div style="flex:1;">
        <div style="color:#fff;font-size:13px;font-weight:700;">إضافة الروستر</div>
        <div style="color:#b8a57a;font-size:11px;">افتحه مثل التطبيق</div>
      </div>
      <button id="closeBtn">✕</button>
    `;

    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      banner.style.opacity = '1';
      banner.style.transform = 'translateX(-50%) translateY(0)';
    });

    document.getElementById('closeBtn').onclick = () => {
      banner.remove();
      setBannerDismissed();
    };
  }

  window.addEventListener('load', () => {
    setTimeout(createBanner, 3000);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js?v=9');
  }

})();


// 🔥🔥🔥 BANNER FEATURE (محسن ومتوافق)
(function () {

  const KEY = 'selectedBanner';
  const PATH = '/roster-site/assets/banners/';

  function start() {
    const header = document.querySelector('.header');
    if (!header) return false;

    // منع التكرار
    if (document.getElementById('banner-btn')) return true;

    function setBanner(file) {
      header.style.backgroundImage =
        "linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url('" + PATH + file + "')";
      header.style.backgroundSize = 'cover';
      header.style.backgroundPosition = 'center';
      header.style.backgroundRepeat = 'no-repeat';
    }

    const saved = localStorage.getItem(KEY) || 'banner1.jpg';
    setBanner(saved);

    // 🎨 زر صغير بدون إطار
    const btn = document.createElement('button');
    btn.id = 'banner-btn';
    btn.textContent = '🎨';
    btn.type = 'button';

    btn.style.position = 'absolute';
    btn.style.left = '10px';
    btn.style.top = '10px';
    btn.style.zIndex = '9999';

    // ✨ بدون إطار
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.outline = 'none';
    btn.style.fontSize = '18px';
    btn.style.cursor = 'pointer';
    btn.style.opacity = '0.85';

    header.appendChild(btn);

    // لوحة البنرات
    const panel = document.createElement('div');
    panel.style.position = 'absolute';
    panel.style.top = '50px';
    panel.style.left = '10px';
    panel.style.background = '#fff';
    panel.style.borderRadius = '12px';
    panel.style.padding = '8px';
    panel.style.display = 'none';
    panel.style.zIndex = '9999';
    panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.25)';

    const banners = ['banner1.jpg','banner2.jpg','banner3.jpg'];

    banners.forEach(file => {
      const img = document.createElement('div');

      img.style.width = '90px';
      img.style.height = '45px';
      img.style.marginBottom = '6px';
      img.style.cursor = 'pointer';
      img.style.borderRadius = '8px';
      img.style.backgroundImage = `url(${PATH}${file})`;
      img.style.backgroundSize = 'cover';
      img.style.backgroundPosition = 'center';

      img.onclick = () => {
        localStorage.setItem(KEY, file);
        setBanner(file);
        panel.style.display = 'none';
      };

      panel.appendChild(img);
    });

    header.appendChild(panel);

    btn.onclick = (e) => {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    // إغلاق عند الضغط خارج
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.style.display = 'none';
      }
    });

    return true;
  }

  // 🔁 حل مشكلة المتصفحات المختلفة
  let tries = 0;
  const interval = setInterval(() => {
    tries++;
    if (start() || tries > 20) {
      clearInterval(interval);
    }
  }, 400);

})();
