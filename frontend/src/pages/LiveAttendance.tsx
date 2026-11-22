import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  MapPin,
  Search,
  RefreshCw,
  Building2,
  X,
  Radio,
  PauseCircle,
} from 'lucide-react';
import { formatAttendanceTime } from '../utils/timeFormat';

type LiveEmployee = {
  userId: string;
  name: string;
  role: string;
  photo?: string | null;
  divisionName: string;
  clockInTime: string;
  outlet: string;
  shiftName: string;
  shiftId?: string | null;
  shiftCheckIn?: string | null;
  shiftCheckOut?: string | null;
  isEvent?: boolean;
};

export default function LiveAttendance() {
  const [employees, setEmployees] = useState<LiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [statusTab, setStatusTab] = useState<'all' | 'running' | 'frozen'>('all');
  const [now, setNow] = useState<Date>(new Date());

  // 1. Fetch data dari server
  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/live');
      const data = await res.json();
      if (data.success && Array.isArray(data.employees)) {
        setEmployees(data.employees);
      } else {
        setEmployees([]);
      }
    } catch (err) {
      console.error('Error fetching live attendance:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  // 2. Timer tick setiap 1 detik
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Kalkulasi Runtime & Freeze Logika:
  // Jika waktu sekarang sudah melewati jam pulang shift normal, runtime DI-FREEZE di jam checkout shift!
  const getEmployeeRuntime = useCallback((emp: LiveEmployee) => {
    const inDate = new Date(emp.clockInTime);
    const nowMs = now.getTime();

    const inWib = new Date(inDate.getTime() + 7 * 3600 * 1000);
    const inYear = inWib.getUTCFullYear();
    const inMonth = inWib.getUTCMonth();
    const inDay = inWib.getUTCDate();

    let isFrozen = false;
    let freezeLabel = '';
    let diffSec = 0;

    if (!emp.isEvent && emp.shiftCheckOut && emp.shiftCheckOut !== '00:00') {
      const [soh, som] = emp.shiftCheckOut.split(':').map(Number);
      let endDay = inDay;
      if (emp.shiftCheckIn) {
        const [sih, sim] = emp.shiftCheckIn.split(':').map(Number);
        if (soh * 60 + som < sih * 60 + sim) {
          endDay = inDay + 1; // Overnight shift
        }
      }
      const shiftEndMs = Date.UTC(inYear, inMonth, endDay, soh, som, 0) - (7 * 3600 * 1000);
      if (nowMs >= shiftEndMs) {
        isFrozen = true;
        freezeLabel = `Freeze · Selesai ${emp.shiftCheckOut} WIB`;
        diffSec = Math.max(0, Math.floor((shiftEndMs - inDate.getTime()) / 1000));
      } else {
        diffSec = Math.max(0, Math.floor((nowMs - inDate.getTime()) / 1000));
      }
    } else if (emp.isEvent) {
      // Shift Event: jika sudah melewati jam 23:59 hari tersebut, bekukan
      const eventEndMs = Date.UTC(inYear, inMonth, inDay, 23, 59, 59) - (7 * 3600 * 1000);
      if (nowMs >= eventEndMs) {
        isFrozen = true;
        freezeLabel = 'Freeze · Event Hari Ini/Kemarin Selesai';
        diffSec = Math.max(0, Math.floor((eventEndMs - inDate.getTime()) / 1000));
      } else {
        diffSec = Math.max(0, Math.floor((nowMs - inDate.getTime()) / 1000));
      }
    } else {
      // Jika shift tidak memiliki checkOutTime spesifik: batas wajar kerja maksimal 8 jam
      const maxNormalMs = inDate.getTime() + 8 * 3600 * 1000;
      if (nowMs >= maxNormalMs) {
        isFrozen = true;
        freezeLabel = 'Freeze · Melewati 8 Jam Kerja';
        diffSec = 8 * 3600;
      } else {
        diffSec = Math.max(0, Math.floor((nowMs - inDate.getTime()) / 1000));
      }
    }

    const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const s = String(diffSec % 60).padStart(2, '0');

    return {
      durationStr: `${h}:${m}:${s}`,
      isFrozen,
      freezeLabel,
    };
  }, [now]);

  // Hitung jumlah yang aktif vs frozen
  const { runningCount, frozenCount } = useMemo(() => {
    let running = 0;
    let frozen = 0;
    employees.forEach((e) => {
      const res = getEmployeeRuntime(e);
      if (res.isFrozen) frozen++;
      else running++;
    });
    return { runningCount: running, frozenCount: frozen };
  }, [employees, getEmployeeRuntime]);

  // Daftar divisi unik
  const divisions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.divisionName) set.add(e.divisionName);
    });
    return Array.from(set);
  }, [employees]);

  // Filter karyawan berdasarkan search, divisi, dan status tab
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const matchSearch =
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.outlet.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.shiftName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDiv = selectedDivision === 'all' || e.divisionName === selectedDivision;

      if (!matchSearch || !matchDiv) return false;

      const runtimeInfo = getEmployeeRuntime(e);
      if (statusTab === 'running' && runtimeInfo.isFrozen) return false;
      if (statusTab === 'frozen' && !runtimeInfo.isFrozen) return false;

      return true;
    });
  }, [employees, searchQuery, selectedDivision, statusTab, getEmployeeRuntime]);

  return (
    <div className="pb-24 pt-3 px-3 max-w-lg mx-auto space-y-3">
      {/* ─── Header Halaman Live Kehadiran ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60 relative">
              <Radio size={20} className="animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Realtime
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  {formatAttendanceTime(now)} WIB
                </span>
              </div>
              <h1 className="text-base font-black text-gray-900 tracking-tight leading-tight mt-0.5">
                Live Kehadiran
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setLoading(true);
                fetchLive();
              }}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors border border-gray-100 shadow-2xs"
              title="Segarkan data live"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Counter Ringkasan Bertugas */}
        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              🟢 {runningCount} Sedang Berjalan
            </span>
            {frozenCount > 0 && (
              <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                ⏸ {frozenCount} Shift Selesai (Freeze)
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-400 shrink-0">
            Auto-sync 30s
          </span>
        </div>
      </div>

      {/* Tab Filter: Semua vs Aktif vs Freeze */}
      <div className="grid grid-cols-3 p-1 bg-gray-100 rounded-2xl gap-1 text-xs font-bold">
        <button
          onClick={() => setStatusTab('all')}
          className={`py-1.5 rounded-xl transition-all ${
            statusTab === 'all'
              ? 'bg-white text-gray-900 shadow-2xs'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Semua ({employees.length})
        </button>
        <button
          onClick={() => setStatusTab('running')}
          className={`py-1.5 rounded-xl transition-all ${
            statusTab === 'running'
              ? 'bg-white text-emerald-800 shadow-2xs'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🟢 Aktif ({runningCount})
        </button>
        <button
          onClick={() => setStatusTab('frozen')}
          className={`py-1.5 rounded-xl transition-all ${
            statusTab === 'frozen'
              ? 'bg-white text-amber-800 shadow-2xs'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ⏸ Freeze ({frozenCount})
        </button>
      </div>

      {/* Filter Divisi & Pencarian */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama karyawan, outlet, atau shift..."
            className="w-full pl-8 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {divisions.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedDivision('all')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
                selectedDivision === 'all'
                  ? 'bg-gray-900 text-white shadow-2xs'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Semua Divisi
            </button>
            {divisions.map((div) => {
              const isSelected = selectedDivision === div;
              return (
                <button
                  key={div}
                  onClick={() => setSelectedDivision(div)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {div}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Daftar Karyawan ─── */}
      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-xs text-gray-400 border border-gray-100 space-y-2">
          <RefreshCw size={24} className="animate-spin mx-auto text-emerald-500" />
          <p className="font-semibold text-gray-600">Menghubungkan ke data live presensi...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-xs text-gray-400 border border-dashed border-gray-200 space-y-2">
          <Clock size={32} className="mx-auto text-gray-300" />
          <p className="font-bold text-gray-700 text-sm">Tidak Ada Karyawan Bertugas</p>
          <p className="text-gray-400 max-w-xs mx-auto">
            {searchQuery || selectedDivision !== 'all' || statusTab !== 'all'
              ? 'Tidak ada karyawan yang cocok dengan filter yang Anda pilih.'
              : 'Saat ini belum ada karyawan yang tercatat aktif bekerja.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredEmployees.map((emp) => {
            const isEvent = !!emp.isEvent;
            const runtimeInfo = getEmployeeRuntime(emp);

            return (
              <div
                key={emp.userId}
                className={`bg-white rounded-2xl border p-3.5 shadow-xs space-y-3 transition-all ${
                  runtimeInfo.isFrozen
                    ? 'border-amber-200/80 bg-amber-50/20'
                    : 'border-gray-100 hover:border-emerald-200'
                }`}
              >
                {/* Baris Atas: Foto Profil + Nama + Status On-Duty */}
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-gray-600 overflow-hidden shrink-0 border border-gray-200/80">
                      {emp.photo ? (
                        <img
                          src={
                            emp.photo.startsWith('data:')
                              ? emp.photo
                              : `data:image/jpeg;base64,${emp.photo}`
                          }
                          alt={emp.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-black text-gray-500">
                          {emp.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-900 truncate">
                          {emp.name}
                        </h3>
                        {isEvent && (
                          <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-md">
                            🎪 Event
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                        <Building2 size={11} className="text-gray-400 shrink-0" />
                        <span className="truncate">{emp.divisionName}</span>
                      </p>
                    </div>
                  </div>

                  {/* Badge Status */}
                  {runtimeInfo.isFrozen ? (
                    <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-full">
                      <PauseCircle size={12} className="text-amber-700" />
                      <span>Shift Selesai</span>
                    </div>
                  ) : (
                    <div className="shrink-0 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Aktif</span>
                    </div>
                  )}
                </div>

                {/* Baris Tengah: Runtime Stopwatch */}
                <div
                  className={`rounded-xl p-2.5 flex items-center justify-between border ${
                    runtimeInfo.isFrozen
                      ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                      : 'bg-gradient-to-r from-emerald-50/70 to-green-50/50 border-emerald-100 text-emerald-950'
                  }`}
                >
                  <div>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-widest block mb-0.5 ${
                        runtimeInfo.isFrozen ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {runtimeInfo.isFrozen ? `⏸ ${runtimeInfo.freezeLabel}` : '⏱ Runtime Berjalan'}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-2xl font-black font-mono tracking-tight leading-none ${
                          runtimeInfo.isFrozen ? 'text-amber-900' : 'text-emerald-900'
                        }`}
                      >
                        {runtimeInfo.durationStr}
                      </span>
                      {runtimeInfo.isFrozen && (
                        <span className="text-[10px] font-bold text-amber-700">(Maksimal Shift)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-[10px] font-semibold block ${
                        runtimeInfo.isFrozen ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      Clock IN
                    </span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        runtimeInfo.isFrozen ? 'text-amber-900' : 'text-emerald-900'
                      }`}
                    >
                      {formatAttendanceTime(emp.clockInTime)} WIB
                    </span>
                  </div>
                </div>

                {/* Baris Bawah: Lokasi Outlet & Shift */}
                <div className="pt-1 border-t border-gray-50 flex items-center justify-between gap-2 text-xs text-gray-600">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <MapPin
                      size={13}
                      className={isEvent ? 'text-purple-600 shrink-0' : 'text-red-500 shrink-0'}
                    />
                    <span
                      className={`truncate font-semibold ${
                        isEvent ? 'text-purple-900' : 'text-gray-800'
                      }`}
                    >
                      {emp.outlet}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md font-medium">
                    {emp.shiftName}
                    {emp.shiftCheckOut ? ` (${emp.shiftCheckIn || '—'}–${emp.shiftCheckOut})` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
