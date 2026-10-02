import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClockInOut from './pages/ClockInOut';
import Profile from './pages/Profile';
import UserManagement from './pages/admin/UserManagement';
import DivisionManagement from './pages/admin/DivisionManagement';
import LocationManagement from './pages/admin/LocationManagement';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="presensi" element={<ClockInOut />} />
            <Route path="profile" element={<Profile />} />
            <Route path="admin/users" element={<UserManagement />} />
            <Route path="admin/divisions" element={<DivisionManagement />} />
            <Route path="admin/locations" element={<LocationManagement />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
