import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Briefcase, Plus, Pencil, Trash2, X, Search, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Navigate } from 'react-router-dom';

type Shift = {
  id: string;
  name: string;
  checkInTime: string;
  checkOutTime: string;
  divisionId: string;
};

type Division = {
  id: string;
  name: string;
  shifts: Shift[];
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
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [isSubmittingShift, setIsSubmittingShift] = useState(false);

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchDivisions = async () => {
    try {
      const res = await fetch('/api/divisions');
      const data = await res.json();
      setDivisions(data.success ? data.divisions : []);
    } catch {
      setDivisions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDivisions(); }, []);

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
      if (data.success) { fetchDivisions(); closeDivisionModal(); }
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
    setCheckInTime(shift?.checkInTime || '');
    setCheckOutTime(shift?.checkOutTime || '');
    setIsShiftModalOpen(true);
  };

  const closeShiftModal = () => {
    setIsShiftModalOpen(false);
    setEditingShift(null);
    setShiftName(''); setCheckInTime(''); setCheckOutTime('');
  };

  const submitShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftName || !checkInTime || !checkOutTime) return alert('Semua field shift wajib diisi');
    setIsSubmittingShift(true);
    try {
      const url = editingShift ? `/api/shifts/${editingShift.id}` : '/api/shifts';
      const body = editingShift
        ? { name: shiftName, checkInTime, checkOutTime }
        : { name: shiftName, checkInTime, checkOutTime, divisionId: shiftDivisionId };
      const res = await fetch(url, {
        method: editingShift ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { fetchDivisions(); closeShiftModal(); }
      else alert(data.error || 'Gagal menyimpan shift');
    } catch { alert('Terjadi kesalahan'); }
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

  const filtered = divisions.filter(d =>
    d.name.toLowerCase().includes((search || '').toLowerCase())
  );

  return (
    <div className="px-4 pt-6 pb-28 max-w-lg mx-auto">

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
                    div.shifts.map(shift => (
                      <div key={shift.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock size={14} className="text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{shift.name}</p>
                            <p className="text-xs text-gray-500">{shift.checkInTime} – {shift.checkOutTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
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
                    ))
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
        <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDivisionModal} />
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl relative z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {editingDivision ? 'Edit Divisi' : 'Tambah Divisi'}
              </h3>
              <button onClick={closeDivisionModal} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitDivision} className="p-5 space-y-4">
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
              <div className="pt-1 pb-1">
                <button type="submit" disabled={isSubmittingDiv}
                  className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center">
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
        <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeShiftModal} />
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl relative z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {editingShift ? 'Edit Shift' : 'Tambah Shift'}
              </h3>
              <button onClick={closeShiftModal} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitShift} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Nama Shift *
                </label>
                <input
                  type="text"
                  required
                  value={shiftName}
                  onChange={e => setShiftName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900"
                  placeholder="Misal: Shift Pagi, Shift Malam..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Jam Masuk *</label>
                  <input type="time" required value={checkInTime} onChange={e => setCheckInTime(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Jam Pulang *</label>
                  <input type="time" required value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-900 focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              <div className="pt-1 pb-1">
                <button type="submit" disabled={isSubmittingShift}
                  className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center">
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
