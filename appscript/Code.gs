// ============================================================
// DONATTOUR PRESENSI - Google Apps Script
// ============================================================
// CARA SETUP:
// 1. Buka Google Sheets baru
// 2. Klik Extensions → Apps Script
// 3. Hapus semua kode default, paste seluruh kode ini
// 4. Ganti VERCEL_API_URL di bawah dengan URL Vercel kamu
// 5. Klik Save → Run "setupSheets" pertama kali
// 6. Deploy → New Deployment → Web App → Anyone can access
// 7. Copy URL deployment → paste ke WEBHOOK_URL di aplikasi
// ============================================================

const VERCEL_API_URL = 'https://presensidonattour.vercel.app/api';
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// ============================================================
// SETUP AWAL — Buat struktur sheet otomatis
// ============================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Sheet 1: Data Karyawan ---
  let sheetKaryawan = ss.getSheetByName('Data Karyawan');
  if (!sheetKaryawan) sheetKaryawan = ss.insertSheet('Data Karyawan');
  sheetKaryawan.clearContents();
  sheetKaryawan.getRange(1, 1, 1, 6).setValues([[
    'ID', 'Nama', 'Tanggal Lahir', 'Role', 'Divisi', 'Dibuat'
  ]]);
  sheetKaryawan.getRange(1, 1, 1, 6)
    .setBackground('#1a1a1a').setFontColor('#ffffff').setFontWeight('bold');
  [80, 180, 120, 100, 150, 150].forEach((w, i) => sheetKaryawan.setColumnWidth(i + 1, w));

  // Hapus Sheet 2: Data Divisi (sudah tidak dipakai)
  const oldDivisi = ss.getSheetByName('Data Divisi');
  if (oldDivisi) ss.deleteSheet(oldDivisi);

  // --- Sheet 2: Jadwal Shift Bulanan ---
  let sheetJadwal = ss.getSheetByName('Jadwal Bulanan');
  if (!sheetJadwal) sheetJadwal = ss.insertSheet('Jadwal Bulanan');
  sheetJadwal.clearContents();
  
  let headers = ['Nama Karyawan', 'Bulan-Tahun'];
  for (let i = 1; i <= 31; i++) headers.push(i.toString());
  headers.push('Keterangan', '', 'DIVISI', 'KODE SHIFT', 'JAM KERJA', 'KETERANGAN SHIFT');

  sheetJadwal.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format Header Jadwal (Hitam)
  sheetJadwal.getRange(1, 1, 1, 34)
    .setBackground('#1a1a1a').setFontColor('#ffffff').setFontWeight('bold');
    
  // Format Header Legenda (Biru)
  sheetJadwal.getRange(1, 36, 1, 4)
    .setBackground('#0052cc').setFontColor('#ffffff').setFontWeight('bold');

  sheetJadwal.setColumnWidth(1, 180);
  sheetJadwal.setColumnWidth(2, 100);
  for (let i = 3; i <= 33; i++) sheetJadwal.setColumnWidth(i, 80);
  sheetJadwal.setColumnWidth(34, 200);
  sheetJadwal.setColumnWidth(35, 40); // Pembatas
  sheetJadwal.setColumnWidth(36, 150); // Divisi
  sheetJadwal.setColumnWidth(37, 100); // Kode Shift
  sheetJadwal.setColumnWidth(38, 120); // Jam kerja
  sheetJadwal.setColumnWidth(39, 200); // Keterangan Shift

  // Legenda akan diisi otomatis melalui fungsi syncLegendaShift()

  // Hapus Sheet Rekap Presensi jika ada (sudah tidak dipakai)
  const oldPresensi = ss.getSheetByName('Rekap Presensi');
  if (oldPresensi) ss.deleteSheet(oldPresensi);

  // Hapus Master Shift jika sebelumnya ada agar tidak bingung
  const oldMaster = ss.getSheetByName('Master Shift');
  if (oldMaster) ss.deleteSheet(oldMaster);

  SpreadsheetApp.getUi().alert(
    '✅ Setup selesai!\n\nSheet berhasil dibuat:\n- Data Karyawan\n- Jadwal Bulanan\n\nSheet Data Divisi dan Rekap Presensi telah dihapus untuk menyederhanakan tampilan.\nSekarang jalankan menu: Sync Semua Data'
  );
}

// ============================================================
// SYNC DATA KARYAWAN dari API
// ============================================================
function syncKaryawan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Data Karyawan');
  if (!sheet) return;

  try {
    const res = UrlFetchApp.fetch(`${VERCEL_API_URL}/users`);
    const data = JSON.parse(res.getContentText());
    if (!data.success || !data.users) return;

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 6).clearContent();

    const rows = data.users.map(u => [
      u.id,
      u.name,
      u.dob || '-',
      u.role,
      u.division ? u.division.name : '-',
      u.createdAt ? new Date(u.createdAt).toLocaleString('id-ID') : '-'
    ]);

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 6).setValues(rows);
      for (let i = 0; i < rows.length; i++) {
        sheet.getRange(i + 2, 1, 1, 6).setBackground(i % 2 === 0 ? '#ffffff' : '#f5f5f5');
      }
    }

    // Setelah sync karyawan, update kolom Nama di Jadwal Bulanan
    updateJadwalNamaKaryawan(data.users.map(u => u.name));
    Logger.log('Sync karyawan: ' + rows.length + ' data');
  } catch (e) {
    Logger.log('Error sync karyawan: ' + e.toString());
    throw e;
  }
}

// ============================================================
// SYNC LEGENDA SHIFT dari API ke Jadwal Bulanan
// ============================================================
function syncLegendaShift() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Jadwal Bulanan');
  if (!sheet) return;

  try {
    const res = UrlFetchApp.fetch(`${VERCEL_API_URL}/divisions`);
    const data = JSON.parse(res.getContentText());
    if (!data.success || !data.divisions) return;

    // Bersihkan legenda lama (kolom 36-39, baris 2 ke bawah)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 36, Math.max(lastRow - 1, 100), 4).clearContent();
    }

    const rows = [];
    data.divisions.forEach(d => {
      if (d.shifts && d.shifts.length > 0) {
        d.shifts.forEach(s => {
          rows.push([
            d.name,
            s.name,
            `${s.checkInTime} - ${s.checkOutTime}`,
            'Sesuai APK'
          ]);
        });
      }
    });

    // Tambahkan default yang tidak ada di APK (opsional, misalnya OFF)
    rows.push(['Semua Divisi', 'OFF', '-', 'Libur']);
    rows.push(['Semua Divisi', 'U/K', '-', 'Izin / Sakit']);
    rows.push(['Semua Divisi', 'OTR', '-', 'Training']);

    if (rows.length > 0) {
      sheet.getRange(2, 36, rows.length, 4).setValues(rows);
    }
    Logger.log('Sync legenda shift: ' + rows.length + ' baris');
  } catch (e) {
    Logger.log('Error sync legenda shift: ' + e.toString());
  }
}

// ============================================================
// SYNC SEMUA DATA
// ============================================================
function syncAllData() {
  syncKaryawan();
  syncLegendaShift();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Data Karyawan dan Legenda Shift berhasil disinkronkan dengan Aplikasi!',
    '✅ Sync Selesai', 5
  );
}

// ============================================================
// AUTO SYNC setiap 1 jam
// ============================================================
function setAutoSync() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAllData').timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert('✅ Auto-sync aktif!\nData akan otomatis diperbarui setiap 1 jam.');
}

// ============================================================
// HELPER: Ambil mapping kode shift dari Jadwal Bulanan
// ============================================================
function getShiftMapping(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const kodeCol = headers.indexOf('KODE SHIFT');
  const jamCol = headers.indexOf('JAM KERJA');
  const ketCol = headers.indexOf('KETERANGAN SHIFT');
  
  const map = {};
  if (kodeCol === -1 || jamCol === -1 || ketCol === -1) return map;

  for(let i = 1; i < data.length; i++) {
    const code = (data[i][kodeCol] || '').toString().trim().toUpperCase();
    const jam = (data[i][jamCol] || '').toString().trim();
    const ket = (data[i][ketCol] || '').toString().trim();
    
    if (code) {
      let text = '';
      if (jam && jam !== '-' && jam !== '') {
        text = jam;
        if (ket && ket !== '-' && ket !== '') {
           text += ` (${ket})`; // Misal: "05:00 - 11:00 (Shift 1)"
        }
      } else {
        text = ket; // Misal: "Libur"
      }
      map[code] = text;
    }
  }
  return map;
}

// ============================================================
// doGet — Web App endpoint: baca jadwal hari ini per karyawan
// Dipanggil dari: /api/schedule?name=Bayu&full=true
// ============================================================
function doGet(e) {
  const userName = (e.parameter.name || '').trim();
  const isFull = e.parameter.full === 'true';
  
  // Menggunakan zona waktu Indonesia (Asia/Jakarta) agar hari ini selalu akurat
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'd');
  const todayDate = parseInt(todayStr, 10);

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Jadwal Bulanan');
    if (!sheet) {
      return jsonResponse({ success: false, error: 'Sheet Jadwal Bulanan tidak ditemukan' });
    }

    const shiftMap = getShiftMapping(sheet);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => {
      if (h instanceof Date) return h.getDate().toString();
      return String(h).trim();
    });

    let jadwal = '-';
    let jadwalFull = {};
    let keterangan = '';

    for (let i = 1; i < data.length; i++) {
      const rowName = (data[i][0] || '').toString().trim();
      if (rowName.toLowerCase() === userName.toLowerCase()) {
        const todayColIndex = headers.indexOf(todayDate.toString());
        if (todayColIndex !== -1) {
          let rawJadwal = (data[i][todayColIndex] || '-').toString().trim();
          let upCode = rawJadwal.toUpperCase();
          jadwal = shiftMap[upCode] ? shiftMap[upCode] : rawJadwal;
        }

        if (isFull) {
          for(let d=1; d<=31; d++) {
             const colIdx = headers.indexOf(d.toString());
             if (colIdx !== -1) {
               let rJadwal = (data[i][colIdx] || '-').toString().trim();
               let uCode = rJadwal.toUpperCase();
               jadwalFull[d] = shiftMap[uCode] ? shiftMap[uCode] : rJadwal;
             }
          }
        }
        
        const ketCol = headers.indexOf('Keterangan');
        keterangan = ketCol !== -1 ? (data[i][ketCol] || '').toString() : '';
        break;
      }
    }

    if (isFull) {
      return jsonResponse({
        success: true,
        name: userName,
        jadwalBulanIni: jadwalFull,
        keterangan: keterangan,
        timestamp: new Date().toISOString()
      });
    } else {
      return jsonResponse({
        success: true,
        name: userName,
        tanggal: todayDate,
        jadwal: jadwal,
        keterangan: keterangan,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {
    return jsonResponse({ success: false, error: e.toString() });
  }
}

// ============================================================
// HELPER: Tambah nama karyawan baru ke sheet Jadwal Bulanan
// ============================================================
function updateJadwalNamaKaryawan(namaList) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Jadwal Bulanan');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  let lastRowColA = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0]) {
      lastRowColA = i + 1;
    }
  }

  const existingNames = [];
  for (let i = 1; i < lastRowColA; i++) {
    existingNames.push(data[i][0].toString().toLowerCase());
  }

  let addedCount = 0;
  const currentMonth = new Date().toLocaleDateString('id-ID', { month: '2-digit', year: 'numeric' });
  
  namaList.forEach(nama => {
    if (!existingNames.includes(nama.toLowerCase())) {
      let newRow = [nama, currentMonth];
      for(let i = 1; i <= 31; i++) newRow.push('');
      newRow.push(''); // Kolom Keterangan
      
      // Tambah karyawan di baris terakhir kolom A (bukan paling bawah sheet karena ada legenda)
      lastRowColA++;
      sheet.getRange(lastRowColA, 1, 1, newRow.length).setValues([newRow]);
      addedCount++;
    }
  });

  if (addedCount > 0) {
    Logger.log(`Ditambahkan ${addedCount} karyawan baru ke Jadwal Bulanan`);
  }
}

// ============================================================
// HELPER: JSON response untuk doGet
// ============================================================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// AUTO GENERATE JADWAL (Acak tapi Adil)
// ============================================================
function generateAutoSchedule() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Jadwal Bulanan');
  if (!sheet) {
    ui.alert('Sheet Jadwal Bulanan tidak ditemukan!');
    return;
  }

  // Baca baris karyawan
  const data = sheet.getDataRange().getValues();
  const employees = [];
  const startRowIndex = 1; // Baris 2
  
  for (let i = startRowIndex; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim() !== '') {
      employees.push({ index: i, name: data[i][0].toString().trim() });
    }
  }

  if (employees.length === 0) {
    ui.alert('Belum ada nama karyawan di Jadwal Bulanan. Harap Sync Karyawan terlebih dahulu.');
    return;
  }

  // Baca Legenda untuk mengidentifikasi shift kerja dan shift libur
  const shiftMap = getShiftMapping(sheet);
  let offCode = 'OFF';
  let workingShifts = [];
  
  const codes = Object.keys(shiftMap);
  if (codes.length > 0) {
    codes.forEach(code => {
      const ket = shiftMap[code].toLowerCase();
      if (ket.includes('libur') || ket.includes('off')) {
        offCode = code;
      } else {
        workingShifts.push(code); // Memasukkan SEMUA kode (S1, S2, L1, L2, OTR, U/K dll)
      }
    });
  }
  
  // Jika tidak ada working shifts yang terdeteksi, berikan default
  if (workingShifts.length === 0) workingShifts = ['S1', 'S2'];

  const response = ui.prompt(
    '🎲 Auto-Generate Jadwal Adil',
    'Berapa jumlah hari Libur / OFF per karyawan dalam sebulan? (Misal: 4)\n\nSistem akan membagikan hari libur & shift kerja secara acak, merata, dan adil untuk semua orang.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;
  let offCountTarget = parseInt(response.getResponseText());
  if (isNaN(offCountTarget) || offCountTarget < 0) offCountTarget = 4;

  const totalDays = 31;
  const schedule = [];
  for (let i = 0; i < employees.length; i++) schedule.push(new Array(totalDays).fill(''));

  const empShiftCounts = [];
  for (let i = 0; i < employees.length; i++) {
    empShiftCounts.push({});
    workingShifts.forEach(s => empShiftCounts[i][s] = 0);
  }

  // 1. Tentukan Hari Libur (OFF) secara adil dan acak
  // Agar tidak semua orang libur di hari yang sama, kita batasi kuota libur per hari
  const maxOffPerDay = Math.ceil((employees.length * offCountTarget) / totalDays) + 1;

  for (let i = 0; i < employees.length; i++) {
    let offAssigned = 0;
    let attempts = 0;
    while (offAssigned < offCountTarget && attempts < 1000) {
      attempts++;
      let randDay = Math.floor(Math.random() * totalDays);
      if (schedule[i][randDay] === '') {
        // Cek berapa orang yang sudah libur di hari ini
        let dayOffCount = 0;
        for (let j = 0; j < employees.length; j++) {
          if (schedule[j][randDay] === offCode) dayOffCount++;
        }
        
        // Jangan libur berturut-turut jika memungkinkan (opsional, diringankan agar tidak infinite loop)
        let isConsecutive = (randDay > 0 && schedule[i][randDay - 1] === offCode) || 
                            (randDay < totalDays - 1 && schedule[i][randDay + 1] === offCode);

        if (dayOffCount < maxOffPerDay && (!isConsecutive || attempts > 50)) {
          schedule[i][randDay] = offCode;
          offAssigned++;
        }
      }
    }
  }

  // 2. Tentukan Shift Kerja secara adil
  for (let d = 0; d < totalDays; d++) {
    // Acak urutan karyawan setiap hari agar pembagian sisa shift adil
    let dailyEmpIndices = [];
    for(let i=0; i<employees.length; i++) dailyEmpIndices.push(i);
    dailyEmpIndices.sort(() => 0.5 - Math.random());

    for (let idx of dailyEmpIndices) {
      if (schedule[idx][d] === '') {
        // Cari shift kerja yang paling jarang dilakukan oleh karyawan ini
        let shuffledShifts = [...workingShifts].sort(() => 0.5 - Math.random());
        let minShift = shuffledShifts[0];
        let minCount = empShiftCounts[idx][minShift];
        
        for (let s of shuffledShifts) {
          if (empShiftCounts[idx][s] < minCount) {
            minShift = s;
            minCount = empShiftCounts[idx][s];
          }
        }
        
        schedule[idx][d] = minShift;
        empShiftCounts[idx][minShift]++;
      }
    }
  }

  // Tulis hasil ke Spreadsheet
  for (let i = 0; i < employees.length; i++) {
    const rowIndex = employees[i].index + 1; // 1-based Google Sheets
    sheet.getRange(rowIndex, 3, 1, totalDays).setValues([schedule[i]]);
  }

  ui.alert('✅ Jadwal acak dan adil berhasil dibuat untuk ' + employees.length + ' karyawan!\n\nSemua orang mendapat ' + offCountTarget + ' hari libur dan porsi shift (' + workingShifts.join(', ') + ') yang seimbang.');
}

// ============================================================
// MENU KUSTOM di Google Sheets
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏢 Donattour Presensi')
    .addItem('⚙️ Setup Awal (Buat Sheet)', 'setupSheets')
    .addSeparator()
    .addItem('🔄 Sync Semua Data', 'syncAllData')
    .addItem('👤 Sync Karyawan', 'syncKaryawan')
    .addItem('🏷️ Sync Divisi', 'syncDivisi')
    .addItem('📋 Sync Rekap Presensi', 'syncPresensi')
    .addSeparator()
    .addItem('🎲 Auto-Generate Jadwal (Adil)', 'generateAutoSchedule')
    .addSeparator()
    .addItem('⏰ Aktifkan Auto-Sync (1 jam)', 'setAutoSync')
    .addToUi();
}
