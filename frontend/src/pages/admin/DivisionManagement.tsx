import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Briefcase, Plus, Pencil, Trash2, X, Search, Clock, ChevronDown, ChevronUp, MapPin, Globe } from 'lucide-react';
import { Navigate } from 'react-router-dom';

type Shift = {
  id: string;
  name: string;
  description: string | null;
  checkInTime: string;
  checkOutTime: string;
  divisionId: string;
  locationId?: string | null;
  location?: { id: string; name: string; radius: number } | null;
};

type Division = {
  id: string;
  name: string;
  shifts: Shift[];
};

const isOff = (s?: Shift | { name?: string; description?: string | null; checkInTime?: string; checkOutTime?: string } | null) => {
  if (!s) return false;
  // Shift hanya dianggap Libur/OFF jika jamnya 00:00 - 00:00, atau namanya persis OFF / LIBUR
  const isZeroHours = s.checkInTime === '00:00' && s.checkOutTime === '00:00';
  if (isZeroHours) return true;
  const name = (s.name || '').toUpperCase().trim();
  return (name === 'OFF' || name === 'LIBUR') && (!s.checkInTime || s.checkInTime === '00:00');
};

const isEvent = (s?: Shift | { name?: string; description?: string | null } | null) => {
  if (!s) return false;
  const name = (s.name || '').toUpperCase().trim();
  const desc = (s.description || '').toUpperCase();
  return name.includes('EVENT') || desc.includes('[EVENT]');
};

const isNoRadius = (s?: Shift | { name?: string; description?: string | null } | null) => {
  if (!s) return false;
  if (isEvent(s)) return true;
  const desc = (s.description || '');
  return desc.includes('[NO_RADIUS]');
};

const cleanDescription = (desc?: string | null) => {
  if (!desc) return '';
  return desc.replace(/\[(NO_RADIUS|EVENT)\]/g, '').trim();
};

const DivisionManagement = () => {
  const { user: currentUser } = useAuth();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Division modal
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [divName, setDivName] = useState('');
  const [isSubmittingDiv, setIsSubmittingDiv] = useState(false);

  // Shift modal
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [shiftDivisionId, setShiftDivisionId] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftDesc, setShiftDesc] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [workDurationHours, setWorkDurationHours] = useState<number | ''>('');

  // Helper: hitung durasi dari checkIn dan checkOut (HH:MM)
  const calcDuration = (inTime: string, outTime: string): number | '' => {
    if (!inTime || !outTime) return '';
    const [ih, im] = inTime.split(':').map(Number);
    const [oh, om] = outTime.split(':').map(Number);
    const inMin = ih * 60 + im;
    let outMin = oh * 60 + om;
    // Jika out < in, anggap melewati tengah malam
    if (outMin < inMin) outMin += 24 * 60;
    const diff = outMin - inMin;
    if (diff <= 0 || diff > 24 * 60) return '';
    // Bulatkan ke jam terdekat (0.5)
    return Math.round((diff / 60) * 2) / 2;
  };

  // Helper: hitung checkOut dari checkIn + durasi (jam)
  const calcCheckOut = (inTime: string, durationHours: number): string => {
    const [ih, im] = inTime.split(':').map(Number);
    const totalMin = ih * 60 + im + Math.round(durationHours * 60);
    const outH = Math.floor(totalMin / 60) % 24;
    const outM = totalMin % 60;
    return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
  };
  const [shiftLocationId, setShiftLocationId] = useState('');
  const [shiftLocationMode, setShiftLocationMode] = useState<string>('ANY_RADIUS');
  const [locationCategory, setLocationCategory] = useState<'BEBAS' | 'SPECIFIC'>('BEBAS');
  const [isSubmittingShift, setIsSubmittingShift] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadInitialData = async () => {
    try {
      const [divRes, locRes] = await Promise.all([
        fetch('/api/divisions').then(r => r.json()).catch(() => null),
        fetch('/api/locations').then(r => r.json()).catch(() => null),
      ]);
      if (divRes?.success) setDivisions(divRes.divisions);
      if (locRes?.success) setLocations(locRes.locations);
    } catch {
      setDivisions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDivisions = async () => {
    try {
      const res = await fetch('/api/divisions');
      const data = await res.json();
      setDivisions(data.success ? data.divisions : []);
    } catch {
      setDivisions([]);
    }
  };

  useEffect(() => { 
    loadInitialData();
  }, []);

  // ---- DIVISION CRUD ----
  const openDivisionModal = (div?: Division) => {
    setEditingDivision(div || null);
    setDivName(div?.name || '');
    setIsDivisionModalOpen(true);
  };

  const closeDivisionModal = () => {
    setIsDivisionModalOpen(false);
    setEditingDivision(null);
    setDivName('');
  };

  const submitDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!divName.trim()) return alert('Nama divisi wajib diisi');
    setIsSubmittingDiv(true);
    try {
      const url = editingDivision ? `/api/divisions/${editingDivision.id}` : '/api/divisions';
      const res = await fetch(url, {
        method: editingDivision ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: divName.trim() }),
      });
      const data = await res.json();
      if (data.success) { 
        await fetchDivisions(); 
        closeDivisionModal(); 
        showToast(editingDivision ? 'Divisi berhasil diperbarui!' : 'Divisi baru berhasil dibuat!');
      }
      else alert(data.error || 'Gagal menyimpan');
    } catch { alert('Terjadi kesalahan'); }
    finally { setIsSubmittingDiv(false); }
  };

  const deleteDivision = async (id: string, name: string) => {
    if (!confirm(`Hapus divisi "${name}" beserta semua shiftnya?`)) return;
    try {
      const res = await fetch(`/api/divisions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchDivisions();
    } catch { alert('Terjadi kesalahan'); }
  };

  // ---- SHIFT CRUD ----
  const openShiftModal = (divisionId: string, shift?: Shift) => {
    setShiftDivisionId(divisionId);
    setEditingShift(shift || null);
    setShiftName(shift?.name || '');
    setShiftDesc(cleanDescription(shift?.description));
    setCheckInTime(shift?.checkInTime || '07:00');
    setCheckOutTime(shift?.checkOutTime || '16:00');
    setWorkDurationHours(calcDuration(shift?.checkInTime || '07:00', shift?.checkOutTime || '16:00'));

    if (shift) {
      if (shift.locationId) {
        setLocationCategory('SPECIFIC');
        setShiftLocationId(shift.locationId);
        setShiftLocationMode(shift.locationId);
      } else if (isNoRadius(shift)) {
        setLocationCategory('BEBAS');
        setShiftLocationId('');
        setShiftLocationMode('NO_RADIUS');
      } else {
        setLocationCategory('BEBAS');
        setShiftLocationId('');
        setShiftLocationMode('ANY_RADIUS');
      }
    } else {
      setLocationCategory('BEBAS');
      setShiftLocationId('');
      setShiftLocationMode('ANY_RADIUS');
    }
    setIsShiftModalOpen(true);
  };

  const closeShiftModal = () => {
    setIsShiftModalOpen(false);
    setEditingShift(null);
    setShiftName('');
    setShiftDesc('');
    setCheckInTime('');
    setCheckOutTime('');
    setShiftLocationId('');
    setShiftLocationMode('ANY_RADIUS');
    setLocationCategory('BEBAS');
    setWorkDurationHours('');
  };

  const submitShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftName.trim() || !checkInTime || !checkOutTime) {
      return alert('Mohon lengkapi kode shift, jam masuk, dan jam pulang');
    }
    setIsSubmittingShift(true);

    try {
      let finalDesc = cleanDescription(shiftDesc);
      const isShiftAnEvent = isEvent({ name: shiftName, description: finalDesc });
      if (isShiftAnEvent) {
        finalDesc = `${finalDesc} [EVENT]`.trim();
      }

      // Jika kategori BEBAS dengan opsi TANPA RADIUS, atau shift Event
      if (locationCategory === 'BEBAS' && (shiftLocationMode === 'NO_RADIUS' || isShiftAnEvent)) {
        finalDesc = `${finalDesc} [NO_RADIUS]`.trim();
      }

      // Jika kategori OUTLET KHUSUS: simpan shiftLocationId, jika BEBAS: null
      const finalLocationId = locationCategory === 'SPECIFIC' ? shiftLocationId || null : null;

      const url = editingShift ? `/api/shifts/${editingShift.id}` : '/api/shifts';
      const body = editingShift
        ? {
            name: shiftName.trim(),
            description: finalDesc || null,
            checkInTime,
            checkOutTime,
            locationId: finalLocationId,
          }
        : {
            name: shiftName.trim(),
            description: finalDesc || null,
            checkInTime,
            checkOutTime,
            divisionId: shiftDivisionId,
            locationId: finalLocationId,
          };

      const res = await fetch(url, {
        method: editingShift ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        await fetchDivisions();
        closeShiftModal();
        showToast(editingShift ? 'Shift berhasil diperbarui!' : 'Shift baru berhasil ditambahkan!');
      } else {
        alert(data.error || 'Gagal menyimpan shift');
      }
    } catch {
      alert('Terjadi kesalahan saat menyimpan shift');
    } finally {
      setIsSubmittingShift(false);
    }
  };

  const deleteShift = async (id: string, name: string) => {
    if (!confirm(`Hapus shift "${name}"?`)) return;
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchDivisions();
    } catch { alert('Terjadi kesalahan'); }
  };

  const filtered = [...divisions]
    .filter(d => d.name.toLowerCase().includes((search || '').toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' }));

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 border border-gray-700 animate-in fade-in slide-in-from-top duration-200">
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">✓</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Divisi & Shift</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola divisi dan jam kerja</p>
        </div>
        <div className="w-11 h-11 bg-gray-100 rounded-2xl flex items-center justify-center">
          <Briefcase size={20} className="text-gray-600" />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nama divisi..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
        />
      </div>

      {/* Division List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-sm mt-3">Memuat data...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
            <Briefcase size={36} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">Belum ada divisi</p>
          </div>
        ) : (
          filtered.map(div => (
            <div key={div.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all">
              {/* Division row */}
              <div
                onClick={() => setExpandedId(expandedId === div.id ? null : div.id)}
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50/70 transition-colors select-none"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Briefcase size={18} className="text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{div.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5" translate="no">
                    <span className="text-xs text-gray-400">
                      {div.shifts.length === 0
                        ? 'Belum ada Shift'
                        : `${div.shifts.length} Shift`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === div.id ? null : div.id)}
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                    title={expandedId === div.id ? 'Tutup Daftar Shift' : 'Buka Daftar Shift'}
                  >
                    {expandedId === div.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openDivisionModal(div)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                    title="Edit Nama Divisi"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDivision(div.id, div.name)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    title="Hapus Divisi"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Expanded: shifts list */}
              {expandedId === div.id && (
                <div className="border-t border-gray-100 bg-gray-50/40 px-4 pb-4 pt-3 space-y-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider" translate="no">
                      Daftar Shift ({div.shifts.length})
                    </p>
                  </div>

                  {div.shifts.length === 0 ? (
                    <div className="text-center py-4 bg-white rounded-xl border border-dashed border-gray-200">
                      <p className="text-xs text-gray-400">Belum ada shift untuk divisi ini</p>
                    </div>
                  ) : (
                    [...div.shifts]
                      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id', { numeric: true, sensitivity: 'base' }))
                      .map(shift => {
                        const loc = shift.location || locations.find(l => l.id === shift.locationId);
                        const isOffShift = isOff(shift);
                        const isEvShift = isEvent(shift);
                        const isNoRad = isNoRadius(shift);
                        const displayDesc = cleanDescription(shift.description);

                        return (
                          <div
                            key={shift.id}
                            className="bg-white border border-gray-200/80 hover:border-indigo-200/80 rounded-xl p-3 shadow-2xs transition-all space-y-2"
                          >
                            {/* Baris Atas: Badge Shift, Keterangan, dan Tombol Aksi */}
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-xs font-black tracking-wide shrink-0 ${
                                    isOffShift
                                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                      : isEvShift
                                      ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                                  }`}
                                >
                                  {isEvShift ? '🎪 EVENT' : shift.name}
                                </span>
                                {displayDesc && displayDesc !== shift.name && (
                                  <span
                                    className="text-xs font-semibold text-gray-600 truncate"
                                    title={displayDesc}
                                  >
                                    {displayDesc}
                                  </span>
                                )}
                              </div>

                              {/* Tombol Aksi (Tidak Nabrak Konten) */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openShiftModal(div.id, shift)}
                                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Edit Shift"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteShift(shift.id, shift.name)}
                                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Hapus Shift"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Baris Bawah: Jam Kerja dan Lokasi (Responsif & Anti-Tabrakan di HP) */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-gray-100 text-xs">
                              {isOffShift ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shrink-0">
                                  🏖️ Libur (OFF)
                                </span>
                              ) : isEvShift ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 shrink-0">
                                  🎪 Fleksibel (Event)
                                </span>
                              ) : (
                                <div className="inline-flex items-center gap-1 font-bold text-gray-700 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 shrink-0 text-[11px]">
                                  <Clock size={11} className="text-indigo-500" />
                                  <span>{`${shift.checkInTime} – ${shift.checkOutTime}`}</span>
                                </div>
                              )}

                              {!isOffShift && (
                                loc ? (
                                  <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100 max-w-[160px] truncate" title={`Wajib di outlet: ${loc.name}`}>
                                    <MapPin size={11} className="text-indigo-500 shrink-0" />
                                    <span className="truncate">{loc.name}</span>
                                  </div>
                                ) : isNoRad ? (
                                  <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100 shrink-0" title="Bebas presensi di mana saja tanpa radius (Event)">
                                    <Globe size={11} className="text-purple-500 shrink-0" />
                                    <span>BEBAS: Tanpa Radius</span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 shrink-0" title="Bebas di outlet mana saja (dalam radius)">
                                    <Globe size={11} className="text-emerald-500 shrink-0" />
                                    <span>BEBAS: Radius</span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}

                  {/* Add shift button */}
                  <button
                    onClick={() => openShiftModal(div.id)}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-white border border-dashed border-gray-300 hover:border-gray-400 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors shadow-2xs"
                  >
                    <Plus size={14} />
                    Tambah Shift
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* FAB - Tambah Divisi */}
      <button
        onClick={() => openDivisionModal()}
        className="fixed bottom-24 right-5 w-14 h-14 bg-gray-900 hover:bg-gray-700 text-white rounded-2xl shadow-xl flex items-center justify-center transition-all active:scale-90 z-40"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ===== DIVISION MODAL ===== */}
      {isDivisionModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDivisionModal} />
          <div className="bg-white w-full max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-2xl relative z-10 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-bold text-gray-900">
                {editingDivision ? 'Edit Divisi' : 'Tambah Divisi'}
              </h3>
              <button 
                type="button" 
                onClick={closeDivisionModal} 
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitDivision} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Nama Divisi / Jabatan *
                  </label>
                  <input
                    type="text"
                    required
                    value={divName}
                    onChange={e => setDivName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                    placeholder="Misal: Kasir, Dapur, Logistik..."
                  />
                </div>
              </div>
              <div className="p-4 bg-white border-t border-gray-100 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                <button 
                  type="submit" 
                  disabled={isSubmittingDiv}
                  className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center text-sm"
                >
                  {isSubmittingDiv
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : editingDivision ? 'Simpan Perubahan' : 'Buat Divisi'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== SHIFT MODAL ===== */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeShiftModal} />
          <div className="bg-white w-full max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-2xl relative z-10 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-bold text-gray-900">
                {editingShift ? 'Edit Shift' : 'Tambah Shift'}
              </h3>
              <button 
                type="button" 
                onClick={closeShiftModal} 
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitShift} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Kode Shift *
                  </label>
                  <input
                    type="text"
                    required
                    value={shiftName}
                    onChange={e => setShiftName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900"
                    placeholder="Misal: Pagi, S1, K1, atau OFF..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Keterangan Shift (Opsional)
                  </label>
                  <input
                    type="text"
                    value={shiftDesc}
                    onChange={e => setShiftDesc(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900"
                    placeholder="Misal: Shift Pagi, Lodan Shift 1, Libur Kerja..."
                  />
                </div>

                {/* Jam Masuk & Jam Pulang + Durasi Bidirectional */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Jam Masuk & Jam Pulang *
                  </label>
                  <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 mb-1">Jam Masuk</label>
                      <input
                        type="time"
                        required
                        value={checkInTime}
                        onChange={e => {
                          const val = e.target.value;
                          setCheckInTime(val);
                          // Jika ada durasi → auto hitung jam pulang
                          if (workDurationHours !== '' && val) {
                            setCheckOutTime(calcCheckOut(val, Number(workDurationHours)));
                          } else if (val && checkOutTime) {
                            // Jika ada jam pulang → auto hitung durasi
                            setWorkDurationHours(calcDuration(val, checkOutTime));
                          }
                        }}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-semibold text-gray-900 text-center focus:ring-2 focus:ring-gray-900 focus:bg-white box-border transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 mb-1">Jam Pulang</label>
                      <input
                        type="time"
                        required
                        value={checkOutTime}
                        onChange={e => {
                          const val = e.target.value;
                          setCheckOutTime(val);
                          // Auto hitung durasi dari In + Out
                          if (checkInTime && val) {
                            setWorkDurationHours(calcDuration(checkInTime, val));
                          }
                        }}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-semibold text-gray-900 text-center focus:ring-2 focus:ring-gray-900 focus:bg-white box-border transition-all"
                      />
                    </div>
                  </div>

                  {/* Durasi Jam Kerja */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                        ⏱ Durasi Jam Kerja
                      </label>
                      {workDurationHours !== '' && (
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                          {Number(workDurationHours) === Math.floor(Number(workDurationHours))
                            ? `${workDurationHours} jam`
                            : `${Math.floor(Number(workDurationHours))} jam ${Math.round((Number(workDurationHours) % 1) * 60)} mnt`}
                        </span>
                      )}
                    </div>
                    <select
                      value={workDurationHours}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setWorkDurationHours(val);
                        // Auto hitung Jam Pulang dari Jam Masuk + Durasi
                        if (val !== '' && checkInTime) {
                          setCheckOutTime(calcCheckOut(checkInTime, Number(val)));
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl outline-none text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
                    >
                      <option value="">— Pilih atau isi jam masuk & pulang —</option>
                      {[0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11,11.5,12,13,14,15,16,17,18,19,20,21,22,23,24].map(h => (
                        <option key={h} value={h}>
                          {Number.isInteger(h) ? `${h} jam` : `${Math.floor(h)} jam 30 mnt`}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-indigo-500 leading-relaxed">
                      💡 Isi <strong>Jam Masuk + Jam Pulang</strong> → durasi otomatis terhitung. Atau pilih <strong>Durasi</strong> + isi Jam Masuk → Jam Pulang otomatis muncul.
                    </p>
                  </div>
                </div>

                {/* Tombol Cepat: Set Libur/OFF & Set Event */}
                <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">💡</span>
                    <span className="font-bold text-[11px] text-amber-900">Pintasan Cepat:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCheckInTime('00:00');
                        setCheckOutTime('00:00');
                        setWorkDurationHours(0);
                        if (!shiftName) setShiftName('OFF');
                        if (!shiftDesc) setShiftDesc('Libur Kerja');
                        setShiftLocationMode('NO_RADIUS');
                        setShiftLocationId('');
                      }}
                      className="w-full py-2 px-1.5 bg-amber-200/90 hover:bg-amber-300 text-amber-950 font-bold rounded-lg text-[11px] transition-colors active:scale-95 text-center truncate"
                    >
                      ⚡ Set OFF (00:00)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCheckInTime('00:00');
                        setCheckOutTime('23:59');
                        setWorkDurationHours('');
                        if (!shiftName) setShiftName('EVENT');
                        if (!shiftDesc) setShiftDesc('Event / Acara');
                        setShiftLocationMode('NO_RADIUS');
                        setShiftLocationId('');
                      }}
                      className="w-full py-2 px-1.5 bg-purple-200 hover:bg-purple-300 text-purple-950 font-bold rounded-lg text-[11px] transition-colors active:scale-95 text-center truncate"
                    >
                      🎪 Set Event (Fleksibel)
                    </button>
                  </div>
                </div>

                {/* Aturan Lokasi Presensi: Dropdown Bersih Terkelompok */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Aturan Lokasi Presensi *
                  </label>
                  <div className="relative">
                    <select
                      value={shiftLocationMode}
                      onChange={e => {
                        const val = e.target.value;
                        setShiftLocationMode(val);
                        if (val === 'ANY_RADIUS' || val === 'NO_RADIUS') {
                          setShiftLocationId('');
                        } else {
                          setShiftLocationId(val);
                        }
                      }}
                      className="w-full px-3.5 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs sm:text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer pr-10"
                    >
                      <optgroup label="── BEBAS ──">
                        <option value="ANY_RADIUS">1. RADIUS (Bisa di outlet mana saja)</option>
                        <option value="NO_RADIUS">2. TANPA RADIUS (Bisa di mana saja)</option>
                      </optgroup>
                      {locations.length > 0 && (
                        <optgroup label="── OUTLET KHUSUS ──">
                          {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>
                              📍 {loc.name} (Radius {loc.radius}m)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="mt-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-[11px] text-gray-600 leading-relaxed">
                    {shiftLocationMode === 'NO_RADIUS' ? (
                      <p>
                        🚀 <strong>2. TANPA RADIUS:</strong> Karyawan bebas presensi di mana saja (tempat event / dinas luar) tanpa dibatasi radius.
                      </p>
                    ) : shiftLocationMode === 'ANY_RADIUS' ? (
                      <p>
                        🏢 <strong>1. RADIUS:</strong> Karyawan bebas presensi di outlet mana saja (In di A, Out di B) asalkan dalam radius outlet tersebut.
                      </p>
                    ) : (
                      <p>
                        📍 <strong>OUTLET KHUSUS:</strong> Karyawan wajib berada dalam radius outlet yang dipilih saat presensi.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Pinned Bottom Action Button */}
              <div className="p-4 bg-white border-t border-gray-100 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                <button 
                  type="submit" 
                  disabled={isSubmittingShift}
                  className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center text-sm"
                >
                  {isSubmittingShift
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : editingShift ? 'Simpan Shift' : 'Tambah Shift'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DivisionManagement;
