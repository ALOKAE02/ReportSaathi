import { TEST_CATALOGUE, type TestResult } from '../data/reports';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function testName(r: TestResult): string {
  return TEST_CATALOGUE[r.code]?.name ?? r.label ?? r.code;
}

/** "Fasting glucose" -> "fasting glucose" mid-sentence; acronyms like "HbA1c", "TSH" and "CBC" stay as they are. */
export function sentenceCase(s: string): string {
  if (/^[A-Z][a-z]?[A-Z]/.test(s)) return s;
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

export function fmtNumber(code: string, n: number): string {
  const decimals = TEST_CATALOGUE[code]?.decimals ?? 1;
  return n.toFixed(decimals);
}

export function fmtValue(r: TestResult): string {
  if (r.value === null || !Number.isFinite(r.value)) return 'unreadable';
  const unit = TEST_CATALOGUE[r.code]?.unit ?? '';
  const v = fmtNumber(r.code, r.value);
  if (unit === '%') return `${v}%`;
  return unit ? `${v} ${unit}` : v;
}

export function fmtRange(r: TestResult): string {
  const { low, high } = r;
  if (low !== undefined && high !== undefined) return `${fmtNumber(r.code, low)}–${fmtNumber(r.code, high)}`;
  if (high !== undefined) return `below ${fmtNumber(r.code, high)}`;
  if (low !== undefined) return `above ${fmtNumber(r.code, low)}`;
  return 'no range printed';
}

export function fmtCriticalLimit(r: TestResult): string | undefined {
  if (r.criticalHigh !== undefined) return `above ${fmtNumber(r.code, r.criticalHigh)}`;
  if (r.criticalLow !== undefined) return `below ${fmtNumber(r.code, r.criticalLow)}`;
  return undefined;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export const DATE_PATTERN = new RegExp(`\\b\\d{1,2} (?:${MONTHS.join('|')}|${MONTHS.map((m) => m.slice(0, 3)).join('|')}) \\d{4}\\b`, 'g');
export const TIME_PATTERN = /\b\d{1,2}:\d{2}\b/g;

/** "Meena Iyer" -> "M•••• I••••" */
export function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]}••••`)
    .join(' ');
}

/** "+91 98450 77321" -> "+91 98••• ••321" */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.slice(-10);
  return `+91 ${local.slice(0, 2)}••• ••${local.slice(-3)}`;
}

export function fmtCountdown(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
