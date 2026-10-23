import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, Calendar, FileText, Download, Send, Loader2 } from 'lucide-react';

type Props = {
  title: string;
  subtitle: string;
  onExport: () => void;
  onSendWa?: () => void;
  isSendingWa?: boolean;
  badgeCount?: number;
};

const ReportTabsNav = ({ title, subtitle, onExport, onSendWa, isSendingWa, badgeCount }: Props) => {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div className="space-y-3">
      {/* Header with Title, Send WA Button, and Export Button */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">{subtitle}</span>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onSendWa && (
            <button
              onClick={onSendWa}
              disabled={isSendingWa}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all disabled:opacity-50"
              title="Kirim Laporan Rekap ke Grup WhatsApp"
            >
              {isSendingWa ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Send size={13} />
              )}
              <span>{isSendingWa ? 'Mengirim...' : 'Kirim WA'}</span>
            </button>
          )}

          <button
            onClick={onExport}
            className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs hover:bg-gray-800 active:scale-95 transition-all"
            title="Unduh Data CSV / Excel"
          >
            <Download size={13} />
            <span>Ekspor</span>
          </button>
        </div>
      </div>

      {/* 3 Sub-menu Navigation Bar */}
      <div className="bg-gray-200/80 p-1 rounded-2xl flex gap-1">
        <Link
          to="/admin/reports/late"
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            currentPath.includes('/late')
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <AlertTriangle size={13} />
          <span>Telat Harian</span>
          {typeof badgeCount === 'number' && badgeCount > 0 && !currentPath.includes('/late') && (
            <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
              {badgeCount}
            </span>
          )}
        </Link>

        <Link
          to="/admin/reports/daily"
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            currentPath.includes('/daily')
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Calendar size={13} />
          <span>Harian</span>
        </Link>

        <Link
          to="/admin/reports/monthly"
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            currentPath.includes('/monthly')
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText size={13} />
          <span>Bulanan</span>
        </Link>
      </div>
    </div>
  );
};

export default ReportTabsNav;
