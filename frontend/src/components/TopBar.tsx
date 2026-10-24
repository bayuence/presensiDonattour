import { useState, useEffect, useRef } from 'react';
import { Menu, LogOut, Bell, AlertTriangle, CheckCircle2, Clock, X, Sparkles, Trash2, MessageCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatAttendanceTime } from '../utils/timeFormat';

type TopBarProps = {
  onOpenSidebar: () => void;
};

// Helper tanggal YYYY-MM-DD
const getTodayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Komponen Kartu Notifikasi yang Bisa Digeser ke Kiri / Kanan untuk Menghapus (Swipe to Dismiss)
const SwipeableNotificationItem = ({
  id,
  onDismiss,
  children,
}: {
  id: string;
  onDismiss: (id: string) => void;
  children: React.ReactNode;
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    isDown: boolean;
    lockedDirection: 'h' | 'v' | null;
  }>({
    startX: 0,
    startY: 0,
    isDown: false,
    lockedDirection: null,
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      isDown: true,
      lockedDirection: null,
    };
    setIsSwiping(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDown || isDismissing) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    // Deteksi arah gesture awal
    if (!dragRef.current.lockedDirection) {
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        dragRef.current.lockedDirection = 'h';
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {}
      } else if (Math.abs(dy) > 7) {
        dragRef.current.lockedDirection = 'v';
        dragRef.current.isDown = false;
        setIsSwiping(false);
        setOffsetX(0);
        return;
      }
    }

    if (dragRef.current.lockedDirection === 'h') {
      setOffsetX(dx);
    }
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    if (!dragRef.current.isDown && !dragRef.current.lockedDirection) return;

    dragRef.current.isDown = false;
    setIsSwiping(false);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const threshold = 75; // Batas geser dalam pixel untuk memicu hapus
    if (Math.abs(offsetX) > threshold) {
      // Geser keluar layar
      const flyTarget = offsetX > 0 ? 360 : -360;
      setOffsetX(flyTarget);
      setIsDismissing(true);

      setTimeout(() => {
        onDismiss(id);
      }, 220);
    } else {
      // Kembali ke posisi semula
      setOffsetX(0);
    }
    dragRef.current.lockedDirection = null;
  };

  const isLeftSwipe = offsetX < 0;
  const isRightSwipe = offsetX > 0;
  const absOffset = Math.abs(offsetX);
  const swipeProgress = Math.min(absOffset / 75, 1);

  return (
    <div
      className={`relative overflow-hidden rounded-xl select-none touch-pan-y transition-all duration-200 ${
        isDismissing ? 'max-h-0 opacity-0 my-0 py-0 scale-95' : 'max-h-36 opacity-100 my-1.5'
      }`}
    >
      {/* Layer Belakang: Aksi Merah dengan Ikon Tong Sampah (Layaknya Notifikasi HP) */}
      <div
        className={`absolute inset-0 flex items-center justify-between px-3.5 rounded-xl transition-colors duration-150 ${
          absOffset > 75 ? 'bg-red-600' : 'bg-red-500'
        }`}
      >
        {/* Indikator Hapus Sisi Kiri (muncul saat digeser ke kanan) */}
        <div
          className="flex items-center gap-1.5 text-white font-bold text-xs pointer-events-none transition-transform"
          style={{
            opacity: isRightSwipe ? swipeProgress : 0,
            transform: `scale(${0.75 + swipeProgress * 0.25})`,
          }}
        >
          <Trash2 size={16} />
          <span>Hapus</span>
        </div>

        {/* Indikator Hapus Sisi Kanan (muncul saat digeser ke kiri) */}
        <div
          className="flex items-center gap-1.5 text-white font-bold text-xs ml-auto pointer-events-none transition-transform"
          style={{
            opacity: isLeftSwipe ? swipeProgress : 0,
            transform: `scale(${0.75 + swipeProgress * 0.25})`,
          }}
        >
          <span>Hapus</span>
          <Trash2 size={16} />
        </div>
      </div>

      {/* Layer Depan: Kartu Notifikasi yang Bisa Digeser */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative z-10 cursor-grab active:cursor-grabbing bg-white rounded-xl shadow-xs"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};

const TopBar = ({ onOpenSidebar }: TopBarProps) => {
  const { user, logout } = useAuth();

  const [isBellOpen, setIsBellOpen] = useState(false);
  const [lateNotifications, setLateNotifications] = useState<any[]>([]);
  const [unmarkedNotifications, setUnmarkedNotifications] = useState<any[]>([]);
  const [shiftChangeRequests, setShiftChangeRequests] = useState<any[]>([]); // Notif shift change
  const [userSchedule, setUserSchedule] = useState<any | null>(null);
  const [loadingNotif, setLoadingNotif] = useState(false);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const pullStartY = useRef<number>(0);

  // Persistence notifikasi yang sudah digeser/dihapus hari ini
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const todayStr = getTodayStr();
      const saved = localStorage.getItem(`dismissed_notifs_${todayStr}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // Format durasi telat singkat
  const formatDur = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}j ${m}m`;
    return `${m}m`;
  };

  // Helper untuk hitung status overdue karyawan belum presensi (sinkron dengan menu Rekap Telat)
  const getOverdueStatus = (checkInTimeStr?: string) => {
    if (!checkInTimeStr) return { isOverdue: false, text: 'Belum Presensi', diffMinutes: 0 };
    const now = new Date();
    const nowWib = new Date(now.getTime() + 7 * 3600 * 1000 + now.getTimezoneOffset() * 60 * 1000);
    const [sh, sm] = checkInTimeStr.split(':').map(Number);
    const schedDate = new Date(nowWib);
    schedDate.setHours(sh, sm, 0, 0);

    const diffMinutes = Math.round((nowWib.getTime() - schedDate.getTime()) / (60 * 1000));
    if (diffMinutes > 0) {
      const h = Math.floor(diffMinutes / 60);
      const m = diffMinutes % 60;
      const durText = h > 0 ? `${h}j ${m}m` : `${m}m`;
      return { isOverdue: true, text: `Lewat ${durText}`, diffMinutes };
    } else {
      return { isOverdue: false, text: `Mulai ${checkInTimeStr}`, diffMinutes };
    }
  };

  // Muat data notifikasi sesuai role dengan smart caching
  const fetchNotifications = (silent = false) => {
    if (!user) return;
    
    // Debug: Log role user untuk memastikan role terdeteksi dengan benar
    console.log('[TopBar] User Role:', user.role, '| isAdmin:', isAdmin);
    
    // Cache check: skip jika baru fetch dalam 5 detik terakhir
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    if (timeSinceLastFetch < 5000 && hasInitialLoad) {
      return; // Skip jika masih fresh
    }
    
    const todayStr = getTodayStr();
    lastFetchTimeRef.current = now;

    // Silent mode: tidak show loading spinner jika sudah ada data (background refresh)
    if (!silent || !hasInitialLoad) {
      setLoadingNotif(true);
    }

    if (isAdmin) {
      // ADMIN: Fetch notifikasi semua karyawan (telat & belum presensi) + shift change requests
      Promise.all([
        fetch(`/api/reports/daily?date=${todayStr}`).then(r => r.json()),
        fetch(`/api/shift-change-requests?status=pending`).then(r => r.json())
      ])
        .then(([dailyData, shiftChangeData]) => {
          if (dailyData.success && dailyData.items) {
            // Karyawan Terlambat
            const lateList = dailyData.items.filter((it: any) => it.isLate);
            // Karyawan Berjadwal tapi Belum Presensi Masuk (sama dengan menu Rekap Telat)
            const unmarkedList = dailyData.items.filter(
              (it: any) => !it.inRecord && it.shift && !it.shift.isOff
            );
            setLateNotifications(lateList);
            setUnmarkedNotifications(unmarkedList);
            console.log('[TopBar Admin] Late:', lateList.length, '| Unmarked:', unmarkedList.length);
          }
          if (shiftChangeData.success && shiftChangeData.requests) {
            setShiftChangeRequests(shiftChangeData.requests);
            console.log('[TopBar Admin] Shift Change Requests:', shiftChangeData.requests.length);
          }
          setHasInitialLoad(true);
        })
        .catch(console.error)
        .finally(() => setLoadingNotif(false));
    } else {
      // KARYAWAN: Hanya fetch jadwal diri sendiri + shift change requests mereka sendiri
      // Reset notifikasi admin supaya tidak muncul
      setLateNotifications([]);
      setUnmarkedNotifications([]);
      
      Promise.all([
        fetch(`/api/schedules?date=${todayStr}&userId=${user.id}`).then(r => r.json()),
        fetch(`/api/shift-change-requests?userId=${user.id}`).then(r => r.json())
      ])
        .then(([schedData, shiftChangeData]) => {
          if (schedData.success && schedData.schedules?.length > 0) {
            setUserSchedule(schedData.schedules[0].shift);
            console.log('[TopBar Employee] Schedule:', schedData.schedules[0].shift?.name);
          } else {
            setUserSchedule(null);
            console.log('[TopBar Employee] No schedule today');
          }
          if (shiftChangeData.success && shiftChangeData.requests) {
            setShiftChangeRequests(shiftChangeData.requests);
            console.log('[TopBar Employee] My Shift Change Requests:', shiftChangeData.requests.length);
          }
          setHasInitialLoad(true);
        })
        .catch(console.error)
        .finally(() => setLoadingNotif(false));
    }
  };

  useEffect(() => {
    fetchNotifications();
    
    // Smart auto-refresh: hanya refresh jika dropdown TIDAK dibuka
    const timer = setInterval(() => {
      if (!isBellOpen) {
        fetchNotifications(true); // Silent background refresh
      }
    }, 15000); // Refresh setiap 15 detik untuk update realtime
    
    return () => clearInterval(timer);
  }, [user, isBellOpen]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsBellOpen(false);
      }
    };
    if (isBellOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isBellOpen]);

  // Handle Hapus Notifikasi saat digeser
  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        const todayStr = getTodayStr();
        localStorage.setItem(`dismissed_notifs_${todayStr}`, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Handle Hapus Semua Sekaligus
  const handleDismissAll = () => {
    const todayStr = getTodayStr();
    const allIds = isAdmin
      ? [
          ...lateNotifications.map((it, idx) => it.inRecord?.id || `late_${it.user?.id || idx}`),
          ...unmarkedNotifications.map((it, idx) => `unmarked_${it.user?.id || idx}`),
          ...shiftChangeRequests.map((req) => `shift_change_${req.id}`),
        ]
      : [
          ...(userSchedule ? [`sched_${user?.id}_${todayStr}`] : []),
          ...shiftChangeRequests.map((req) => `shift_change_${req.id}`),
        ];

    const merged = Array.from(new Set([...dismissedIds, ...allIds]));
    setDismissedIds(merged);
    try {
      localStorage.setItem(`dismissed_notifs_${todayStr}`, JSON.stringify(merged));
    } catch (e) {
      console.error(e);
    }
  };

  // Handler untuk Pull-to-Restore (tarik ke bawah untuk kembalikan notifikasi yang dihapus)
  const handlePullStart = (e: React.TouchEvent | React.PointerEvent) => {
    const container = notifContainerRef.current;
    if (!container) return;
    
    // Hanya aktif jika scroll di paling atas
    if (container.scrollTop === 0 && dismissedIds.length > 0) {
      setIsPulling(true);
      pullStartY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    }
  };

  const handlePullMove = (e: React.TouchEvent | React.PointerEvent) => {
    if (!isPulling) return;
    
    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const distance = Math.max(0, currentY - pullStartY.current);
    
    // Max pull distance 80px
    setPullDistance(Math.min(distance, 80));
  };

  const handlePullEnd = () => {
    if (!isPulling) return;
    
    setIsPulling(false);
    
    // Jika pull lebih dari 60px, restore semua notifikasi yang dihapus
    if (pullDistance > 60) {
      handleRestoreAll();
    }
    
    // Reset pull distance dengan animation
    setPullDistance(0);
  };

  // Handler untuk restore semua notifikasi yang dihapus hari ini
  const handleRestoreAll = () => {
    setDismissedIds([]);
    try {
      const todayStr = getTodayStr();
      localStorage.removeItem(`dismissed_notifs_${todayStr}`);
    } catch (e) {
      console.error(e);
    }
  };

  // Handler untuk kirim notifikasi WhatsApp
  const handleSendWhatsApp = async (user: any, shift: any, overdueText: string) => {
    const userId = user?.id;
    if (!userId) return;

    setSendingWaId(userId);

    try {
      const response = await fetch('/api/notifications/send-absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userName: user.name,
          divisionName: user.division?.name || '',
          outletName: shift?.location?.name || '',
          checkInTime: shift?.checkInTime || '',
          overdueText,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Toast success sederhana
        alert(`✅ Notifikasi WhatsApp berhasil dikirim untuk ${user.name}`);
        
        // Refresh notifikasi setelah 2 detik untuk update status realtime
        setTimeout(() => {
          fetchNotifications(true);
        }, 2000);
      } else {
        alert(`❌ Gagal mengirim notifikasi: ${result.message}`);
      }
    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
      alert('❌ Terjadi kesalahan saat mengirim notifikasi');
    } finally {
      setSendingWaId(null);
    }
  };

  // Filter notifikasi yang belum dihapus oleh user
  const activeLateNotifs = lateNotifications.filter((it, idx) => {
    const id = it.inRecord?.id || `late_${it.user?.id || idx}`;
    return !dismissedIds.includes(id);
  });

  const activeUnmarkedNotifs = unmarkedNotifications.filter((it, idx) => {
    const id = `unmarked_${it.user?.id || idx}`;
    return !dismissedIds.includes(id);
  });

  const activeShiftChangeRequests = shiftChangeRequests.filter((req) => {
    const id = `shift_change_${req.id}`;
    return !dismissedIds.includes(id);
  });

  const employeeSchedId = user ? `sched_${user.id}_${getTodayStr()}` : '';
  const isEmployeeSchedDismissed = dismissedIds.includes(employeeSchedId);
  const hasActiveEmployeeSched = !!userSchedule && !isEmployeeSchedDismissed;

  const totalActiveAdmin = activeLateNotifs.length + activeUnmarkedNotifs.length + activeShiftChangeRequests.length;
  const totalActiveEmployee = (hasActiveEmployeeSched ? 1 : 0) + activeShiftChangeRequests.length;
  const unreadCount = isAdmin ? totalActiveAdmin : totalActiveEmployee;

  return (
    <header className="bg-white/90 backdrop-blur-md px-4 py-3 flex justify-between items-center z-40 shrink-0 border-b border-gray-100 sticky top-0">
      
      {/* Sisi Kiri: Menu Hamburger + Logo Donattour */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-2 -ml-2 rounded-xl transition-colors active:scale-95"
          title="Buka Menu"
        >
          <Menu size={24} />
        </button>
        <div className="flex items-center h-8">
          <img
            src="/logoDONATTOUR.PNG"
            alt="Donattour Logo"
            className="h-full w-auto object-contain drop-shadow-sm"
          />
        </div>
      </div>

      {/* Sisi Kanan: Lonceng Notifikasi + Tombol Logout */}
      <div className="flex items-center gap-1 relative" ref={dropdownRef}>
        
        {/* Tombol Lonceng */}
        <button
          onClick={() => setIsBellOpen(!isBellOpen)}
          className={`p-2.5 rounded-full transition-all relative active:scale-95 ${
            isBellOpen
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`}
          title="Notifikasi"
        >
          <Bell size={21} />

          {/* Badge Jumlah Notifikasi Aktif */}
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 text-[9px] font-black text-white items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </button>

        {/* Tombol Logout */}
        <button
          onClick={logout}
          className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all active:scale-95"
          title="Keluar"
        >
          <LogOut size={21} />
        </button>

        {/* ══ DROPDOWN NOTIFIKASI ══ */}
        {isBellOpen && (
          <div className="absolute right-0 top-12 w-84 max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            
            {/* Header Dropdown */}
            <div className="px-4 py-3 bg-gradient-to-r from-gray-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/10 rounded-lg">
                  <Bell size={15} className="text-indigo-300" />
                </div>
                <div>
                  <h4 className="text-xs font-bold leading-tight">
                    {isAdmin ? 'Pemberitahuan Presensi' : 'Pengingat Hari Ini'}
                  </h4>
                  <p className="text-[10px] text-gray-300">
                    {new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleDismissAll}
                    className="text-[10px] font-semibold text-indigo-200 hover:text-white px-2 py-0.5 rounded-md hover:bg-white/10 transition-colors"
                    title="Hapus Semua Notifikasi"
                  >
                    Hapus Semua
                  </button>
                )}
                <button
                  onClick={() => setIsBellOpen(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* List Notifikasi (Bisa Digeser Kiri/Kanan & Pull-to-Restore) */}
            <div 
              ref={notifContainerRef}
              className="max-h-80 overflow-y-auto p-3 space-y-1 relative"
              onTouchStart={handlePullStart}
              onTouchMove={handlePullMove}
              onTouchEnd={handlePullEnd}
              onPointerDown={handlePullStart}
              onPointerMove={handlePullMove}
              onPointerUp={handlePullEnd}
              style={{
                transform: `translateY(${pullDistance}px)`,
                transition: isPulling ? 'none' : 'transform 0.3s ease-out',
              }}
            >
              {/* Pull-to-Restore Indicator */}
              {dismissedIds.length > 0 && (
                <div 
                  className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none"
                  style={{
                    transform: `translateY(${Math.max(-40, -40 + pullDistance)}px)`,
                    opacity: Math.min(1, pullDistance / 60),
                    transition: isPulling ? 'none' : 'all 0.3s ease-out',
                  }}
                >
                  <div className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full text-[10px] font-semibold flex items-center gap-1.5 shadow-sm">
                    {pullDistance > 60 ? (
                      <>
                        <CheckCircle2 size={13} />
                        <span>Lepas untuk Kembalikan</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} className={isPulling ? 'animate-spin' : ''} />
                        <span>Tarik untuk Kembalikan</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              {loadingNotif ? (
                <div className="py-8 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  <span>Memeriksa notifikasi...</span>
                </div>
              ) : isAdmin ? (
                // ── TAMPILAN ADMIN (Keterlambatan & Belum Presensi Hari Ini) ──
                activeLateNotifs.length === 0 && activeUnmarkedNotifs.length === 0 && activeShiftChangeRequests.length === 0 ? (
                  <div className="py-7 px-4 text-center">
                    <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-100">
                      <CheckCircle2 size={22} />
                    </div>
                    <p className="text-xs font-bold text-gray-800">
                      {lateNotifications.length === 0 && unmarkedNotifications.length === 0 && shiftChangeRequests.length === 0
                        ? 'Semua Tepat Waktu & Hadir! 🎉'
                        : 'Semua Notifikasi Dihapus 🎉'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {lateNotifications.length === 0 && unmarkedNotifications.length === 0 && shiftChangeRequests.length === 0
                        ? 'Tidak ada karyawan yang terlambat, belum presensi, atau pengajuan shift.'
                        : 'Semua pemberitahuan sudah Anda bersihkan.'}
                    </p>
                    {dismissedIds.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] text-indigo-600 font-medium flex items-center justify-center gap-1">
                          <RefreshCw size={11} />
                          <span>Tarik ke bawah untuk kembalikan ({dismissedIds.length})</span>
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-1 px-1 mb-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        Pemberitahuan Hari Ini
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        Geser kiri/kanan untuk hapus ↔
                      </span>
                    </div>

                    {/* ── BAGIAN 1: Karyawan Terlambat ── */}
                    {activeLateNotifs.length > 0 && (
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 uppercase tracking-wider px-1">
                          <AlertTriangle size={11} /> {activeLateNotifs.length} Karyawan Terlambat
                        </div>
                        {activeLateNotifs.map((it: any, idx: number) => {
                          const id = it.inRecord?.id || `late_${it.user?.id || idx}`;
                          const divName = it.user?.division?.name || '';
                          const outletName = it.inRecord?.outlet || it.shift?.location?.name || '';
                          const meta = [divName, outletName].filter(Boolean).join(' · ');
                          const actualTime = it.inRecord?.timestamp ? formatAttendanceTime(it.inRecord.timestamp) : '-';

                          return (
                            <SwipeableNotificationItem
                              key={id}
                              id={id}
                              onDismiss={handleDismiss}
                            >
                              <div className="bg-red-50/70 hover:bg-red-50 border border-red-100 rounded-xl p-2.5 transition-colors text-left">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-black text-gray-900 leading-snug truncate">
                                    {it.user?.name}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded-md">
                                    Telat {formatDur(it.lateSeconds)}
                                  </span>
                                </div>
                                {meta && (
                                  <p className="text-[10px] text-gray-500 font-medium mt-0.5">{meta}</p>
                                )}
                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 mt-1.5 pt-1.5 border-t border-red-100/80">
                                  <Clock size={10} className="text-red-500 shrink-0" />
                                  <span>Jadwal: {it.shift?.checkInTime || '-'}</span>
                                  <span className="text-gray-400">➔</span>
                                  <span className="text-red-700">Masuk: {actualTime} WIB</span>
                                </div>
                              </div>
                            </SwipeableNotificationItem>
                          );
                        })}
                      </div>
                    )}

                    {/* ── BAGIAN 2: Karyawan Belum Presensi Masuk ── */}
                    {activeUnmarkedNotifs.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider px-1">
                          <Clock size={11} /> {activeUnmarkedNotifs.length} Belum Presensi Masuk
                        </div>
                        {activeUnmarkedNotifs.map((it: any, idx: number) => {
                          const id = `unmarked_${it.user?.id || idx}`;
                          const divName = it.user?.division?.name || '';
                          const outletName = it.shift?.location?.name || '';
                          const meta = [divName, outletName].filter(Boolean).join(' · ');
                          const overdue = getOverdueStatus(it.shift?.checkInTime);

                          return (
                            <SwipeableNotificationItem
                              key={id}
                              id={id}
                              onDismiss={handleDismiss}
                            >
                              <div className="bg-amber-50/80 hover:bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 transition-colors text-left">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-black text-gray-900 leading-snug truncate">
                                    {it.user?.name}
                                  </span>
                                  <span
                                    className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md ${
                                      overdue.isOverdue
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-gray-200 text-gray-700'
                                    }`}
                                  >
                                    {overdue.isOverdue ? overdue.text : 'Belum Masuk'}
                                  </span>
                                </div>
                                {meta && (
                                  <p className="text-[10px] text-gray-500 font-medium mt-0.5">{meta}</p>
                                )}
                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 mt-1.5 pt-1.5 border-t border-amber-100">
                                  <Clock size={10} className="text-amber-500 shrink-0" />
                                  <span>Jadwal: {it.shift?.checkInTime || '-'} WIB</span>
                                  <span className="text-gray-400">➔</span>
                                  <span className={overdue.isOverdue ? 'text-amber-700 font-bold' : 'text-gray-500'}>
                                    {overdue.isOverdue ? `Belum Presensi (${overdue.text})` : `Shift Mulai ${it.shift?.checkInTime}`}
                                  </span>
                                </div>
                                
                                {/* Tombol WhatsApp */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendWhatsApp(it.user, it.shift, overdue.text);
                                  }}
                                  disabled={sendingWaId === it.user?.id}
                                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white text-[10px] font-bold rounded-lg transition-all active:scale-95 disabled:cursor-not-allowed"
                                  title="Kirim Notifikasi WhatsApp"
                                >
                                  {sendingWaId === it.user?.id ? (
                                    <>
                                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      <span>Mengirim...</span>
                                    </>
                                  ) : (
                                    <>
                                      <MessageCircle size={12} />
                                      <span>Kirim Notifikasi WA</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </SwipeableNotificationItem>
                          );
                        })}
                      </div>
                    )}

                    {/* ── BAGIAN 3: Pengajuan Perubahan Shift ── */}
                    {activeShiftChangeRequests.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider px-1">
                          <RefreshCw size={11} /> {activeShiftChangeRequests.length} Pengajuan Ganti Shift
                        </div>
                        {activeShiftChangeRequests.map((req: any) => {
                          const id = `shift_change_${req.id}`;
                          const reqDate = new Date(req.requestedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

                          return (
                            <SwipeableNotificationItem
                              key={id}
                              id={id}
                              onDismiss={handleDismiss}
                            >
                              <div className="bg-blue-50/70 hover:bg-blue-50 border border-blue-100 rounded-xl p-2.5 transition-colors text-left">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-black text-gray-900 leading-snug truncate">
                                    {req.user?.name}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-md">
                                    {reqDate}
                                  </span>
                                </div>
                                <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                  {req.user?.division?.name || 'Divisi tidak diketahui'}
                                </p>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 mt-1.5 pt-1.5 border-t border-blue-100/80">
                                  <RefreshCw size={10} className="text-blue-500 shrink-0" />
                                  <span>Shift Baru: {req.requestedShift?.name || '-'}</span>
                                  {req.requestedShift?.checkInTime && (
                                    <span className="text-gray-400">({req.requestedShift.checkInTime}–{req.requestedShift.checkOutTime})</span>
                                  )}
                                </div>
                              </div>
                            </SwipeableNotificationItem>
                          );
                        })}
                      </div>
                    )}
                  </>
                )
              ) : (
                // ── TAMPILAN KARYAWAN (Jadwal & Pengingat) ──
                hasActiveEmployeeSched || activeShiftChangeRequests.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between pb-1 px-1 mb-1">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles size={11} /> Pengingat & Notifikasi
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        Geser untuk hapus ↔
                      </span>
                    </div>

                    {/* Jadwal Hari Ini */}
                    {hasActiveEmployeeSched && (
                      <SwipeableNotificationItem
                        id={employeeSchedId}
                        onDismiss={handleDismiss}
                      >
                        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 text-left">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-1">
                            <Sparkles size={13} className="text-indigo-600" />
                            <span>Jadwal Kerja Anda Hari Ini</span>
                          </div>
                          <p className="text-xs font-black text-gray-900 mt-1">
                            {userSchedule.name} {userSchedule.description ? `(${userSchedule.description})` : ''}
                          </p>
                          <p className="text-[11px] font-semibold text-indigo-700 mt-0.5 flex items-center gap-1">
                            <Clock size={11} /> {userSchedule.checkInTime} – {userSchedule.checkOutTime} WIB
                          </p>
                        </div>
                      </SwipeableNotificationItem>
                    )}

                    {/* Pengajuan Shift Change Karyawan */}
                    {activeShiftChangeRequests.length > 0 && (
                      <div className={`space-y-1 ${hasActiveEmployeeSched ? 'mt-2' : ''}`}>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider px-1">
                          <RefreshCw size={11} /> Status Pengajuan Anda
                        </div>
                        {activeShiftChangeRequests.map((req: any) => {
                          const id = `shift_change_${req.id}`;
                          const reqDate = new Date(req.requestedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                          const statusColor = req.status === 'pending' ? 'bg-amber-500' : req.status === 'approved' ? 'bg-green-600' : 'bg-red-600';
                          const statusText = req.status === 'pending' ? 'Menunggu' : req.status === 'approved' ? 'Disetujui' : 'Ditolak';

                          return (
                            <SwipeableNotificationItem
                              key={id}
                              id={id}
                              onDismiss={handleDismiss}
                            >
                              <div className="bg-blue-50/70 hover:bg-blue-50 border border-blue-100 rounded-xl p-2.5 transition-colors text-left">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-black text-gray-900 leading-snug">
                                    Pengajuan {reqDate}
                                  </span>
                                  <span className={`shrink-0 text-[10px] font-black text-white px-2 py-0.5 rounded-md ${statusColor}`}>
                                    {statusText}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 mt-1.5">
                                  <RefreshCw size={10} className="text-blue-500 shrink-0" />
                                  <span>Shift: {req.requestedShift?.name || '-'}</span>
                                  {req.requestedShift?.checkInTime && (
                                    <span className="text-gray-400">({req.requestedShift.checkInTime}–{req.requestedShift.checkOutTime})</span>
                                  )}
                                </div>
                              </div>
                            </SwipeableNotificationItem>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-7 px-4 text-center">
                    <div className="w-11 h-11 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-gray-100">
                      <CheckCircle2 size={22} className="text-emerald-500" />
                    </div>
                    <p className="text-xs font-bold text-gray-800">
                      {isEmployeeSchedDismissed ? 'Notifikasi Dihapus 🎉' : 'Tidak ada jadwal hari ini'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {isEmployeeSchedDismissed
                        ? 'Pengingat jadwal sudah Anda bersihkan.'
                        : 'Nikmati waktu libur atau istirahat Anda.'}
                    </p>
                    {dismissedIds.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] text-indigo-600 font-medium flex items-center justify-center gap-1">
                          <RefreshCw size={11} />
                          <span>Tarik ke bawah untuk kembalikan</span>
                        </p>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

          </div>
        )}

      </div>
    </header>
  );
};

export default TopBar;
