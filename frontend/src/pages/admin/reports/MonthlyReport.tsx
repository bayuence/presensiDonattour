import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2, Calendar, Users, FileText, Printer, Monitor, FileSpreadsheet, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ─── Tipe data ────────────────────────────────────────────────────────────────
type DayData = {
  shiftName: string | null;
  shiftIn: string | null;
  shiftOut: string | null;
  isOff: boolean;
  inTime: string | null;
  outTime: string | null;
  diffText: string | null; // Delta masuk (- telat / + awal)
  diffSeconds: number | null;
  isLate: boolean;
  isEarly: boolean;
  outDiffText: string | null; // Delta pulang (- cepat / + lembur)
  outDiffSeconds: number | null;
  isOutEarly: boolean;
  isOutLate: boolean;
  noOutScan: boolean; // True jika hadir masuk tapi tidak presensi pulang
  status: 'present' | 'off' | 'absent' | 'unscheduled' | 'upcoming';
  statusText: string;
  isBeforeJoin: boolean;
};

type UserRow = {
  user: {
    id: string;
    name: string;
    role: string;
    createdAt?: string;
    division?: { id: string; name: string } | null;
  };
  summary: {
    totalWorkDays: number;
    totalPresent: number;
    totalLateCount: number;
    totalLateSeconds: number;
    totalEarlySeconds: number;
    totalOff: number;
    totalAbsent: number;
    totalUnscheduled: number;
    totalUpcomingWork: number;
    presencePercent: number;
  };
  dailyData: Record<string, DayData>;
};

type DetailData = {
  success: boolean;
  month: string;
  todayWib?: string;
  periodLabel?: string;
  days: string[];
  users: UserRow[];
};

const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

// Helper format durasi detik yang rapi
const formatDuration = (totalSeconds: number, sign: '+' | '-') => {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const totalM = Math.round(totalSeconds / 60);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h > 0) return `${sign}${h}j ${m}m`;
  return `${sign}${totalM}m`;
};

const MonthlyReport = () => {
  const { user: currentUser } = useAuth();
  const tableRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const thisMonthStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const cleanTodayDate = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonthStr);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load divisions
  useEffect(() => {
    fetch('/api/divisions')
      .then((r) => r.json())
      .then((d) => { if (d.success) setDivisions(d.divisions); })
      .catch(console.error);
  }, []);

  // Fetch detail data
  useEffect(() => {
    setLoading(true);
    const divParam = selectedDivision ? `&divisionId=${selectedDivision}` : '';
    fetch(`/api/reports/monthly-detail?month=${selectedMonth}${divParam}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setDetailData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedMonth, selectedDivision]);

  if ((currentUser?.role || '').toLowerCase() !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // Label periode tanggal cutoff: 11 [Bulan] s/d 10 [Bulan Berikutnya]
  const [selYear, selMonth] = selectedMonth.split('-').map(Number);
  const nextMonthDate = new Date(selYear, selMonth, 1);
  const periodLabel = `11 ${MONTH_NAMES[selMonth - 1]} ${selYear} – 10 ${MONTH_NAMES[nextMonthDate.getMonth()]} ${nextMonthDate.getFullYear()}`;

  const [showExportModal, setShowExportModal] = useState(false);

  // ─── 1. Export PDF Kertas Biasa A4 (1 Lembar Pas Landscape - Format Atas Bawah) ─────
  const handleExportA4SinglePage = () => {
    if (!detailData) return;
    const days = detailData.days;
    const sortedUsers = [...(detailData.users || [])].sort((a, b) =>
      (a.user.name || '').localeCompare(b.user.name || '', 'id', { sensitivity: 'base' })
    );

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4', // 297mm x 210mm standar kertas biasa
    });

    const divName = selectedDivision ? (divisions.find(d => d.id === selectedDivision)?.name || 'Semua Divisi') : 'Semua Divisi';
    const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // Judul & Header Info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text('REKAP BULANAN PRESENSI LENGKAP - DONATTOUR', 4, 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Periode Cutoff: ${periodLabel}   |   Divisi: ${divName}   |   Total: ${sortedUsers.length} Karyawan   |   Dicetak: ${printDate}`, 4, 10);

    // Header tabel dengan teks 2 kata dibuat atas-bawah
    const head: any[] = [
      { content: 'NO', styles: { halign: 'center' } },
      { content: 'NAMA\nKARYAWAN', styles: { halign: 'left' } },
      { content: 'DIVISI', styles: { halign: 'left' } },
    ];

    for (const dStr of days) {
      const d = new Date(dStr);
      head.push({
        content: `${d.getDate()}\n${DAY_SHORT[d.getDay()]}`,
        styles: { halign: 'center' }
      });
    }

    head.push(
      { content: 'HADIR\nKERJA', styles: { halign: 'center' } },
      { content: 'TOTAL\nTELAT', styles: { halign: 'center' } },
      { content: 'LEBIH\nAWAL', styles: { halign: 'center' } },
      { content: 'TIDAK\nHADIR', styles: { halign: 'center' } },
      { content: 'BELUM\nJADWAL', styles: { halign: 'center' } }
    );

    const body: any[] = sortedUsers.map((u, idx) => {
      // Nama karyawan dibuat atas-bawah jika lebih dari 1 kata
      const nameParts = (u.user.name || '').trim().split(' ');
      const nameStacked = nameParts.length > 1 ? `${nameParts[0]}\n${nameParts.slice(1).join(' ')}` : (u.user.name || '-');

      const row: any[] = [
        String(idx + 1),
        nameStacked,
        u.user.division?.name || '-'
      ];

      for (const dStr of days) {
        const dd = u.dailyData[dStr];
        if (!dd || dd.status === 'unscheduled') {
          const t = dd?.isBeforeJoin ? 'BELUM\nMASUK' : 'BELUM\nJADWAL';
          row.push({
            content: t,
            styles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold' }
          });
        } else if (dd.status === 'off') {
          row.push({
            content: 'OFF\nLIBUR',
            styles: { fillColor: [220, 252, 231], textColor: [21, 128, 61], fontStyle: 'bold' }
          });
        } else if (dd.status === 'absent') {
          row.push({
            content: 'TIDAK\nHADIR',
            styles: { fillColor: [254, 226, 226], textColor: [185, 28, 28], fontStyle: 'bold' }
          });
        } else if (dd.status === 'upcoming') {
          row.push({
            content: `JADWAL\n${dd.shiftIn || '-'}`,
            styles: { fillColor: [239, 246, 255], textColor: [29, 78, 216] }
          });
        } else {
          // Hadir: Baris 1 Jam In, Baris 2 Jam Out (Atas-Bawah)
          let inLine = dd.inTime ? dd.inTime.slice(0, 5) : '-';
          if (dd.diffText) inLine += ` ${dd.diffText}`;
          
          let outLine = '-';

          if (dd.outTime) {
            outLine = dd.outTime.slice(0, 5);
            if (dd.outDiffText) outLine += ` ${dd.outDiffText}`;
          } else if (dd.noOutScan) {
            outLine = 'TDK OUT';

          }

          row.push({
            content: `${inLine}\n${outLine}`,
            styles: {
              textColor: dd.isLate ? [185, 28, 28] : dd.isEarly ? [21, 128, 61] : [15, 23, 42],
              fontStyle: dd.isLate ? 'bold' : 'normal'
            }
          });
        }
      }

      const s = u.summary;
      row.push(
        `${s.totalPresent}/${s.totalWorkDays}`,
        s.totalLateSeconds > 0 ? `-${Math.round(s.totalLateSeconds / 60)}m` : '0m',
        s.totalEarlySeconds > 0 ? `+${Math.round(s.totalEarlySeconds / 60)}m` : '0m',
        s.totalAbsent > 0 ? `${s.totalAbsent} hr` : '0',
        s.totalUnscheduled > 0 ? `${s.totalUnscheduled} hr` : '-'
      );
      return row;
    });

    autoTable(doc, {
      startY: 12,
      head: [head],
      body: body,
      theme: 'grid',
      styles: {
        fontSize: 3.8,
        cellPadding: 0.3,
        minCellHeight: 4,
        halign: 'center',
        valign: 'middle',
        overflow: 'linebreak',
        lineColor: [203, 213, 225],
        lineWidth: 0.15
      },
      headStyles: {
        fillColor: [30, 27, 75],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 3.9,
        minCellHeight: 4.5,
        halign: 'center',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 5 },
        1: { cellWidth: 20, halign: 'left' },
        2: { cellWidth: 12, halign: 'left' }
      },
      margin: { top: 4, left: 4, right: 4, bottom: 4 },
      didDrawPage: (data) => {
        doc.setFontSize(6);
        doc.setTextColor(148, 163, 184);
        doc.text(`Halaman ${data.pageNumber} (1 Lembar Kertas HVS A4 Landscape Pas)`, 220, 206);
      }
    });

    doc.save(`Rekap_Presensi_${cleanTodayDate}.pdf`);
    setShowExportModal(false);
  };

  // ─── 2. Export PDF Kertas Biasa A4 (Opsi 2 Lembar Landscape) ─────
  const handleExportA4PDF = () => {
    if (!detailData) return;
    const days = detailData.days;
    const sortedUsers = [...(detailData.users || [])].sort((a, b) =>
      (a.user.name || '').localeCompare(b.user.name || '', 'id', { sensitivity: 'base' })
    );

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4', // 297mm x 210mm standar kertas biasa
    });

    const divName = selectedDivision ? (divisions.find(d => d.id === selectedDivision)?.name || 'Semua Divisi') : 'Semua Divisi';
    const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // ── HALAMAN 1: PARUH PERTAMA (Tgl 11 s/d 25) ──────────────────────────
    const daysPart1 = days.slice(0, 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('REKAP PRESENSI BULANAN (PARUH 1: TGL 11 – 25) - DONATTOUR', 10, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Periode Cutoff: ${periodLabel}   |   Divisi: ${divName}   |   Total: ${sortedUsers.length} Karyawan   |   Dicetak: ${printDate}`, 10, 17);

    const head1Part1: any[] = [
      { content: 'No', rowSpan: 2 },
      { content: 'Nama Karyawan', rowSpan: 2 },
      { content: 'Divisi', rowSpan: 2 },
      { content: 'Posisi', rowSpan: 2 },
    ];
    for (const dateStr of daysPart1) {
      const d = new Date(dateStr);
      head1Part1.push({ content: `Tgl ${d.getDate()}\n${DAY_SHORT[d.getDay()]}`, colSpan: 2, styles: { halign: 'center' } });
    }

    const head2Part1: string[] = [];
    for (let i = 0; i < daysPart1.length; i++) {
      head2Part1.push('In', 'Out');
    }

    const bodyPart1 = sortedUsers.map((u, idx) => {
      const row: any[] = [String(idx + 1), u.user.name, u.user.division?.name || '-', u.user.role || '-'];
      for (const dateStr of daysPart1) {
        const dd = u.dailyData[dateStr];
        if (!dd || dd.status === 'unscheduled') {
          row.push({ content: dd?.isBeforeJoin ? 'Belum Masuk' : 'No Sched', colSpan: 2, styles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], halign: 'center', fontStyle: 'bold' } });
        } else if (dd.status === 'off') {
          const isIzin = (dd.shiftName || '').toUpperCase().includes('IZIN');
          row.push({
            content: isIzin ? 'IZIN' : 'OFF',
            colSpan: 2,
            styles: {
              fillColor: isIzin ? [254, 243, 199] : [220, 252, 231],
              textColor: isIzin ? [180, 83, 9] : [21, 128, 61],
              halign: 'center',
              fontStyle: 'bold'
            }
          });
        } else if (dd.status === 'absent') {
          row.push({ content: `TIDAK HADIR\n${dd.shiftIn || ''}`, colSpan: 2, styles: { fillColor: [254, 226, 226], textColor: [185, 28, 28], halign: 'center', fontStyle: 'bold' } });
        } else if (dd.status === 'upcoming') {
          row.push({ content: `Jadwal\n${dd.shiftIn || ''}`, colSpan: 2, styles: { fillColor: [239, 246, 255], textColor: [29, 78, 216], halign: 'center' } });
        } else {
          const inContent = dd.diffText ? `${dd.inTime}\n${dd.diffText}` : (dd.inTime || '-');
          let outContent = '-';
          let outColor: [number, number, number] = [29, 78, 216];
          if (dd.outTime) {
            outContent = dd.outDiffText ? `${dd.outTime}\n${dd.outDiffText}` : dd.outTime;
            outColor = dd.isOutEarly ? [180, 83, 9] : [29, 78, 216];
          } else if (dd.noOutScan) {
            outContent = 'Tidak Out';
            outColor = [194, 65, 12];
          }
          row.push(
            { content: inContent, styles: { textColor: dd.isLate ? [220, 38, 38] : dd.isEarly ? [22, 163, 74] : [15, 23, 42], fontStyle: 'bold' } },
            { content: outContent, styles: { textColor: outColor, fontStyle: dd.noOutScan ? 'bold' : 'normal' } }
          );
        }
      }
      return row;
    });

    const colStylesPart1: Record<number, any> = {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 32, halign: 'left' },
      2: { cellWidth: 20, halign: 'left' },
      3: { cellWidth: 18, halign: 'left' },
    };
    // 281 mm printable - 78 mm fixed = 203 mm / 30 cols = ~6.7mm
    const daysPart1Count = daysPart1.length;
    const subColWidthPart1 = Math.min(6.7, Math.floor((203 / (daysPart1Count * 2)) * 10) / 10);
    let cIdx = 4;
    for (let i = 0; i < daysPart1Count; i++) {
      colStylesPart1[cIdx] = { cellWidth: subColWidthPart1, halign: 'center' };
      colStylesPart1[cIdx + 1] = { cellWidth: subColWidthPart1, halign: 'center' };
      cIdx += 2;
    }

    autoTable(doc, {
      startY: 21,
      head: [head1Part1, head2Part1],
      body: bodyPart1,
      theme: 'grid',
      styles: { fontSize: 5, cellPadding: 0.8, halign: 'center', valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [30, 27, 75], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 5.5 },
      columnStyles: colStylesPart1,
      margin: { top: 8, left: 8, right: 8, bottom: 8 },
      didDrawPage: (_data) => {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Halaman 1: Paruh Pertama (Tgl 11 – 25)', doc.internal.pageSize.width - 56, doc.internal.pageSize.height - 4);
      }
    });

    // ── HALAMAN 2: PARUH KEDUA (Tgl 26 s/d 10) + TOTAL RINGKASAN ─────────
    doc.addPage('a4', 'landscape');
    const daysPart2 = days.slice(15);
    const daysPart2Count = daysPart2.length;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('REKAP PRESENSI BULANAN (PARUH 2 & RINGKASAN: TGL 26 – 10) - DONATTOUR', 10, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Periode Cutoff: ${periodLabel}   |   Divisi: ${divName}   |   Total: ${sortedUsers.length} Karyawan   |   Dicetak: ${printDate}`, 10, 17);

    const head1Part2: any[] = [
      { content: 'No', rowSpan: 2 },
      { content: 'Nama Karyawan', rowSpan: 2 },
    ];
    for (const dateStr of daysPart2) {
      const d = new Date(dateStr);
      head1Part2.push({ content: `Tgl ${d.getDate()}\n${DAY_SHORT[d.getDay()]}`, colSpan: 2, styles: { halign: 'center' } });
    }
    head1Part2.push(
      { content: 'Hadir', rowSpan: 2 },
      { content: 'Total Telat (-)', rowSpan: 2 },
      { content: 'Lebih Awal (+)', rowSpan: 2 },
      { content: 'Tidak Hadir', rowSpan: 2 },
      { content: 'Belum Jadwal', rowSpan: 2 }
    );

    const head2Part2: string[] = [];
    for (let i = 0; i < daysPart2Count; i++) {
      head2Part2.push('In', 'Out');
    }

    const bodyPart2 = sortedUsers.map((u, idx) => {
      const row: any[] = [String(idx + 1), u.user.name];
      for (const dateStr of daysPart2) {
        const dd = u.dailyData[dateStr];
        if (!dd || dd.status === 'unscheduled') {
          row.push({ content: dd?.isBeforeJoin ? 'Belum Masuk' : 'No Sched', colSpan: 2, styles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], halign: 'center', fontStyle: 'bold' } });
        } else if (dd.status === 'off') {
          const isIzin = (dd.shiftName || '').toUpperCase().includes('IZIN');
          row.push({
            content: isIzin ? 'IZIN' : 'OFF',
            colSpan: 2,
            styles: {
              fillColor: isIzin ? [254, 243, 199] : [220, 252, 231],
              textColor: isIzin ? [180, 83, 9] : [21, 128, 61],
              halign: 'center',
              fontStyle: 'bold'
            }
          });
        } else if (dd.status === 'absent') {
          row.push({ content: `TIDAK HADIR\n${dd.shiftIn || ''}`, colSpan: 2, styles: { fillColor: [254, 226, 226], textColor: [185, 28, 28], halign: 'center', fontStyle: 'bold' } });
        } else if (dd.status === 'upcoming') {
          row.push({ content: `Jadwal\n${dd.shiftIn || ''}`, colSpan: 2, styles: { fillColor: [239, 246, 255], textColor: [29, 78, 216], halign: 'center' } });
        } else {
          const inContent = dd.diffText ? `${dd.inTime}\n${dd.diffText}` : (dd.inTime || '-');
          let outContent = '-';
          let outColor: [number, number, number] = [29, 78, 216];
          if (dd.outTime) {
            outContent = dd.outDiffText ? `${dd.outTime}\n${dd.outDiffText}` : dd.outTime;
            outColor = dd.isOutEarly ? [180, 83, 9] : [29, 78, 216];
          } else if (dd.noOutScan) {
            outContent = 'Tdk Out';
            outColor = [194, 65, 12];
          }
          row.push(
            { content: inContent, styles: { textColor: dd.isLate ? [220, 38, 38] : dd.isEarly ? [22, 163, 74] : [15, 23, 42], fontStyle: 'bold' } },
            { content: outContent, styles: { textColor: outColor, fontStyle: dd.noOutScan ? 'bold' : 'normal' } }
          );
        }
      }
      const s = u.summary;
      row.push(
        `${s.totalPresent}/${s.totalWorkDays}`,
        s.totalLateSeconds > 0 ? formatDuration(s.totalLateSeconds, '-') : '0m',
        s.totalEarlySeconds > 0 ? formatDuration(s.totalEarlySeconds, '+') : '0m',
        s.totalAbsent > 0 ? `${s.totalAbsent} hr` : '0',
        s.totalUnscheduled > 0 ? `${s.totalUnscheduled} hr` : '-'
      );
      return row;
    });

    // 281 mm printable: Fixed No (8) + Nama (28) + 5 Ringkasan (12+15+15+13+13=68) = 104 mm
    // Remaining for dates = 177 mm -> ~5.5mm per sub-column
    const subColWidthPart2 = Math.min(6.5, Math.floor((177 / (daysPart2Count * 2)) * 10) / 10);

    const colStylesPart2: Record<number, any> = {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 28, halign: 'left' },
    };
    let cIdx2 = 2;
    for (let i = 0; i < daysPart2Count; i++) {
      colStylesPart2[cIdx2] = { cellWidth: subColWidthPart2, halign: 'center' };
      colStylesPart2[cIdx2 + 1] = { cellWidth: subColWidthPart2, halign: 'center' };
      cIdx2 += 2;
    }
    colStylesPart2[cIdx2] = { cellWidth: 12, halign: 'center', fontStyle: 'bold' };
    colStylesPart2[cIdx2 + 1] = { cellWidth: 15, halign: 'center', fontStyle: 'bold' };
    colStylesPart2[cIdx2 + 2] = { cellWidth: 15, halign: 'center', fontStyle: 'bold' };
    colStylesPart2[cIdx2 + 3] = { cellWidth: 13, halign: 'center', fontStyle: 'bold' };
    colStylesPart2[cIdx2 + 4] = { cellWidth: 13, halign: 'center', fontStyle: 'bold' };

    autoTable(doc, {
      startY: 21,
      head: [head1Part2, head2Part2],
      body: bodyPart2,
      theme: 'grid',
      styles: { fontSize: 5, cellPadding: 0.8, halign: 'center', valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [30, 27, 75], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 5.5 },
      columnStyles: colStylesPart2,
      margin: { top: 8, left: 8, right: 8, bottom: 8 },
      didDrawPage: (_data) => {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Halaman 2: Paruh Kedua & Ringkasan (Tgl 26 – 10)', doc.internal.pageSize.width - 70, doc.internal.pageSize.height - 4);
      }
    });

    doc.save(`Rekap_Presensi_${cleanTodayDate}.pdf`);
    setShowExportModal(false);
  };

  // ─── 2. Export PDF Kanvas Lebar (Untuk Ditinjau di Layar Laptop / Komputer) ──────
  const handleExportWidePDF = () => {
    if (!detailData) return;
    const days = detailData.days;
    const daysCount = days.length;

    const colNoWidth = 12;
    const colNameWidth = 55;
    const colDivWidth = 34;
    const colPosWidth = 30;
    const subColWidth = 19;
    const datesTotalWidth = daysCount * (subColWidth * 2);
    const summaryTotalWidth = 26 + 30 + 30 + 28 + 28;
    const marginX = 14;

    const pageWidth = colNoWidth + colNameWidth + colDivWidth + colPosWidth + datesTotalWidth + summaryTotalWidth + (marginX * 2);
    const sortedUsers = [...(detailData.users || [])].sort((a, b) =>
      (a.user.name || '').localeCompare(b.user.name || '', 'id', { sensitivity: 'base' })
    );
    const pageHeight = Math.max(380, 50 + (sortedUsers.length * 11) + 40);

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [pageWidth, pageHeight],
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text('REKAP BULANAN PRESENSI LENGKAP - DONATTOUR', marginX, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    const divName = selectedDivision ? (divisions.find(d => d.id === selectedDivision)?.name || 'Semua Divisi') : 'Semua Divisi';
    const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Periode Cutoff: ${periodLabel}   |   Divisi: ${divName}   |   Total Karyawan: ${sortedUsers.length} Orang   |   Dicetak: ${printDate}`, marginX, 24);

    const head1: any[] = [
      { content: 'No', rowSpan: 2 },
      { content: 'Nama Karyawan', rowSpan: 2 },
      { content: 'Divisi', rowSpan: 2 },
      { content: 'Posisi', rowSpan: 2 },
    ];

    for (const dateStr of days) {
      const d = new Date(dateStr);
      const isNextMonth = d.getDate() <= 10;
      const monthTag = isNextMonth ? ` ${MONTH_NAMES[d.getMonth()]}` : '';
      const label = `Tgl ${d.getDate()}${monthTag}\n${DAY_SHORT[d.getDay()]}`;
      head1.push({ content: label, colSpan: 2, styles: { halign: 'center' } });
    }

    head1.push(
      { content: 'Hadir\n(Kerja)', rowSpan: 2 },
      { content: 'Total Telat\n(-)', rowSpan: 2 },
      { content: 'Lebih Awal\n(+)', rowSpan: 2 },
      { content: 'Tidak Hadir\n(Mangkir)', rowSpan: 2 },
      { content: 'Belum Jadwal\n(Kary. Baru)', rowSpan: 2 },
    );

    const head2: string[] = [];
    for (let i = 0; i < daysCount; i++) {
      head2.push('In', 'Out');
    }

    const body: any[] = sortedUsers.map((u, idx) => {
      const row: any[] = [
        String(idx + 1),
        u.user.name,
        u.user.division?.name || '-',
        u.user.role || '-'
      ];

      for (const dateStr of days) {
        const dd = u.dailyData[dateStr];
        if (!dd || dd.status === 'unscheduled') {
          const text = dd?.isBeforeJoin ? 'Belum Masuk' : 'Belum Terjadwal';
          row.push({
            content: text,
            colSpan: 2,
            styles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], halign: 'center', fontStyle: 'bold' }
          });
        } else if (dd.status === 'off') {
          row.push({
            content: 'OFF / LIBUR',
            colSpan: 2,
            styles: { fillColor: [220, 252, 231], textColor: [21, 128, 61], halign: 'center', fontStyle: 'bold' }
          });
        } else if (dd.status === 'absent') {
          const shiftInfo = dd.shiftIn ? `Shift ${dd.shiftIn}` : '';
          row.push({
            content: `TIDAK HADIR\n${shiftInfo}`,
            colSpan: 2,
            styles: { fillColor: [254, 226, 226], textColor: [185, 28, 28], halign: 'center', fontStyle: 'bold' }
          });
        } else if (dd.status === 'upcoming') {
          row.push({
            content: `Terjadwal\n[${dd.shiftIn || '-'}]`,
            colSpan: 2,
            styles: { fillColor: [239, 246, 255], textColor: [29, 78, 216], halign: 'center', fontStyle: 'bold' }
          });
        } else {
          const inContent = dd.diffText ? `${dd.inTime}\n${dd.diffText}` : (dd.inTime || '-');
          let outContent = '-';
          let outColor: [number, number, number] = [29, 78, 216];
          let outBold: 'bold' | 'normal' = 'normal';

          if (dd.outTime) {
            outContent = dd.outDiffText ? `${dd.outTime}\n${dd.outDiffText}` : dd.outTime;
            outColor = dd.isOutEarly ? [180, 83, 9] : [29, 78, 216];
          } else if (dd.noOutScan) {
            outContent = 'Tidak Out';
            outColor = [194, 65, 12];
            outBold = 'bold';
          }

          row.push(
            {
              content: inContent,
              styles: {
                textColor: dd.isLate ? [220, 38, 38] : dd.isEarly ? [22, 163, 74] : [15, 23, 42],
                fontStyle: 'bold'
              }
            },
            {
              content: outContent,
              styles: {
                textColor: outColor,
                fontStyle: outBold
              }
            }
          );
        }
      }

      const s = u.summary;
      row.push(
        `${s.totalPresent} / ${s.totalWorkDays}`,
        s.totalLateSeconds > 0 ? formatDuration(s.totalLateSeconds, '-') : '0m',
        s.totalEarlySeconds > 0 ? formatDuration(s.totalEarlySeconds, '+') : '0m',
        s.totalAbsent > 0 ? `${s.totalAbsent} hr` : '0',
        s.totalUnscheduled > 0 ? `${s.totalUnscheduled} hr` : '-'
      );

      return row;
    });

    const columnStyles: Record<number, any> = {
      0: { cellWidth: colNoWidth, halign: 'center' },
      1: { cellWidth: colNameWidth, halign: 'left' },
      2: { cellWidth: colDivWidth, halign: 'left' },
      3: { cellWidth: colPosWidth, halign: 'left' },
    };

    let colIdx = 4;
    for (let i = 0; i < daysCount; i++) {
      columnStyles[colIdx] = { cellWidth: subColWidth, halign: 'center' };
      columnStyles[colIdx + 1] = { cellWidth: subColWidth, halign: 'center' };
      colIdx += 2;
    }

    columnStyles[colIdx] = { cellWidth: 26, halign: 'center', fontStyle: 'bold' };
    columnStyles[colIdx + 1] = { cellWidth: 30, halign: 'center', fontStyle: 'bold' };
    columnStyles[colIdx + 2] = { cellWidth: 30, halign: 'center', fontStyle: 'bold' };
    columnStyles[colIdx + 3] = { cellWidth: 28, halign: 'center', fontStyle: 'bold' };
    columnStyles[colIdx + 4] = { cellWidth: 28, halign: 'center', fontStyle: 'bold' };

    autoTable(doc, {
      startY: 28,
      head: [head1, head2],
      body,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        overflow: 'linebreak',
        halign: 'center',
        valign: 'middle',
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [30, 27, 75],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles,
      margin: { top: 12, left: marginX, right: marginX, bottom: 12 },
      didDrawPage: (data) => {
        const str = `Halaman ${data.pageNumber}`;
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text(str, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 6);
      }
    });

    doc.save(`Rekap_Presensi_${cleanTodayDate}.pdf`);
    setShowExportModal(false);
  };

  // ─── 3. Export Excel Spreadsheet ──────────────────────────────────────────
  const handleExportExcel = () => {
    if (!detailData) return;
    const days = detailData.days;
    const sortedUsers = [...(detailData.users || [])].sort((a, b) =>
      (a.user.name || '').localeCompare(b.user.name || '', 'id', { sensitivity: 'base' })
    );

    const headerRow1: string[] = ['No', 'Nama Karyawan', 'Divisi', 'Jabatan / Role'];
    const headerRow2: string[] = ['', '', '', ''];

    for (const dateStr of days) {
      const d = new Date(dateStr);
      const isNextMonth = d.getDate() <= 10;
      const monthTag = isNextMonth ? ` (${MONTH_NAMES[d.getMonth()]})` : '';
      headerRow1.push(`Tgl ${d.getDate()}${monthTag} [${DAY_SHORT[d.getDay()]}]`, '');
      headerRow2.push('In', 'Out');
    }

    headerRow1.push('Hadir/Kerja', 'Total Telat (-)', 'Lebih Awal (+)', 'Tidak Hadir', 'Belum Jadwal');
    headerRow2.push('', '', '', '', '');

    const dataRows = sortedUsers.map((u, idx) => {
      const row: string[] = [String(idx + 1), u.user.name, u.user.division?.name || '-', u.user.role || '-'];
      for (const dateStr of days) {
        const dd = u.dailyData[dateStr];
        if (!dd || dd.status === 'unscheduled') {
          row.push(dd?.isBeforeJoin ? 'Belum Masuk' : 'Belum Terjadwal', '-');
        } else if (dd.status === 'off') {
          const isIzin = (dd.shiftName || '').toUpperCase().includes('IZIN');
          row.push(isIzin ? 'IZIN' : 'OFF', isIzin ? 'IZIN' : 'OFF');
        } else if (dd.status === 'absent') {
          row.push(`TIDAK HADIR (${dd.shiftIn || ''})`, '-');
        } else if (dd.status === 'upcoming') {
          row.push(`Terjadwal (${dd.shiftIn || ''})`, '-');
        } else {
          const inCell = dd.diffText ? `${dd.inTime} (${dd.diffText})` : (dd.inTime || '-');
          let outCell = '-';
          if (dd.outTime) {
            outCell = dd.outDiffText ? `${dd.outTime} (${dd.outDiffText})` : dd.outTime;
          } else if (dd.noOutScan) {
            outCell = 'Tidak Out';
          }
          row.push(inCell, outCell);
        }
      }
      const s = u.summary;
      row.push(
        `${s.totalPresent} / ${s.totalWorkDays}`,
        s.totalLateSeconds > 0 ? formatDuration(s.totalLateSeconds, '-') : '0m',
        s.totalEarlySeconds > 0 ? formatDuration(s.totalEarlySeconds, '+') : '0m',
        `${s.totalAbsent} hr`,
        s.totalUnscheduled > 0 ? `${s.totalUnscheduled} hr` : '-'
      );
      return row;
    });

    const ws = XLSX.utils.aoa_to_sheet([
      [`REKAP BULANAN PRESENSI LENGKAP - PERIODE ${periodLabel.toUpperCase()}`],
      [],
      headerRow1,
      headerRow2,
      ...dataRows
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Detail');
    XLSX.writeFile(wb, `Rekap_Presensi_${cleanTodayDate}.xlsx`);
    setShowExportModal(false);
  };

  const users = [...(detailData?.users || [])].sort((a, b) =>
    (a.user.name || '').localeCompare(b.user.name || '', 'id', { sensitivity: 'base' })
  );
  const days = detailData?.days || [];

  return (
    <div className="pb-24 pt-2 px-2.5 max-w-full mx-auto space-y-3">

      {/* ─── Header & Filter Card ─── */}
      <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-xs space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/80 uppercase tracking-wider px-1.5 py-0.5 rounded">
                Laporan Eksekutif
              </span>
              <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                Cutoff 11–10
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight mt-1 truncate">
              Rekap Bulanan Lengkap
            </h1>
            <p className="text-[10px] text-gray-500 font-medium flex items-center gap-1 mt-0.5">
              <Calendar size={11} className="text-indigo-500 shrink-0" />
              <span className="truncate">Periode: <strong className="text-gray-800">{periodLabel}</strong></span>
            </p>
          </div>

          <button
            onClick={() => setShowExportModal(true)}
            disabled={!detailData || loading}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 text-white text-[11px] font-bold px-3 py-2 rounded-xl shadow-xs active:scale-95 transition-all shrink-0 disabled:opacity-40"
          >
            <FileText size={13} />
            <span>Unduh PDF</span>
          </button>
        </div>

        {/* Filter Input & Dropdown */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Bulan Cutoff</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Filter Divisi</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Semua ({users.length} Karyawan)</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-xs">
          <Loader2 size={24} className="animate-spin text-indigo-600" />
          <span className="text-[11px] text-gray-500 font-bold">Memuat rekap presensi...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-xs font-medium space-y-1.5">
          <Users size={28} className="mx-auto text-gray-300" />
          <p className="font-bold text-gray-700 text-sm">Tidak ada data karyawan/presensi.</p>
        </div>
      ) : (
        <>
          {/* ─── Ringkasan Eksekutif ─── */}
          {detailData && (() => {
            const total = users.length;
            const avgPct = total > 0 ? Math.round(users.reduce((s, u) => s + u.summary.presencePercent, 0) / total) : 0;
            const totalLateSec = users.reduce((s, u) => s + u.summary.totalLateSeconds, 0);
            const totalEarlySec = users.reduce((s, u) => s + u.summary.totalEarlySeconds, 0);
            const totalRealAbsent = users.reduce((s, u) => s + u.summary.totalAbsent, 0);
            const totalUnscheduledDays = users.reduce((s, u) => s + u.summary.totalUnscheduled, 0);

            return (
              <div className="space-y-2">
                {/* Baris 1: Karyawan & Rata-rata Hadir */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">Karyawan</p>
                      <p className="text-base font-black text-indigo-950 mt-0.5">{total} Orang</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Avg Hadir</p>
                      <p className="text-base font-black text-emerald-700 mt-0.5">{avgPct}%</p>
                    </div>
                  </div>

                  {/* Card 2: Tidak Hadir (Mangkir) & Belum Terjadwal */}
                  <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">Tidak Hadir</p>
                      <p className="text-base font-black text-rose-700 mt-0.5">{totalRealAbsent} Hari</p>
                    </div>
                    {totalUnscheduledDays > 0 && (
                      <div className="text-right">
                        <p className="text-[8px] font-bold text-gray-400 uppercase">Belum Jadwal</p>
                        <p className="text-xs font-black text-gray-600 mt-0.5">{totalUnscheduledDays} hr</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Baris 2: Akumulasi Telat (-) & Lebih Awal (+) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Total Telat (-)</p>
                      <span className="text-[8px] font-bold text-amber-600 bg-amber-100 px-1 py-0.2 rounded">Terlambat</span>
                    </div>
                    <p className="text-sm font-black text-amber-900 mt-0.5">{formatDuration(totalLateSec, '-')}</p>
                  </div>

                  <div className="bg-teal-50/70 border border-teal-200/60 rounded-xl p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-bold text-teal-700 uppercase tracking-wider">Lebih Awal (+)</p>
                      <span className="text-[8px] font-bold text-teal-600 bg-teal-100 px-1 py-0.2 rounded">Cepat</span>
                    </div>
                    <p className="text-sm font-black text-teal-900 mt-0.5">{formatDuration(totalEarlySec, '+')}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── Petunjuk Ringkas & Panduan Simbol ─── */}
          <div className="bg-white rounded-xl border border-gray-200 px-2.5 py-2 flex items-center justify-between gap-1.5 flex-wrap text-[10px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-gray-500">Status:</span>
              <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-black text-[8px]">TIDAK HADIR</span>
              <span className="text-gray-500">Mangkir jadwal</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[8px]">Belum Terjadwal</span>
              <span className="text-gray-500">Karyawan baru</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[8px]">Tidak Out</span>
              <span className="text-gray-500">Lupa scan pulang</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[8px]">OFF</span>
            </div>
            <span className="text-[9px] text-indigo-600 font-bold shrink-0">← Geser tabel →</span>
          </div>

          {/* ─── Tabel Scroll Horizontal Detail ─── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div ref={tableRef} style={{ overflowX: 'auto', maxHeight: '58vh' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  {/* 1. Nama (sticky left) */}
                  <col style={{ width: 124, minWidth: 124 }} />
                  {/* 2. Divisi / Posisi */}
                  <col style={{ width: 96, minWidth: 96 }} />
                  {/* 3. Per tanggal: 2 sub-kolom In & Out berurutan untuk tiap tanggal */}
                  {days.map((d) => (
                    <React.Fragment key={d}>
                      <col style={{ width: 68, minWidth: 68 }} />
                      <col style={{ width: 68, minWidth: 68 }} />
                    </React.Fragment>
                  ))}
                  {/* 4. Kolom Ringkasan Kanan */}
                  <col style={{ width: 68, minWidth: 68 }} />
                  <col style={{ width: 78, minWidth: 78 }} />
                  <col style={{ width: 78, minWidth: 78 }} />
                  <col style={{ width: 78, minWidth: 78 }} />
                  <col style={{ width: 78, minWidth: 78 }} />
                </colgroup>

                <thead>
                  {/* Baris Header 1: Tanggal Group */}
                  <tr>
                    <th rowSpan={2} style={stickyThLeft}>
                      NAMA KARYAWAN
                      <div style={{ fontSize: 7, fontWeight: 600, color: '#c7d2fe', textTransform: 'none' }}>Urut Abjad (A-Z)</div>
                    </th>
                    <th rowSpan={2} style={{ ...thTop, borderLeft: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569' }}>
                      DIVISI / POSISI
                    </th>

                    {days.map((dateStr) => {
                      const d = new Date(dateStr);
                      const dow = d.getDay();
                      const isSun = dow === 0;
                      const isSat = dow === 6;
                      const isNextMonth = d.getDate() <= 10;
                      const isToday = dateStr === `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

                      return (
                        <th
                          key={dateStr}
                          colSpan={2}
                          style={{
                            ...thTop,
                            background: isToday
                              ? '#4f46e5'
                              : isNextMonth
                              ? '#eff6ff'
                              : isSun
                              ? '#fff1f2'
                              : isSat
                              ? '#fdf4ff'
                              : '#f8fafc',
                            color: isToday
                              ? '#ffffff'
                              : isNextMonth
                              ? '#1d4ed8'
                              : isSun
                              ? '#e11d48'
                              : isSat
                              ? '#7e22ce'
                              : '#334155',
                            borderLeft: '2px solid #cbd5e1',
                            fontSize: 10,
                            fontWeight: 900,
                            padding: '4px 2px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <span>{d.getDate()}</span>
                            {isNextMonth && (
                              <span style={{ fontSize: 7, padding: '0 2px', borderRadius: 2, background: '#dbeafe', color: '#1e40af', fontWeight: 800 }}>
                                {MONTH_NAMES[d.getMonth()]}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 8, opacity: 0.85, fontWeight: 700 }}>{DAY_SHORT[dow]}</div>
                        </th>
                      );
                    })}

                    {/* Header Ringkasan Kanan */}
                    <th rowSpan={2} style={{ ...thTop, background: '#eef2ff', color: '#3730a3', borderLeft: '3px solid #6366f1', fontSize: 9 }}>
                      HADIR
                      <div style={{ fontSize: 7, opacity: 0.8 }}>(Hadir/Kerja)</div>
                    </th>
                    <th rowSpan={2} style={{ ...thTop, background: '#fff1f2', color: '#9f1239', borderLeft: '1px solid #fecdd3', fontSize: 9 }}>
                      TOTAL TELAT
                      <div style={{ fontSize: 7, opacity: 0.9 }}>Tanda (-)</div>
                    </th>
                    <th rowSpan={2} style={{ ...thTop, background: '#f0fdf4', color: '#166534', borderLeft: '1px solid #bbf7d0', fontSize: 9 }}>
                      LEBIH AWAL
                      <div style={{ fontSize: 7, opacity: 0.9 }}>Tanda (+)</div>
                    </th>
                    <th rowSpan={2} style={{ ...thTop, background: '#fff1f2', color: '#991b1b', borderLeft: '1px solid #fecdd3', fontSize: 9 }}>
                      TIDAK HADIR
                      <div style={{ fontSize: 7, opacity: 0.9 }}>(Dari Jadwal)</div>
                    </th>
                    <th rowSpan={2} style={{ ...thTop, background: '#f8fafc', color: '#475569', borderLeft: '1px solid #e2e8f0', fontSize: 8 }}>
                      BELUM JADWAL
                      <div style={{ fontSize: 7, opacity: 0.8 }}>(Kary. Baru)</div>
                    </th>
                  </tr>

                  {/* Baris Header 2: Sub-kolom In & Out */}
                  <tr>
                    {days.map((dateStr) => {

                      const isToday = dateStr === `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
                      const bg = isToday ? '#6366f1' : '#f1f5f9';

                      return [
                        <th
                          key={dateStr + '-in'}
                          style={{
                            ...thTop,
                            top: 28,
                            background: bg,
                            color: isToday ? '#fff' : '#059669',
                            fontSize: 8,
                            fontWeight: 800,
                            borderLeft: '2px solid #cbd5e1',
                            padding: '2px 1px',
                          }}
                        >
                          In
                        </th>,
                        <th
                          key={dateStr + '-out'}
                          style={{
                            ...thTop,
                            top: 28,
                            background: bg,
                            color: isToday ? '#fff' : '#2563eb',
                            fontSize: 8,
                            fontWeight: 800,
                            padding: '2px 1px',
                          }}
                        >
                          Out
                        </th>,
                      ];
                    })}
                  </tr>
                </thead>

                <tbody>
                  {users.map((u, uIdx) => {
                    const s = u.summary;
                    const rowBg = uIdx % 2 === 0 ? '#ffffff' : '#f8fafc';

                    return (
                      <tr key={u.user.id} style={{ height: 42 }}>
                        {/* 1. NAMA (Sticky Kolom Kiri) */}
                        <td
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 6,
                            background: rowBg,
                            borderRight: '2px solid #cbd5e1',
                            borderBottom: '1px solid #e2e8f0',
                            padding: '3px 6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <div style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.user.name}
                          </div>
                        </td>

                        {/* 2. DIVISI / POSISI */}
                        <td style={{ ...td(rowBg), borderLeft: '1px solid #e2e8f0', textAlign: 'left', padding: '3px 5px' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#334155', lineHeight: 1.15, maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.user.division?.name || '—'}
                          </div>
                          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, marginTop: 1, maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.user.role || '—'}
                          </div>
                        </td>

                        {/* 3. PER TANGGAL: TAMPILAN JELAS TANPA KOSONGAN PUTIH */}
                        {days.map((dateStr) => {
                          const dd = u.dailyData[dateStr];
                          const d = new Date(dateStr);
                          const isSun = d.getDay() === 0;
                          const isSat = d.getDay() === 6;
                          const cellBg = isSun ? '#fff5f5' : isSat ? '#faf5ff' : rowBg;

                          // KASUS 1: BELUM TERJADWAL / KARYAWAN BARU (Blok abu-abu jelas)
                          if (!dd || dd.status === 'unscheduled') {
                            const isNew = dd?.isBeforeJoin;
                            return (
                              <td
                                key={dateStr + '-unsched'}
                                colSpan={2}
                                style={{
                                  ...td(cellBg),
                                  borderLeft: '2px solid #cbd5e1',
                                  padding: '3px 2px',
                                }}
                              >
                                <div style={{
                                  background: isNew ? '#f1f5f9' : '#f8fafc',
                                  border: isNew ? '1px dashed #cbd5e1' : '1px solid #e2e8f0',
                                  borderRadius: 4,
                                  padding: '2px 4px',
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: isNew ? '#475569' : '#64748b',
                                  textAlign: 'center',
                                  lineHeight: 1.2,
                                }}>
                                  {isNew ? 'Belum Masuk' : 'Belum Terjadwal'}
                                </div>
                              </td>
                            );
                          }

                          // KASUS 2: OFF / LIBUR (Blok hijau jelas)
                          if (dd.status === 'off') {
                            return (
                              <td
                                key={dateStr + '-off'}
                                colSpan={2}
                                style={{
                                  ...td('#f0fdf4'),
                                  borderLeft: '2px solid #cbd5e1',
                                  padding: '3px 2px',
                                }}
                              >
                                <div style={{
                                  background: '#dcfce7',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: 4,
                                  padding: '2px 4px',
                                  fontSize: 8.5,
                                  fontWeight: 800,
                                  color: '#15803d',
                                  textAlign: 'center',
                                }}>
                                  OFF / LIBUR
                                </div>
                              </td>
                            );
                          }

                          // KASUS 3: SUDAH DIJADWAL NAMUN TIDAK HADIR (BLOK BESAR MERAH TEGAS)
                          if (dd.status === 'absent') {
                            return (
                              <td
                                key={dateStr + '-absent'}
                                colSpan={2}
                                style={{
                                  ...td('#fee2e2'),
                                  borderLeft: '2px solid #f87171',
                                  borderRight: '1px solid #fca5a5',
                                  padding: '2px 2px',
                                }}
                              >
                                <div style={{
                                  background: '#ef4444',
                                  borderRadius: 4,
                                  padding: '2px 3px',
                                  color: '#ffffff',
                                  textAlign: 'center',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}>
                                  <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.04em' }}>
                                    TIDAK HADIR
                                  </div>
                                  {dd.shiftIn && (
                                    <div style={{ fontSize: 7, fontWeight: 700, opacity: 0.95, marginTop: 0.5 }}>
                                      Shift {dd.shiftIn}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          }

                          // KASUS 4: TERJADWAL DI MASA DEPAN (Blok biru jelas)
                          if (dd.status === 'upcoming') {
                            return (
                              <td
                                key={dateStr + '-upcoming'}
                                colSpan={2}
                                style={{
                                  ...td(cellBg),
                                  borderLeft: '2px solid #cbd5e1',
                                  padding: '3px 2px',
                                }}
                              >
                                <div style={{
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: 4,
                                  padding: '2px 4px',
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: '#1d4ed8',
                                  textAlign: 'center',
                                }}>
                                  Terjadwal [{dd.shiftIn || '-'}]
                                </div>
                              </td>
                            );
                          }

                          // KASUS 5: HADIR (IN LENGKAP & OUT DENGAN DELTA / TIDAK SCAN OUT)
                          return [
                            // 5A. SUB-KOLOM IN (JAM MASUK)
                            <td
                              key={dateStr + '-in'}
                              style={{
                                ...td(cellBg),
                                borderLeft: '2px solid #cbd5e1',
                                padding: '2px 3px',
                              }}
                            >
                              {/* Jam Masuk Lengkap HH:mm:ss */}
                              <div style={{ fontSize: 8.5, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                                {dd.inTime}
                              </div>
                              {/* Delta Keterlambatan / Kecepatan */}
                              {dd.diffText && (
                                <div
                                  style={{
                                    fontSize: 7.5,
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    marginTop: 1.5,
                                    padding: '1px 3px',
                                    borderRadius: 3,
                                    display: 'inline-block',
                                    background: dd.isLate ? '#fee2e2' : dd.isEarly ? '#dcfce7' : '#f1f5f9',
                                    color: dd.isLate ? '#dc2626' : dd.isEarly ? '#15803d' : '#64748b',
                                  }}
                                >
                                  {dd.diffText}
                                </div>
                              )}
                            </td>,

                            // 5B. SUB-KOLOM OUT (JAM PULANG)
                            <td
                              key={dateStr + '-out'}
                              style={{
                                ...td(cellBg),
                                padding: '2px 3px',
                              }}
                            >
                              {dd.outTime ? (
                                <>
                                  {/* Jam Keluar Lengkap HH:mm:ss */}
                                  <div style={{ fontSize: 8.5, fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace' }}>
                                    {dd.outTime}
                                  </div>
                                  {/* Delta Jam Keluar (Pulang Cepat - / Lembur +) */}
                                  {dd.outDiffText && (
                                    <div
                                      style={{
                                        fontSize: 7.5,
                                        fontWeight: 900,
                                        lineHeight: 1,
                                        marginTop: 1.5,
                                        padding: '1px 3px',
                                        borderRadius: 3,
                                        display: 'inline-block',
                                        background: dd.isOutEarly ? '#fef3c7' : dd.isOutLate ? '#e0e7ff' : '#f1f5f9',
                                        color: dd.isOutEarly ? '#b45309' : dd.isOutLate ? '#4338ca' : '#64748b',
                                      }}
                                    >
                                      {dd.outDiffText}
                                    </div>
                                  )}
                                </>
                              ) : dd.noOutScan ? (
                                /* Tidak scan keluar */
                                <div
                                  style={{
                                    fontSize: 7,
                                    fontWeight: 800,
                                    lineHeight: 1.1,
                                    padding: '2px 3px',
                                    borderRadius: 3,
                                    background: '#fff7ed',
                                    border: '1px solid #fed7aa',
                                    color: '#c2410c',
                                  }}
                                  title="Karyawan hadir masuk tetapi belum/tidak presensi pulang"
                                >
                                  Tidak Out
                                </div>
                              ) : (
                                <span style={{ color: '#cbd5e1', fontSize: 9 }}>—</span>
                              )}
                            </td>,
                          ];
                        })}

                        {/* 4. TOTAL HADIR */}
                        <td
                          style={{
                            ...td('#eef2ff'),
                            borderLeft: '3px solid #6366f1',
                            color: '#3730a3',
                            fontWeight: 900,
                            fontSize: 10,
                          }}
                        >
                          {s.totalPresent} / {s.totalWorkDays}
                        </td>

                        {/* 5. TOTAL TELAT */}
                        <td
                          style={{
                            ...td(s.totalLateSeconds > 0 ? '#fff1f2' : rowBg),
                            borderLeft: '1px solid #fecdd3',
                            color: s.totalLateSeconds > 0 ? '#b91c1c' : '#94a3b8',
                            fontWeight: 800,
                            fontSize: 9.5,
                          }}
                        >
                          {s.totalLateSeconds > 0 ? (
                            <div>
                              <div>{formatDuration(s.totalLateSeconds, '-')}</div>
                              <div style={{ fontSize: 7.5, opacity: 0.8 }}>({s.totalLateCount}x)</div>
                            </div>
                          ) : (
                            '0m'
                          )}
                        </td>

                        {/* 6. LEBIH AWAL */}
                        <td
                          style={{
                            ...td(s.totalEarlySeconds > 0 ? '#f0fdf4' : rowBg),
                            borderLeft: '1px solid #bbf7d0',
                            color: s.totalEarlySeconds > 0 ? '#15803d' : '#94a3b8',
                            fontWeight: 800,
                            fontSize: 9.5,
                          }}
                        >
                          {s.totalEarlySeconds > 0 ? formatDuration(s.totalEarlySeconds, '+') : '0m'}
                        </td>

                        {/* 7. TIDAK HADIR DARI JADWAL */}
                        <td
                          style={{
                            ...td(s.totalAbsent > 0 ? '#fee2e2' : rowBg),
                            borderLeft: '1px solid #fca5a5',
                            color: s.totalAbsent > 0 ? '#b91c1c' : '#94a3b8',
                            fontWeight: 900,
                            fontSize: 10,
                          }}
                        >
                          {s.totalAbsent > 0 ? `${s.totalAbsent} hr` : '0'}
                        </td>

                        {/* 8. BELUM TERJADWAL / KARYAWAN BARU */}
                        <td
                          style={{
                            ...td(s.totalUnscheduled > 0 ? '#f8fafc' : rowBg),
                            borderLeft: '1px solid #e2e8f0',
                            color: s.totalUnscheduled > 0 ? '#475569' : '#cbd5e1',
                            fontWeight: 700,
                            fontSize: 9.5,
                          }}
                        >
                          {s.totalUnscheduled > 0 ? `${s.totalUnscheduled} hr` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Keterangan Warna */}
            <div className="p-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-2 flex-wrap text-[10px]">
              <span className="font-semibold text-gray-500">Total {users.length} Karyawan Terdata</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">In: (-) Telat / (+) Lebih Awal</span>
                <span className="text-gray-500 font-medium">Out: (-) Cepat / (+) Lembur</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── Modal Pilihan Format Unduh / Cetak ─── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header Modal */}
            <div className="p-4 bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 bg-indigo-800/60 px-2 py-0.5 rounded">
                  Format Laporan Eksekutif
                </span>
                <h3 className="text-base font-black text-white mt-1">Pilih Format Cetak / Unduh</h3>
                <p className="text-xs text-indigo-200/80 font-medium mt-0.5">
                  Periode {periodLabel}
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Konten Opsi */}
            <div className="p-4 space-y-2.5 overflow-y-auto">
              
              {/* OPSI 1: Kertas Biasa A4 (1 Lembar Pas - Atas Bawah) - PILIHAN UTAMA */}
              <button
                onClick={handleExportA4SinglePage}
                className="w-full text-left p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/60 hover:bg-indigo-50 active:scale-[0.99] transition-all relative group flex items-start gap-3 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Printer size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-indigo-950">
                      Kertas Biasa A4 (1 Lembar Pas)
                    </span>
                    <span className="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.2 rounded-full uppercase">
                      1 Lembar HVS A4
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-900/80 font-medium leading-relaxed mt-1">
                    <strong>Semua 31 hari muat dalam 1 lembar kertas A4 Landscape!</strong> Setiap teks 2 kata (Nama, Status, Header, Jam In & Out) dibuat atas-bawah sehingga kompak ke samping & langsung pas di printer kantor.
                  </p>
                </div>
              </button>

              {/* OPSI 2: Kertas Biasa A4 (2 Lembar Landscape) */}
              <button
                onClick={handleExportA4PDF}
                className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 active:scale-[0.99] transition-all flex items-start gap-3 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-gray-900">
                      Kertas Biasa A4 (2 Lembar)
                    </span>
                    <span className="text-[9px] font-bold bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded-full">
                      Font Lebih Besar
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-1">
                    Otomatis dibagi 2 lembar (Paruh 1: Tgl 11–25, Paruh 2: Tgl 26–10 + Rekap) jika membutuhkan ukuran huruf yang lebih besar.
                  </p>
                </div>
              </button>

              {/* OPSI 3: Kanvas Lebar Utuh (Tampilan Layar / Digital) */}
              <button
                onClick={handleExportWidePDF}
                className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 active:scale-[0.99] transition-all flex items-start gap-3 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Monitor size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-gray-900">
                      Layar Digital (Kanvas Penuh)
                    </span>
                    <span className="text-[9px] font-bold bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded-full">
                      1 Lembar Lebar
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-1">
                    1 lembar utuh memanjang tanpa terpotong (panjang kanvas 1,48 meter). Cocok untuk ditinjau / zoom di laptop atau proyektor.
                  </p>
                </div>
              </button>

              {/* OPSI 4: File Excel */}
              <button
                onClick={handleExportExcel}
                className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 active:scale-[0.99] transition-all flex items-start gap-3 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <FileSpreadsheet size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-gray-900">
                      Spreadsheet Excel (.xlsx)
                    </span>
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">
                      Data Mentah
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-1">
                    Format tabel lengkap Microsoft Excel untuk pengolahan formula atau arsip keuangan.
                  </p>
                </div>
              </button>
            </div>

            {/* Footer Modal */}
            <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Batal
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

// ─── Style helpers ─────────────────────────────────────────────────────────
const stickyThLeft: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  top: 0,
  zIndex: 30,
  background: '#312e81',
  color: '#ffffff',
  padding: '5px 6px',
  fontSize: 9,
  fontWeight: 900,
  textAlign: 'left',
  letterSpacing: '0.03em',
  borderRight: '2px solid #cbd5e1',
  borderBottom: '2px solid #cbd5e1',
  whiteSpace: 'nowrap',
};

const thTop: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  padding: '4px 2px',
  textAlign: 'center',
  borderBottom: '2px solid #cbd5e1',
  fontWeight: 800,
  fontSize: 9,
  whiteSpace: 'nowrap',
};

const td = (bg: string): React.CSSProperties => ({
  background: bg,
  borderBottom: '1px solid #e2e8f0',
  borderRight: '1px solid #e2e8f0',
  padding: '2px 3px',
  textAlign: 'center',
  fontSize: 9,
  verticalAlign: 'middle',
});

export default MonthlyReport;
