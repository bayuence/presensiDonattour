import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Image, Video, TrendingUp, Eye } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

const formatTitik = (n: number) => Math.round(n).toLocaleString('id-ID');
const parseTitik = (val: string) => Number(val.replace(/\D/g, '')) || 0;
const formatRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

export default function KontenAtur() {
  const [feeVideo, setFeeVideo] = useState(5000);
  const [feeFoto, setFeeFoto] = useState(2500);
  const [fypBonusPer10k, setFypBonusPer10k] = useState(25000);
  const [fypMinViews, setFypMinViews] = useState(10000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fypRatePerView = fypBonusPer10k / 10000;

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/fee-settings`);
      const data = await res.json();
      if (data.success && data.settings) {
        setFeeVideo(data.settings.feeVideo);
        setFeeFoto(data.settings.feeFoto);
        setFypBonusPer10k(Math.round((data.settings.fypRatePerView ?? 2.5) * 10000));
        setFypMinViews(data.settings.fypMinViews ?? 0);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/fee-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feeVideo,
          feeFoto,
          fypRatePerView,
          fypMinViews,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <RefreshCw size={24} className="animate-spin text-purple-500" />
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-purple-100 rounded-xl text-purple-600 shrink-0">
          <Settings size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Pengaturan Fee Konten</h1>
          <p className="text-xs text-gray-500">Perubahan langsung berlaku untuk input berikutnya</p>
        </div>
      </div>

      {/* Fee Konten */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-gradient-to-r from-orange-50 to-yellow-50 border-b border-gray-100">
          <p className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">Fee Per Konten</p>
        </div>
        <div className="p-4 space-y-4">
          {/* Video */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-blue-100 rounded-lg text-blue-600">
                <Video size={14} />
              </div>
              <label className="text-xs font-bold text-gray-700">Fee Video</label>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatTitik(feeVideo)}
                onChange={e => setFeeVideo(parseTitik(e.target.value))}
                className="w-full border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Foto */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-pink-100 rounded-lg text-pink-600">
                <Image size={14} />
              </div>
              <label className="text-xs font-bold text-gray-700">Fee Foto</label>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatTitik(feeFoto)}
                onChange={e => setFeeFoto(parseTitik(e.target.value))}
                className="w-full border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fee FYP */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-gradient-to-r from-rose-50 to-pink-50 border-b border-gray-100">
          <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Fee FYP / Viral</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-rose-100 rounded-lg text-rose-600">
                <TrendingUp size={14} />
              </div>
              <label className="text-xs font-bold text-gray-700">Bonus per 10.000 Views</label>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatTitik(fypBonusPer10k)}
                onChange={e => setFypBonusPer10k(parseTitik(e.target.value))}
                className="w-full border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
            <p className="text-[11px] text-gray-500">
              10.000 views = <span className="font-bold text-rose-600">{formatRp(fypBonusPer10k)}</span> (kelipatan berlaku otomatis)
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-indigo-100 rounded-lg text-indigo-600">
                <Eye size={14} />
              </div>
              <label className="text-xs font-bold text-gray-700">Minimum Views FYP</label>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={formatTitik(fypMinViews)}
              onChange={e => setFypMinViews(parseTitik(e.target.value))}
              placeholder="0"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-[11px] text-gray-400">
              {fypMinViews === 0
                ? 'Tidak ada batas minimum views untuk FYP'
                : `Minimal ${formatTitik(fypMinViews)} views baru dihitung FYP`}
            </p>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-2xl p-4 space-y-2 text-xs border border-gray-100 shadow-sm">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Simulasi Perhitungan</p>
        <div className="flex justify-between gap-2 text-gray-700">
          <span>Video biasa</span>
          <span className="font-bold whitespace-nowrap">{formatRp(feeVideo)}</span>
        </div>
        <div className="flex justify-between gap-2 text-gray-700">
          <span>Foto biasa</span>
          <span className="font-bold whitespace-nowrap">{formatRp(feeFoto)}</span>
        </div>
        <div className="flex justify-between gap-2 text-gray-700">
          <span>Video + FYP 10.000 views (1×)</span>
          <span className="font-bold text-green-700 whitespace-nowrap">{formatRp(feeVideo + fypBonusPer10k)}</span>
        </div>
        <div className="flex justify-between gap-2 text-gray-700">
          <span>Video + FYP 20.000 views (2×)</span>
          <span className="font-bold text-green-700 whitespace-nowrap">{formatRp(feeVideo + 2 * fypBonusPer10k)}</span>
        </div>
        <div className="flex justify-between gap-2 text-gray-700">
          <span>Foto + FYP 10.000 views (1×)</span>
          <span className="font-bold text-green-700 whitespace-nowrap">{formatRp(feeFoto + fypBonusPer10k)}</span>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all shadow-sm ${
          saved ? 'bg-green-500 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'
        } disabled:opacity-50`}
      >
        {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
        {saved ? 'Tersimpan!' : saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
      </button>
    </div>
  );
}
