if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isDevHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.port === '5173'
    if (isDevHost) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => console.info('[PWA] Service Worker registered', reg.scope))
      .catch(err => console.error('[PWA] Service Worker registration failed', err))
  })
}
