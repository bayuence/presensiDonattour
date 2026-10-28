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
  const [shiftLocationId, setShiftLocationId] = useState('');
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
    setShiftDesc(shift?.description || '');
    setCheckInTime(shift?.checkInTime || '07:00');
    setCheckOutTime(shift?.checkOutTime || '16:00');
    setShiftLocationId(shift?.locationId || '');
    setIsShiftModalOpen(true);
  };

  const closeShiftModal = () => {
    setIsShiftModalOpen(false);
    setEditingShift(null);
    setShiftName(''); setShiftDesc(''); setCheckInTime(''); setCheckOutTime(''); setShiftLocationId('');
  };

  const submitShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftName.trim() || !checkInTime || !checkOutTime) {
      return alert('Mohon lengkapi kode shift, jam masuk, dan jam pulang');
    }
    setIsSubmittingShift(true);
    try {
      const url = editingShift ? `/api/shifts/${editingShift.id}` : '/api/shifts';
      const body = editingShift
        ? { name: shiftName.trim(), description: shiftDesc.trim() || null, checkInTime, checkOutTime, locationId: shiftLocationId || null }
        : { name: shiftName.trim(), description: shiftDesc.trim() || null, checkInTime, checkOutTime, divisionId: shiftDivisionId, locationId: shiftLocationId || null };
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
      }
      else alert(data.error || 'Gagal menyimpan shift');
    } catch { alert('Terjadi kesalahan saat menyimpan shift'); }
    finally { setIsSubmittingShift(false); }
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
            <div key={div.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Division row */}
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Briefcase size={18} className="text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{div.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5" translate="no">
                    {div.shifts.length === 0
                      ? 'Belum ada Shift'
                      : `${div.shifts.length} Shift`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setExpandedId(expandedId === div.id ? null : div.id)}
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                    {expandedId === div.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button onClick={() => openDivisionModal(div)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => deleteDivision(div.id, div.name)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Expanded: shifts list */}
              {expandedId === div.id && (
                <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3" translate="no">Daftar Shift</p>

                  {div.shifts.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">Belum ada shift — tambah shift di bawah</p>
                  ) : (
                    [...div.shifts]
                      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id', { numeric: true, sensitivity: 'base' }))
                      .map(shift => {
                      const loc = shift.location || locations.find(l => l.id === shift.locationId);
                      const isOffShift = isOff(shift);
                      return (
                        <div key={shift.id} className="flex items-center justify-between bg-gray-50/80 hover:bg-gray-100/70 border border-gray-100 rounded-xl px-3.5 py-3 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isOffShift ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'} font-black text-xs`}>
                              {shift.name}
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-gray-900">{shift.name}</span>
                                {shift.description && shift.description !== shift.name && (
                                  <span className="text-xs font-semibold text-gray-500">
                                    • {shift.description}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                                {isOffShift ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                    🏖️ Libur Kerja (Tidak Perlu Absen)
                                  </span>
                                ) : (
                                  <>
                                    <span className="flex items-center gap-1 font-medium text-gray-600">
                                      <Clock size={12} className="text-gray-400" />
                                      {`${shift.checkInTime} – ${shift.checkOutTime}`}
                                    </span>
                                    <span className="text-gray-300">•</span>
                                    {loc ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                        <MapPin size={11} className="text-indigo-500" />
                                        {loc.name}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                        <Globe size={11} className="text-emerald-500" />
                                        Bebas Absen
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button onClick={() => openShiftModal(div.id, shift)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteShift(shift.id, shift.name)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Add shift button */}
                  <button
                    onClick={() => openShiftModal(div.id)}
                    className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Jam Masuk *</label>
                    <input
                      type="time"
                      required
                      value={checkInTime}
                      onChange={e => setCheckInTime(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Jam Pulang *</label>
                    <input
                      type="time"
                      required
                      value={checkOutTime}
                      onChange={e => setCheckOutTime(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>

                {/* Peringatan kecil untuk shift Libur/OFF */}
                <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
                  <span className="text-sm shrink-0 mt-0.5">💡</span>
                  <p className="leading-relaxed text-[11px] text-amber-800">
                    <strong>Tips:</strong> Jika ingin membuat shift <strong>Libur / OFF</strong>, cukup buatkan nama/kode (misal: <code>OFF</code>) lalu jam masuk dan jam pulangnya diset ke <strong>00:00 – 00:00</strong>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Outlet / Lokasi (Opsional)</label>
                  <div className="relative">
                    <select
                      value={shiftLocationId}
                      onChange={e => setShiftLocationId(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer pr-10"
                    >
                      <option value="">Bebas Absen Di Mana Saja (Tanpa Radius)</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
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
