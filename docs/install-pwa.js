(function () {
  let deferredPrompt = null;

  function addInstallButton() {
    if (document.getElementById('installWrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'installWrap';
    wrap.style.position = 'fixed';
    wrap.style.left = '50%';
    wrap.style.bottom = '20px';
    wrap.style.transform = 'translateX(-50%)';
    wrap.style.zIndex = '99999';
    wrap.style.textAlign = 'center';

    wrap.innerHTML = `
      <button id="installBtn" style="
        border:none;
        border-radius:16px;
        padding:14px 28px;
        font-size:15px;
        font-weight:800;
        cursor:pointer;
        color:#fff;
        background:linear-gradient(135deg,#16a34a,#22c55e);
        box-shadow:0 6px 20px rgba(34,197,94,.25);
      ">📲 تثبيت التطبيق</button>
    `;

    document.body.appendChild(wrap);

    document.getElementById('installBtn').addEventListener('click', async function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } catch (e) {}
        return;
      }

      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIOS) {
        alert('على iPhone/iPad: افتح زر المشاركة ثم اختر Add to Home Screen');
      } else {
        alert('إذا لم تظهر نافذة التثبيت، افتح قائمة المتصفح ثم اختر Install App أو Add to Home Screen');
      }
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', function () {
    const wrap = document.getElementById('installWrap');
    if (wrap) wrap.remove();
    deferredPrompt = null;
  });

  window.addEventListener('load', function () {
    addInstallButton();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err));
  }
})();
