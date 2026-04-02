(function () {
  let deferredPrompt = null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function createUI() {
    if (!document.getElementById('install-banner')) {
      const banner = document.createElement('div');
      banner.id = 'install-banner';
      banner.style.cssText = `
        position:fixed;
        bottom:20px;
        left:50%;
        transform:translateX(-50%) translateY(160px);
        background:rgba(22,15,5,0.97);
        border:1px solid rgba(201,168,76,0.3);
        border-radius:16px;
        padding:14px;
        z-index:9999;
        display:flex;
        gap:10px;
        direction:rtl;
        transition:0.4s;
      `;

      banner.innerHTML = `
        <span style="color:#e8c97a;font-size:14px">ثبّت التطبيق</span>
        <button id="installBtn">تثبيت</button>
        <button id="closeBtn">✕</button>
      `;

      document.body.appendChild(banner);

      document.getElementById('installBtn').onclick = async () => {
        banner.style.transform='translateX(-50%) translateY(160px)';

        if (deferredPrompt) {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
        } else if (isIOS) {
          alert("اضغط مشاركة ثم Add to Home Screen");
        }
      };

      document.getElementById('closeBtn').onclick = () => {
        banner.style.transform='translateX(-50%) translateY(160px)';
      };
    }
  }

  function showBanner(){
    const b=document.getElementById('install-banner');
    if(b) b.style.transform='translateX(-50%) translateY(0)';
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(showBanner, 2500);
  });

  window.addEventListener('load', () => {
    createUI();
    if (isIOS && !isStandalone) {
      setTimeout(showBanner, 2500);
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js');
  }
})();
