import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, Calendar, CheckCircle2, XCircle } from 'lucide-react';
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

  useEffect(() => {
    if (!user?.id) return;

    const fetchLogs = async () => {
      setLoadingLogs(true);
      try {
        const res = await fetch(`https://presensi-api.onrender.com/api/attendance/${user.id}`);
        const data = await res.json();
        if (data.success) {
          setLogs(data.records);
        }
      } catch {
        // Silently fail — tampilkan kosong jika server tidak tersedia
      } finally {
        setLoadingLogs(false);
      }
    };

    fetchLogs();
  }, [user]);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200">
        <h2 className="text-2xl font-bold mb-1">Halo, {user?.name}! 👋</h2>
        <p className="text-indigo-100 opacity-90">Selamat bekerja, jangan lupa presensi.</p>

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 flex-1 min-w-[120px]">
            <div className="flex items-center gap-2 text-indigo-50 mb-1">
              <Clock size={16} />
              <span className="text-sm font-medium">Shift Hari Ini</span>
            </div>
            <div className="text-xl font-bold">08:00 - 17:00</div>
          </div>
          <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 flex-1 min-w-[120px]">
            <div className="flex items-center gap-2 text-indigo-50 mb-1">
              <Calendar size={16} />
              <span className="text-sm font-medium">Role</span>
            </div>
            <div className="text-xl font-bold capitalize">{user?.role}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Action Card */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-2">
            <Clock size={36} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Waktunya Presensi</h3>
            <p className="text-gray-500 text-sm mt-1">Catat kehadiran Anda untuk hari ini.</p>
          </div>
          <Link
            to="/presensi"
            className="w-full max-w-xs py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-200 transition-all active:scale-95"
          >
            Mulai Clock In
          </Link>
        </div>

        {/* Recent Logs */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Riwayat Terakhir</h3>
          </div>
          <div className="p-2 flex-1 overflow-y-auto">
            {loadingLogs ? (
              <div className="flex flex-col gap-2 p-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : logs.length > 0 ? (
              <ul className="space-y-2">
                {[...logs].reverse().slice(0, 5).map((log) => (
                  <li key={log.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${log.type === 'in' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                        {log.type === 'in' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900 capitalize">Clock {log.type}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(log.timestamp).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">
                        {new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-400">
                <Calendar size={40} className="mb-3 opacity-20" />
                <p className="text-sm">Belum ada riwayat presensi</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
