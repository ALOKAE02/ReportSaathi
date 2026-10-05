// Output checks, run on every outgoing assistant message. No React imports here.
import type { Report } from '../data/reports';
import { TEST_CATALOGUE } from '../data/reports';
import { classify, type Route } from './classify';
import { DATE_PATTERN, TIME_PATTERN, testName } from './format';
import { DISCLAIMER, LAB_NAME, REVIEWED_PHRASES, getTemplate, type Message, type Template } from './templates';

export type CheckId = 'registered' | 'numbers' | 'wording' | 'disclaimer' | 'critical';
export type CheckStatus = 'pass' | 'fail' | 'na';

export interface CheckResult {
  id: CheckId;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface CheckOutcome {
  ok: boolean;
  results: CheckResult[];
}

export interface CheckContext {
  report?: Report;
  route?: Route;
}

export const BANNED_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'diagnos*', re: /\bdiagnos\w*/i },
  { label: 'you have', re: /\byou have\b/i },
  { label: 'prescribe', re: /\bprescri\w*/i },
  { label: 'dose', re: /\bdos(?:e|es|age|ing)\b/i },
  { label: 'tablet', re: /\btablets?\b/i },
  { label: 'medicine', re: /\bmedicines?\b/i },
  { label: 'treatment', re: /\btreatments?\b/i },
  { label: 'cure', re: /\bcur(?:e|es|ed|ing)\b/i },
];

const NUMBER_TOKEN = /(?<![A-Za-z0-9.])\d+(?:\.\d+)?(?![A-Za-z0-9])/g;
const VISIT_ID = /\bDEMO-\d+\b/g;
const UNITS = ['mmol/L', 'mg/dL', 'g/dL', 'mIU/L', 'ng/mL', 'U/mL', 'thousand/µL'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove visit IDs, times, dates and reviewed protocol phrases before looking for numbers. */
export function stripNonResultNumbers(text: string): string {
  let out = text.replace(VISIT_ID, ' ').replace(DATE_PATTERN, ' ').replace(TIME_PATTERN, ' ');
  for (const phrase of REVIEWED_PHRASES) out = out.replace(new RegExp(escapeRegExp(phrase), 'gi'), ' ');
  return out;
}

export function numbersIn(text: string): number[] {
  return (stripNonResultNumbers(text).match(NUMBER_TOKEN) ?? []).map(Number);
}

/** Numbers that exist in the report data, plus the result counts the engine derives from it. */
export function allowedNumbers(report?: Report): Set<number> {
  const allowed = new Set<number>();
  if (!report) return allowed;
  allowed.add(report.patient.age);
  for (const r of report.results) {
    for (const n of [r.value, r.low, r.high, r.criticalLow, r.criticalHigh]) {
      if (typeof n === 'number') allowed.add(n);
    }
  }
  for (const p of report.previous ?? []) allowed.add(p.value).add(p.monthsAgo);
  const { counts } = classify(report);
  allowed.add(counts.total).add(counts.inRange).add(counts.outOfRange);
  return allowed;
}

function checkRegistered(msg: Message): { result: CheckResult; tpl?: Template } {
  const tpl = getTemplate(msg.templateId, msg.version);
  if (!tpl) {
    return {
      result: { id: 'registered', label: 'Registered template', status: 'fail', detail: `No registered template for "${msg.templateId ?? 'none'}" v${msg.version ?? '?'}` },
    };
  }
  return { tpl, result: { id: 'registered', label: 'Registered template', status: 'pass', detail: `${tpl.id} v${tpl.version}` } };
}

export function checkNumbers(text: string, report?: Report): CheckResult {
  const allowed = allowedNumbers(report);
  const invented = numbersIn(text).filter((n) => !allowed.has(n));
  return invented.length
    ? { id: 'numbers', label: 'Numbers match report', status: 'fail', detail: `Not in report data: ${invented.join(', ')}` }
    : { id: 'numbers', label: 'Numbers match report', status: 'pass' };
}

export function checkWording(text: string, tpl?: Template): CheckResult {
  // The lab's own name is a proper noun, not a clinical statement.
  const scanned = text.split(LAB_NAME).join(' ');
  const hits = BANNED_PATTERNS.filter((p) => p.re.test(scanned)).map((p) => p.label);
  if (!hits.length) return { id: 'wording', label: 'No banned wording', status: 'pass' };
  if (tpl?.verbatimWordingAllowed && tpl.static && text === tpl.text) {
    return { id: 'wording', label: 'No banned wording', status: 'pass', detail: 'Registered refusal text, word for word' };
  }
  return { id: 'wording', label: 'No banned wording', status: 'fail', detail: `Found: ${hits.join(', ')}` };
}

export function checkDisclaimer(text: string, tpl?: Template): CheckResult {
  if (!tpl?.requiresDisclaimer) return { id: 'disclaimer', label: 'Disclaimer present', status: 'na' };
  return text.includes(DISCLAIMER)
    ? { id: 'disclaimer', label: 'Disclaimer present', status: 'pass' }
    : { id: 'disclaimer', label: 'Disclaimer present', status: 'fail', detail: 'Explanation is missing the disclaimer line' };
}

/** A CRITICAL route emits no result values, test names or units at all. */
export function checkCritical(text: string, ctx: CheckContext): CheckResult {
  if (ctx.route !== 'CRITICAL') return { id: 'critical', label: 'No values on critical path', status: 'na' };
  const problems: string[] = [];
  const nums = numbersIn(text);
  if (nums.length) problems.push(`values ${nums.join(', ')}`);
  const lower = text.toLowerCase();
  const names = new Set<string>();
  for (const r of ctx.report?.results ?? []) names.add(testName(r));
  for (const def of Object.values(TEST_CATALOGUE)) names.add(def.name);
  for (const name of names) {
    if (new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) problems.push(name);
  }
  for (const unit of UNITS) if (text.includes(unit)) problems.push(unit);
  return problems.length
    ? { id: 'critical', label: 'No values on critical path', status: 'fail', detail: `Found: ${problems.join(', ')}` }
    : { id: 'critical', label: 'No values on critical path', status: 'pass' };
}

export function runOutputChecks(msg: Message, ctx: CheckContext = {}): CheckOutcome {
  const { result: registered, tpl } = checkRegistered(msg);
  const results = [
    registered,
    checkNumbers(msg.text, ctx.report),
    checkWording(msg.text, tpl),
    checkDisclaimer(msg.text, tpl),
    checkCritical(msg.text, ctx),
  ];
  return { ok: results.every((r) => r.status !== 'fail'), results };
}
