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
      ">📲 تثبيت التطبيق</button>
    `;

    document.body.appendChild(wrap);

    document.getElementById('installBtn').onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } else {
        alert("استخدم Add to Home Screen من المتصفح");
      }
    };
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('load', addInstallButton);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/sw.js');
  }
})();
