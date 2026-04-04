(function () {
  // ========== PWA Install Banner ==========
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
    if (deferredPrompt) localStorage.removeItem(DISMISS_KEY);
  }

  function createBanner() {
    if (document.getElementById('install-banner')) return;
    if (isStandalone) return;
    if (bannerDismissed()) return;

    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.style.cssText = `
      position:fixed;bottom:16px;left:50%;
      transform:translateX(-50%) translateY(20px);opacity:0;
      background:rgba(20,20,24,0.94);border:1px solid rgba(201,168,76,0.28);
      border-radius:16px;padding:10px 12px;z-index:9999;
      display:flex;align-items:center;gap:10px;direction:rtl;
      min-width:260px;max-width:calc(100vw - 24px);
      box-shadow:0 10px 30px rgba(0,0,0,0.28);backdrop-filter:blur(12px);
      transition:opacity .25s ease,transform .25s ease;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    `;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:rgba(201,168,76,0.10);color:#e8c97a;flex-shrink:0;font-size:15px;">📱</div>
      <div style="flex:1;min-width:0;line-height:1.35">
        <div id="installBannerTitle" style="color:#f5ead8;font-size:13px;font-weight:700;">إضافة الروستر</div>
        <div id="installBannerSub" style="color:#b8a57a;font-size:11px;margin-top:2px;">افتحه بسرعة مثل التطبيق</div>
      </div>
      <button id="installBtn" style="border:none;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;color:#1a1208;background:linear-gradient(135deg,#b8922f,#e0bd63);box-shadow:0 4px 12px rgba(201,168,76,0.22);white-space:nowrap;flex-shrink:0;">طريقة التثبيت</button>
      <button id="closeBtn" style="border:none;background:transparent;color:#8f825f;font-size:16px;cursor:pointer;width:26px;height:26px;border-radius:8px;flex-shrink:0;">✕</button>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => {
      banner.style.opacity = '1';
      banner.style.transform = 'translateX(-50%) translateY(0)';
    });
    updateBannerText();
    document.getElementById('installBtn').onclick = async () => {
      if (deferredPrompt) {
        try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch (e) {}
        return;
      }
      showHelp();
    };
    document.getElementById('closeBtn').onclick = () => hideBanner(true);
  }

  function hideBanner(remember = false) {
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    banner.style.opacity = '0';
    banner.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => banner.remove(), 250);
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
      position:fixed;inset:auto 0 0 0;background:#17181d;color:#f3e6c1;
      padding:22px 18px 24px;z-index:10000;direction:rtl;
      border-top-left-radius:22px;border-top-right-radius:22px;
      box-shadow:0 -10px 30px rgba(0,0,0,0.30);
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    `;
    const helpText = isIOS
      ? `<div style="color:#c7b384;font-size:13px;line-height:1.9">1) افتح زر المشاركة في المتصفح<br>2) اختر <b style="color:#f3e6c1">Add to Home Screen</b><br>3) اضغط <b style="color:#f3e6c1">Add</b></div>`
      : `<div style="color:#c7b384;font-size:13px;line-height:1.9">إذا لم تظهر نافذة التثبيت تلقائيًا، أضف الصفحة إلى الشاشة الرئيسية من خيارات المتصفح.<br>بعض المتصفحات لا تعرض نافذة التثبيت المباشرة دائمًا.</div>`;
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
        <div style="font-size:16px;font-weight:800;color:#f5ead8;">طريقة إضافة الروستر</div>
        <button id="closeHelpBtn" style="border:none;background:rgba(255,255,255,0.05);color:#b8a57a;width:30px;height:30px;border-radius:10px;font-size:15px;cursor:pointer;">✕</button>
      </div>
      ${helpText}
      <button id="closeHelpMainBtn" style="margin-top:16px;width:100%;border:none;border-radius:12px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;color:#1a1208;background:linear-gradient(135deg,#b8922f,#e0bd63);">حسنًا</button>
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
    setTimeout(() => tryShowBanner(), 5000);
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

  // ========== Banner Image Changer ==========
  const BANNER_KEY = 'roster_banner_choice';
  const BANNERS_PATH = '/roster-site/docs/assets/banners/';

  // ← عدّل هذه القائمة بأسماء الصور اللي عندك في المجلد
  const availableBanners = [
    'banner1.jpg',
    'banner2.jpg',
    'banner3.jpg',
  ];

  function getSavedBanner() {
    return localStorage.getItem(BANNER_KEY) || availableBanners[0];
  }

  function saveBannerChoice(name) {
    localStorage.setItem(BANNER_KEY, name);
  }

  function applyBanner(name) {
    const bannerImg = document.querySelector('[class*="banner"] img, #banner img, img.banner');
    if (bannerImg) bannerImg.src = BANNERS_PATH + name;

    const bannerBg = document.querySelector('[class*="banner"], #banner');
    if (bannerBg && getComputedStyle(bannerBg).backgroundImage !== 'none') {
      bannerBg.style.backgroundImage = `url('${BANNERS_PATH + name}')`;
    }
  }

  function createChangerBtn() {
    if (document.getElementById('banner-changer-btn')) return;

    const bannerEl = document.querySelector('[class*="banner"], #banner');
    if (!bannerEl) return;

    const btn = document.createElement('button');
    btn.id = 'banner-changer-btn';
    btn.textContent = '🖼️';
    btn.title = 'تغيير البنر';
    btn.style.cssText = `
      position:absolute;top:8px;left:8px;z-index:999;
      background:rgba(20,20,24,0.75);border:1px solid rgba(201,168,76,0.35);
      color:#e8c97a;border-radius:8px;padding:4px 7px;
      font-size:13px;cursor:pointer;backdrop-filter:blur(6px);line-height:1;
    `;

    if (getComputedStyle(bannerEl).position === 'static') {
      bannerEl.style.position = 'relative';
    }

    bannerEl.appendChild(btn);
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
    sheet.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <span style="color:#f5ead8;font-size:15px;font-weight:700;">اختر البنر</span>
        <button id="closePicker" style="background:rgba(255,255,255,0.06);border:none;color:#b8a57a;width:28px;height:28px;border-radius:8px;font-size:15px;cursor:pointer;">✕</button>
      </div>
      <div id="bannerGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;"></div>
    `;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const grid = document.getElementById('bannerGrid');
    const current = getSavedBanner();

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
      wrap.appendChild(img);
      grid.appendChild(wrap);

      wrap.onclick = () => {
        saveBannerChoice(name);
        applyBanner(name);
        overlay.remove();
      };
    });

    document.getElementById('closePicker').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  function initBannerChanger() {
    applyBanner(getSavedBanner());

    // ننتظر الـ DOM يكتمل في حال الصفحة تُولَّد ديناميكياً
    const observer = new MutationObserver(() => {
      if (document.querySelector('[class*="banner"], #banner')) {
        createChangerBtn();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    createChangerBtn(); // محاولة فورية أيضاً
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBannerChanger);
  } else {
    initBannerChanger();
  }

})();
