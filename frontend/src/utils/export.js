/**
 * Helper to export array of objects to a downloadable CSV file.
 * @param {Array<Object>} data 
 * @param {string} filename 
 */
export function downloadCSV(data = [], filename = 'export.csv') {
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('downloadCSV: No data to export');
    return;
  }

  const keys = Object.keys(data[0]);
  const header = keys.join(',');

  const rows = data.map((row) => {
    return keys
      .map((key) => {
        let val = row[key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'object') val = JSON.stringify(val);
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          val = `"${val}"`;
        }
        return val;
      })
      .join(',');
  });

  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
