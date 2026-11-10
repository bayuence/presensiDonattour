import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Trash2,
  Eye,
  X,
  RefreshCw,
  User,
  Search,
} from "lucide-react";

type LeaveRequestItem = {
  id: string;
  userId: string;
  requestDate: string;
  reason: string;
  photo: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    division?: { name: string } | null;
  };
};

const LeaveApprovalManagement = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);

  const isAdmin = (user?.role || "").toLowerCase() === "admin";

  const fetchAllRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leave-requests");
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests || []);
      }
    } catch (e) {
      console.error("Error loading leave requests:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAllRequests();
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setRequests((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status } : item))
        );
      } else {
        alert(data.error || "Gagal memperbarui status izin.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Hapus data pengajuan izin ini?")) return;
    setProcessingId(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setRequests((prev) => prev.filter((item) => item.id !== id));
      } else {
        alert(data.error || "Gagal menghapus pengajuan izin.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setProcessingId(null);
    }
  };

  const fmtDate = (d: string) => {
    try {
      const [y, m, dd] = d.split("-").map(Number);
      return new Date(y, m - 1, dd).toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "approved")
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} /> Disetujui
        </span>
      );
    if (status === "rejected")
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
          <XCircle size={12} /> Ditolak
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock size={12} /> Menunggu
      </span>
    );
  };

  const countPending = requests.filter((r) => r.status === "pending").length;
  const countApproved = requests.filter((r) => r.status === "approved").length;
  const countRejected = requests.filter((r) => r.status === "rejected").length;

  const filteredRequests = requests.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      (r.user?.name || "").toLowerCase().includes(q) ||
      (r.user?.division?.name || "").toLowerCase().includes(q) ||
      (r.reason || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-28 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-2 bg-indigo-600 w-full" />
        <div className="p-5 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText size={22} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-gray-900">Penerimaan Izin</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Kelola dan konfirmasi pengajuan izin karyawan beserta bukti foto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchAllRequests}
            disabled={loading}
            className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors shrink-0"
            title="Muat ulang"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-indigo-600" : ""} />
          </button>
        </div>
      </div>

      {/* Filter Tab Status */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("pending")}
          className={`p-2.5 rounded-xl border text-center transition-all ${
            statusFilter === "pending"
              ? "bg-amber-50 border-amber-300 text-amber-800 shadow-xs"
              : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="block text-base font-black">{countPending}</span>
          <span className="text-[10px] font-bold uppercase">Menunggu</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("approved")}
          className={`p-2.5 rounded-xl border text-center transition-all ${
            statusFilter === "approved"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs"
              : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="block text-base font-black">{countApproved}</span>
          <span className="text-[10px] font-bold uppercase">Disetujui</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("rejected")}
          className={`p-2.5 rounded-xl border text-center transition-all ${
            statusFilter === "rejected"
              ? "bg-red-50 border-red-300 text-red-800 shadow-xs"
              : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="block text-base font-black">{countRejected}</span>
          <span className="text-[10px] font-bold uppercase">Ditolak</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`p-2.5 rounded-xl border text-center transition-all ${
            statusFilter === "all"
              ? "bg-indigo-50 border-indigo-300 text-indigo-800 shadow-xs"
              : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="block text-base font-black">{requests.length}</span>
          <span className="text-[10px] font-bold uppercase">Semua</span>
        </button>
      </div>

      {/* Pencarian Nama / Divisi */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari nama karyawan, divisi, atau alasan izin..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Daftar Pengajuan Izin */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-10 flex flex-col items-center gap-2 text-gray-400">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
              <span className="text-xs font-medium">Memuat daftar pengajuan izin...</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2.5">
                <FileText size={22} className="text-gray-300" />
              </div>
              <p className="text-xs font-bold text-gray-600">
                Tidak ada pengajuan izin ditemukan
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Belum ada data yang sesuai dengan filter saat ini.
              </p>
            </div>
          ) : (
            filteredRequests.map((item) => {
              const busy = processingId === item.id;
              return (
                <div
                  key={item.id}
                  className="p-4 space-y-3 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <User size={13} className="text-indigo-500" />
                        <span className="text-sm font-extrabold text-gray-900">
                          {item.user?.name || "Karyawan"}
                        </span>
                        {item.user?.division?.name && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold">
                            {item.user.division.name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-indigo-600">
                        Tanggal Izin: {fmtDate(item.requestDate)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Diajukan:{" "}
                        {new Date(item.createdAt).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>

                  {/* Keterangan + Bukti Foto */}
                  <div className="flex items-start gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    {item.photo && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPhoto({
                            url: item.photo,
                            title: `${item.user?.name || "Karyawan"} — ${fmtDate(item.requestDate)}`,
                          })
                        }
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-black group"
                      >
                        <img
                          src={item.photo}
                          alt="Bukti Izin"
                          className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye size={16} className="text-white" />
                        </div>
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                        Keterangan Izin:
                      </p>
                      <p className="text-xs text-gray-800 font-medium break-words whitespace-pre-line">
                        {item.reason}
                      </p>
                      {item.photo && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewPhoto({
                              url: item.photo,
                              title: `${item.user?.name || "Karyawan"} — ${fmtDate(item.requestDate)}`,
                            })
                          }
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                        >
                          <Eye size={12} /> Lihat Foto Bukti
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tombol Aksi Admin */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      {item.status !== "approved" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleAction(item.id, "approved")}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-bold transition-all active:scale-95"
                        >
                          <CheckCircle2 size={14} /> Terima Izin
                        </button>
                      )}
                      {item.status !== "rejected" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleAction(item.id, "rejected")}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-xs font-bold transition-all active:scale-95"
                        >
                          <XCircle size={14} /> Tolak
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 text-xs font-semibold transition-colors"
                      title="Hapus pengajuan"
                    >
                      <Trash2 size={14} /> Hapus
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal Preview Foto */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-800 truncate">
                {previewPhoto.title}
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="bg-black max-h-[75vh] overflow-auto flex items-center justify-center">
              <img
                src={previewPhoto.url}
                alt="Bukti Izin"
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveApprovalManagement;

