// Spreadsheet (CSV) download of all reports.

/**
 * One spreadsheet cell. Text a visitor typed could start with "=" and run as a
 * formula when the file is opened in Excel, so such cells get a leading quote mark.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  // The byte-order mark tells Excel the file is UTF-8, so accents and symbols show correctly.
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
