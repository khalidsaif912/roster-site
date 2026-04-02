(function () {
  let deferredPrompt = null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function createBanner() {
    if (document.getElementById('install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'install-banner';

    banner.style.cssText = `
      position:fixed;
      bottom:20px;
      left:50%;
      transform:translateX(-50%);
      background:#1a1208;
      border:1px solid #c9a84c;
      border-radius:14px;
      padding:12px 16px;
      z-index:9999;
      display:flex;
      gap:10px;
      align-items:center;
      direction:rtl;
    `;

    banner.innerHTML = `
      <span style="color:#e8c97a;font-size:14px">ثبّت التطبيق</span>
      <button id="installBtn">تثبيت</button>
      <button id="closeBtn">✕</button>
    `;

    document.body.appendChild(banner);

    document.getElementById('installBtn').onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } else if (isIOS) {
        alert("اضغط مشاركة ثم Add to Home Screen");
      } else {
        alert("من قائمة المتصفح اختر Install App");
      }
    };

    document.getElementById('closeBtn').onclick = () => {
      banner.remove();
    };
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('load', () => {
    if (!isStandalone) {
      setTimeout(createBanner, 1000);
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js?v=5');
  }
})();
