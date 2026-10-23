import { X } from 'lucide-react';

type Props = {
  photo: string | null;
  onClose: () => void;
};

const PhotoModal = ({ photo, onClose }: Props) => {
  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative max-w-sm w-full">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition-colors"
        >
          <X size={20} />
        </button>
        <img
          src={photo}
          alt="Bukti Selfie Presensi"
          className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh] border border-white/10"
        />
      </div>
    </div>
  );
};

export default PhotoModal;
