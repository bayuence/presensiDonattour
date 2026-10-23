import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { Navigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Zap, RefreshCw, X,
  Users, Clock, CheckCircle, Info, Calendar,
  Download, Upload, FileSpreadsheet, AlertTriangle, Check
} from "lucide-react";
import * as XLSX from "xlsx";

type Shift = {
  id: string;
  name: string;
  description: string | null;
  checkInTime: string;
  checkOutTime: string;
  divisionId: string;
};
type Division = { id: string; name: string; shifts: Shift[] };
type UserItem = {
  id: string;
  name: string;
  divisionId: string | null;
  division: { id: string; name: string } | null;
};
type Schedule = {
  id: string;
  userId: string;
  shiftId: string;
  date: string;
  user: UserItem;
  shift: Shift;
};

const SHIFT_COLORS = [
  { bg: "#6366f1", light: "#eef2ff", text: "#4338ca", border: "#c7d2fe" },
  { bg: "#10b981", light: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
  { bg: "#f59e0b", light: "#fffbeb", text: "#92400e", border: "#fde68a" },
  { bg: "#ef4444", light: "#fef2f2", text: "#991b1b", border: "#fecaca" },
  { bg: "#8b5cf6", light: "#f5f3ff", text: "#5b21b6", border: "#ddd6fe" },
  { bg: "#06b6d4", light: "#ecfeff", text: "#155e75", border: "#a5f3fc" },
  { bg: "#f97316", light: "#fff7ed", text: "#9a3412", border: "#fed7aa" },
  { bg: "#14b8a6", light: "#f0fdfa", text: "#134e4a", border: "#99f6e4" },
];
const OFF_COLOR = { bg: "#6b7280", light: "#f3f4f6", text: "#374151", border: "#e5e7eb" };

const isOff = (s: Shift | { name?: string; description?: string | null; checkInTime?: string; checkOutTime?: string } | null | undefined) => {
  if (!s) return false;
  const isZeroHours = s.checkInTime === '00:00' && s.checkOutTime === '00:00';
  if (isZeroHours) return true;
  const name = (s.name || '').toUpperCase().trim();
  return (name === 'OFF' || name === 'LIBUR') && (!s.checkInTime || s.checkInTime === '00:00');
};
const getShiftCode = (s: Shift | null | undefined) => {
  if (!s || !s.name) return "";
  if (s.name.length <= 4) return s.name;
  if (s.description && s.description.length <= 4) return s.description;
  const upper = s.name.toUpperCase();
  if (upper.includes("LODAN") && upper.includes("1")) return "L1";
  if (upper.includes("LODAN") && upper.includes("2")) return "L2";
  if (upper.includes("K3PG") && upper.includes("1")) return "K1";
  if (upper.includes("K3PG") && upper.includes("2")) return "K2";
  if (upper.includes("OFF") || (s.checkInTime === "00:00" && s.checkOutTime === "00:00")) return "OFF";
  if (upper.includes("CFD")) return "CFD";
  return s.name.slice(0, 3).toUpperCase();
};
const toYM = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const toYMD = (d: Date, day: number) => `${toYM(d)}-${String(day).padStart(2, "0")}`;
const formatMonth = (d: Date) => d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const NUM = (s: React.CSSProperties): React.CSSProperties => ({
  background: "#6366f1", color: "#fff", borderRadius: "50%",
  width: 18, height: 18, display: "inline-flex", alignItems: "center",
  justifyContent: "center", fontSize: 10, fontWeight: 900,
  flexShrink: 0, ...s
});

// ── Module-level cache (tetap hidup selama SPA, bersih saat reload) ──
let _cachedDivisions: Division[] = [];
let _cachedUsers: UserItem[] = [];
let _cachedSchedules: Schedule[] = [];
let _cachedMonthKey = "";
let _cachedDivisionId = "";

const ScheduleManagement = () => {
  const { user: currentUser } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  // Inisialisasi state dari cache agar langsung tampil saat re-mount
  const [divisions, setDivisions] = useState<Division[]>(_cachedDivisions);
  const [users, setUsers] = useState<UserItem[]>(_cachedUsers);
  const [schedules, setSchedules] = useState<Schedule[]>(_cachedSchedules);
  const [selectedDivisionId, setSelectedDivisionId] = useState(_cachedDivisionId);
  // Hanya tampilkan loading jika cache kosong
  const [loading, setLoading] = useState(_cachedDivisions.length === 0);
  const [saving, setSaving] = useState("");
  const [autoModal, setAutoModal] = useState(false);
  const [autoOff, setAutoOff] = useState("4");
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  const [toast, setToast] = useState("");
  const [picker, setPicker] = useState<{ userId: string; date: string; userName: string } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── State Import Excel ──
  const [importModal, setImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<{
    schedules: { userId: string; shiftId: string; date: string }[];
    totalRows: number;
    matchedCount: number;
    unmatchedNames: string[];
    unmatchedCodes: string[];
    previewRows: { name: string; shifts: { day: number; code: string; valid: boolean }[] }[];
  } | null>(null);

  const monthKey = toYM(currentDate);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const selectedDiv = divisions.find((d) => d.id === selectedDivisionId) ?? null;
  const divUsers = selectedDivisionId ? users.filter((u) => u.divisionId === selectedDivisionId) : [];
  const divShifts = selectedDiv?.shifts ?? [];

  const colorMap: Record<string, typeof SHIFT_COLORS[0] | typeof OFF_COLOR> = {};
  let ci = 0;
  for (const s of divShifts) {
    colorMap[s.id] = isOff(s) ? OFF_COLOR : SHIFT_COLORS[ci++ % SHIFT_COLORS.length];
  }

  const divScheds = (schedules || []).filter((s) => s && s.user?.divisionId === selectedDivisionId);
  const schedMap: Record<string, Record<string, Schedule>> = {};
  for (const s of divScheds) {
    if (!s || !s.date || !s.userId) continue;
    if (!schedMap[s.date]) schedMap[s.date] = {};
    schedMap[s.date][s.userId] = s;
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const fetchAll = useCallback(async (showSpinner = false) => {
    // Hanya tampilkan spinner jika cache kosong atau diminta eksplisit
    if (showSpinner || _cachedDivisions.length === 0) setLoading(true);
    try {
      const [dR, uR, sR] = await Promise.all([
        fetch("/api/divisions").then((r) => r.json()),
        fetch("/api/users").then((r) => r.json()),
        fetch(`/api/schedules?month=${monthKey}`).then((r) => r.json()),
      ]);
      const newDivisions = dR.success ? dR.divisions : [];
      const newUsers = uR.success ? uR.users : [];
      const newSchedules = sR.success ? sR.schedules : [];
      // Simpan ke cache modul
      _cachedDivisions = newDivisions;
      _cachedUsers = newUsers;
      _cachedSchedules = newSchedules;
      _cachedMonthKey = monthKey;
      setDivisions(newDivisions);
      setUsers(newUsers);
      setSchedules(newSchedules);
    } finally { setLoading(false); }
  }, [monthKey]);

  // Muat ulang jadwal saja secara instan dan efisien di background
  const refreshSchedules = useCallback(async () => {
    try {
      const res = await fetch(`/api/schedules?month=${monthKey}`).then((r) => r.json());
      if (res.success && res.schedules) {
        _cachedSchedules = res.schedules;
        setSchedules(res.schedules);
      }
    } catch (err) {
      console.error("Gagal refresh jadwal:", err);
    }
  }, [monthKey]);

  useEffect(() => {
    // Jika bulan berubah, fetch ulang dengan spinner
    if (monthKey !== _cachedMonthKey) {
      fetchAll(true);
    } else {
      // Bulan sama: langsung pakai cache, refresh di background tanpa spinner
      fetchAll(false);
    }
  }, [fetchAll, monthKey]);

  useEffect(() => {
    if (divisions.length > 0 && !selectedDivisionId) {
      const firstId = divisions[0].id;
      setSelectedDivisionId(firstId);
      _cachedDivisionId = firstId;
    }
  }, [divisions, selectedDivisionId]);

  // Simpan divisi terpilih ke cache saat berubah
  const handleSelectDivision = (id: string) => {
    setSelectedDivisionId(id);
    _cachedDivisionId = id;
  };

  if ((currentUser?.role || "").toLowerCase() !== "admin") return <Navigate to="/dashboard" replace />;

  const assignShift = async (userId: string, shiftId: string, date: string) => {
    const key = `${userId}-${date}`;
    setSaving(key);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, shiftId, date }),
      });
      const data = await res.json();
      if (data.success) {
        setSchedules((prev) => {
          const idx = prev.findIndex((s) => s.userId === userId && s.date === date);
          if (idx >= 0) { const c = [...prev]; c[idx] = data.schedule; return c; }
          return [...prev, data.schedule];
        });
        showToast("Jadwal disimpan!");
        setPicker(null);
      }
    } finally { setSaving(""); }
  };

  const removeShift = async (scheduleId: string, userId: string, date: string) => {
    setSaving(`${userId}-${date}`);
    try {
      await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
      setSchedules((prev) => prev.filter((s) => !(s.userId === userId && s.date === date)));
      showToast("Jadwal dihapus");
      setPicker(null);
    } finally { setSaving(""); }
  };

  const autoGenerate = async () => {
    if (!selectedDivisionId) return;
    setAutoLoading(true); setAutoMsg("");
    try {
      const res = await fetch("/api/schedules/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthKey, divisionId: selectedDivisionId, offPerPerson: parseInt(autoOff) || 4 }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoMsg(`Berhasil membuat ${data.generated} jadwal!`);
        await fetchAll();
        setTimeout(() => { setAutoModal(false); setAutoMsg(""); }, 1500);
      } else { setAutoMsg(data.error || "Terjadi kesalahan"); }
    } finally { setAutoLoading(false); }
  };

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const totalCells = divUsers.length * daysInMonth;
  const filledCells = divScheds.length;
  const pct = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
  const pickerExisting = picker ? schedMap[picker.date]?.[picker.userId] : null;

  // ── Download Template Excel ──
  const handleDownloadTemplate = () => {
    if (!selectedDiv || divUsers.length === 0) {
      showToast("Pilih divisi yang memiliki karyawan terlebih dahulu");
      return;
    }

    // 1. Data Sheet Jadwal
    const headers = ["Nama Karyawan", ...days.map((d) => String(d))];
    const rows = divUsers.map((u) => {
      const row: (string | number)[] = [u.name];
      for (const d of days) {
        const dateStr = toYMD(currentDate, d);
        const existing = schedMap[dateStr]?.[u.id];
        row.push(existing ? getShiftCode(existing.shift) : "");
      }
      return row;
    });

    const wsJadwal = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    wsJadwal["!cols"] = [
      { wch: 22 },
      ...days.map(() => ({ wch: 6 })),
    ];

    // 2. Data Sheet Panduan Shift
    const shiftHeaders = ["Kode Shift", "Nama Shift", "Jam Masuk", "Jam Pulang", "Keterangan"];
    const shiftRows = divShifts.map((s) => [
      getShiftCode(s),
      s.name,
      s.checkInTime,
      s.checkOutTime,
      isOff(s) ? "Libur Kerja (OFF)" : (s.description || ""),
    ]);
    const wsShift = XLSX.utils.aoa_to_sheet([shiftHeaders, ...shiftRows]);
    wsShift["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 25 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsJadwal, "Jadwal");
    XLSX.utils.book_append_sheet(wb, wsShift, "Panduan Shift");

    const safeDivName = selectedDiv.name.replace(/[^a-zA-Z0-9]/g, "_");
    XLSX.writeFile(wb, `Template_Jadwal_${safeDivName}_${monthKey}.xlsx`);
    showToast("Template Excel berhasil diunduh!");
  };

  // ── Parse File Excel Upload ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportLoading(true);
    setImportError("");
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      if (wb.SheetNames.length === 0) {
        throw new Error("File Excel kosong atau tidak memiliki sheet");
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rawData.length === 0) {
        throw new Error("Sheet Excel pertama kosong");
      }

      // Cari baris header yang memuat angka tanggal (1 s/d 31)
      let headerRowIdx = -1;
      let dayCols: { colIdx: number; day: number }[] = [];

      for (let r = 0; r < Math.min(rawData.length, 15); r++) {
        const row = rawData[r];
        if (!row || !Array.isArray(row)) continue;
        const currentDays: { colIdx: number; day: number }[] = [];
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] ?? "").trim();
          const n = parseInt(val, 10);
          if (!isNaN(n) && n >= 1 && n <= 31 && String(n) === val) {
            currentDays.push({ colIdx: c, day: n });
          } else if (val.toLowerCase().startsWith("tgl") || val.toLowerCase().startsWith("tanggal")) {
            const numPart = parseInt(val.replace(/\D/g, ""), 10);
            if (!isNaN(numPart) && numPart >= 1 && numPart <= 31) {
              currentDays.push({ colIdx: c, day: numPart });
            }
          }
        }
        if (currentDays.length > dayCols.length) {
          dayCols = currentDays;
          headerRowIdx = r;
        }
      }

      if (dayCols.length === 0) {
        throw new Error("Tidak dapat mendeteksi kolom tanggal (1 s/d 31) di file Excel Anda. Pastikan ada baris judul dengan angka tanggal 1, 2, 3, dst.");
      }

      const firstDayCol = Math.min(...dayCols.map((d) => d.colIdx));
      let nameColIdx = 0;
      if (firstDayCol > 0) {
        nameColIdx = firstDayCol - 1;
      }

      // Siapkan kamus pencocokan shift
      const shiftLookup: Record<string, string> = {};
      for (const s of divShifts) {
        const code = getShiftCode(s).toUpperCase().trim();
        shiftLookup[code] = s.id;
        shiftLookup[s.name.toUpperCase().trim()] = s.id;
        if (s.description) shiftLookup[s.description.toUpperCase().trim()] = s.id;
        if (isOff(s)) {
          shiftLookup["OFF"] = s.id;
          shiftLookup["LIBUR"] = s.id;
          shiftLookup["CUTI"] = s.id;
          shiftLookup["L"] = s.id;
        }
      }

      // Kamus pencocokan karyawan
      const cleanStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
      const userLookup: { clean: string; user: UserItem }[] = divUsers.map((u) => ({
        clean: cleanStr(u.name),
        user: u,
      }));

      const parsedSchedules: { userId: string; shiftId: string; date: string }[] = [];
      const unmatchedNamesSet = new Set<string>();
      const unmatchedCodesSet = new Set<string>();
      const previewRows: { name: string; shifts: { day: number; code: string; valid: boolean }[] }[] = [];

      for (let r = headerRowIdx + 1; r < rawData.length; r++) {
        const row = rawData[r];
        if (!row || !Array.isArray(row)) continue;

        const rawName = String(row[nameColIdx] ?? "").trim();
        if (!rawName || rawName.toLowerCase().includes("total") || rawName.toLowerCase() === "nama") continue;

        const cName = cleanStr(rawName);
        const matchedU = userLookup.find((u) => u.clean === cName || u.clean.includes(cName) || cName.includes(u.clean));

        if (!matchedU) {
          unmatchedNamesSet.add(rawName);
          continue;
        }

        const previewShifts: { day: number; code: string; valid: boolean }[] = [];

        for (const dc of dayCols) {
          if (dc.day > daysInMonth) continue;
          const cellVal = String(row[dc.colIdx] ?? "").trim().toUpperCase();
          if (!cellVal || cellVal === "-" || cellVal === "0") continue;

          const matchedShiftId = shiftLookup[cellVal];
          if (matchedShiftId) {
            const dateStr = toYMD(currentDate, dc.day);
            parsedSchedules.push({
              userId: matchedU.user.id,
              shiftId: matchedShiftId,
              date: dateStr,
            });
            previewShifts.push({ day: dc.day, code: cellVal, valid: true });
          } else {
            unmatchedCodesSet.add(cellVal);
            previewShifts.push({ day: dc.day, code: cellVal, valid: false });
          }
        }

        if (previewRows.length < 8) {
          previewRows.push({
            name: matchedU.user.name,
            shifts: previewShifts,
          });
        }
      }

      setImportResult({
        schedules: parsedSchedules,
        totalRows: rawData.length - headerRowIdx - 1,
        matchedCount: parsedSchedules.length,
        unmatchedNames: Array.from(unmatchedNamesSet),
        unmatchedCodes: Array.from(unmatchedCodesSet),
        previewRows,
      });
    } catch (err: any) {
      setImportError(err.message || "Gagal membaca file Excel");
    } finally {
      setImportLoading(false);
    }
  };

  // ── Simpan Batch Hasil Import Excel ──
  const handleSaveImportedSchedules = async () => {
    if (!importResult || importResult.schedules.length === 0) return;
    setImportSaving(true);
    setImportError("");
    try {
      const res = await fetch("/api/schedules/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: monthKey,
          divisionId: selectedDivisionId,
          items: importResult.schedules,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Berhasil menyimpan ${data.count} jadwal dari Excel!`);
        setImportModal(false);
        setImportResult(null);
        setImportFile(null);
        refreshSchedules();
      } else {
        setImportError(data.error || "Gagal menyimpan jadwal");
      }
    } catch (err: any) {
      setImportError(err.message || "Gagal menghubungi server");
    } finally {
      setImportSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6ff", paddingBottom: 120, paddingTop: 16 }}>

      {/* ── Header ── */}
      <div style={{ padding: "0 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 10, padding: "4px 8px", display: "inline-flex" }}>
              <Calendar size={16} color="#fff" />
            </span>
            Jadwal Shift
          </h1>
          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, marginLeft: 4 }}>Klik sel untuk atur jadwal — semudah Excel!</p>
        </div>
        <button onClick={() => fetchAll(true)} style={{ padding: 8, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <RefreshCw size={15} color="#6b7280" className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Step 1: Pilih Divisi ── */}
      <div style={{ padding: "0 16px", marginBottom: 14 }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={NUM({})}>1</span> Pilih Tim / Divisi
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {divisions.map((d) => (
            <button key={d.id} onClick={() => handleSelectDivision(d.id)}
              style={selectedDivisionId === d.id
                ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "2px solid #6366f1", boxShadow: "0 4px 12px rgba(99,102,241,0.35)", borderRadius: 12, padding: "7px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }
                : { background: "#fff", color: "#4b5563", border: "2px solid #e5e7eb", borderRadius: 12, padding: "7px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {d.name}
            </button>
          ))}
          {divisions.length === 0 && <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>Belum ada divisi</p>}
        </div>
      </div>

      {selectedDivisionId && (<>

        {/* ── Step 2: Legenda Shift ── */}
        <div style={{ padding: "0 16px", marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={NUM({})}>2</span> Kode Shift — {selectedDiv?.name}
          </p>
          {divShifts.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px" }}>
              <Info size={14} color="#d97706" />
              <p style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>Belum ada shift. Tambahkan di <strong>Manajemen Divisi & Shift</strong>.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {divShifts.map((s) => {
                const c = colorMap[s.id];
                const code = getShiftCode(s);
                return (
                  <div key={s.id} style={{ background: c.light, border: `1.5px solid ${c.border}`, color: c.text, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px" }}>
                    <span style={{ background: c.bg, color: "#fff", borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 900, minWidth: 26, textAlign: "center" }}>
                      {code}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {s.description && s.description !== code && (
                        <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1, color: c.text }}>{s.description}</span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, opacity: 0.85 }}>
                        <Clock size={9} /> {isOff(s) ? "OFF / Libur" : `${s.checkInTime}–${s.checkOutTime}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Step 3: Navigasi + Progress ── */}
        <div style={{ padding: "0 16px", marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={NUM({})}>3</span> Tabel Jadwal — Klik sel untuk isi / ubah
          </p>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                style={{ padding: 6, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", display: "flex" }}>
                <ChevronLeft size={16} color="#6b7280" />
              </button>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#111827", padding: "0 8px" }}>{formatMonth(currentDate)}</span>
              <button onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                style={{ padding: 6, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", display: "flex" }}>
                <ChevronRight size={16} color="#6b7280" />
              </button>
            </div>
            {divUsers.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#6b7280" }}>
                <Users size={13} color="#6366f1" />
                <span>{filledCells}/{totalCells}</span>
                <div style={{ width: 48, height: 6, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius: 99, transition: "width 0.4s" }} />
                </div>
                <span style={{ color: "#6366f1", fontWeight: 900 }}>{pct}%</span>
              </div>
            )}
          </div>

          {/* Tombol Aksi Excel */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              onClick={handleDownloadTemplate}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: "#ecfdf5",
                color: "#065f46",
                border: "1.5px solid #a7f3d0",
                borderRadius: 12,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                transition: "all 0.15s"
              }}
            >
              <Download size={14} /> Download Template Excel
            </button>
            <button
              onClick={() => {
                setImportModal(true);
                setImportResult(null);
                setImportError("");
                setImportFile(null);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
                transition: "all 0.15s"
              }}
            >
              <FileSpreadsheet size={14} /> Import dari Excel
            </button>
          </div>
        </div>

        {/* ── Tabel Spreadsheet ── */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #e0e7ff", borderTopColor: "#6366f1", animation: "spin 0.7s linear infinite" }} />
            <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 12, fontWeight: 600 }}>Memuat jadwal...</p>
          </div>
        ) : divUsers.length === 0 ? (
          <div style={{ margin: "0 16px", background: "#fff", borderRadius: 16, border: "2px dashed #e5e7eb", padding: "48px 24px", textAlign: "center" }}>
            <Users size={36} color="#e5e7eb" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "#9ca3af", fontWeight: 600, fontSize: 13 }}>Belum ada karyawan di divisi ini</p>
          </div>
        ) : (
          <div style={{ padding: "0 16px" }}>
            <div ref={tableRef} style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", background: "#fff" }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 96, minWidth: 96 }} />
                  {days.map((d) => <col key={d} style={{ width: 38, minWidth: 38 }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{
                      position: "sticky",
                      left: 0,
                      top: 0,
                      zIndex: 20,
                      background: "#4f46e5",
                      color: "#fff",
                      padding: "8px 6px",
                      fontSize: 10,
                      fontWeight: 900,
                      textAlign: "center",
                      letterSpacing: "0.06em",
                      borderRight: "2px solid #4338ca",
                      borderBottom: "2px solid #4338ca"
                    }}>
                      NAMA
                    </th>
                    {days.map((day) => {
                      const dateStr = toYMD(currentDate, day);
                      const dow = new Date(year, month, day).getDay();
                      const isSun = dow === 0;
                      const isSat = dow === 6;
                      const isToday = dateStr === todayStr;
                      return (
                        <th key={day} style={{
                          position: "sticky",
                          top: 0,
                          zIndex: 10,
                          background: isToday ? "#4f46e5" : isSun ? "#fff1f2" : isSat ? "#fdf4ff" : "#f8fafc",
                          color: isToday ? "#fff" : isSun ? "#e11d48" : isSat ? "#7e22ce" : "#475569",
                          padding: "6px 2px",
                          textAlign: "center",
                          borderBottom: "2px solid #e2e8f0",
                          borderRight: "1px solid #f1f5f9",
                          fontWeight: 800
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.1 }}>{day}</div>
                          <div style={{ fontSize: 8, opacity: isToday ? 0.9 : 0.75, fontWeight: 700, letterSpacing: 0.3 }}>{DAY_SHORT[dow]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {divUsers.map((u, uIdx) => (
                    <tr key={u.id} style={{ height: 38 }}>
                      <td style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 5,
                        background: uIdx % 2 === 0 ? "#ffffff" : "#f8fafc",
                        borderRight: "2px solid #e2e8f0",
                        borderBottom: "1px solid #f1f5f9",
                        padding: "4px 8px",
                        whiteSpace: "nowrap"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: "linear-gradient(135deg,#eef2ff,#ede9fe)", color: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
                            {u.name}
                          </span>
                        </div>
                      </td>
                      {days.map((day) => {
                        const dateStr = toYMD(currentDate, day);
                        const sched = schedMap[dateStr]?.[u.id];
                        const c = sched ? colorMap[sched.shiftId] : null;
                        const isSavingThis = saving === `${u.id}-${dateStr}`;
                        const isToday = dateStr === todayStr;
                        const dow = new Date(year, month, day).getDay();
                        const isSun = dow === 0;
                        const isSat = dow === 6;
                        return (
                          <td key={day}
                            onClick={() => setPicker({ userId: u.id, date: dateStr, userName: u.name })}
                            style={{
                              borderBottom: "1px solid #f1f5f9",
                              borderRight: "1px solid #f1f5f9",
                              padding: "3px 2px",
                              textAlign: "center",
                              cursor: "pointer",
                              background: isSavingThis ? "#eef2ff" : isToday ? "#f0f4ff" : isSun ? "#fff5f5" : isSat ? "#faf5ff" : uIdx % 2 === 0 ? "#ffffff" : "#f8fafc",
                              verticalAlign: "middle",
                              height: 38
                            }}>
                            {isSavingThis ? (
                              <div style={{ width: 30, height: 24, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "#e0e7ff" }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.6s linear infinite" }} />
                              </div>
                            ) : sched && c ? (
                              <div style={{
                                width: 32,
                                height: 24,
                                margin: "0 auto",
                                background: c.bg,
                                color: "#fff",
                                borderRadius: 6,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 900,
                                letterSpacing: 0.3,
                                boxShadow: `0 1px 3px ${c.bg}44`,
                                lineHeight: 1
                              }}>
                                {getShiftCode(sched.shift)}
                              </div>
                            ) : (
                              <div style={{ width: 32, height: 24, margin: "0 auto", borderRadius: 6, border: "1.5px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1 }}>+</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ textAlign: "center", fontSize: 10, color: "#9ca3af", marginTop: 6 }}>← Geser kiri/kanan untuk lihat semua tanggal →</p>
          </div>
        )}

        {/* ── FAB ── */}
        <button onClick={() => { setAutoModal(true); setAutoMsg(""); }}
          style={{ position: "fixed", bottom: 90, right: 16, zIndex: 40, display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", borderRadius: 16, padding: "0 20px", height: 52, fontWeight: 800, fontSize: 14, boxShadow: "0 8px 24px rgba(99,102,241,0.45)", border: "none", cursor: "pointer" }}>
          <Zap size={17} /> Auto Generate
        </button>
      </>)}

      {/* ══ SHIFT PICKER BOTTOM SHEET ══ */}
      {picker && selectedDiv && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.52)", backdropFilter: "blur(4px)" }} onClick={() => setPicker(null)} />
          <div style={{ position: "relative", zIndex: 10, background: "#fff", width: "100%", maxWidth: 480, borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)", overflow: "hidden", animation: "slideUp 0.25s ease" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", padding: "16px 20px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Pilih Shift untuk</p>
                  <h3 style={{ color: "#fff", fontSize: 19, fontWeight: 900, lineHeight: 1.2 }}>{picker.userName}</h3>
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, marginTop: 3 }}>
                    {new Date(picker.date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <button onClick={() => setPicker(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 10, padding: 8, cursor: "pointer", display: "flex" }}>
                  <X size={18} color="#fff" />
                </button>
              </div>
            </div>

            {/* Jadwal aktif */}
            {pickerExisting && (
              <div style={{ margin: "12px 16px 0", background: colorMap[pickerExisting.shiftId]?.light ?? "#f3f4f6", border: `1.5px solid ${colorMap[pickerExisting.shiftId]?.border ?? "#e5e7eb"}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Jadwal Sekarang</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: colorMap[pickerExisting.shiftId]?.bg ?? "#6b7280", color: "#fff", borderRadius: 7, padding: "2px 10px", fontSize: 14, fontWeight: 900 }}>
                      {getShiftCode(pickerExisting.shift)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: colorMap[pickerExisting.shiftId]?.text ?? "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} />
                      {pickerExisting.shift?.description && pickerExisting.shift.description !== getShiftCode(pickerExisting.shift) ? `${pickerExisting.shift.description} • ` : ""}
                      {isOff(pickerExisting.shift) ? "Libur / OFF" : `${pickerExisting.shift?.checkInTime ?? "-"} - ${pickerExisting.shift?.checkOutTime ?? "-"}`}
                    </span>
                  </div>
                </div>
                <button onClick={() => removeShift(pickerExisting.id, pickerExisting.userId, pickerExisting.date)} disabled={!!saving}
                  style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 9, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Hapus
                </button>
              </div>
            )}

            {/* Grid pilih shift */}
            <div style={{ padding: "12px 16px 28px" }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                {pickerExisting ? "Ganti shift menjadi:" : "Pilih shift:"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {divShifts.map((s) => {
                  const c = colorMap[s.id];
                  const code = getShiftCode(s);
                  const isActive = pickerExisting?.shiftId === s.id;
                  const isSav = saving === `${picker.userId}-${picker.date}`;
                  return (
                    <button key={s.id}
                      onClick={() => !isActive && !isSav && assignShift(picker.userId, s.id, picker.date)}
                      disabled={isActive || isSav}
                      style={{ background: isActive ? c.bg : c.light, color: isActive ? "#fff" : c.text, border: `2px solid ${isActive ? c.bg : c.border}`, borderRadius: 14, padding: "12px 14px", cursor: isActive ? "default" : "pointer", textAlign: "left", opacity: isSav ? 0.6 : 1, transition: "all 0.15s", boxShadow: isActive ? `0 4px 12px ${c.bg}55` : "none", position: "relative", overflow: "hidden" }}>
                      {isActive && <CheckCircle size={14} style={{ position: "absolute", top: 8, right: 8 }} />}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.2 }}>{code}</span>
                        {s.description && s.description !== code && (
                          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>{s.description}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={10} /> {isOff(s) ? "Libur / OFF" : `${s.checkInTime} - ${s.checkOutTime}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ IMPORT EXCEL MODAL ══ */}
      {importModal && selectedDiv && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.52)", backdropFilter: "blur(4px)" }} onClick={() => !importSaving && setImportModal(false)} />
          <div style={{ position: "relative", zIndex: 10, background: "#fff", width: "100%", maxWidth: 520, maxHeight: "90vh", borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)", overflow: "hidden", display: "flex", flexDirection: "column", animation: "slideUp 0.25s ease" }}>
            
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", padding: "16px 20px 14px", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: 10, display: "flex" }}>
                    <FileSpreadsheet size={20} color="#fff" />
                  </div>
                  <div>
                    <h3 style={{ color: "#fff", fontWeight: 900, fontSize: 17 }}>Import Jadwal dari Excel</h3>
                    <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600 }}>{selectedDiv.name} · {formatMonth(currentDate)}</p>
                  </div>
                </div>
                <button onClick={() => !importSaving && setImportModal(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 10, padding: 8, cursor: "pointer", display: "flex" }}>
                  <X size={18} color="#fff" />
                </button>
              </div>
            </div>

            {/* Content Scrollable */}
            <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              
              {/* Petunjuk Ringkas */}
              <div style={{ background: "#f8f9ff", border: "1px solid #e0e7ff", borderRadius: 14, padding: "12px 14px", fontSize: 12, color: "#4338ca", lineHeight: 1.5 }}>
                Unggah file Excel <strong>.xlsx / .xls / .csv</strong> yang dibuat staf. Sistem membaca baris nama karyawan & kolom tanggal 1 s/d {daysInMonth} lalu mencocokkan kode shift-nya!
              </div>

              {/* Upload Box */}
              <div style={{
                border: "2px dashed #c7d2fe",
                background: "#fafbff",
                borderRadius: 16,
                padding: "24px 16px",
                textAlign: "center",
                position: "relative",
                cursor: "pointer"
              }}>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  disabled={importLoading || importSaving}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer"
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Upload size={22} color="#6366f1" />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "#1e1b4b" }}>
                      {importFile ? importFile.name : "Pilih File Excel Jadwal"}
                    </p>
                    <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {importFile ? `${(importFile.size / 1024).toFixed(1)} KB — Klik untuk ganti file` : "Klik di sini atau drag & drop file .xlsx"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Loading Indicator */}
              {importLoading && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 0" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2.5px solid #e0e7ff", borderTopColor: "#6366f1", animation: "spin 0.7s linear infinite" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>Membaca & mencocokkan data Excel...</span>
                </div>
              )}

              {/* Error Box */}
              {importError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10, color: "#991b1b", fontSize: 12 }}>
                  <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong style={{ display: "block", marginBottom: 2 }}>Perhatian:</strong>
                    {importError}
                  </div>
                </div>
              )}

              {/* Result Preview */}
              {importResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  
                  {/* Summary Metric Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                    <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 12, padding: "10px 8px" }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: "#065f46", textTransform: "uppercase" }}>Jadwal Cocok</p>
                      <p style={{ fontSize: 18, fontWeight: 900, color: "#047857", marginTop: 2 }}>{importResult.matchedCount}</p>
                    </div>
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "10px 8px" }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: "#1e40af", textTransform: "uppercase" }}>Karyawan</p>
                      <p style={{ fontSize: 18, fontWeight: 900, color: "#1d4ed8", marginTop: 2 }}>{importResult.previewRows.length}</p>
                    </div>
                    <div style={{ background: (importResult.unmatchedNames.length > 0 || importResult.unmatchedCodes.length > 0) ? "#fffbeb" : "#f0fdf4", border: `1px solid ${(importResult.unmatchedNames.length > 0 || importResult.unmatchedCodes.length > 0) ? "#fde68a" : "#bbf7d0"}`, borderRadius: 12, padding: "10px 8px" }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: (importResult.unmatchedNames.length > 0 || importResult.unmatchedCodes.length > 0) ? "#92400e" : "#166534", textTransform: "uppercase" }}>Catatan</p>
                      <p style={{ fontSize: 18, fontWeight: 900, color: (importResult.unmatchedNames.length > 0 || importResult.unmatchedCodes.length > 0) ? "#b45309" : "#15803d", marginTop: 2 }}>
                        {importResult.unmatchedNames.length + importResult.unmatchedCodes.length === 0 ? "100% Cocok" : `${importResult.unmatchedNames.length + importResult.unmatchedCodes.length} Item`}
                      </p>
                    </div>
                  </div>

                  {/* Warning Details if Any */}
                  {(importResult.unmatchedNames.length > 0 || importResult.unmatchedCodes.length > 0) && (
                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 12px", fontSize: 11, color: "#92400e", lineHeight: 1.5 }}>
                      {importResult.unmatchedNames.length > 0 && (
                        <div>
                          <strong>Nama tidak terdaftar di divisi {selectedDiv.name}:</strong> {importResult.unmatchedNames.join(", ")}
                        </div>
                      )}
                      {importResult.unmatchedCodes.length > 0 && (
                        <div style={{ marginTop: importResult.unmatchedNames.length > 0 ? 4 : 0 }}>
                          <strong>Kode shift tidak dikenal:</strong> {importResult.unmatchedCodes.join(", ")} (Lihat kode di Step 2).
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview Rows */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>
                      Preview Hasil Bacaan Excel:
                    </p>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", maxHeight: 180, overflowY: "auto", background: "#fff" }}>
                      {importResult.previewRows.map((pr, idx) => (
                        <div key={idx} style={{ padding: "8px 12px", borderBottom: idx < importResult.previewRows.length - 1 ? "1px solid #f3f4f6" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>{pr.name}</span>
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "60%" }}>
                            {pr.shifts.slice(0, 7).map((s, sIdx) => (
                              <span key={sIdx} style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 4, background: s.valid ? "#e0e7ff" : "#fee2e2", color: s.valid ? "#3730a3" : "#991b1b" }}>
                                {s.day}:{s.code}
                              </span>
                            ))}
                            {pr.shifts.length > 7 && (
                              <span style={{ fontSize: 9, color: "#9ca3af", alignSelf: "center" }}>+{pr.shifts.length - 7} hari</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Footer Buttons */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #f3f4f6", background: "#f9fafb", display: "flex", gap: 10, flexShrink: 0 }}>
              <button
                onClick={() => setImportModal(false)}
                disabled={importSaving}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1.5px solid #e5e7eb",
                  background: "#fff",
                  color: "#4b5563",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveImportedSchedules}
                disabled={importSaving || !importResult || importResult.matchedCount === 0}
                style={{
                  flex: 2,
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "none",
                  background: (!importResult || importResult.matchedCount === 0 || importSaving)
                    ? "#d1d5db"
                    : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: (!importResult || importResult.matchedCount === 0 || importSaving) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: (!importResult || importResult.matchedCount === 0) ? "none" : "0 4px 14px rgba(99,102,241,0.35)"
                }}
              >
                {importSaving ? (
                  <>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check size={16} /> Simpan {importResult?.matchedCount || 0} Jadwal
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ══ AUTO GENERATE MODAL ══ */}
      {autoModal && selectedDiv && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.52)", backdropFilter: "blur(4px)" }} onClick={() => !autoLoading && setAutoModal(false)} />
          <div style={{ position: "relative", zIndex: 10, background: "#fff", width: "100%", maxWidth: 480, borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", padding: "16px 20px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: 10, display: "flex" }}><Zap size={20} color="#fff" /></div>
                  <div>
                    <h3 style={{ color: "#fff", fontWeight: 900, fontSize: 17 }}>Auto-Generate Jadwal</h3>
                    <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600 }}>{selectedDiv.name} · {formatMonth(currentDate)}</p>
                  </div>
                </div>
                <button onClick={() => !autoLoading && setAutoModal(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 10, padding: 8, cursor: "pointer", display: "flex" }}>
                  <X size={18} color="#fff" />
                </button>
              </div>
            </div>

            <div style={{ padding: "16px 20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#f8f9ff", borderRadius: 14, padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                {[{ label: "Divisi", value: selectedDiv.name }, { label: "Karyawan", value: `${divUsers.length} orang` }, { label: "Shift", value: `${divShifts.length} shift` }].map((item) => (
                  <div key={item.label}>
                    <p style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 900, color: "#111827", marginTop: 2 }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 10 }}>
                  Hari OFF per karyawan dalam sebulan:
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center" }}>
                  <button onClick={() => setAutoOff((v) => String(Math.max(0, parseInt(v) - 1)))} style={{ width: 44, height: 44, borderRadius: 14, background: "#f3f4f6", border: "none", fontSize: 22, fontWeight: 900, cursor: "pointer", color: "#374151" }}>-</button>
                  <div style={{ textAlign: "center", minWidth: 60 }}>
                    <span style={{ fontSize: 40, fontWeight: 900, color: "#6366f1", lineHeight: 1, display: "block" }}>{autoOff}</span>
                    <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>hari libur</p>
                  </div>
                  <button onClick={() => setAutoOff((v) => String(Math.min(20, parseInt(v) + 1)))} style={{ width: 44, height: 44, borderRadius: 14, background: "#f3f4f6", border: "none", fontSize: 22, fontWeight: 900, cursor: "pointer", color: "#374151" }}>+</button>
                </div>
              </div>

              <div style={{ background: "#eef2ff", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#4338ca", fontWeight: 600, lineHeight: 1.6 }}>
                Jadwal dibuat <strong>acak tapi adil</strong> — semua orang dapat porsi shift yang sama.<br />
                Jadwal bulan ini untuk divisi <strong>{selectedDiv.name}</strong> akan <strong>diganti semua</strong>.
              </div>

              {autoMsg && (
                <div style={{ borderRadius: 12, padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 700, background: autoMsg.startsWith("Berhasil") ? "#ecfdf5" : "#fef2f2", color: autoMsg.startsWith("Berhasil") ? "#065f46" : "#991b1b" }}>
                  {autoMsg}
                </div>
              )}

              <button onClick={autoGenerate} disabled={autoLoading || divShifts.length === 0 || divUsers.length === 0}
                style={{ width: "100%", height: 52, borderRadius: 16, background: (autoLoading || divShifts.length === 0 || divUsers.length === 0) ? "#d1d5db" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", cursor: autoLoading ? "wait" : "pointer", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 20px rgba(99,102,241,0.4)" }}>
                {autoLoading ? (
                  <><div style={{ width: 20, height: 20, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} /> Membuat jadwal...</>
                ) : (
                  <><Zap size={17} /> Buat Jadwal Otomatis</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: "#1f2937", color: "#fff", fontSize: 13, fontWeight: 700, padding: "10px 20px", borderRadius: 12, zIndex: 60, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default ScheduleManagement;
