import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Calendar, Shield, LogOut, Camera, Loader2, Building2, Edit2, X, Check } from 'lucide-react';

const Profile = () => {
  const { user, logout, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDobModal, setShowDobModal] = useState(false);
  const [editingDob, setEditingDob] = useState('');
  const [isSavingDob, setIsSavingDob] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran foto maksimal 2MB');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawBase64 = reader.result as string;
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          try {
            const response = await fetch(`/api/users/${user.id}/photo`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photo: compressed }),
            });
            const data = await response.json();
            if (data.success) {
              updateUser(data.user);
            } else {
              alert('Gagal mengupload foto.');
            }
          } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Terjadi kesalahan saat mengupload foto.');
          } finally {
            setIsUploading(false);
          }
        }
      };
      img.src = rawBase64;
    };
    reader.readAsDataURL(file);
  };

  const openDobModal = () => {
    const currentDob = user?.dob ? new Date(user.dob).toISOString().split('T')[0] : '';
    setEditingDob(currentDob);
    setShowDobModal(true);
  };

  const handleSaveDob = async () => {
    if (!user || !editingDob) return;

    setIsSavingDob(true);
    try {
      const response = await fetch(`/api/users/${user.id}/dob`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dob: editingDob }),
      });
      const data = await response.json();
      if (data.success) {
        updateUser(data.user);
        setShowDobModal(false);
      } else {
        alert(data.error || 'Gagal mengupdate tanggal lahir.');
      }
    } catch (error) {
      console.error('Error updating DOB:', error);
      alert('Terjadi kesalahan saat mengupdate tanggal lahir.');
    } finally {
      setIsSavingDob(false);
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin': return 'bg-gray-900 text-white';
      case 'supervisor': return 'bg-gray-700 text-white';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-28">

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        {/* Top strip */}
        <div className="h-2 bg-gray-900 w-full" />

        <div className="p-6 flex items-center gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className="w-20 h-20 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer group relative"
            >
              {user?.photo ? (
                <img src={user.photo} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User size={32} className="text-gray-400" />
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                {isUploading
                  ? <Loader2 size={20} className="text-white animate-spin" />
                  : <Camera size={20} className="text-white" />
                }
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
          </div>

          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handlePhotoUpload}
          />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{user?.name}</h2>
            <p className="text-sm text-gray-500 truncate">{user?.division?.name || 'Tidak ada divisi'}</p>
            <span className={`mt-2 inline-block text-xs font-bold px-3 py-1 rounded-full ${getRoleBadgeStyle(user?.role || '')}`}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Informasi Akun</p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">

          <div className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <User size={16} className="text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 font-medium">Nama Lengkap</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{user?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Calendar size={16} className="text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 font-medium">Tanggal Lahir</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {user?.dob
                  ? new Date(user.dob).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '-'}
              </p>
            </div>
            <button
              onClick={openDobModal}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0 transition-colors active:scale-95"
            >
              <Edit2 size={14} className="text-gray-600" />
            </button>
          </div>

          <div className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Shield size={16} className="text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 font-medium">Hak Akses</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5 capitalize">{user?.role}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 font-medium">Divisi</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{user?.division?.name || '-'}</p>
            </div>
          </div>

        </div>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-700 hover:text-red-600 font-semibold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-sm"
      >
        <LogOut size={18} />
        Keluar dari Akun
      </button>

      {/* DOB Edit Modal */}
      {showDobModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Edit Tanggal Lahir</h3>
              <button
                onClick={() => setShowDobModal(false)}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            <div className="mb-6">
              <label className="text-xs text-gray-500 font-medium mb-2 block">Tanggal Lahir</label>
              <input
                type="date"
                value={editingDob}
                onChange={(e) => setEditingDob(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDobModal(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveDob}
                disabled={isSavingDob || !editingDob}
                className="flex-1 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isSavingDob ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Check size={18} />
                    Simpan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Profile;
