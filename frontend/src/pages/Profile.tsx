import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Calendar, Shield, MapPin, ChevronRight, LogOut, Camera, Loader2 } from 'lucide-react';

const Profile = () => {
  const { user, logout, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Check file size (e.g. limit to 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("Ukuran foto maksimal 2MB");
      return;
    }

    setIsUploading(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Photo = reader.result as string;

      try {
        const response = await fetch(`https://presensi-api.onrender.com/api/users/${user.id}/photo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo: base64Photo }),
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
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Profile Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
        
        <div className="relative mt-8 mb-3">
          <div 
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className="w-24 h-24 bg-white rounded-full p-1 shadow-xl cursor-pointer group relative transition-transform active:scale-95"
          >
            <div className="w-full h-full bg-gradient-to-tr from-indigo-100 to-purple-50 rounded-full flex items-center justify-center text-indigo-600 overflow-hidden relative">
              {user?.photo ? (
                <img src={user.photo} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User size={40} />
              )}
              
              {/* Overlay for uploading */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {isUploading ? <Loader2 size={24} className="text-white animate-spin" /> : <Camera size={24} className="text-white" />}
              </div>
            </div>
          </div>
          <div className="absolute bottom-1 right-1 bg-green-500 w-5 h-5 border-[3px] border-white rounded-full"></div>
        </div>
        
        <input 
          type="file" 
          accept="image/*"
          className="hidden" 
          ref={fileInputRef}
          onChange={handlePhotoUpload}
        />

        <h2 className="text-2xl font-bold text-gray-900">{user?.name}</h2>
        <p className="text-sm font-medium text-indigo-600 capitalize mt-1.5 px-4 py-1 bg-indigo-50 rounded-full">
          {user?.role}
        </p>
      </div>

      {/* Info Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Informasi Akun</h3>
        
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          <div className="flex items-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <User size={22} />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-xs text-gray-500 font-medium">Nama Lengkap</p>
              <p className="text-sm font-bold text-gray-900">{user?.name}</p>
            </div>
          </div>
          
          <div className="flex items-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <Calendar size={22} />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-xs text-gray-500 font-medium">Tanggal Lahir</p>
              <p className="text-sm font-bold text-gray-900">
                {user?.dob ? new Date(user.dob).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Shield size={22} />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-xs text-gray-500 font-medium">Hak Akses (Role)</p>
              <p className="text-sm font-bold text-gray-900 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings / Actions */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Pengaturan</h3>
        
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          <button className="w-full flex items-center p-4 hover:bg-gray-50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-600 flex items-center justify-center shrink-0">
              <MapPin size={22} />
            </div>
            <div className="ml-4 flex-1 text-left">
              <p className="text-sm font-bold text-gray-900">Lokasi Kantor</p>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>
        </div>
      </div>

      <div className="pt-2 pb-6">
        <button 
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-4 rounded-2xl transition-colors active:scale-95 border border-red-100"
        >
          <LogOut size={20} />
          Keluar dari Akun
        </button>
      </div>

    </div>
  );
};

export default Profile;
