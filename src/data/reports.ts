// All patients, numbers and phone numbers in this file are fictional.
// This app must never be given real patient data.

export type SensitiveCategory = 'HIV' | 'GENETIC' | 'TUMOUR_MARKER' | 'PREGNANCY';

/** Tests in these categories are never explained by the assistant and always route to a human. */
export const SENSITIVE_CATEGORIES: readonly SensitiveCategory[] = ['HIV', 'GENETIC', 'TUMOUR_MARKER', 'PREGNANCY'];

export type TestGroup = 'blood count' | 'sugar' | 'thyroid' | 'cholesterol' | 'kidney' | 'minerals';

/** The approved explanation library. Domain experts own these lines; the assistant may only use them. */
export interface TestDefinition {
  code: string;
  name: string;
  unit: string;
  decimals: number;
  /** A few plain words, shown in brackets in the brief. */
  short: string;
  /** One plain line about what the test measures. Never says what a result means. */
  measures: string;
  /** Longer approved explanation for "What is …?" */
  about: string;
  group?: TestGroup;
  category?: SensitiveCategory;
  /** Re-test interval set by the lab's medical team, used for reminders. */
  repeatMonths?: number;
}

const def = (d: TestDefinition) => d;

export const TEST_CATALOGUE: Record<string, TestDefinition> = {
  HB: def({ code: 'HB', name: 'Haemoglobin', unit: 'g/dL', decimals: 1, group: 'blood count', short: 'oxygen-carrying protein',
    measures: 'It is the protein in your blood that carries oxygen.',
    about: 'Haemoglobin is a protein in your red blood cells. It carries oxygen around your body.' }),
  WBC: def({ code: 'WBC', name: 'White cells', unit: 'thousand/µL', decimals: 1, group: 'blood count', short: 'cells that fight infection',
    measures: 'These cells help your body fight infections.',
    about: 'White blood cells are part of your immune system. They help your body fight infections.' }),
  PLT: def({ code: 'PLT', name: 'Platelets', unit: 'thousand/µL', decimals: 0, group: 'blood count', short: 'cells that help blood clot',
    measures: 'These tiny cells help your blood clot.',
    about: 'Platelets are tiny cells in your blood. They help it clot when you get a cut.' }),
  FBG: def({ code: 'FBG', name: 'Fasting glucose', unit: 'mg/dL', decimals: 0, group: 'sugar', short: 'blood sugar after fasting',
    measures: 'It is your blood sugar after fasting.',
    about: 'Fasting glucose is the sugar in your blood after a night without food. It is a snapshot of one morning.', repeatMonths: 3 }),
  HBA1C: def({ code: 'HBA1C', name: 'HbA1c', unit: '%', decimals: 1, group: 'sugar', short: 'average sugar over about 3 months',
    measures: 'It shows your average blood sugar over about 3 months.',
    about: 'HbA1c shows your average blood sugar over about 3 months. It changes slowly, so it is often checked every few months.', repeatMonths: 3 }),
  TSH: def({ code: 'TSH', name: 'TSH', unit: 'mIU/L', decimals: 1, group: 'thyroid', short: 'thyroid signal hormone',
    measures: 'It is a hormone that tells your thyroid how much to work.',
    about: 'TSH is a hormone that tells your thyroid gland how much to work. The thyroid helps control how your body uses energy.', repeatMonths: 3 }),
  CHOL: def({ code: 'CHOL', name: 'Total cholesterol', unit: 'mg/dL', decimals: 0, group: 'cholesterol', short: 'fat carried in the blood',
    measures: 'It is a type of fat carried in your blood.',
    about: 'Cholesterol is a type of fat carried in your blood. Your body needs some of it to work well.' }),
  CREAT: def({ code: 'CREAT', name: 'Creatinine', unit: 'mg/dL', decimals: 1, group: 'kidney', short: 'kidney waste product',
    measures: 'It is a waste product your kidneys filter out.',
    about: 'Creatinine is a waste product from your muscles. Your kidneys filter it out of the blood.' }),
  UREA: def({ code: 'UREA', name: 'Urea', unit: 'mg/dL', decimals: 0, group: 'kidney', short: 'kidney waste product',
    measures: 'It is a waste product your kidneys remove.',
    about: 'Urea is a waste product made when your body breaks down protein. Your kidneys remove it.' }),
  K: def({ code: 'K', name: 'Potassium', unit: 'mmol/L', decimals: 1, group: 'minerals', short: 'mineral for nerves and muscles',
    measures: 'It is a mineral that helps your nerves and muscles work.',
    about: 'Potassium is a mineral that helps your nerves, muscles and heart work.' }),
  NA: def({ code: 'NA', name: 'Sodium', unit: 'mmol/L', decimals: 0, group: 'minerals', short: 'mineral for water balance',
    measures: 'It is a mineral that helps balance the water in your body.',
    about: 'Sodium is a mineral that helps balance the water in your body.' }),
  // Sensitive tests: recognised so the rules engine can route them to a person. Never explained.
  HIV: def({ code: 'HIV', name: 'HIV antibody screen', unit: '', decimals: 2, short: '', measures: '', about: '', category: 'HIV' }),
  BRCA: def({ code: 'BRCA', name: 'BRCA gene panel', unit: '', decimals: 0, short: '', measures: '', about: '', category: 'GENETIC' }),
  PSA: def({ code: 'PSA', name: 'PSA', unit: 'ng/mL', decimals: 1, short: '', measures: '', about: '', category: 'TUMOUR_MARKER' }),
  CA125: def({ code: 'CA125', name: 'CA-125', unit: 'U/mL', decimals: 0, short: '', measures: '', about: '', category: 'TUMOUR_MARKER' }),
  BHCG: def({ code: 'BHCG', name: 'Beta hCG', unit: 'mIU/mL', decimals: 0, short: '', measures: '', about: '', category: 'PREGNANCY' }),
};

export interface TestResult {
  code: string;
  /** null means the value could not be read (blurry photo, cut-off page). */
  value: number | null;
  low?: number;
  high?: number;
  criticalLow?: number;
  criticalHigh?: number;
  /** Display label for codes the catalogue does not recognise. */
  label?: string;
}

export interface PreviousResult {
  code: string;
  value: number;
  monthsAgo: number;
}

export interface Patient {
  name: string;
  firstName: string;
  age: number;
  sex: 'M' | 'F';
  phone: string;
}

export type DocKind = 'lab' | 'insurance';
export type ReportTone = 'calm' | 'note' | 'urgent' | 'photo' | 'other';

export interface Report {
  id: string;
  visitId: string;
  /** What the document is, in plain words: "CBC + HbA1c". */
  title: string;
  /** Short line for the document shelf. */
  blurb: string;
  tone: ReportTone;
  kind: DocKind;
  file: { name: string; type: 'pdf' | 'image'; meta: string };
  /** Collection date, in the format the output checks recognise. */
  date: string;
  patient: Patient;
  results: TestResult[];
  previous?: PreviousResult[];
  /** For a blurry photo: the clearer re-take the patient can send. */
  retakeId?: string;
  /** Hidden from the document shelf (only reachable from another flow). */
  hidden?: boolean;
}

export const REPORTS: Report[] = [
  {
    id: 'DEMO-1001',
    visitId: 'DEMO-1001',
    title: 'Annual health check',
    blurb: 'Everything in range',
    tone: 'calm',
    kind: 'lab',
    file: { name: 'Annual_Health_Check_Rahul.pdf', type: 'pdf', meta: '2 pages · PDF' },
    date: '2 Oct 2026',
    patient: { name: 'Rahul Verma', firstName: 'Rahul', age: 34, sex: 'M', phone: '+91 98200 41108' },
    results: [
      { code: 'HB', value: 14.2, low: 13.0, high: 17.0 },
      { code: 'FBG', value: 88, low: 70, high: 99 },
      { code: 'HBA1C', value: 5.2, low: 4.0, high: 5.6 },
      { code: 'TSH', value: 2.1, low: 0.4, high: 4.2 },
      { code: 'CHOL', value: 172, high: 200 },
      { code: 'CREAT', value: 0.9, low: 0.7, high: 1.3 },
    ],
  },
  {
    id: 'DEMO-2043',
    visitId: 'DEMO-2043',
    title: 'CBC + HbA1c',
    blurb: 'Two values to note',
    tone: 'note',
    kind: 'lab',
    file: { name: 'CBC_HbA1c_Ramesh.pdf', type: 'pdf', meta: '2 pages · PDF' },
    date: '2 Oct 2026',
    patient: { name: 'Ramesh Kumar', firstName: 'Ramesh', age: 61, sex: 'M', phone: '+91 99860 22457' },
    results: [
      { code: 'HB', value: 14.1, low: 13.0, high: 17.0 },
      { code: 'WBC', value: 7.2, low: 4.0, high: 11.0 },
      { code: 'PLT', value: 245, low: 150, high: 410 },
      { code: 'FBG', value: 132, low: 70, high: 99 },
      { code: 'HBA1C', value: 7.4, low: 4.0, high: 5.6 },
    ],
    previous: [
      { code: 'HBA1C', value: 8.1, monthsAgo: 3 },
      { code: 'FBG', value: 156, monthsAgo: 3 },
    ],
  },
  {
    id: 'DEMO-3077',
    visitId: 'DEMO-3077',
    title: 'Kidney panel',
    blurb: 'Needs a doctor',
    tone: 'urgent',
    kind: 'lab',
    file: { name: 'Kidney_Panel_Meena.pdf', type: 'pdf', meta: '1 page · PDF' },
    date: '2 Oct 2026',
    patient: { name: 'Meena Iyer', firstName: 'Meena', age: 58, sex: 'F', phone: '+91 98450 77321' },
    results: [
      { code: 'K', value: 6.9, low: 3.5, high: 5.1, criticalHigh: 6.5 },
      { code: 'CREAT', value: 2.9, low: 0.6, high: 1.1 },
      { code: 'NA', value: 138, low: 135, high: 145 },
      { code: 'HB', value: 11.8, low: 12.0, high: 15.5 },
      { code: 'FBG', value: 96, low: 70, high: 99 },
      { code: 'UREA', value: 62, low: 15, high: 45 },
    ],
    previous: [{ code: 'K', value: 4.6, monthsAgo: 6 }],
  },
  {
    id: 'DEMO-4010',
    visitId: 'DEMO-4010',
    title: 'Sugar + thyroid (photo)',
    blurb: 'A blurry photo',
    tone: 'photo',
    kind: 'lab',
    file: { name: 'IMG_2041.jpg', type: 'image', meta: 'Photo · slightly blurry' },
    date: '2 Oct 2026',
    patient: { name: 'Sunita Rao', firstName: 'Sunita', age: 45, sex: 'F', phone: '+91 97400 18862' },
    results: [
      { code: 'HB', value: 12.8, low: 12.0, high: 15.5 },
      { code: 'FBG', value: null, low: 70, high: 99 },
      { code: 'TSH', value: 2.4, low: 0.4, high: 4.2 },
    ],
    retakeId: 'DEMO-4011',
  },
  {
    id: 'DEMO-4011',
    visitId: 'DEMO-4010',
    title: 'Sugar + thyroid report',
    blurb: 'Clear re-take',
    tone: 'calm',
    kind: 'lab',
    file: { name: 'IMG_2042.jpg', type: 'image', meta: 'Photo · clear' },
    date: '2 Oct 2026',
    patient: { name: 'Sunita Rao', firstName: 'Sunita', age: 45, sex: 'F', phone: '+91 97400 18862' },
    results: [
      { code: 'HB', value: 12.8, low: 12.0, high: 15.5 },
      { code: 'FBG', value: 92, low: 70, high: 99 },
      { code: 'TSH', value: 2.4, low: 0.4, high: 4.2 },
    ],
    hidden: true,
  },
  {
    id: 'DEMO-9001',
    visitId: 'DEMO-9001',
    title: 'Health insurance policy',
    blurb: 'Not a lab report',
    tone: 'other',
    kind: 'insurance',
    file: { name: 'Health_Insurance_Policy.pdf', type: 'pdf', meta: '38 pages · PDF' },
    date: '2 Oct 2026',
    patient: { name: 'Priya Nair', firstName: 'Priya', age: 29, sex: 'F', phone: '+91 96320 55104' },
    results: [],
  },
];

export const SHELF_REPORTS = REPORTS.filter((r) => !r.hidden);

export function getReport(id: string | undefined): Report | undefined {
  return id ? REPORTS.find((r) => r.id === id) : undefined;
}
