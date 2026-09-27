/**
 * Lecteur CSV (RFC 4180) : guillemets, guillemets doublés, retours à la ligne dans
 * les champs, séparateur « ; » ou « , » détecté sur la ligne d'en-tête, BOM UTF-8.
 */
export interface CsvRow {
  line: number;
  values: Record<string, string>;
}

export function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch as keyof typeof counts]++;
  }
  if (counts['\t'] > counts[';'] && counts['\t'] > counts[',']) return '\t';
  return counts[';'] >= counts[','] ? ';' : ',';
}

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const src = text.replace(/^﻿/, '');
  const firstLineEnd = src.search(/\r?\n/);
  const delimiter = detectDelimiter(firstLineEnd >= 0 ? src.slice(0, firstLineEnd) : src);
  const records: Array<{ line: number; fields: string[] }> = [];
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delimiter) {
      fields.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = '';
      line++;
      recordLine = line;
    } else field += ch;
  }
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  const nonEmpty = records.filter((r) => r.fields.some((f) => f.trim() !== ''));
  const header = nonEmpty.shift();
  if (!header) return { headers: [], rows: [] };
  const headers = header.fields.map((h) => h.trim().toLowerCase());
  const rows = nonEmpty.map((r) => {
    const values: Record<string, string> = {};
    headers.forEach((h, i) => (values[h] = (r.fields[i] ?? '').trim()));
    return { line: r.line, values };
  });
  return { headers, rows };
}
