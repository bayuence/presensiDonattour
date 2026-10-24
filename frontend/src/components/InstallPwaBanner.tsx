import { useState } from 'react';
import { Smartphone, Download, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { InstallPwaModal } from './InstallPwaModal';

export const InstallPwaBanner = () => {
  const { installPrompt, isStandalone, isDismissed, triggerInstall, dismissBanner } = usePwaInstall();
  const [showModal, setShowModal] = useState(false);

  // Jika sudah jalan di mode standalone PWA, atau banner sudah ditutup sementara oleh user
  if (isStandalone || isDismissed) {
    return null;
  }

  const handleOpenInstall = () => {
    if (installPrompt) {
      triggerInstall();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white rounded-2xl p-3.5 shadow-md shadow-blue-500/10 flex items-center justify-between gap-3 relative overflow-hidden animate-in fade-in duration-300">
        {/* Dekorasi background */}
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/20">
            <Smartphone size={20} className="text-white" />
          </div>
          <div>
            <h4 className="text-xs font-bold leading-tight">Pasang HadirDonattour</h4>
            <p className="text-[11px] text-blue-100 mt-0.5 leading-tight">
              Akses cepat tanpa browser di layar utama HP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 relative z-10 shrink-0">
          <button
            onClick={handleOpenInstall}
            className="px-3 py-1.5 bg-white text-indigo-700 font-bold text-xs rounded-xl shadow-xs hover:bg-blue-50 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Download size={14} />
            <span>Pasang</span>
          </button>
          <button
            onClick={dismissBanner}
            className="p-1.5 text-white/70 hover:text-white rounded-lg transition-colors"
            title="Tutup pengingat"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <InstallPwaModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onInstall={triggerInstall}
        canDirectInstall={!!installPrompt}
      />
    </>
  );
};
