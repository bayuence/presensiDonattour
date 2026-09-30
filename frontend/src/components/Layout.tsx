import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import SidebarMenu from './SidebarMenu';

const Layout = () => {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="bg-gray-100 min-h-screen flex justify-center items-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-gray-50 sm:rounded-2xl sm:shadow-xl h-[100dvh] sm:h-[90vh] flex flex-col relative overflow-hidden sm:border sm:border-gray-200">
        
        <TopBar onOpenSidebar={() => setIsSidebarOpen(true)} />
        
        <SidebarMenu 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />

        <main className="flex-1 overflow-y-auto pb-6 scroll-smooth">
          <Outlet />
        </main>

        <BottomNav />
        
      </div>
    </div>
  );
};

export default Layout;
