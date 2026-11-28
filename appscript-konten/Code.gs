/**
 * Google Apps Script — Sinkronisasi Rekap Konten Donattour (3 Sheet Tetap)
 * -------------------------------------------------------------------------
 * - "Riwayat Upload Konten" = Master Data lengkap dari aplikasi (auto-sync via webhook)
 * - "Rekap Konten"          = Membaca langsung dari "Riwayat Upload Konten"
 * - "Rekap Pendapatan"      = Membaca langsung dari "Riwayat Upload Konten"
 * - Pilihan Bulan (B1: Januari–Desember) ada di "Rekap Konten" & "Rekap Pendapatan"
 * - Tahun otomatis mengikuti tahun berjalan saat ini (tanpa perlu pilih tahun)
 * - Periode Cut-off Gajian: Tanggal 10 bulan terpilih s/d Tanggal 9 bulan berikutnya
 */

const API_BASE_URL = 'https://presensidonattour.vercel.app';

const SHEET_REKAP = 'Rekap Konten';
const SHEET_RIWAYAT = 'Riwayat Upload Konten';
const SHEET_PENDAPATAN = 'Rekap Pendapatan';

const BULAN_INDO = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function doPost(e) {
  try {
    syncKonten();
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  syncKonten();
  return ContentService
    .createTextOutput('Sync Rekap Konten selesai!')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Otomatis jalan saat user mengganti Bulan (B1) di "Rekap Konten" atau "Rekap Pendapatan"
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheetName = e.range.getSheet().getName();
  const cell = e.range.getA1Notation();
  if ((sheetName === SHEET_REKAP || sheetName === SHEET_PENDAPATAN) && cell === 'B1') {
    const val = String(e.range.getValue()).trim();
    const idx = BULAN_INDO.findIndex(b => b.toLowerCase() === val.toLowerCase());
    if (idx !== -1) {
      renderFromRiwayat(idx);
    }
  }
}

function getSelectedMonthIdx(ss, overrideIdx) {
  if (overrideIdx !== undefined && overrideIdx !== null) return overrideIdx;
  const rekapSheet = ss.getSheetByName(SHEET_REKAP);
  if (rekapSheet) {
    const b1 = String(rekapSheet.getRange('B1').getValue()).trim();
    const idx = BULAN_INDO.findIndex(b => b.toLowerCase() === b1.toLowerCase());
    if (idx !== -1) return idx;
  }
  return new Date().getMonth();
}

function getPeriodDates(year, monthIdx) {
  const start = new Date(year, monthIdx, 10);
  const end = new Date(year, monthIdx + 1, 9);
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
    const label = cur.getDate() + ' ' + BULAN_SINGKAT[cur.getMonth()];
    dates.push({ iso, label });
    cur.setDate(cur.getDate() + 1);
  }
  return {
    startIso: dates[0].iso,
    endIso: dates[dates.length - 1].iso,
    dates
  };
}

function syncKonten() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nowYm = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM');

  const [rekapRes, allRes, feeRes] = UrlFetchApp.fetchAll([
    { url: API_BASE_URL + '/api/konten/rekap?bulan=' + nowYm, muteHttpExceptions: true },
    { url: API_BASE_URL + '/api/konten?bulan=all', muteHttpExceptions: true },
    { url: API_BASE_URL + '/api/fee-settings', muteHttpExceptions: true },
  ]);

  const rekapJson = JSON.parse(rekapRes.getContentText());
  const allJson = JSON.parse(allRes.getContentText());
  const feeJson = JSON.parse(feeRes.getContentText());

  const users = rekapJson.success ? rekapJson.data.map(u => ({ userId: u.userId, nama: u.nama, divisi: u.divisi })) : [];
  const records = allJson.success ? allJson.records : [];
  const settings = (feeJson && feeJson.settings) ? feeJson.settings : { feeVideo: 5000, feeFoto: 2500, fypRatePerView: 2.5 };

  const props = PropertiesService.getScriptProperties();
  props.setProperty('ALL_USERS', JSON.stringify(users));
  props.setProperty('FEE_SETTINGS', JSON.stringify(settings));

  writeRiwayatSheet(ss, records);
  renderFromRiwayat();
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function writeRiwayatSheet(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEET_RIWAYAT);
  sheet.clear();

  sheet.getRange('A1').setValue('Master Riwayat Upload Konten (Semua Periode — Auto Sync dari Aplikasi)')
    .setFontWeight('bold').setFontSize(12);

  const headers = [
    'Tanggal', 'UserID', 'Nama', 'Divisi', 'Platform', 'Jenis',
    'Link', 'Status FYP', 'Views', 'Fee Konten', 'Fee FYP', 'Total Fee', 'Catatan'
  ];

  sheet.getRange(3, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#f3f4f6');

  if (!records || records.length === 0) return;

  const rows = records.map(r => [
    r.tanggal,
    r.userId || '',
    r.user ? r.user.name : '-',
    r.user && r.user.division ? r.user.division.name : '-',
    r.platform,
    r.jenis,
    r.link,
    r.isFyp ? 'FYP' : '-',
    r.views || 0,
    r.feeKonten || 0,
    r.feeFyp || 0,
    r.totalFee || 0,
    r.catatan || ''
  ]);

  sheet.getRange(4, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(4, 1, rows.length, 1).setNumberFormat('@');
  sheet.getRange(4, 10, rows.length, 3).setNumberFormat('Rp #,##0');
  sheet.setFrozenRows(3);
}

function renderFromRiwayat(overrideMonthIdx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = new Date().getFullYear(); // Selalu otomatis mengikuti tahun berjalan
  const monthIdx = getSelectedMonthIdx(ss, overrideMonthIdx);
  const bulanNama = BULAN_INDO[monthIdx];
  const period = getPeriodDates(year, monthIdx);

  const props = PropertiesService.getScriptProperties();
  const baseUsers = JSON.parse(props.getProperty('ALL_USERS') || '[]');
  const settings = JSON.parse(props.getProperty('FEE_SETTINGS') || '{"feeVideo":5000,"feeFoto":2500,"fypRatePerView":2.5}');

  const riwayatSheet = ss.getSheetByName(SHEET_RIWAYAT);
  const allRecords = [];
  if (riwayatSheet && riwayatSheet.getLastRow() >= 4) {
    const raw = riwayatSheet.getRange(4, 1, riwayatSheet.getLastRow() - 3, 13).getValues();
    raw.forEach(row => {
      let tgl = row[0];
      if (tgl instanceof Date) {
        tgl = Utilities.formatDate(tgl, 'Asia/Jakarta', 'yyyy-MM-dd');
      } else {
        tgl = String(tgl).trim();
      }
      if (!tgl) return;
      if (tgl >= period.startIso && tgl <= period.endIso) {
        allRecords.push({
          tanggal: tgl,
          userId: String(row[1]),
          nama: String(row[2]),
          divisi: String(row[3]),
          platform: String(row[4]),
          jenis: String(row[5]),
          link: String(row[6]),
          isFyp: String(row[7]).indexOf('FYP') !== -1,
          views: Number(row[8]) || 0,
          feeKonten: Number(row[9]) || 0,
          feeFyp: Number(row[10]) || 0,
          totalFee: Number(row[11]) || 0,
        });
      }
    });
  }

  const userMap = {};
  baseUsers.forEach(u => {
    userMap[u.userId] = {
      userId: u.userId,
      nama: u.nama,
      divisi: u.divisi,
      totalKonten: 0, totalVideo: 0, totalFoto: 0,
      totalFyp: 0, totalViews: 0, totalFee: 0, totalFeeFyp: 0,
      byDate: {}
    };
  });

  allRecords.forEach(r => {
    const key = r.userId || r.nama;
    if (!userMap[key]) {
      userMap[key] = {
        userId: key,
        nama: r.nama,
        divisi: r.divisi,
        totalKonten: 0, totalVideo: 0, totalFoto: 0,
        totalFyp: 0, totalViews: 0, totalFee: 0, totalFeeFyp: 0,
        byDate: {}
      };
    }
    const u = userMap[key];
    u.totalKonten += 1;
    if (r.jenis === 'VIDEO') u.totalVideo += 1; else u.totalFoto += 1;
    if (r.isFyp) { u.totalFyp += 1; u.totalViews += r.views; }
    u.totalFeeFyp += r.feeFyp;
    u.totalFee += r.totalFee;
    if (!u.byDate[r.tanggal]) u.byDate[r.tanggal] = [];
    u.byDate[r.tanggal].push(r);
  });

  const sortedUsers = Object.values(userMap).sort((a, b) => {
    if (b.totalFee !== a.totalFee) return b.totalFee - a.totalFee;
    if (b.totalKonten !== a.totalKonten) return b.totalKonten - a.totalKonten;
    return a.nama.localeCompare(b.nama);
  });

  writeRekapSheet(ss, bulanNama, year, period, sortedUsers);
  writePendapatanSheet(ss, bulanNama, year, period, sortedUsers, settings);
}

function writeRekapSheet(ss, bulanNama, year, period, users) {
  const sheet = getOrCreateSheet(ss, SHEET_REKAP);
  sheet.clear();

  // Baris 1: Hanya Pilih Bulan (B1) — Tahun otomatis
  sheet.getRange('A1').setValue('Pilih Bulan:').setFontWeight('bold').setBackground('#fef3c7');
  const b1 = sheet.getRange('B1');
  b1.clearDataValidations();
  b1.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(BULAN_INDO, true).setAllowInvalid(true).build());
  b1.setValue(bulanNama).setFontWeight('bold').setBackground('#fef3c7').setHorizontalAlignment('center');
  SpreadsheetApp.flush();

  sheet.getRange('C1').setValue('Tahun ' + year + ' (Periode: ' + period.dates[0].label + ' – ' + period.dates[period.dates.length - 1].label + ')')
    .setFontColor('#4b5563').setFontStyle('italic');

  const headers = ['No', 'Nama', 'Divisi'];
  period.dates.forEach(d => headers.push(d.label));
  headers.push('Total Konten', 'Video', 'Foto', 'FYP', 'Total Pendapatan');

  sheet.getRange(3, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#f3f4f6')
    .setHorizontalAlignment('center');

  if (!users || users.length === 0) return;

  const richRows = [];
  const plainRows = [];

  users.forEach((u, idx) => {
    const plainRow = [idx + 1, u.nama, u.divisi];
    const richCells = [];

    period.dates.forEach(d => {
      const items = u.byDate[d.iso];
      if (!items || items.length === 0) {
        plainRow.push('');
        richCells.push(null);
      } else {
        const builder = SpreadsheetApp.newRichTextValue();
        const segments = [];
        let fullText = '';
        items.forEach((item, i) => {
          if (i > 0) fullText += '\n';
          const label = item.isFyp ? '🔥 FYP (' + item.jenis + ')' : (item.jenis === 'VIDEO' ? 'V' : 'F');
          fullText += label + '\n';
          const urlStart = fullText.length;
          fullText += item.link;
          const urlEnd = fullText.length;
          segments.push({ start: urlStart, end: urlEnd, url: item.link });
        });
        builder.setText(fullText);
        segments.forEach(seg => builder.setLinkUrl(seg.start, seg.end, seg.url));
        plainRow.push(fullText);
        richCells.push(builder.build());
      }
    });

    plainRow.push(u.totalKonten, u.totalVideo, u.totalFoto, u.totalFyp, u.totalFee);
    plainRows.push(plainRow);
    richRows.push(richCells);
  });

  const dataRange = sheet.getRange(4, 1, plainRows.length, headers.length);
  dataRange.setValues(plainRows).setVerticalAlignment('top').setWrap(true);

  for (let r = 0; r < richRows.length; r++) {
    for (let c = 0; c < period.dates.length; c++) {
      if (richRows[r][c]) {
        sheet.getRange(4 + r, 4 + c).setRichTextValue(richRows[r][c]);
      }
    }
  }

  for (let c = 4; c <= 3 + period.dates.length; c++) {
    sheet.setColumnWidth(c, 165);
  }
  sheet.getRange(4, headers.length, plainRows.length, 1).setNumberFormat('Rp #,##0').setFontWeight('bold');
  sheet.setFrozenColumns(3);
  sheet.setFrozenRows(3);
}

function writePendapatanSheet(ss, bulanNama, year, period, users, settings) {
  const sheet = getOrCreateSheet(ss, SHEET_PENDAPATAN);
  sheet.clear();

  // Baris 1: Pilih Bulan (B1) juga tersedia di Rekap Pendapatan
  sheet.getRange('A1').setValue('Pilih Bulan:').setFontWeight('bold').setBackground('#d1fae5');
  const b1 = sheet.getRange('B1');
  b1.clearDataValidations();
  b1.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(BULAN_INDO, true).setAllowInvalid(true).build());
  b1.setValue(bulanNama).setFontWeight('bold').setBackground('#d1fae5').setHorizontalAlignment('center');
  SpreadsheetApp.flush();

  sheet.getRange('C1').setValue('Tahun ' + year + ' (Periode: ' + period.dates[0].label + ' – ' + period.dates[period.dates.length - 1].label + ')')
    .setFontColor('#065f46').setFontStyle('italic');

  const feeVideo = settings.feeVideo || 5000;
  const feeFoto = settings.feeFoto || 2500;
  const bonus10k = Math.round((settings.fypRatePerView || 2.5) * 10000);

  const headers = [
    'No', 'Nama', 'Divisi',
    'Jml Video', 'Fee Video (× Rp ' + feeVideo.toLocaleString('id-ID') + ')',
    'Jml Foto', 'Fee Foto (× Rp ' + feeFoto.toLocaleString('id-ID') + ')',
    'Jml FYP', 'Total Views FYP',
    'Bonus FYP (Rp ' + bonus10k.toLocaleString('id-ID') + '/10rb view)',
    'Total Pendapatan'
  ];

  sheet.getRange(3, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#ecfdf5')
    .setWrap(true)
    .setHorizontalAlignment('center');

  if (!users || users.length === 0) return;

  const rows = users.map((u, idx) => [
    idx + 1,
    u.nama,
    u.divisi,
    u.totalVideo,
    u.totalVideo * feeVideo,
    u.totalFoto,
    u.totalFoto * feeFoto,
    u.totalFyp,
    u.totalViews,
    u.totalFeeFyp,
    u.totalFee
  ]);

  sheet.getRange(4, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(4, 5, rows.length, 1).setNumberFormat('Rp #,##0');
  sheet.getRange(4, 7, rows.length, 1).setNumberFormat('Rp #,##0');
  sheet.getRange(4, 10, rows.length, 2).setNumberFormat('Rp #,##0');
  sheet.getRange(4, 11, rows.length, 1).setFontWeight('bold').setBackground('#f0fdf4');
  sheet.setFrozenColumns(3);
  sheet.setFrozenRows(3);
}
