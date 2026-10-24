import { useState, useEffect } from 'react';

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Cek apakah sudah berjalan di mode PWA (standalone)
    const isRunningStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(isRunningStandalone);

    // Cek apakah user pernah menutup banner install
    const dismissed = localStorage.getItem('hadir_pwa_install_dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setInstallPrompt(null);
      localStorage.removeItem('hadir_pwa_install_dismissed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstallPrompt(null);
        }
        return true;
      } catch (err) {
        console.error('PWA install error:', err);
        return false;
      }
    }
    return false;
  };

  const dismissBanner = () => {
    setIsDismissed(true);
    localStorage.setItem('hadir_pwa_install_dismissed', 'true');
  };

  return {
    installPrompt,
    isStandalone,
    isDismissed,
    triggerInstall,
    dismissBanner,
  };
}
