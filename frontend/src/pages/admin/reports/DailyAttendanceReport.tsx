import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2, Camera } from 'lucide-react';
import { formatAttendanceTime } from '../../../utils/timeFormat';
import { downloadCSV } from '../../../utils/exportCsv';
import ReportTabsNav from './ReportTabsNav';
import PhotoModal from './PhotoModal';

const DailyAttendanceReport = () => {
  const { user: currentUser } = useAuth();

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);

  // Instant render dari sessionStorage jika tersedia
  const [dailyData, setDailyData] = useState<any>(() => {
    try {
      const saved = sessionStorage.getItem(`daily_report_${todayStr}_all`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  // Photo modal state
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});

  // Load divisions
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions);
      })
      .catch(console.error);
  }, []);

  // Fetch daily attendance
  useEffect(() => {
    const curCacheKey = `daily_report_${selectedDate}_${selectedDivision || 'all'}`;
    try {
      const cached = sessionStorage.getItem(curCacheKey);
      if (cached) setDailyData(JSON.parse(cached));
    } catch {}

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const divParam = selectedDivision ? `&divisionId=${selectedDivision}` : '';
    fetch(`/api/reports/daily?date=${selectedDate}${divParam}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setDailyData(d);
          try { sessionStorage.setItem(curCacheKey, JSON.stringify(d)); } catch {}
        }
      })
      .catch(console.error)
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
  }, [selectedDate, selectedDivision]);

  const handleOpenPhoto = async (attendanceId?: string) => {
    if (!attendanceId) return;
    if (photoCache[attendanceId]) {
      setSelectedPhoto(photoCache[attendanceId]);
      return;
    }
    setLoadingPhoto(true);
    setSelectedPhoto(null);
    try {
      const res = await fetch(`/api/attendance/${attendanceId}/photo`);
      const data = await res.json();
      if (data.success && data.photo) {
        setPhotoCache((prev) => ({ ...prev, [attendanceId]: data.photo }));
        setSelectedPhoto(data.photo);
      } else {
        alert('Foto bukti selfie tidak ditemukan.');
      }
    } catch {
      alert('Gagal mengambil foto bukti presensi.');
    } finally {
      setLoadingPhoto(false);
    }
  };

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExport = () => {
    const headers = ['Nama', 'Divisi', 'Shift', 'Presensi Masuk', 'Presensi Keluar', 'Status', 'Outlet'];
    const rows = (dailyData?.items || []).map((it: any) => [
      it.user.name,
      it.user.division?.name || '-',
      it.shift?.name || '-',
      it.inRecord ? `${formatAttendanceTime(it.inRecord.timestamp)} WIB` : '-',
      it.outRecord ? `${formatAttendanceTime(it.outRecord.timestamp)} WIB` : '-',
      it.status,
      it.inRecord?.outlet || '-',
    ]);
    downloadCSV(`rekap-harian-${selectedDate}`, headers, rows);
  };

  return (
    <div className="pb-24 pt-4 px-3 max-w-lg mx-auto space-y-4">
      <ReportTabsNav
        title="Rekapan Harian"
        subtitle="Daftar Hadir Semua Karyawan"
        onExport={handleExport}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="bg-gray-50 border border-gray-100 p-2.5 rounded-xl text-center">
          <span className="text-[9px] font-bold text-gray-400 uppercase block">Total</span>
          <div className="text-base font-black text-gray-900">{dailyData?.summary?.totalUsers ?? 0}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl text-center">
          <span className="text-[9px] font-bold text-emerald-600 uppercase block">Hadir</span>
          <div className="text-base font-black text-emerald-900">{dailyData?.summary?.totalPresent ?? 0}</div>
        </div>
        <div className="bg-red-50 border border-red-100 p-2.5 rounded-xl text-center">
          <span className="text-[9px] font-bold text-red-600 uppercase block">Telat</span>
          <div className="text-base font-black text-red-900">{dailyData?.summary?.totalLate ?? 0}</div>
        </div>
        <div className="bg-gray-100 p-2.5 rounded-xl text-center">
          <span className="text-[9px] font-bold text-gray-500 uppercase block">Absen</span>
          <div className="text-base font-black text-gray-700">{dailyData?.summary?.totalAbsent ?? 0}</div>
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 size={24} className="animate-spin text-gray-500" />
          <span className="text-xs text-gray-400 font-medium">Memuat rekap harian...</span>
        </div>
      ) : (dailyData?.items || []).length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-xs font-medium">
          Tidak ada data karyawan pada tanggal ini.
        </div>
      ) : (
        <div className="space-y-2">
          {dailyData.items.map((item: any, idx: number) => {
            const inTime = item.inRecord ? formatAttendanceTime(item.inRecord.timestamp) : null;
            const outTime = item.outRecord ? formatAttendanceTime(item.outRecord.timestamp) : null;

            return (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.inRecord?.id ? (
                    <button
                      onClick={() => handleOpenPhoto(item.inRecord.id)}
                      className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-gray-100 relative group bg-gray-50"
                      title="Klik untuk lihat selfie"
                    >
                      {item.user.photo ? (
                        <img src={item.user.photo} alt={item.user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-xs">
                          {item.user.name.charAt(0)}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <Camera size={13} />
                      </div>
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 font-bold flex items-center justify-center shrink-0 text-xs">
                      {item.user.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-900 text-xs truncate">{item.user.name}</h4>
                    <span className="text-[10px] text-gray-400 block truncate">
                      {item.user.division?.name || '-'} · {item.shift?.name || 'Shift'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {item.status === 'off' ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      🏖️ Libur
                    </span>
                  ) : item.status === 'absent' ? (
                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                      Belum Absen
                    </span>
                  ) : (
                    <div>
                      <div className="text-[11px] font-mono font-bold text-gray-900">
                        IN: {inTime} {outTime ? `· OUT: ${outTime}` : ''}
                      </div>
                      {item.isLate ? (
                        <span className="text-[9px] font-bold text-red-600">
                          Telat +{Math.ceil(item.lateSeconds / 60)}m
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-emerald-600">
                          Tepat Waktu
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selfie Preview Modal */}
      <PhotoModal
        photo={selectedPhoto}
        loading={loadingPhoto}
        onClose={() => {
          setSelectedPhoto(null);
          setLoadingPhoto(false);
        }}
      />
    </div>
  );
};

export default DailyAttendanceReport;
