import { Link, useLocation } from 'react-router-dom';
import { Home, MapPin, User } from 'lucide-react';

const BottomNav = () => {
  const location = useLocation();
  
  return (
    <nav className="w-full bg-white border-t border-gray-200 flex justify-around items-center h-[68px] pb-safe z-40 shrink-0">
      <Link 
        to="/dashboard" 
        className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors ${location.pathname === '/dashboard' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <Home size={24} strokeWidth={location.pathname === '/dashboard' ? 2.5 : 2} />
        <span className="text-[10px] font-bold tracking-wide">Beranda</span>
      </Link>
      
      <Link 
        to="/presensi" 
        className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors ${location.pathname === '/presensi' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <MapPin size={24} strokeWidth={location.pathname === '/presensi' ? 2.5 : 2} />
        <span className="text-[10px] font-bold tracking-wide">Presensi</span>
      </Link>

      <Link 
        to="/profile" 
        className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors ${location.pathname === '/profile' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <User size={24} strokeWidth={location.pathname === '/profile' ? 2.5 : 2} />
        <span className="text-[10px] font-bold tracking-wide">Profil</span>
      </Link>
    </nav>
  );
};

export default BottomNav;
