import { useLocation } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type TopBarProps = {
  onOpenSidebar: () => void;
};

const TopBar = ({ onOpenSidebar }: TopBarProps) => {
  const { logout } = useAuth();
  const location = useLocation();

  return (
    <header className="bg-white px-5 py-3.5 flex justify-between items-center z-40 shrink-0 shadow-sm shadow-gray-100/50 relative">
      <div className="flex items-center gap-3">
        {(location.pathname === '/profile' || location.pathname.startsWith('/admin')) && (
          <button 
            onClick={onOpenSidebar}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-2 -ml-2 rounded-xl transition-colors active:scale-95"
          >
            <Menu size={24} />
          </button>
        )}
        <div className="flex items-center h-8">
          <img 
            src="/logoDONATTOUR.PNG" 
            alt="Donattour Logo" 
            className="h-full w-auto object-contain drop-shadow-sm"
          />
        </div>
      </div>
      <button 
        onClick={logout}
        className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all active:scale-95"
      >
        <LogOut size={22} />
      </button>
    </header>
  );
};

export default TopBar;
