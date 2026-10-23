/**
 * Utility untuk mengunduh data dalam format CSV/Excel
 */
export const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += headers.map((h) => `"${h}"`).join(',') + '\n';
  rows.forEach((row) => {
    csvContent += row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
