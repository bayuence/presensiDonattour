import { useState, useEffect } from 'react';
import { RefreshCw, Video, Image, Flame, Trophy, Download, Search, ExternalLink, Pencil, Trash2, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export interface HariItem {
  id: string;
  tanggal: string;
  platform: string;
  jenis: string;
  link: string;
  feeKonten: number;
  isFyp: boolean;
  views: number | null;
  feeFyp: number;
  totalFee: number;
  catatan: string | null;
}

export interface HariData {
  konten: number;
  fyp: boolean;
  jenis: string;
  platform: string;
  items: HariItem[];
}

export interface UserRekap {
  userId: string;
  nama: string;
  divisi: string;
  totalKonten: number;
  totalFoto: number;
  totalVideo: number;
  totalFyp: number;
  totalViews: number;
  totalFeeKonten: number;
  totalFeeFyp: number;
  totalFee: number;
  harian: Record<number, HariData>;
}

const medals = ['🥇', '🥈', '🥉'];
const formatRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const formatTitik = (val: string) => {
  const num = Number(val.replace(/\D/g, '')) || 0;
  return num === 0 ? '' : num.toLocaleString('id-ID');
};
const parseTitik = (val: string) => Number(val.replace(/\D/g, '')) || 0;

export default function KontenRekapView({ isAdmin = false }: { isAdmin?: boolean }) {
  const { user } = useAuth();
  const nowDate = new Date();
  const [bulan, setBulan] = useState(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState<UserRekap[]>([]);
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [selectedCell, setSelectedCell] = useState<{ nama: string; divisi: string; day: number; items: HariItem[] } | null>(null);
  const [editingItem, setEditingItem] = useState<HariItem | null>(null);
  const [editForm, setEditForm] = useState({ tanggal: '', platform: 'TIKTOK', jenis: 'VIDEO', link: '', catatan: '', isFyp: false, viewsStr: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchRekap = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/konten/rekap?bulan=${bulan}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setDaysInMonth(json.daysInMonth);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchRekap(); }, [bulan]);

  const filteredData = data.filter(u => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.nama.toLowerCase().includes(q) || u.divisi.toLowerCase().includes(q);
  });

  const exportCsv = () => {
    const header = ['No', 'Nama', 'Divisi', 'Total Konten', 'Video', 'Foto', 'FYP', 'Total Views', 'Fee Konten', 'Fee FYP', 'Total Pendapatan'];
    const rows = filteredData.map((u, i) => [
      i + 1, `"${u.nama}"`, `"${u.divisi}"`, u.totalKonten, u.totalVideo, u.totalFoto,
      u.totalFyp, u.totalViews, u.totalFeeKonten, u.totalFeeFyp, u.totalFee,
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `rekap-konten-${bulan}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const openEdit = (item: HariItem) => {
    setEditingItem(item);
    setEditForm({
      tanggal: item.tanggal,
      platform: item.platform,
      jenis: item.jenis,
      link: item.link,
      catatan: item.catatan ?? '',
      isFyp: item.isFyp,
      viewsStr: item.views ? item.views.toLocaleString('id-ID') : '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${API}/api/konten/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tanggal: editForm.tanggal,
          platform: editForm.platform,
          jenis: editForm.jenis,
          link: editForm.link,
          catatan: editForm.catatan,
          isFyp: editForm.isFyp,
          views: editForm.isFyp ? parseTitik(editForm.viewsStr) : 0,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEditingItem(null);
        setSelectedCell(null);
        fetchRekap();
      }
    } catch (e) { console.error(e); }
    setSavingEdit(false);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Hapus konten ini?')) return;
    try {
      await fetch(`${API}/api/konten/${id}`, { method: 'DELETE' });
      setSelectedCell(null);
      fetchRekap();
    } catch (e) { console.error(e); }
  };

  const totalFeeAll = data.reduce((s, u) => s + u.totalFee, 0);
  const totalKontenAll = data.reduce((s, u) => s + u.totalKonten, 0);
  const totalFypAll = data.reduce((s, u) => s + u.totalFyp, 0);
  const activePerformers = data.filter(u => u.totalKonten > 0);
  const myRekap = data.find(u => u.userId === user?.id);

  const summaryKonten = isAdmin ? totalKontenAll : (myRekap?.totalKonten ?? 0);
  const summaryFyp = isAdmin ? totalFypAll : (myRekap?.totalFyp ?? 0);
  const summaryFee = isAdmin ? totalFeeAll : (myRekap?.totalFee ?? 0);

  return (
    <div className="p-4 space-y-4 w-full min-w-0">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-yellow-100 rounded-xl text-yellow-600 shrink-0">
            <Trophy size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Rekap Konten</h1>
            <p className="text-xs text-gray-500 truncate">
              {isAdmin ? 'Klik tanggal di tabel untuk edit atau tandai FYP' : 'Yuk berlomba kirimkan konten terbaik kamu! 🚀'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={bulan}
            onChange={e => setBulan(e.target.value)}
            className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          {isAdmin && (
            <button
              onClick={exportCsv}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors shrink-0"
            >
              <Download size={14} /> CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-1.5">
        {!isAdmin && user && (
          <p className="text-xs font-bold text-sky-700 px-0.5 truncate">
            Ringkasan Saya ({user.name})
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div className={`rounded-2xl p-2.5 border shadow-sm text-center min-w-0 ${!isAdmin ? 'bg-sky-50/70 border-sky-100' : 'bg-white border-gray-100'}`}>
            <p className="text-xl font-black text-blue-600 leading-tight">{summaryKonten}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{isAdmin ? 'Total Konten' : 'Konten Saya'}</p>
          </div>
          <div className={`rounded-2xl p-2.5 border shadow-sm text-center min-w-0 ${!isAdmin ? 'bg-sky-50/70 border-sky-100' : 'bg-white border-gray-100'}`}>
            <p className="text-xl font-black text-orange-500 leading-tight">{summaryFyp}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{isAdmin ? '🔥 Total FYP' : '🔥 FYP Saya'}</p>
          </div>
          <div className={`rounded-2xl p-2.5 border shadow-sm text-center min-w-0 ${!isAdmin ? 'bg-sky-50/70 border-sky-100' : 'bg-white border-gray-100'}`}>
            <p className="text-sm font-black text-green-600 leading-tight truncate pt-0.5">{formatRp(summaryFee)}</p>
            <p className="text-[11px] text-gray-500 mt-1 leading-tight">{isAdmin ? 'Total Fee' : 'Pendapatan'}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw size={24} className="animate-spin text-yellow-500" />
        </div>
      ) : (
        <>
          {/* Top 3 Podium — rapi & aman di layar sempit */}
          {activePerformers.length >= 3 && (
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-3 border border-yellow-100 overflow-hidden">
              <p className="text-[11px] font-bold text-yellow-700 uppercase tracking-wider mb-3 text-center">🏆 Top Performer</p>
              <div className="grid grid-cols-3 gap-2 items-end">
                {/* #2 */}
                <div className="bg-white/90 border border-gray-100 rounded-2xl p-2.5 text-center min-w-0 overflow-hidden">
                  <p className="text-xl leading-none mb-1.5">🥈</p>
                  <p className="text-xs font-bold text-gray-900 truncate">{activePerformers[1].nama}</p>
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{activePerformers[1].divisi}</p>
                  <p className="text-[11px] font-black text-blue-600 mt-1.5">{activePerformers[1].totalKonten} konten</p>
                  {activePerformers[1].totalFyp > 0 && (
                    <p className="text-[10px] text-orange-500 font-semibold mt-0.5">🔥 {activePerformers[1].totalFyp} FYP</p>
                  )}
                </div>

                {/* #1 */}
                <div className="bg-yellow-500 rounded-2xl px-2 py-3.5 text-center shadow-md shadow-yellow-200 min-w-0 overflow-hidden">
                  <p className="text-2xl leading-none mb-1.5">🥇</p>
                  <p className="text-xs font-black text-white truncate">{activePerformers[0].nama}</p>
                  <p className="text-[10px] text-yellow-100 truncate mt-0.5">{activePerformers[0].divisi}</p>
                  <p className="text-[11px] font-black text-white mt-1.5">{activePerformers[0].totalKonten} konten</p>
                  {activePerformers[0].totalFyp > 0 && (
                    <p className="text-[10px] text-yellow-100 font-semibold mt-0.5">🔥 {activePerformers[0].totalFyp} FYP</p>
                  )}
                </div>

                {/* #3 */}
                <div className="bg-orange-100/80 border border-orange-200/60 rounded-2xl p-2.5 text-center min-w-0 overflow-hidden">
                  <p className="text-xl leading-none mb-1.5">🥉</p>
                  <p className="text-xs font-bold text-gray-900 truncate">{activePerformers[2].nama}</p>
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">{activePerformers[2].divisi}</p>
                  <p className="text-[11px] font-black text-blue-600 mt-1.5">{activePerformers[2].totalKonten} konten</p>
                  {activePerformers[2].totalFyp > 0 && (
                    <p className="text-[10px] text-orange-500 font-semibold mt-0.5">🔥 {activePerformers[2].totalFyp} FYP</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Filter Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama atau divisi..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          {/* Tabel Lengkap 1 Bulan */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden w-full">
            <div className="px-3.5 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-gray-800">
                Tabel Tracking Konten ({filteredData.length} akun)
              </p>
              <span className="text-[10px] text-gray-400">Geser ke kanan →</span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-center px-2 py-2.5 font-bold text-gray-500 w-7">#</th>
                    <th className="text-left px-2.5 py-2.5 font-bold text-gray-700 min-w-[105px] max-w-[130px] sticky left-0 bg-gray-50 z-10 border-r border-gray-100">Nama</th>
                    <th className="text-left px-2.5 py-2.5 font-bold text-gray-600 min-w-[85px] max-w-[110px]">Divisi</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                      <th key={d} className="text-center px-1 py-2.5 font-bold text-gray-400 min-w-[26px]">{d}</th>
                    ))}
                    <th className="text-center px-2 py-2.5 font-bold text-gray-700 whitespace-nowrap">Total</th>
                    <th className="text-center px-1.5 py-2.5 font-bold text-blue-600"><Video size={12} className="inline" /></th>
                    <th className="text-center px-1.5 py-2.5 font-bold text-pink-600"><Image size={12} className="inline" /></th>
                    <th className="text-center px-1.5 py-2.5 font-bold text-orange-500"><Flame size={12} className="inline" /></th>
                    <th className="text-right px-3 py-2.5 font-bold text-green-700 whitespace-nowrap min-w-[95px]">Pendapatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredData.map((u, idx) => {
                    const isSelf = user?.id === u.userId;
                    const isSelectedFriend = selectedUserId === u.userId && !isSelf;
                    const rowBg = isSelf
                      ? 'bg-sky-100/80 hover:bg-sky-100'
                      : isSelectedFriend
                        ? 'bg-gray-200/80 hover:bg-gray-200'
                        : u.totalKonten === 0
                          ? 'opacity-70 hover:bg-gray-50'
                          : idx < 3
                            ? 'bg-yellow-50/30 hover:bg-yellow-50/50'
                            : 'hover:bg-gray-50';
                    const stickyBg = isSelf
                      ? 'bg-sky-100'
                      : isSelectedFriend
                        ? 'bg-gray-200'
                        : idx < 3 && u.totalKonten > 0
                          ? 'bg-amber-50/40'
                          : 'bg-white';

                    return (
                      <tr
                        key={u.userId}
                        onClick={() => setSelectedUserId(prev => prev === u.userId ? null : u.userId)}
                        className={`transition-colors cursor-pointer ${rowBg}`}
                      >
                        <td className="text-center px-2 py-2">
                          {u.totalKonten > 0 && idx < 3 ? (
                            <span className="text-sm">{medals[idx]}</span>
                          ) : (
                            <span className="text-gray-400 font-bold text-[11px]">{idx + 1}</span>
                          )}
                        </td>
                        <td className={`px-2.5 py-2 font-bold text-gray-900 sticky left-0 z-10 border-r border-gray-100 max-w-[130px] ${stickyBg}`}>
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="truncate">{u.nama}</span>
                            {isSelf && (
                              <span className="text-[8px] bg-sky-600 text-white px-1 py-0.5 rounded font-black uppercase shrink-0">Anda</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-gray-600 max-w-[110px] truncate">{u.divisi}</td>

                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                          const hari = u.harian[d];
                          return (
                            <td key={d} className="text-center px-0.5 py-2">
                              {hari ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedUserId(u.userId);
                                    setSelectedCell({ nama: u.nama, divisi: u.divisi, day: d, items: hari.items });
                                  }}
                                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black transition-transform hover:scale-110 cursor-pointer ${
                                    hari.fyp
                                      ? 'bg-orange-500 text-white shadow-xs'
                                      : hari.jenis === 'VIDEO'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-pink-400 text-white'
                                  }`}
                                  title={`Klik untuk lihat detail tanggal ${d}`}
                                >
                                  {hari.fyp ? '🔥' : hari.jenis === 'VIDEO' ? 'V' : 'F'}
                                </button>
                              ) : (
                                <span className={`inline-block w-4 h-4 rounded-full ${isSelf ? 'bg-sky-200/70' : isSelectedFriend ? 'bg-gray-300/80' : 'bg-gray-100'}`} />
                              )}
                            </td>
                          );
                        })}

                        <td className="text-center px-2 py-2 font-black text-gray-900">{u.totalKonten}</td>
                        <td className="text-center px-1.5 py-2 text-blue-600 font-bold">{u.totalVideo || '-'}</td>
                        <td className="text-center px-1.5 py-2 text-pink-500 font-bold">{u.totalFoto || '-'}</td>
                        <td className="text-center px-1.5 py-2 text-orange-500 font-bold">{u.totalFyp || '-'}</td>
                        <td className="text-right px-3 py-2 font-black text-green-700 whitespace-nowrap">{formatRp(u.totalFee)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={3} className="px-2.5 py-2.5 font-black text-gray-700 text-xs">TOTAL</td>
                    <td colSpan={daysInMonth} />
                    <td className="text-center px-2 py-2.5 font-black text-gray-900">{totalKontenAll}</td>
                    <td className="text-center px-1.5 py-2.5 text-blue-700 font-black">{data.reduce((s, u) => s + u.totalVideo, 0)}</td>
                    <td className="text-center px-1.5 py-2.5 text-pink-600 font-black">{data.reduce((s, u) => s + u.totalFoto, 0)}</td>
                    <td className="text-center px-1.5 py-2.5 text-orange-600 font-black">{totalFypAll}</td>
                    <td className="text-right px-3 py-2.5 font-black text-green-700 whitespace-nowrap">{formatRp(totalFeeAll)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Legend */}
            <div className="px-3.5 py-2.5 border-t border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 text-[11px] text-gray-500">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[8px] font-black">V</span>
                Video
              </div>
              <div className="flex items-center gap-1 text-[11px] text-gray-500">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-pink-400 text-white text-[8px] font-black">F</span>
                Foto
              </div>
              <div className="flex items-center gap-1 text-[11px] text-gray-500">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-white text-[8px]">🔥</span>
                FYP
              </div>
              <div className="flex items-center gap-1 text-[11px] text-gray-400">
                <span className="inline-block w-4 h-4 rounded-full bg-gray-100" />
                Kosong
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Detail Konten per Tanggal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedCell(null); setEditingItem(null); }}>
          <div className="bg-white rounded-2xl p-4 max-w-sm w-full shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
              <div className="min-w-0 pr-2">
                <h3 className="font-bold text-gray-900 truncate">{selectedCell.nama}</h3>
                <p className="text-xs text-gray-500 truncate">{selectedCell.divisi} • Tgl {selectedCell.day} ({bulan})</p>
              </div>
              <button onClick={() => { setSelectedCell(null); setEditingItem(null); }} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 shrink-0">
                <X size={18} />
              </button>
            </div>

            {editingItem ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-blue-600 uppercase">Edit Konten & Status FYP</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-bold text-gray-500 block mb-1">Tanggal</label>
                    <input type="date" value={editForm.tanggal} onChange={e => setEditForm(f => ({ ...f, tanggal: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-500 block mb-1">Platform</label>
                    <select value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white">
                      <option value="TIKTOK">🎵 TikTok</option>
                      <option value="INSTAGRAM">📸 Instagram</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">Jenis Konten</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['VIDEO', 'FOTO'] as const).map(j => (
                      <button key={j} type="button" onClick={() => setEditForm(f => ({ ...f, jenis: j }))}
                        className={`py-2 rounded-xl text-xs font-bold border ${
                          editForm.jenis === j ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'
                        }`}>
                        {j}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">Link Konten</label>
                  <input type="url" value={editForm.link} onChange={e => setEditForm(f => ({ ...f, link: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs" />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">Catatan</label>
                  <input type="text" value={editForm.catatan} onChange={e => setEditForm(f => ({ ...f, catatan: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs" />
                </div>

                <div className="bg-orange-50 rounded-xl p-3 space-y-2 border border-orange-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.isFyp} onChange={e => setEditForm(f => ({ ...f, isFyp: e.target.checked }))}
                      className="w-4 h-4 accent-orange-500" />
                    <span className="text-xs font-bold text-orange-700 flex items-center gap-1"><Flame size={14} /> Nyatakan Konten Ini FYP</span>
                  </label>
                  {editForm.isFyp && (
                    <div>
                      <label className="text-[11px] font-semibold text-orange-700 block mb-1">Jumlah Views</label>
                      <input type="text" inputMode="numeric"
                        value={editForm.viewsStr}
                        onChange={e => setEditForm(f => ({ ...f, viewsStr: formatTitik(e.target.value) }))}
                        placeholder="Contoh: 10.000"
                        className="w-full border border-orange-200 bg-white rounded-xl px-3 py-2 text-sm font-bold text-gray-900"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setEditingItem(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600">Batal</button>
                  <button type="button" onClick={handleSaveEdit} disabled={savingEdit}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50">
                    <Check size={14} /> {savingEdit ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedCell.items.map(item => (
                  <div key={item.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${item.jenis === 'VIDEO' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                          {item.jenis}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-gray-200 text-gray-700">
                          {item.platform === 'TIKTOK' ? '🎵 TikTok' : '📸 IG'}
                        </span>
                        {item.isFyp && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-600 flex items-center gap-1">
                            <Flame size={10} /> FYP
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-black text-green-700 whitespace-nowrap">{formatRp(item.totalFee)}</span>
                    </div>

                    <a href={item.link} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 break-all">
                      <ExternalLink size={12} className="shrink-0" /> {item.link}
                    </a>

                    {item.catatan && <p className="text-xs text-gray-500">Catatan: {item.catatan}</p>}

                    {item.isFyp && item.views && (
                      <p className="text-xs text-orange-600 font-semibold">
                        🔥 {item.views.toLocaleString('id-ID')} views (Bonus FYP: {formatRp(item.feeFyp)})
                      </p>
                    )}

                    {isAdmin && (
                      <div className="flex gap-2 pt-1 border-t border-gray-100">
                        <button onClick={() => openEdit(item)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold">
                          <Pencil size={12} /> Edit / Atur FYP
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)}
                          className="px-3 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
