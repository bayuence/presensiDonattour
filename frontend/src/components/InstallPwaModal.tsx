import { useState } from 'react';
import { Download, X, Smartphone, Share2, PlusSquare } from 'lucide-react';

interface InstallPwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => Promise<boolean>;
  canDirectInstall: boolean;
}

export const InstallPwaModal = ({
  isOpen,
  onClose,
  onInstall,
  canDirectInstall,
}: InstallPwaModalProps) => {
  const [installing, setInstalling] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    setInstalling(true);
    const success = await onInstall();
    setInstalling(false);
    if (success) {
      onClose();
    }
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-xs">
              <Download size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">Pasang HadirDonattour</h3>
              <p className="text-[11px] text-blue-100">Jadikan Aplikasi di Layar Utama HP</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
            <img 
              src="/logoDONATTOUR.PNG" 
              alt="HadirDonattour" 
              className="w-12 h-12 rounded-xl object-cover shadow-xs border border-white"
            />
            <div>
              <h4 className="text-xs font-bold text-gray-900">HadirDonattour</h4>
              <p className="text-[11px] text-gray-600 leading-snug">
                Buka presensi instan tanpa buka browser tiap hari, hemat kuota & lebih cepat.
              </p>
            </div>
          </div>

          {canDirectInstall ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-600 text-center">
                Klik tombol di bawah ini untuk langsung memasang aplikasi ke layar depan HP Anda.
              </p>
              <button
                onClick={handleInstallClick}
                disabled={installing}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
              >
                {installing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Download size={16} />
                    <span>Pasang Aplikasi Sekarang</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-xs text-gray-700">
              <p className="font-semibold text-gray-900 text-xs flex items-center gap-1.5">
                <Smartphone size={15} className="text-blue-600" />
                <span>Cara Pasang di HP Anda:</span>
              </p>

              {isIOS ? (
                // Panduan untuk iOS Safari
                <ol className="space-y-2.5 bg-gray-50 p-3 rounded-xl border border-gray-100 text-[11px]">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">1</span>
                    <span>Klik tombol <strong>Bagikan</strong> (ikon kotak dengan panah ke atas <Share2 size={12} className="inline text-blue-600" />) di bagian bawah Safari.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">2</span>
                    <span>Gulir ke bawah dan pilih <strong>"Tambah ke Layar Utama"</strong> (<PlusSquare size={12} className="inline text-blue-600" />).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">3</span>
                    <span>Klik <strong>Tambah</strong> di sudut kanan atas.</span>
                  </li>
                </ol>
              ) : (
                // Panduan untuk Android Chrome
                <ol className="space-y-2.5 bg-gray-50 p-3 rounded-xl border border-gray-100 text-[11px]">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">1</span>
                    <span>
                      Klik tombol titik tiga <strong>(⋮)</strong> di pojok kanan atas browser Google Chrome.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">2</span>
                    <span>
                      Pilih menu <strong>"Bagikan..."</strong> (<Share2 size={12} className="inline text-blue-600" />) atau <strong>"Tambahkan ke Layar Utama"</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">3</span>
                    <span>
                      Pada menu yang muncul di bawah, klik opsi <strong>"Tambahkan ke Layar Utama"</strong> atau <strong>"Instal aplikasi"</strong>.
                    </span>
                  </li>
                </ol>
              )}

              <button
                onClick={onClose}
                className="w-full mt-2 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                Saya Mengerti
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
