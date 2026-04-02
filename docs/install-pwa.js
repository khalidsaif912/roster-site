(function () {
  let deferredPrompt = null;

  function ensureButton() {
    if (document.getElementById('installWrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'installWrap';
    wrap.style.display = 'none';
    wrap.style.textAlign = 'center';
    wrap.style.margin = '18px 0 8px';

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

    wrap.addEventListener('click', async function (e) {
      const btn = e.target.closest('#installBtn');
      if (!btn || !deferredPrompt) return;

      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (err) {}

      deferredPrompt = null;
      wrap.style.display = 'none';
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    ensureButton();
    const wrap = document.getElementById('installWrap');
    if (wrap) wrap.style.display = 'block';
  });

  window.addEventListener('appinstalled', function () {
    const wrap = document.getElementById('installWrap');
    if (wrap) wrap.style.display = 'none';
    deferredPrompt = null;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/roster-site/docs/sw.js');
  }
})();