import { X, Loader2 } from 'lucide-react';

type Props = {
  photo: string | null;
  loading?: boolean;
  onClose: () => void;
};

const PhotoModal = ({ photo, loading, onClose }: Props) => {
  if (!photo && !loading) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative max-w-sm w-full bg-gray-900/80 p-2 rounded-2xl border border-white/10 flex flex-col items-center justify-center min-h-[250px]">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition-colors z-10"
        >
          <X size={20} />
        </button>

        {loading ? (
          <div className="flex flex-col items-center gap-2 text-white/80 py-12">
            <Loader2 size={32} className="animate-spin text-red-500" />
            <span className="text-xs font-semibold">Memuat foto selfie...</span>
          </div>
        ) : photo ? (
          <img
            src={photo}
            alt="Bukti Selfie Presensi"
            className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
          />
        ) : (
          <div className="text-white/60 text-xs py-12">Foto tidak tersedia</div>
        )}
      </div>
    </div>
  );
};

export default PhotoModal;
