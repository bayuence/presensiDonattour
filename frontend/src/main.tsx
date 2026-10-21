import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Auto-update PWA: unduh versi baru segera dan muat ulang halaman secara otomatis
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[PWA] Aplikasi siap bekerja secara offline.');
  },
  onRegisteredSW(_swUrl, r) {
    if (r) {
      // Periksa update setiap kali user membuka kembali tab
      window.addEventListener('focus', () => {
        r.update().catch(() => {});
      });
      // Periksa berkala setiap 5 menit
      setInterval(async () => {
        if ('connection' in navigator && !navigator.onLine) return;
        try {
          await r.update();
        } catch {}
      }, 5 * 60 * 1000);
    }
  }
});

// Otomatis reload saat Service Worker baru mengambil alih kendali
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
