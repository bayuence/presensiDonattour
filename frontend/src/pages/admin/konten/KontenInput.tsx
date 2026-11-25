import { useState, useEffect, useRef } from 'react';
import { Plus, Video, Image, TrendingUp, Trash2, RefreshCw, ExternalLink, Flame, Search, X, Check } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

interface User { id: string; name: string; division?: { name: string } }
interface KontenRecord {
  id: string; userId: string; tanggal: string; platform: string;
  jenis: string; link: string; feeKonten: number; isFyp: boolean;
  views?: number; feeFyp: number; totalFee: number; catatan?: string;
  user: { name: string; division?: { name: string } };
}

const formatTitik = (val: string) => {
  const num = Number(val.replace(/\D/g, '')) || 0;
  return num === 0 ? '' : num.toLocaleString('id-ID');
};
const parseTitik = (val: string) => Number(val.replace(/\D/g, '')) || 0;

export default function KontenInput() {
  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<KontenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    userId: '', tanggal: today, platform: '', jenis: '', link: '', catatan: '',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const [fypModal, setFypModal] = useState<{ open: boolean; recordId: string; views: string }>({
    open: false, recordId: '', views: '',
  });
  const [fypLoading, setFypLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const nowDate = new Date();
  const [bulan, setBulan] = useState(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/api/users`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users.filter((u: any) => u.role !== 'DELETED'));
      }
    } catch (e) { console.error(e); }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/konten?bulan=${bulan}`);
      const data = await res.json();
      if (data.success) setRecords(data.records);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { fetchRecords(); }, [bulan]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredUsers = users.filter(u => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || (u.division?.name ?? '').toLowerCase().includes(q);
  });

  const selectedUser = users.find(u => u.id === form.userId);

  const selectUser = (u: User) => {
    setForm(f => ({ ...f, userId: u.id }));
    setSearchQuery('');
    setShowDropdown(false);
    setHighlightIdx(0);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowDropdown(true);
      setHighlightIdx(i => Math.min(i + 1, Math.max(0, filteredUsers.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredUsers.length > 0) {
        const picked = filteredUsers[highlightIdx] || filteredUsers[0];
        selectUser(picked);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setShowDropdown(true);
    setHighlightIdx(0);
    const q = val.trim().toLowerCase();
    if (q) {
      const exact = users.filter(u => u.name.toLowerCase() === q);
      if (exact.length === 1) {
        setForm(f => ({ ...f, userId: exact[0].id }));
        setShowDropdown(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userId || !form.platform || !form.jenis || !form.link) return;
    setSubmitting(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${API}/api/konten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success && data.record) {
        if (form.tanggal.startsWith(bulan)) {
          setRecords(prev => [data.record, ...prev]);
        }
        setForm({ userId: '', tanggal: today, platform: '', jenis: '', link: '', catatan: '' });
        setSearchQuery('');
      } else {
        alert(data.error || 'Gagal menyimpan konten');
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.name === 'AbortError' ? 'Koneksi lambat/timeout, silakan coba lagi.' : 'Gagal terhubung ke server.');
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  };

  const handleFyp = async () => {
    const numViews = parseTitik(fypModal.views);
    if (!fypModal.recordId || numViews <= 0) return;
    setFypLoading(true);
    try {
      const res = await fetch(`${API}/api/konten/${fypModal.recordId}/fyp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ views: numViews }),
      });
      const data = await res.json();
      if (data.success && data.record) {
        setRecords(prev => prev.map(r => r.id === fypModal.recordId ? data.record : r));
        setFypModal({ open: false, recordId: '', views: '' });
      }
    } catch (e) { console.error(e); }
    setFypLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/konten/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setRecords(prev => prev.filter(r => r.id !== id));
      }
    } catch (e) { console.error(e); }
    setDeleteId(null);
  };

  const formatRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600 shrink-0">
          <Plus size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Input Konten</h1>
          <p className="text-xs text-gray-500">Konten yang diinput otomatis lolos cek SK</p>
        </div>
      </div>

      {/* Form Input */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3.5">
        <div ref={searchBoxRef} className="relative">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Nama Karyawan / Akun</label>

          {selectedUser ? (
            <div className="flex items-center justify-between gap-2 border-2 border-blue-500 bg-blue-50/50 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Check size={16} className="text-blue-600 shrink-0" />
                <span className="text-sm font-bold text-gray-900 truncate">{selectedUser.name}</span>
                {selectedUser.division && (
                  <span className="text-[11px] bg-white text-gray-600 px-2 py-0.5 rounded-md border border-gray-200 font-medium truncate max-w-[120px]">
                    {selectedUser.division.name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setForm(f => ({ ...f, userId: '' })); setShowDropdown(true); }}
                className="p-1 text-gray-400 hover:text-red-500 rounded-lg shrink-0"
                title="Ganti"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setShowDropdown(true)}
                onChange={e => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Ketik nama atau divisi, lalu Enter..."
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
            </div>
          )}

          {showDropdown && !selectedUser && (
            <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-30 divide-y divide-gray-50">
              {filteredUsers.length === 0 ? (
                <div className="p-3 text-xs text-gray-400 text-center">Akun tidak ditemukan</div>
              ) : (
                filteredUsers.map((u, idx) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUser(u)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 text-sm transition-colors ${
                      idx === highlightIdx ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <span className="truncate">{u.name}</span>
                    <span className="text-xs text-gray-400 font-normal flex items-center gap-1.5 shrink-0">
                      <span className="truncate max-w-[100px]">{u.division?.name ?? '-'}</span>
                      {idx === highlightIdx && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">Enter</span>}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Tanggal */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Tanggal Konten</label>
          <input
            type="date"
            value={form.tanggal}
            onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))}
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>

        {/* Platform */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
            Platform <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {(['TIKTOK', 'INSTAGRAM'] as const).map(p => (
              <button key={p} type="button"
                onClick={() => setForm(f => ({ ...f, platform: p }))}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                  form.platform === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300 bg-gray-50/50'
                }`}
              >
                <span className="text-base leading-none">{p === 'INSTAGRAM' ? '📸' : '🎵'}</span>
                <span>{p === 'TIKTOK' ? 'TikTok' : 'Instagram'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Jenis Konten */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
            Jenis Konten <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {(['VIDEO', 'FOTO'] as const).map(j => (
              <button key={j} type="button"
                onClick={() => setForm(f => ({ ...f, jenis: j }))}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  form.jenis === j
                    ? j === 'VIDEO' ? 'bg-blue-600 text-white border-blue-600' : 'bg-pink-500 text-white border-pink-500'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-gray-50/50'
                }`}
              >
                {j === 'VIDEO' ? <Video size={15} /> : <Image size={15} />}
                <span>{j}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Link */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Link Konten</label>
          <input
            ref={linkInputRef}
            type="url"
            value={form.link}
            onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
            placeholder="https://www.tiktok.com/..."
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Catatan */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Catatan (Opsional)</label>
          <input
            type="text"
            value={form.catatan}
            onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))}
            placeholder="Misal: konten promo Ramadan"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !form.userId || !form.platform || !form.jenis || !form.link}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all disabled:opacity-50"
        >
          {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
          <span>{submitting ? 'Menyimpan...' : 'Simpan Konten'}</span>
        </button>
      </form>

      {/* Daftar Konten Bulan Ini */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold text-gray-800">Konten Masuk</p>
          <input
            type="month"
            value={bulan}
            onChange={e => setBulan(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24">
            <RefreshCw size={20} className="animate-spin text-blue-400" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10">Belum ada konten di bulan ini</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {records.map(r => (
              <div key={r.id} className="p-3 flex items-start gap-2.5 hover:bg-gray-50 transition-colors">
                <div className={`p-2 rounded-xl shrink-0 ${r.jenis === 'VIDEO' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                  {r.jenis === 'VIDEO' ? <Video size={15} /> : <Image size={15} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 truncate max-w-[140px]">{r.user.name}</span>
                    {r.user.division && <span className="text-[11px] text-gray-400 truncate max-w-[90px]">{r.user.division.name}</span>}
                    {r.isFyp && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                        <Flame size={10} /> FYP
                      </span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${r.platform === 'TIKTOK' ? 'bg-gray-100 text-gray-700' : 'bg-purple-100 text-purple-700'}`}>
                      {r.platform === 'TIKTOK' ? '🎵 TikTok' : '📸 IG'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{r.tanggal}</p>
                  <a href={r.link} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5 truncate">
                    <ExternalLink size={11} className="shrink-0" />
                    <span className="truncate">{r.link}</span>
                  </a>
                  {r.isFyp && r.views !== undefined && r.views !== null && (
                    <p className="text-[11px] text-orange-600 font-semibold mt-0.5">
                      {r.views.toLocaleString('id-ID')} views • Fee FYP: {formatRp(r.feeFyp)}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <p className="text-xs font-bold text-green-600 whitespace-nowrap">{formatRp(r.totalFee)}</p>
                  <div className="flex gap-1 justify-end">
                    {!r.isFyp && (
                      <button
                        onClick={() => setFypModal({ open: true, recordId: r.id, views: '' })}
                        className="p-1.5 rounded-lg bg-orange-50 text-orange-500 hover:bg-orange-100 transition-colors"
                        title="Tandai FYP"
                      >
                        <TrendingUp size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteId(r.id)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FYP Modal */}
      {fypModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setFypModal({ open: false, recordId: '', views: '' })}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-xl text-orange-600"><Flame size={20} /></div>
              <div>
                <h3 className="font-bold text-gray-900">Input FYP</h3>
                <p className="text-xs text-gray-500">Masukkan jumlah penonton/views</p>
              </div>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={fypModal.views}
              onChange={e => setFypModal(m => ({ ...m, views: formatTitik(e.target.value) }))}
              placeholder="Contoh: 10.000"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setFypModal({ open: false, recordId: '', views: '' })}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              >Batal</button>
              <button
                onClick={handleFyp}
                disabled={fypLoading || !fypModal.views}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {fypLoading ? <RefreshCw size={14} className="animate-spin" /> : <Flame size={14} />}
                Simpan FYP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">Hapus Konten?</h3>
            <p className="text-sm text-gray-500 mb-4">Data konten ini akan dihapus permanen.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Batal</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
