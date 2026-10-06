import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, Calendar, CheckCircle2, XCircle, MapPin, ArrowRight, User } from 'lucide-react';
import { Link } from 'react-router-dom';

type AttendanceLog = {
  id: string;
  type: 'in' | 'out';
  timestamp: string;
  location: string;
};

const Dashboard = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [todaySchedule, setTodaySchedule] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const fetchLogs = async () => {
      setLoadingLogs(true);
      try {
        const res = await fetch(`/api/attendance/${user.id}`);
        const data = await res.json();
        if (data.success) {
          setLogs(data.records);
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingLogs(false);
      }
    };

    const fetchUserSchedule = async () => {
      try {
        const res = await fetch(`/api/schedule?name=${encodeURIComponent(user.name)}`);
        const data = await res.json();
        if (data.success) {
          setTodaySchedule(data.jadwal);
        }
      } catch {
        // Silently fail
      }
    };

    fetchLogs();
    fetchUserSchedule();
  }, [user]);

  return (
    <div className="p-4 sm:p-5 max-w-md mx-auto space-y-5">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-2 px-1">
        <div>
          <p className="text-gray-500 text-xs font-semibold tracking-wide uppercase mb-1">Selamat datang,</p>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{user?.name}</h2>
        </div>
        <div className="shrink-0">
          {user?.photo ? (
            <img 
              src={user.photo} 
              alt="Profil" 
              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg border-2 border-white shadow-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Clock size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Shift Hari Ini</span>
          </div>
          <div className="text-lg font-black text-gray-900 tracking-tight truncate">
            {todaySchedule !== null ? (todaySchedule !== '-' && todaySchedule !== '' ? todaySchedule : 'Libur') : 'Loading...'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <User size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Role Anda</span>
          </div>
          <div className="text-lg font-black text-gray-900 capitalize tracking-tight">{user?.role}</div>
        </div>
      </div>

      {/* Primary Action Button */}
      <Link
        to="/presensi"
        className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-5 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
              <MapPin size={24} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Waktunya Presensi</h3>
              <p className="text-indigo-100 text-sm mt-0.5 font-medium">Catat kehadiran Anda sekarang</p>
            </div>
          </div>
          <ArrowRight size={20} className="text-indigo-200" strokeWidth={2.5} />
        </div>
      </Link>

      {/* History List */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-800 text-xs tracking-widest uppercase">Riwayat Terakhir</h3>
        </div>
        <div className="p-0">
          {loadingLogs ? (
            <div className="flex flex-col gap-0">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-white border-b border-gray-50 p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse" />
                    <div className="h-3 bg-gray-50 rounded w-1/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {[...logs].reverse().slice(0, 5).map((log) => (
                <li key={log.id} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-full ${log.type === 'in' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {log.type === 'in' ? <CheckCircle2 size={20} strokeWidth={2.5} /> : <XCircle size={20} strokeWidth={2.5} />}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 capitalize tracking-tight">Clock {log.type}</div>
                      <div className="text-xs text-gray-500 font-medium mt-0.5">
                        {new Date(log.timestamp).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-gray-900 tracking-tight">
                      {new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400">
              <div className="bg-gray-50 p-4 rounded-full mb-3">
                <Calendar size={32} className="text-gray-300" strokeWidth={2} />
              </div>
              <p className="text-sm font-medium text-gray-500">Belum ada riwayat presensi</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
