import { Link, useLocation } from 'react-router-dom';
import { Home, MapPin, User } from 'lucide-react';

const BottomNav = () => {
  const location = useLocation();
  
  return (
    <nav className="w-full bg-white/90 backdrop-blur-xl border-t border-gray-100 flex justify-around p-4 pb-safe z-40 shrink-0">
      <Link 
        to="/dashboard" 
        className={`flex flex-col items-center gap-1.5 transition-all ${location.pathname === '/dashboard' ? 'text-indigo-600 scale-110' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <Home size={24} strokeWidth={location.pathname === '/dashboard' ? 2.5 : 2} />
        <span className="text-[10px] font-bold">Beranda</span>
      </Link>
      
      <div className="-mt-10">
        <Link 
          to="/presensi" 
          className="flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-full shadow-xl shadow-indigo-300 border-[6px] border-gray-50 active:scale-95 transition-transform"
        >
          <MapPin size={26} strokeWidth={2.5} />
        </Link>
      </div>

      <Link 
        to="/profile" 
        className={`flex flex-col items-center gap-1.5 transition-all ${location.pathname === '/profile' ? 'text-indigo-600 scale-110' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <User size={24} strokeWidth={location.pathname === '/profile' ? 2.5 : 2} />
        <span className="text-[10px] font-bold">Profil</span>
      </Link>
    </nav>
  );
};

export default BottomNav;
