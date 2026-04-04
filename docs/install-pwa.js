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
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    `;

    banner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:rgba(201,168,76,0.10);color:#e8c97a;flex-shrink:0;font-size:15px;">📱</div>

      <div style="flex:1;min-width:0;line-height:1.35">
        <div id="installBannerTitle" style="color:#f5ead8;font-size:13px;font-weight:700;">إضافة الروستر</div>
        <div id="installBannerSub" style="color:#b8a57a;font-size:11px;margin-top:2px;">افتحه بسرعة مثل التطبيق</div>
      </div>

      <button id="installBtn" style="
        border:none;
        border-radius:10px;
        padding:8px 12px;
        font-size:12px;
        font-weight:700;
        cursor:pointer;
        color:#1a1208;
        background:linear-gradient(135deg,#b8922f,#e0bd63);
        box-shadow:0 4px 12px rgba(201,168,76,0.22);
        white-space:nowrap;
        flex-shrink:0;
      ">طريقة التثبيت</button>

      <button id="closeBtn" style="
        border:none;
        background:transparent;
        color:#8f825f;
        font-size:16px;
        cursor:pointer;
        width:26px;
        height:26px;
        border-radius:8px;
        flex-shrink:0;
      ">✕</button>
    `;

    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      banner.style.opacity = '1';
      banner.style.transform = 'translateX(-50%) translateY(0)';
    });

    updateBannerText();

    document.getElementById('installBtn').onclick = async () => {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
        } catch (e) {}
        return;
      }

      showHelp();
    };

    document.getElementById('closeBtn').onclick = () => {
      hideBanner(true);
    };
  }

  function hideBanner(remember = false) {
    const banner = document.getElementById('install-banner');
    if (!banner) return;

    banner.style.opacity = '0';
    banner.style.transform = 'translateX(-50%) translateY(20px)';

    setTimeout(() => {
      banner.remove();
    }, 250);

    if (remember) setBannerDismissed();
  }

  function updateBannerText() {
    const btn = document.getElementById('installBtn');
    const title = document.getElementById('installBannerTitle');
    const sub = document.getElementById('installBannerSub');
    if (!btn || !title || !sub) return;

    if (deferredPrompt) {
      title.textContent = 'تثبيت الروستر';
      sub.textContent = 'جاهز للإضافة على جهازك';
      btn.textContent = 'تثبيت الآن';
    } else {
      title.textContent = 'إضافة الروستر';
      sub.textContent = 'خطوات بسيطة لفتحه مثل التطبيق';
      btn.textContent = 'طريقة التثبيت';
    }
  }

  function showHelp() {
    if (document.getElementById('pwa-help')) return;

    const box = document.createElement('div');
    box.id = 'pwa-help';

    box.style.cssText = `
      position:fixed;
      inset:auto 0 0 0;
      background:#17181d;
      color:#f3e6c1;
      padding:22px 18px 24px;
      z-index:10000;
      direction:rtl;
      border-top-left-radius:22px;
      border-top-right-radius:22px;
      box-shadow:0 -10px 30px rgba(0,0,0,0.30);
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    `;

    const helpText = isIOS
      ? `
        <div style="color:#c7b384;font-size:13px;line-height:1.9">
          1) افتح زر المشاركة في المتصفح<br>
          2) اختر <b style="color:#f3e6c1">Add to Home Screen</b><br>
          3) اضغط <b style="color:#f3e6c1">Add</b>
        </div>
      `
      : `
        <div style="color:#c7b384;font-size:13px;line-height:1.9">
          إذا لم تظهر نافذة التثبيت تلقائيًا، أضف الصفحة إلى الشاشة الرئيسية من خيارات المتصفح.<br>
          بعض المتصفحات لا تعرض نافذة التثبيت المباشرة دائمًا.
        </div>
      `;

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
        <div style="font-size:16px;font-weight:800;color:#f5ead8;">طريقة إضافة الروستر</div>
        <button id="closeHelpBtn" style="
          border:none;
          background:rgba(255,255,255,0.05);
          color:#b8a57a;
          width:30px;
          height:30px;
          border-radius:10px;
          font-size:15px;
          cursor:pointer;
        ">✕</button>
      </div>

      ${helpText}

      <button id="closeHelpMainBtn" style="
        margin-top:16px;
        width:100%;
        border:none;
        border-radius:12px;
        padding:12px;
        font-size:13px;
        font-weight:700;
        cursor:pointer;
        color:#1a1208;
        background:linear-gradient(135deg,#b8922f,#e0bd63);
      ">حسنًا</button>
    `;

    document.body.appendChild(box);

    document.getElementById('closeHelpBtn').onclick = () => box.remove();
    document.getElementById('closeHelpMainBtn').onclick = () => box.remove();
  }

  function tryShowBanner() {
    if (isStandalone) return;
    if (bannerDismissed()) return;
    createBanner();
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    resetDismissIfInstallAvailable();
    updateBannerText();
    tryShowBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner(false);
  });

  window.addEventListener('load', () => {
    if (isStandalone) return;

    setTimeout(() => {
      tryShowBanner();
    }, 5000);

    window.addEventListener('scroll', function onFirstScroll() {
      tryShowBanner();
      window.removeEventListener('scroll', onFirstScroll);
    }, { passive: true });

    window.addEventListener('touchstart', function onFirstTouch() {
      tryShowBanner();
      window.removeEventListener('touchstart', onFirstTouch);
    }, { passive: true, once: true });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js?v=8');
  }
})();


// ===== Banner chooser =====
(function () {
  const KEY = 'selectedBanner';
  const PATH = '/roster-site/assets/banners/';
  const BANNERS = ['banner1.jpg', 'banner2.jpg', 'banner3.jpg'];

  function setBanner(header, file) {
    header.style.backgroundImage =
      "linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url('" + PATH + file + "')";
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
    header.style.backgroundRepeat = 'no-repeat';
  }

  function initBannerFeature() {
    const header = document.querySelector('.header');
    if (!header) return false;
    if (document.getElementById('banner-picker-btn')) return true;

    const saved = localStorage.getItem(KEY) || BANNERS[0];
    setBanner(header, saved);

    const btn = document.createElement('button');
    btn.id = 'banner-picker-btn';
    btn.type = 'button';
    btn.textContent = '🖼️';
    btn.title = 'تغيير البنر';

    btn.style.position = 'absolute';
    btn.style.left = '12px';
    btn.style.top = '12px';
    btn.style.zIndex = '10001';
    btn.style.background = 'rgba(255,255,255,0.14)';
    btn.style.border = 'none';
    btn.style.outline = 'none';
    btn.style.width = '26px';
    btn.style.height = '26px';
    btn.style.padding = '0';
    btn.style.borderRadius = '999px';
    btn.style.fontSize = '13px';
    btn.style.lineHeight = '26px';
    btn.style.textAlign = 'center';
    btn.style.cursor = 'pointer';
    btn.style.color = '#fff';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.16)';

    const panel = document.createElement('div');
    panel.id = 'banner-picker-panel';
    panel.style.position = 'absolute';
    panel.style.top = '46px';
    panel.style.left = '10px';
    panel.style.background = 'rgba(255,255,255,0.98)';
    panel.style.border = '1px solid rgba(15,23,42,.08)';
    panel.style.borderRadius = '14px';
    panel.style.padding = '8px';
    panel.style.display = 'none';
    panel.style.zIndex = '10002';
    panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.22)';

    BANNERS.forEach(function (file) {
      const thumb = document.createElement('div');
      thumb.style.width = '96px';
      thumb.style.height = '52px';
      thumb.style.marginBottom = '6px';
      thumb.style.cursor = 'pointer';
      thumb.style.borderRadius = '8px';
      thumb.style.backgroundImage = "url('" + PATH + file + "')";
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
      thumb.style.backgroundRepeat = 'no-repeat';

      thumb.onclick = function () {
        localStorage.setItem(KEY, file);
        setBanner(header, file);
        panel.style.display = 'none';
      };

      panel.appendChild(thumb);
    });

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'الافتراضي';
    reset.style.width = '100%';
    reset.style.border = 'none';
    reset.style.borderRadius = '10px';
    reset.style.padding = '7px 8px';
    reset.style.marginTop = '2px';
    reset.style.background = '#eef2ff';
    reset.style.color = '#1e40af';
    reset.style.fontWeight = '700';
    reset.style.cursor = 'pointer';

    reset.onclick = function () {
      localStorage.removeItem(KEY);
      setBanner(header, BANNERS[0]);
      panel.style.display = 'none';
    };

    panel.appendChild(reset);

    btn.onclick = function (e) {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.style.display = 'none';
      }
    });

    header.appendChild(btn);
    header.appendChild(panel);
    return true;
  }

  let tries = 0;
  const timer = setInterval(function () {
    tries += 1;
    if (initBannerFeature() || tries > 25) {
      clearInterval(timer);
    }
  }, 400);
})();
