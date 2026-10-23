import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { CheckCircle, Loader2, AlertTriangle, Clock, Camera, MessageSquare, AlertCircle, X, Download, Send } from 'lucide-react';
import { formatAttendanceTime, formatDuration } from '../../../utils/timeFormat';
import { downloadCSV } from '../../../utils/exportCsv';
import PhotoModal from './PhotoModal';

type FilterTab = 'all' | 'late' | 'unmarked';

const DailyLateReport = () => {
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // WhatsApp broadcast state
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [waSuccessMsg, setWaSuccessMsg] = useState<string | null>(null);

  // Photo modal state
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});

  // Load divisions for filter
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions);
      })
      .catch(console.error);
  }, []);

  // Fetch data dengan Stale-While-Revalidate dan timeout 10 detik
  const fetchData = () => {
    const curCacheKey = `daily_report_${selectedDate}_${selectedDivision || 'all'}`;
    // Coba load dari sessionStorage lebih dulu
    try {
      const cached = sessionStorage.getItem(curCacheKey);
      if (cached) {
        setDailyData(JSON.parse(cached));
      }
    } catch {}

    setLoading(true);
    setErrorMsg(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const divParam = selectedDivision ? `&divisionId=${selectedDivision}` : '';
    fetch(`/api/reports/daily?date=${selectedDate}${divParam}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.success) {
          setDailyData(d);
          try {
            sessionStorage.setItem(curCacheKey, JSON.stringify(d));
          } catch {}
        } else {
          throw new Error(d.error || 'Gagal memuat data');
        }
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setErrorMsg(err.name === 'AbortError' ? 'Koneksi lambat / timeout. Ketuk "Muat Ulang".' : 'Gagal terhubung ke server.');
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate, selectedDivision]);

  // Handler for on-demand photo fetching
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

  // Helper untuk hitung status overdue karyawan belum presensi
  const getOverdueStatus = (checkInTimeStr?: string, dateStr?: string) => {
    if (!checkInTimeStr || !dateStr) return { isOverdue: false, text: 'Belum Presensi', isPast: false };

    const now = new Date();
    const nowWib = new Date(now.getTime() + (7 * 3600 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    const padN = (n: number) => String(n).padStart(2, '0');
    const currentTodayStr = `${nowWib.getFullYear()}-${padN(nowWib.getMonth() + 1)}-${padN(nowWib.getDate())}`;

    const isToday = dateStr === currentTodayStr;
    const isPast = dateStr < currentTodayStr;

    if (isPast) {
      return { isOverdue: true, text: 'Tidak Hadir / Mangkir', isPast: true };
    }

    if (isToday) {
      const [sh, sm] = checkInTimeStr.split(':').map(Number);
      const schedDate = new Date(nowWib);
      schedDate.setHours(sh, sm, 0, 0);

      const diffMinutes = Math.round((nowWib.getTime() - schedDate.getTime()) / (60 * 1000));
      if (diffMinutes > 0) {
        const h = Math.floor(diffMinutes / 60);
        const m = diffMinutes % 60;
        const durText = h > 0 ? `${h} jam ${m} mnt` : `${m} mnt`;
        return { isOverdue: true, text: `Lewat ${durText}`, isPast: false };
      } else {
        return { isOverdue: false, text: `Shift Belum Mulai (${checkInTimeStr} WIB)`, isPast: false };
      }
    }

    return { isOverdue: false, text: 'Jadwal Mendatang', isPast: false };
  };

  // Filter Karyawan Telat & Belum Presensi
  const { lateItems, unmarkedItems } = useMemo(() => {
    const items = dailyData?.items || [];
    const late = items.filter((item: any) => item.isLate);
    const unmarked = items.filter((item: any) => !item.inRecord && item.shift && !item.shift.isOff);
    return { lateItems: late, unmarkedItems: unmarked };
  }, [dailyData]);

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExport = () => {
    const headers = ['Nama', 'Divisi', 'Shift', 'Jadwal Masuk', 'Status', 'Presensi Masuk', 'Keterangan', 'Outlet'];
    const rows: any[] = [];

    // Rows Karyawan Telat
    if (activeTab === 'all' || activeTab === 'late') {
      lateItems.forEach((it: any) => {
        rows.push([
          it.user.name,
          it.user.division?.name || '-',
          it.shift?.name || '-',
          it.shift?.checkInTime ? `${it.shift.checkInTime} WIB` : '-',
          'Terlambat',
          it.inRecord ? `${formatAttendanceTime(it.inRecord.timestamp)} WIB` : '-',
          `Telat ${formatDuration(it.lateSeconds)}`,
          it.inRecord?.outlet || it.shift?.location?.name || '-',
        ]);
      });
    }

    // Rows Karyawan Belum Presensi
    if (activeTab === 'all' || activeTab === 'unmarked') {
      unmarkedItems.forEach((it: any) => {
        const overdue = getOverdueStatus(it.shift?.checkInTime, selectedDate);
        rows.push([
          it.user.name,
          it.user.division?.name || '-',
          it.shift?.name || '-',
          it.shift?.checkInTime ? `${it.shift.checkInTime} WIB` : '-',
          'Belum Presensi',
          '-',
          overdue.text,
          it.shift?.location?.name || '-',
        ]);
      });
    }

    downloadCSV(`rekap-telat-dan-belum-presensi-${selectedDate}`, headers, rows);
  };

  const handleWaReminder = (userName: string, shiftName?: string, checkInTime?: string) => {
    const text = encodeURIComponent(
      `Halo Rekan ${userName},\n\nPengingat dari Donattour: Anda terjadwal masuk hari ini pada shift *${shiftName || 'Kerja'}* pukul *${checkInTime || '-'} WIB*, namun sistem mencatat Anda belum melakukan presensi masuk (Clock IN).\n\nMohon segera lakukan presensi di aplikasi jika sudah berada di lokasi. Terima kasih!`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleSendWa = async () => {
    const confirmMsg = `Kirim laporan rekapan keterlambatan (${lateItems.length} orang) dan belum presensi (${unmarkedItems.length} orang) tanggal ${selectedDate} ke Grup WhatsApp dan WA IT Ence?`;
    if (!window.confirm(confirmMsg)) return;

    setIsSendingWa(true);
    setWaSuccessMsg(null);
    try {
      const res = await fetch('/api/reports/send-wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          divisionId: selectedDivision || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWaSuccessMsg('✅ Rekapan berhasil dikirim ke Grup WA dan WA IT Ence!');
        setTimeout(() => setWaSuccessMsg(null), 5000);
      } else {
        alert(`Gagal mengirim ke WhatsApp: ${data.message || 'Terjadi kesalahan'}`);
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan jaringan: ${err.message}`);
    } finally {
      setIsSendingWa(false);
    }
  };

  return (
    <div className="pb-24 pt-4 px-3 max-w-lg mx-auto space-y-4">
      {/* Header Halaman Rekap Telat (Mandiri, Tanpa Tab Laporan Lain) */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Monitoring Keterlambatan</span>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Rekap Telat</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleSendWa}
            disabled={isSendingWa}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all disabled:opacity-50"
            title="Kirim Laporan Rekap ke Grup WhatsApp & WA IT Ence"
          >
            {isSendingWa ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            <span>{isSendingWa ? 'Mengirim...' : 'Kirim WA'}</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs hover:bg-gray-800 active:scale-95 transition-all"
            title="Unduh Data CSV / Excel"
          >
            <Download size={13} />
            <span>Ekspor</span>
          </button>
        </div>
      </div>

      {/* Banner Notifikasi Sukses Kirim WA */}
      {waSuccessMsg && (
        <div className="bg-emerald-600 text-white p-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} />
            <span>{waSuccessMsg}</span>
          </div>
          <button onClick={() => setWaSuccessMsg(null)} className="text-white/80 hover:text-white p-1">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter Bar (Tanggal & Divisi) */}
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

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => setActiveTab('late')}
          className={`p-3 rounded-2xl text-center border transition-all text-left group ${
            activeTab === 'late'
              ? 'bg-red-600 text-white border-red-700 shadow-md ring-2 ring-red-400'
              : 'bg-red-50/80 border-red-100 hover:bg-red-100/70'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${
            activeTab === 'late' ? 'text-red-100' : 'text-red-600'
          }`}>
            Karyawan Telat
          </span>
          <div className={`text-xl font-black mt-0.5 ${
            activeTab === 'late' ? 'text-white' : 'text-red-900'
          }`}>
            {lateItems.length}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('unmarked')}
          className={`p-3 rounded-2xl text-center border transition-all text-left group ${
            activeTab === 'unmarked'
              ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-300'
              : 'bg-amber-50/80 border-amber-100 hover:bg-amber-100/70'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${
            activeTab === 'unmarked' ? 'text-amber-100' : 'text-amber-600'
          }`}>
            Belum Presensi
          </span>
          <div className={`text-xl font-black mt-0.5 ${
            activeTab === 'unmarked' ? 'text-white' : 'text-amber-900'
          }`}>
            {unmarkedItems.length}
          </div>
        </button>

        <div className="bg-amber-50/50 border border-amber-100/80 p-3 rounded-2xl text-center">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Total Menit Telat</span>
          <div className="text-xl font-black text-amber-900 mt-0.5">
            {Math.ceil((dailyData?.summary?.totalLateSeconds ?? 0) / 60)}m
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-100 p-3 rounded-2xl text-center">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Tepat Waktu</span>
          <div className="text-xl font-black text-emerald-900 mt-0.5">
            {dailyData?.summary?.totalOnTime ?? 0}
          </div>
        </div>
      </div>

      {/* Sub-filter Tabs: Semua, Terlambat Saja, Belum Presensi Saja */}
      <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold gap-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <span>Semua Perhatian</span>
          <span className="bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0.2 rounded-full">
            {lateItems.length + unmarkedItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('late')}
          className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'late'
              ? 'bg-red-600 text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <AlertTriangle size={12} />
          <span>Terlambat</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            activeTab === 'late' ? 'bg-red-700 text-white' : 'bg-red-100 text-red-700'
          }`}>
            {lateItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('unmarked')}
          className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'unmarked'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <Clock size={12} />
          <span>Belum Presensi</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            activeTab === 'unmarked' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'
          }`}>
            {unmarkedItems.length}
          </span>
        </button>
      </div>

      {/* Status Sinkronisasi Latar Belakang */}
      {loading && dailyData && (
        <div className="text-[10px] font-bold text-gray-400 flex items-center justify-center gap-1.5 py-0.5">
          <Loader2 size={11} className="animate-spin text-red-500" />
          <span>Memperbarui data...</span>
        </div>
      )}

      {/* Main Content List */}
      {errorMsg && !dailyData ? (
        <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl text-center space-y-3">
          <AlertCircle size={28} className="mx-auto text-red-500" />
          <div className="text-xs font-bold">{errorMsg}</div>
          <button
            onClick={fetchData}
            className="bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs hover:bg-red-700 active:scale-95 transition-all"
          >
            Muat Ulang
          </button>
        </div>
      ) : loading && !dailyData ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 size={24} className="animate-spin text-red-500" />
          <span className="text-xs text-gray-400 font-medium">Memuat data monitoring kehadiran...</span>
        </div>
      ) : (lateItems.length === 0 && unmarkedItems.length === 0) ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={28} />
          </div>
          <h3 className="font-bold text-gray-900 text-sm">Semua Terjadwal Hadir Tepat Waktu! 🎉</h3>
          <p className="text-xs text-gray-500 mt-1">
            Tidak ada karyawan yang terlambat maupun yang belum melakukan presensi pada tanggal ini.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SECTION 1: KARYAWAN TERLAMBAT */}
          {(activeTab === 'all' || activeTab === 'late') && lateItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  Karyawan Terlambat ({lateItems.length})
                </span>
              </div>

              <div className="space-y-2.5">
                {lateItems.map((item: any, idx: number) => {
                  const inTime = item.inRecord ? formatAttendanceTime(item.inRecord.timestamp) : '-';
                  return (
                    <div key={`late-${idx}`} className="bg-white rounded-2xl border border-red-100 p-3.5 shadow-sm hover:border-red-200 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          {item.inRecord?.id ? (
                            <button
                              onClick={() => handleOpenPhoto(item.inRecord.id)}
                              className="w-11 h-11 rounded-xl overflow-hidden border border-red-200 shrink-0 shadow-sm relative group bg-gray-50 flex items-center justify-center"
                              title="Klik untuk lihat foto selfie presensi"
                            >
                              {item.user.photo ? (
                                <img src={item.user.photo} alt={item.user.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-red-100 text-red-600 font-bold flex items-center justify-center text-sm">
                                  {item.user.name.charAt(0)}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <Camera size={14} />
                              </div>
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
                          {(item.inRecord?.outlet || item.shift?.location?.name) && (
                            <span className="text-[10px] text-gray-400 font-semibold block mt-1">
                              📍 {item.inRecord?.outlet || item.shift?.location?.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between text-xs font-semibold">
                        <div className="text-gray-500">
                          Jadwal: <span className="text-gray-900 font-mono">{item.shift?.checkInTime || '-'} WIB</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-red-700">
                            Masuk: <span className="font-bold font-mono">{inTime} WIB</span>
                          </div>
                          {item.inRecord?.id && (
                            <button
                              onClick={() => handleOpenPhoto(item.inRecord.id)}
                              className="text-[10px] text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors"
                            >
                              <Camera size={11} />
                              Foto
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION 2: KARYAWAN BELUM PRESENSI */}
          {(activeTab === 'all' || activeTab === 'unmarked') && unmarkedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={13} />
                  Karyawan Belum Presensi Masuk ({unmarkedItems.length})
                </span>
              </div>

              <div className="space-y-2.5">
                {unmarkedItems.map((item: any, idx: number) => {
                  const overdue = getOverdueStatus(item.shift?.checkInTime, selectedDate);
                  return (
                    <div key={`unmarked-${idx}`} className="bg-white rounded-2xl border border-amber-200 p-3.5 shadow-sm hover:border-amber-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 font-bold flex items-center justify-center shrink-0 text-sm overflow-hidden border border-amber-200">
                            {item.user.photo ? (
                              <img src={item.user.photo} alt={item.user.name} className="w-full h-full object-cover" />
                            ) : (
                              item.user.name.charAt(0)
                            )}
                          </div>

                          <div className="min-w-0">
                            <h4 className="font-bold text-gray-900 text-sm truncate">{item.user.name}</h4>
                            <span className="text-[11px] text-gray-500 font-medium block truncate">
                              {item.user.division?.name || '-'} · {item.shift?.name || 'Shift'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg shadow-sm block ${
                            overdue.isOverdue
                              ? overdue.isPast
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-white'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {overdue.text}
                          </span>
                          {item.shift?.location?.name && (
                            <span className="text-[10px] text-gray-400 font-semibold block mt-1">
                              📍 {item.shift.location.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between text-xs font-semibold">
                        <div className="text-gray-500">
                          Jadwal Masuk: <span className="text-gray-900 font-mono">{item.shift?.checkInTime || '-'} WIB</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Belum Check-In
                          </span>

                          <button
                            onClick={() => handleWaReminder(item.user.name, item.shift?.name, item.shift?.checkInTime)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors border border-emerald-200"
                            title="Ingatkan via WhatsApp"
                          >
                            <MessageSquare size={11} />
                            Ingatkan WA
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

export default DailyLateReport;
