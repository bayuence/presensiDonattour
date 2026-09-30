import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, X, Users, Settings, FileText, ChevronRight, LogOut, Briefcase } from 'lucide-react';

type SidebarMenuProps = {
  isOpen: boolean;
  onClose: () => void;
};

const SidebarMenu = ({ isOpen, onClose }: SidebarMenuProps) => {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isAdmin = user.role.toLowerCase() === 'admin';

  return (
    <>
      {/* Sidebar Overlay */}
      {isOpen && (
        <div 
          className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity"
          onClick={onClose}
        ></div>
      )}

      {/* Sidebar Panel */}
      <div className={`absolute top-0 left-0 h-full w-[80%] max-w-[300px] bg-white z-50 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-indigo-100 to-purple-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold border border-indigo-50 overflow-hidden">
              {user.photo ? (
                <img src={user.photo} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h3 className="font-bold text-gray-900 leading-none">{user.name}</h3>
              <p className="text-xs text-gray-500 font-medium capitalize mt-1">{user.role}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 bg-white rounded-full shadow-sm border border-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            <Link 
              to="/profile" 
              onClick={onClose}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 font-medium"
            >
              <User size={20} className="text-gray-400" />
              <span>Profil Saya</span>
            </Link>
          </div>

          {isAdmin && (
            <div className="mt-8">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-3">Menu Admin</h4>
              <div className="space-y-1">
                <Link 
                  to="/admin/divisions" 
                  onClick={onClose}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 text-gray-700 font-medium">
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                      <Briefcase size={18} />
                    </div>
                    <span>Manajemen Divisi</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </Link>

                <Link 
                  to="/admin/users" 
                  onClick={onClose}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 text-gray-700 font-medium">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                      <Users size={18} />
                    </div>
                    <span>Kontrol Akun Pengguna</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </Link>
                
                <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group">
                  <div className="flex items-center gap-3 text-gray-700 font-medium">
                    <div className="p-1.5 rounded-lg bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                      <FileText size={18} />
                    </div>
                    <span>Laporan Presensi</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </button>
                
                <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group">
                  <div className="flex items-center gap-3 text-gray-700 font-medium">
                    <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600 group-hover:bg-orange-100 transition-colors">
                      <Settings size={18} />
                    </div>
                    <span>Pengaturan Sistem</span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={logout}
            className="flex items-center gap-3 p-3 w-full rounded-xl hover:bg-red-50 text-red-600 font-bold transition-colors"
          >
            <LogOut size={20} />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default SidebarMenu;
