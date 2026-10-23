import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import { formatAttendanceTime, formatDuration } from '../../../utils/timeFormat';
import { downloadCSV } from '../../../utils/exportCsv';
import ReportTabsNav from './ReportTabsNav';
import PhotoModal from './PhotoModal';

const DailyLateReport = () => {
  const { user: currentUser } = useAuth();

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
  const [dailyData, setDailyData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Load divisions for filter
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions);
      })
      .catch(console.error);
  }, []);

  // Fetch daily lateness data
  useEffect(() => {
    setLoading(true);
    const divParam = selectedDivision ? `&divisionId=${selectedDivision}` : '';
    fetch(`/api/reports/daily?date=${selectedDate}${divParam}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDailyData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDate, selectedDivision]);

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const lateItems = (dailyData?.items || []).filter((item: any) => item.isLate);

  const handleExport = () => {
    const headers = ['Nama', 'Divisi', 'Shift', 'Jadwal Masuk', 'Presensi Masuk', 'Durasi Telat', 'Outlet'];
    const rows = lateItems.map((it: any) => [
      it.user.name,
      it.user.division?.name || '-',
      it.shift?.name || '-',
      it.shift?.checkInTime ? `${it.shift.checkInTime} WIB` : '-',
      it.inRecord ? `${formatAttendanceTime(it.inRecord.timestamp)} WIB` : '-',
      formatDuration(it.lateSeconds),
      it.inRecord?.outlet || '-',
    ]);
    downloadCSV(`rekap-telat-${selectedDate}`, headers, rows);
  };

  return (
    <div className="pb-24 pt-4 px-3 max-w-lg mx-auto space-y-4">
      <ReportTabsNav
        title="Rekapan Telat Harian"
        subtitle="Laporan Keterlambatan"
        onExport={handleExport}
        badgeCount={dailyData?.summary?.totalLate}
      />

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
        />

        <select
          value={selectedDivision}
          onChange={(e) => setSelectedDivision(e.target.value)}
          className="bg-gray-50 border border-gray-200 text-gray-900 text-xs font-bold rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="">Semua Divisi</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-50 border border-red-100 p-3 rounded-2xl text-center">
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">Karyawan Telat</span>
          <div className="text-xl font-black text-red-900 mt-0.5">
            {dailyData?.summary?.totalLate ?? 0}
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Total Menit</span>
          <div className="text-xl font-black text-amber-900 mt-0.5">
            {Math.ceil((dailyData?.summary?.totalLateSeconds ?? 0) / 60)}m
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Tepat Waktu</span>
          <div className="text-xl font-black text-emerald-900 mt-0.5">
            {dailyData?.summary?.totalOnTime ?? 0}
          </div>
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 size={24} className="animate-spin text-red-500" />
          <span className="text-xs text-gray-400 font-medium">Memuat data keterlambatan...</span>
        </div>
      ) : lateItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={28} />
          </div>
          <h3 className="font-bold text-gray-900 text-sm">Tidak Ada yang Terlambat! 🎉</h3>
          <p className="text-xs text-gray-500 mt-1">
            Semua karyawan yang presensi pada tanggal ini hadir tepat waktu sesuai jadwal shift.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {lateItems.map((item: any, idx: number) => {
            const inTime = item.inRecord ? formatAttendanceTime(item.inRecord.timestamp) : '-';
            return (
              <div key={idx} className="bg-white rounded-2xl border border-red-100 p-3.5 shadow-sm hover:border-red-200 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.inRecord?.photo ? (
                      <button
                        onClick={() => setSelectedPhoto(item.inRecord.photo)}
                        className="w-11 h-11 rounded-xl overflow-hidden border border-red-200 shrink-0 shadow-sm"
                        title="Klik untuk perbesar selfie"
                      >
                        <img src={item.inRecord.photo} alt={item.user.name} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 font-bold flex items-center justify-center shrink-0 text-sm">
                        {item.user.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-900 text-sm truncate">{item.user.name}</h4>
                      <span className="text-[11px] text-gray-500 font-medium block truncate">
                        {item.user.division?.name || '-'} · {item.shift?.name || 'Shift'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="bg-red-600 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-sm block">
                      Telat {formatDuration(item.lateSeconds)}
                    </span>
                    {item.inRecord?.outlet && (
                      <span className="text-[10px] text-gray-400 font-semibold block mt-1">
                        📍 {item.inRecord.outlet}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between text-xs font-semibold">
                  <div className="text-gray-500">
                    Jadwal: <span className="text-gray-900 font-mono">{item.shift?.checkInTime || '-'} WIB</span>
                  </div>
                  <div className="text-red-700">
                    Masuk: <span className="font-bold font-mono">{inTime} WIB</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selfie Preview Modal */}
      <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </div>
  );
};

export default DailyLateReport;
