import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { FileText, Calendar, Camera, Upload, CheckCircle2, XCircle, Clock, Loader2, Trash2, Eye, X, AlertCircle, Send, User } from "lucide-react";

type LeaveRequest = {
  id: string; userId: string; requestDate: string; reason: string; photo: string;
  status: "pending" | "approved" | "rejected"; adminNote?: string | null;
  createdAt: string;
  user?: { id: string; name: string; division?: { name: string } | null };
};

const LeaveRequestPage = () => {
  const { user } = useAuth();
  const isAdmin = (user?.role || "").toLowerCase() === "admin";
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [requestDate, setRequestDate] = useState(todayStr);
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"my" | "all">(isAdmin ? "all" : "my");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const fetchRequests = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const q = isAdmin && activeTab === "all" ? "" : `?userId=${user.id}`;
      const res = await fetch(`/api/leave-requests${q}`);
      const data = await res.json();
      if (data.success) setRequests(data.requests || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRequests(); }, [user?.id, activeTab]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErrorMsg("File harus berupa gambar."); return; }
    setErrorMsg(""); setCompressing(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        setPhoto(canvas.toDataURL("image/jpeg", 0.75));
        setCompressing(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(""); setSuccessMsg("");
    if (!requestDate) { setErrorMsg("Pilih tanggal izin terlebih dahulu."); return; }
    if (!reason.trim()) { setErrorMsg("Keterangan izin wajib diisi."); return; }
    if (!photo) { setErrorMsg("Bukti foto wajib disertakan."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user!.id, requestDate, reason: reason.trim(), photo }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Pengajuan izin berhasil dikirim!");
        setReason(""); setPhoto(null);
        fetchRequests();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else { setErrorMsg(data.error || "Gagal mengirim pengajuan."); }
    } catch { setErrorMsg("Terjadi kesalahan jaringan."); }
    finally { setSubmitting(false); }
  };

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch { alert("Gagal memperbarui status."); }
    finally { setProcessingId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Hapus pengajuan izin ini?")) return;
    setProcessingId(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) setRequests(prev => prev.filter(r => r.id !== id));
    } catch { alert("Gagal menghapus."); }
    finally { setProcessingId(null); }
  };

  const fmtDate = (d: string) => {
    try { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
    catch { return d; }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "approved") return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> Disetujui</span>;
    if (status === "rejected") return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200"><XCircle size={12} /> Ditolak</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock size={12} /> Menunggu</span>;
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-28 space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-2 bg-indigo-600 w-full" />
        <div className="p-5 flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><FileText size={22} /></div>
          <div>
            <h1 className="text-base font-extrabold text-gray-900">Pengajuan Izin</h1>
            <p className="text-xs text-gray-500 mt-0.5">Pilih tanggal, berikan keterangan, dan wajib lampirkan foto bukti.</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Form Ajukan Izin Baru</h2>
        {errorMsg && <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"><AlertCircle size={15} className="shrink-0 mt-0.5" />{errorMsg}</div>}
        {successMsg && <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold"><CheckCircle2 size={15} />{successMsg}</div>}

        {/* Tanggal */}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Tanggal Izin <span className="text-red-500">*</span></label>
          <div className="relative">
            <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none" />
            <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} required className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          </div>
          {requestDate && <p className="text-[11px] text-indigo-600 font-semibold mt-1 px-1">{fmtDate(requestDate)}</p>}
        </div>

        {/* Keterangan */}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Keterangan Izin <span className="text-red-500">*</span></label>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Tuliskan alasan izin secara jelas..." required className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none" />
        </div>

        {/* Foto */}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Bukti Foto <span className="text-red-500">* (Wajib)</span></label>
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          {compressing ? (
            <div className="border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-2xl p-6 flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-indigo-600" />
              <span className="text-xs font-semibold text-indigo-600">Memproses foto...</span>
            </div>
          ) : photo ? (
            <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-900">
              <img src={photo} alt="Preview" className="w-full max-h-56 object-contain mx-auto" />
              <div className="p-2.5 bg-white border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} /> Foto siap dilampirkan</span>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => fileRef.current?.click()} className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold">Ganti</button>
                  <button type="button" onClick={() => setPhoto(null)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 hover:border-indigo-300 bg-gray-50 rounded-2xl p-5 text-center">
              <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2.5"><Camera size={20} /></div>
              <p className="text-xs font-bold text-gray-700 mb-1">Lampirkan Foto Bukti</p>
              <p className="text-[11px] text-gray-400 mb-3">Surat dokter / bukti pendukung lainnya</p>
              <div className="flex items-center justify-center gap-2">
                <button type="button" onClick={() => camRef.current?.click()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold active:scale-95"><Camera size={14} /> Kamera</button>
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold active:scale-95"><Upload size={14} /> Galeri</button>
              </div>
            </div>
          )}
        </div>

        <button type="submit" disabled={submitting || compressing || !requestDate || !reason.trim() || !photo} className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] disabled:cursor-not-allowed">
          {submitting ? <><Loader2 size={18} className="animate-spin" /> Mengirim...</> : <><Send size={16} /> Kirim Pengajuan Izin</>}
        </button>
      </form>

      {/* Daftar Riwayat */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">{isAdmin && activeTab === "all" ? "Semua Pengajuan Izin" : "Riwayat Izin Saya"}</h2>
            {isAdmin && activeTab === "all" && pendingCount > 0 && <p className="text-[11px] text-amber-600 font-bold mt-0.5">{pendingCount} menunggu konfirmasi</p>}
          </div>
          {isAdmin && (
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold">
              {(["all", "my"] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-2.5 py-1 rounded-lg transition-all ${activeTab === tab ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>{tab === "all" ? "Semua" : "Milik Saya"}</button>
              ))}
            </div>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 flex flex-col items-center gap-2 text-gray-400"><Loader2 size={22} className="animate-spin text-indigo-500" /><span className="text-xs">Memuat...</span></div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center"><div className="w-11 h-11 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2"><FileText size={20} className="text-gray-300" /></div><p className="text-xs font-bold text-gray-500">Belum ada pengajuan izin</p></div>
          ) : requests.map(item => {
            const busy = processingId === item.id;
            return (
              <div key={item.id} className="p-4 space-y-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {isAdmin && activeTab === "all" && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <User size={12} className="text-indigo-500" />
                        <span className="text-xs font-extrabold text-gray-900">{item.user?.name || "Karyawan"}</span>
                        {item.user?.division?.name && <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-semibold">{item.user.division.name}</span>}
                      </div>
                    )}
                    <p className="text-xs font-bold text-indigo-600">{fmtDate(item.requestDate)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <div className="flex items-start gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  {item.photo && (
                    <button type="button" onClick={() => setPreviewPhoto(item.photo)} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-black group">
                      <img src={item.photo} alt="Bukti" className="w-full h-full object-cover group-hover:opacity-70 transition-opacity" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Eye size={16} className="text-white" /></div>
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Keterangan:</p>
                    <p className="text-xs text-gray-800 font-medium break-words">{item.reason}</p>
                    {item.photo && <button type="button" onClick={() => setPreviewPhoto(item.photo)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"><Eye size={12} /> Lihat Foto</button>}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {isAdmin && item.status === "pending" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => handleAction(item.id, "approved")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-bold"><CheckCircle2 size={13} /> Setujui</button>
                      <button type="button" disabled={busy} onClick={() => handleAction(item.id, "rejected")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-xs font-bold"><XCircle size={13} /> Tolak</button>
                    </>
                  )}
                  {(item.status === "pending" || isAdmin) && (
                    <button type="button" disabled={busy} onClick={() => handleDelete(item.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 text-xs font-semibold"><Trash2 size={13} /> Hapus</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewPhoto(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">Bukti Foto Izin</span>
              <button type="button" onClick={() => setPreviewPhoto(null)} className="p-1.5 rounded-lg bg-gray-100 text-gray-600"><X size={16} /></button>
            </div>
            <div className="bg-black max-h-[75vh] overflow-auto flex items-center justify-center">
              <img src={previewPhoto} alt="Bukti Izin" className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveRequestPage;
