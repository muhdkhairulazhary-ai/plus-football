// Installation and update UI only. No football API requests or credentials.
(() => {
  const notice = document.getElementById('connectionNotice');
  const message = document.getElementById('connectionMessage');
  const update = document.getElementById('updateNotice');
  const apply = document.getElementById('applyUpdate');
  let registration;
  let reloading = false;
  let savedPage = !!document.querySelector('meta[name="plus-offline"]');

  function connection() {
    notice.hidden = navigator.onLine && !savedPage;
    message.textContent = navigator.onLine
      ? 'Berita ini daripada simpanan peranti dan mungkin belum terkini. Muat semula untuk menyemak kemas kini.'
      : 'Anda di luar talian. Berita tersimpan mungkin belum terkini; rujuk tarikh artikel. Skor dan data API tidak tersedia.';
    document.getElementById('connectionReload').disabled = !navigator.onLine;
  }
  function guide() {
    location.hash = 'tentang';
    const details = document.getElementById('installGuide');
    details.open = true;
    // Let the existing hash navigation reveal the section before scrolling.
    requestAnimationFrame(() => details.scrollIntoView({block: 'start', behavior: 'auto'}));
  }
  document.querySelectorAll('[data-install-guide]').forEach(link => link.addEventListener('click', guide));
  document.getElementById('installButton').addEventListener('click', guide);
  document.getElementById('connectionReload').addEventListener('click', () => location.reload());
  document.getElementById('standaloneStatus').hidden = !(matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  window.addEventListener('offline', connection);
  window.addEventListener('online', connection);
  window.addEventListener('pageshow', connection);
  connection();

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
    else if (controlled) update.hidden = false; // Update accepted in another tab.
    controlled = true;
  });
  apply.addEventListener('click', () => {
    if (registration?.waiting) {
      reloading = true;
      registration.waiting.postMessage({type: 'ACTIVATE_UPDATE'});
    } else location.reload();
  });
  navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).then(reg => {
    registration = reg;
    const waiting = () => { if (reg.waiting && navigator.serviceWorker.controller) update.hidden = false; };
    waiting();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') waiting(); });
    });
    // Bypass the HTTP cache for update checks; never activate/reload silently.
    reg.update().catch(() => {});
    let checked = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine && Date.now() - checked > 120000) {
        checked = Date.now(); reg.update().catch(() => {});
      }
    });
  }).catch(() => {
    // Safari private mode/storage restrictions must not break the website.
    const guide = document.getElementById('installGuide');
    const note = document.createElement('p');
    note.textContent = 'Simpanan offline tidak tersedia dalam pelayar ini. Laman masih boleh digunakan dengan internet.';
    guide.append(note);
  });
})();
