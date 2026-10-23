import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2, Download } from 'lucide-react';
import { downloadCSV } from '../../../utils/exportCsv';

const MonthlyReport = () => {
  const { user: currentUser } = useAuth();

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const thisMonthStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonthStr);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Load divisions
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDivisions(d.divisions);
      })
      .catch(console.error);
  }, []);

  // Fetch monthly report data
  useEffect(() => {
    setLoading(true);
    const divParam = selectedDivision ? `&divisionId=${selectedDivision}` : '';
    fetch(`/api/reports/monthly?month=${selectedMonth}${divParam}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setMonthlyData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedMonth, selectedDivision]);

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExport = () => {
    const headers = [
      'Nama', 'Divisi', 'Total Hari Kerja', 'Total Hadir', 'Total Telat (Kali)',
      'Total Menit Telat', 'Persentase Hadir (%)'
    ];
    const rows = (monthlyData?.users || []).map((u: any) => [
      u.user.name,
      u.user.division?.name || '-',
      u.totalWorkDays,
      u.totalPresent,
      u.totalLateCount,
      `${Math.ceil(u.totalLateSeconds / 60)} menit`,
      `${u.presencePercent}%`,
    ]);
    downloadCSV(`rekap-bulanan-${selectedMonth}`, headers, rows);
  };

  return (
    <div className="pb-24 pt-4 px-3 max-w-lg mx-auto space-y-4">
      {/* Header Halaman Rekap Bulanan (Mandiri, Tanpa Tab Laporan Lain) */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Laporan Akumulasi & Jam Kerja</span>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Rekap Bulanan</h1>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs hover:bg-gray-800 active:scale-95 transition-all shrink-0"
          title="Unduh Data CSV / Excel"
        >
          <Download size={13} />
          <span>Ekspor</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2">
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <select
          value={selectedDivision}
          onChange={(e) => setSelectedDivision(e.target.value)}
          className="bg-gray-50 border border-gray-200 text-gray-900 text-xs font-bold rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Semua Divisi</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span className="text-xs text-gray-400 font-medium">Memuat rekap bulanan...</span>
        </div>
      ) : (monthlyData?.users || []).length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-xs font-medium">
          Tidak ada data presensi pada bulan ini.
        </div>
      ) : (
        <div className="space-y-2">
          {monthlyData.users.map((u: any, idx: number) => (
            <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">{u.user.name}</h4>
                  <span className="text-[11px] text-gray-400">{u.user.division?.name || 'Divisi'}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                    {u.presencePercent}% Hadir
                  </span>
                </div>
              </div>

              {/* Stat pills */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-gray-50 text-center text-[10px]">
                <div className="bg-gray-50 p-1.5 rounded-lg">
                  <span className="text-gray-400 block font-semibold">Kerja</span>
                  <span className="font-bold text-gray-800">{u.totalWorkDays} hari</span>
                </div>
                <div className="bg-emerald-50 p-1.5 rounded-lg text-emerald-900">
                  <span className="text-emerald-600 block font-semibold">Hadir</span>
                  <span className="font-bold">{u.totalPresent}x</span>
                </div>
                <div className="bg-red-50 p-1.5 rounded-lg text-red-900">
                  <span className="text-red-600 block font-semibold">Telat</span>
                  <span className="font-bold">{u.totalLateCount}x</span>
                </div>
                <div className="bg-amber-50 p-1.5 rounded-lg text-amber-900">
                  <span className="text-amber-600 block font-semibold">Total Telat</span>
                  <span className="font-bold">{Math.ceil(u.totalLateSeconds / 60)}m</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MonthlyReport;
