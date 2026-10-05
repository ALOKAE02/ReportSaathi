// All data here is fictional. Do not put real patient data in this app.

export type ReportId = 'normal' | 'abnormal' | 'critical' | 'incomplete'

export interface LabResult {
  code: string // test code; must be in KNOWN_CODES or the report goes to a human
  name: string
  value: number | null // null = unreadable
  unit: string
  low?: number // printed range
  high?: number
  rangeText?: string // overrides the printed range text, e.g. "below 200"
  critLow?: number
  critHigh?: number
  category?: string // used for the sensitive-category rule
}

export interface Report {
  id: ReportId
  dot: string
  label: string
  blurb: string
  visitId: string
  patient: { first: string; last: string; age: number; sex: 'M' | 'F'; phone: string }
  results: LabResult[]
  previous?: { code: string; value: number; unit: string; when: string }
}

// Categories the assistant never explains. No demo report uses them.
export const SENSITIVE_CATEGORIES = ['HIV', 'Genetic', 'Tumour marker', 'Pregnancy']

// Test codes the assistant knows how to describe.
export const KNOWN_CODES = ['HB', 'GLU_F', 'HBA1C', 'TSH', 'CHOL', 'CREAT', 'K', 'NA', 'UREA']

export const MEANINGS: Record<string, string> = {
  HB: 'It measures the oxygen-carrying protein in your blood.',
  GLU_F: 'It is your blood sugar after fasting.',
  HBA1C: 'It reflects your average blood sugar over about 3 months.',
  TSH: 'It is a hormone that helps control how your body uses energy.',
  CHOL: 'It measures the total amount of fats in your blood.',
  CREAT: 'It is a waste product that your kidneys filter out.',
  K: 'It is a mineral that helps your muscles and nerves work.',
  NA: 'It is a mineral that helps balance the water in your body.',
  UREA: 'It is a waste product that your kidneys filter out.',
}

export const REPORTS: Record<ReportId, Report> = {
  normal: {
    id: 'normal',
    dot: '🟢',
    label: 'Normal report',
    blurb: 'All results inside printed ranges',
    visitId: 'DEMO-1001',
    patient: { first: 'Rahul', last: 'Verma', age: 34, sex: 'M', phone: '+91 98••• ••114' },
    results: [
      { code: 'HB', name: 'Hemoglobin', value: 14.2, unit: 'g/dL', low: 13.0, high: 17.0 },
      { code: 'GLU_F', name: 'Fasting glucose', value: 88, unit: 'mg/dL', low: 70, high: 99 },
      { code: 'HBA1C', name: 'HbA1c', value: 5.2, unit: '%', low: 4.0, high: 5.6 },
      { code: 'TSH', name: 'TSH', value: 2.1, unit: 'mIU/L', low: 0.4, high: 4.2 },
      { code: 'CHOL', name: 'Total cholesterol', value: 172, unit: 'mg/dL', high: 200, rangeText: 'below 200' },
      { code: 'CREAT', name: 'Creatinine', value: 0.9, unit: 'mg/dL', low: 0.7, high: 1.3 },
    ],
  },
  abnormal: {
    id: 'abnormal',
    dot: '🟡',
    label: 'Out-of-range report',
    blurb: '3 results outside printed ranges',
    visitId: 'DEMO-2043',
    patient: { first: 'Anita', last: 'Sharma', age: 42, sex: 'F', phone: '+91 98••• ••208' },
    results: [
      { code: 'HB', name: 'Hemoglobin', value: 13.1, unit: 'g/dL', low: 12.0, high: 15.5 },
      { code: 'GLU_F', name: 'Fasting glucose', value: 138, unit: 'mg/dL', low: 70, high: 99 },
      { code: 'HBA1C', name: 'HbA1c', value: 7.1, unit: '%', low: 4.0, high: 5.6 },
      { code: 'TSH', name: 'TSH', value: 6.8, unit: 'mIU/L', low: 0.4, high: 4.2 },
      { code: 'CHOL', name: 'Total cholesterol', value: 189, unit: 'mg/dL', high: 200, rangeText: 'below 200' },
      { code: 'CREAT', name: 'Creatinine', value: 0.8, unit: 'mg/dL', low: 0.6, high: 1.1 },
    ],
  },
  critical: {
    id: 'critical',
    dot: '🔴',
    label: 'Critical report',
    blurb: 'A value beyond a critical limit',
    visitId: 'DEMO-3077',
    patient: { first: 'Meena', last: 'Iyer', age: 58, sex: 'F', phone: '+91 98••• ••321' },
    results: [
      { code: 'K', name: 'Potassium', value: 6.9, unit: 'mmol/L', low: 3.5, high: 5.1, critHigh: 6.5 },
      { code: 'CREAT', name: 'Creatinine', value: 2.9, unit: 'mg/dL', low: 0.6, high: 1.1 },
      { code: 'NA', name: 'Sodium', value: 138, unit: 'mmol/L', low: 135, high: 145 },
      { code: 'HB', name: 'Hemoglobin', value: 11.8, unit: 'g/dL', low: 12.0, high: 15.5 },
      { code: 'GLU_F', name: 'Fasting glucose', value: 96, unit: 'mg/dL', low: 70, high: 99 },
      { code: 'UREA', name: 'Urea', value: 62, unit: 'mg/dL', low: 15, high: 45 },
    ],
    previous: { code: 'K', value: 4.6, unit: 'mmol/L', when: 'six months ago' },
  },
  // Hidden presenter report: one unrecognised test with no printed range. Routes to a human.
  incomplete: {
    id: 'incomplete',
    dot: '⚪',
    label: 'Incomplete report (hidden)',
    blurb: 'Unknown test, no printed range',
    visitId: 'DEMO-4090',
    patient: { first: 'Vikram', last: 'Nair', age: 51, sex: 'M', phone: '+91 98••• ••777' },
    results: [
      { code: 'HB', name: 'Hemoglobin', value: 14.8, unit: 'g/dL', low: 13.0, high: 17.0 },
      { code: 'LPA', name: 'Lipoprotein (a)', value: 41, unit: 'mg/dL' },
    ],
  },
}

export const DEMO_REPORT_IDS: ReportId[] = ['normal', 'abnormal', 'critical']

function decimalsOf(n: number | null | undefined): number {
  if (n === null || n === undefined) return 0
  const s = String(n)
  return s.includes('.') ? s.split('.')[1].length : 0
}

// Keep one decimal where the printed data uses one (e.g. 13.0, 4.0).
export function fmt(n: number, r?: LabResult): string {
  const decimals = r ? Math.max(decimalsOf(r.value), decimalsOf(r.low), decimalsOf(r.high)) : decimalsOf(n)
  return n.toFixed(decimals)
}

export function printedRange(r: LabResult): string {
  if (r.rangeText) return r.rangeText
  if (r.low !== undefined && r.high !== undefined) return `${fmt(r.low, r)}–${fmt(r.high, r)}`
  return 'not printed'
}

export function fmtValue(r: LabResult): string {
  return r.value === null ? 'unreadable' : fmt(r.value, r)
}
