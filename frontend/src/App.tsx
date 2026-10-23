import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import { Loader2 } from 'lucide-react';

// Lazy load hanya halaman konten (bukan shell/layout)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ClockInOut = lazy(() => import('./pages/ClockInOut'));
const History = lazy(() => import('./pages/History'));
const Profile = lazy(() => import('./pages/Profile'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const DivisionManagement = lazy(() => import('./pages/admin/DivisionManagement'));
const LocationManagement = lazy(() => import('./pages/admin/LocationManagement'));
const ScheduleManagement = lazy(() => import('./pages/admin/ScheduleManagement'));

// Fallback ringan untuk transisi antar halaman
const PageLoader = () => (
  <div className="flex items-center justify-center h-48">
    <Loader2 size={24} className="animate-spin text-red-500" />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Login tidak perlu Suspense — sudah ringan */}
          <Route path="/login" element={<Login />} />

          {/* Layout (shell) langsung render, konten dalam Suspense */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={
              <Suspense fallback={<PageLoader />}>
                <Dashboard />
              </Suspense>
            } />
            <Route path="presensi" element={
              <Suspense fallback={<PageLoader />}>
                <ClockInOut />
              </Suspense>
            } />
            <Route path="history" element={
              <Suspense fallback={<PageLoader />}>
                <History />
              </Suspense>
            } />
            <Route path="profile" element={
              <Suspense fallback={<PageLoader />}>
                <Profile />
              </Suspense>
            } />
            <Route path="admin/users" element={
              <Suspense fallback={<PageLoader />}>
                <UserManagement />
              </Suspense>
            } />
            <Route path="admin/divisions" element={
              <Suspense fallback={<PageLoader />}>
                <DivisionManagement />
              </Suspense>
            } />
            <Route path="admin/locations" element={
              <Suspense fallback={<PageLoader />}>
                <LocationManagement />
              </Suspense>
            } />
            <Route path="admin/schedule" element={
              <Suspense fallback={<PageLoader />}>
                <ScheduleManagement />
              </Suspense>
            } />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
