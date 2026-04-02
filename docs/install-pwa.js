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
      <span style="color:#e8c97a;font-size:14px">إضافة للتطبيق</span>
      <button id="installBtn">فتح الطريقة</button>
      <button id="closeBtn">✕</button>
    `;

    document.body.appendChild(banner);

    document.getElementById('installBtn').onclick = async () => {

      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        return;
      }

      showHelp();
    };

    document.getElementById('closeBtn').onclick = () => {
      banner.remove();
    };
  }

  function showHelp() {
    if (document.getElementById('pwa-help')) return;

    const box = document.createElement('div');
    box.id = 'pwa-help';

    box.style.cssText = `
      position:fixed;
      bottom:0;
      left:0;
      right:0;
      background:#1e1508;
      color:#e8c97a;
      padding:20px;
      z-index:99999;
      direction:rtl;
      border-radius:20px 20px 0 0;
    `;

    box.innerHTML = `
      <h3>طريقة إضافة التطبيق</h3>
      <p>افتح قائمة المتصفح ثم اختر:</p>
      <p style="font-weight:bold">Add to Home Screen</p>
      <button onclick="this.parentElement.remove()">إغلاق</button>
    `;

    document.body.appendChild(box);
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('load', () => {
    if (!isStandalone) {
      setTimeout(createBanner, 1200);
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js?v=7');
  }

})();
