// Deterministic routing rules. Rules decide the route; the brief is only built afterwards.
// No React imports here.
import { SENSITIVE_CATEGORIES, TEST_CATALOGUE, type Report, type TestResult } from '../data/reports';
import { fmtCriticalLimit, fmtRange, fmtValue, testName } from './format';

/**
 * NORMAL      everything in range → brief
 * ABNORMAL    something outside the printed range → brief with flags, no interpretation
 * CRITICAL    beyond a critical limit → share nothing, a doctor calls first
 * HUMAN       sensitive test, or a result the lab library does not recognise → a person explains it
 * UNREADABLE  a value could not be read → say so, ask for a clearer copy, never guess
 * UNSUPPORTED not a lab report → say so, explain what the assistant can do
 */
export type Route = 'NORMAL' | 'ABNORMAL' | 'CRITICAL' | 'HUMAN' | 'UNREADABLE' | 'UNSUPPORTED';

export type Flag =
  | 'IN_RANGE'
  | 'LOW'
  | 'HIGH'
  | 'CRITICAL_LOW'
  | 'CRITICAL_HIGH'
  | 'UNREADABLE'
  | 'INCOMPLETE'
  | 'SENSITIVE';

export type HumanReason = 'SENSITIVE' | 'INCOMPLETE';

export interface FlaggedResult {
  result: TestResult;
  flag: Flag;
  reason: string;
}

export interface Classification {
  route: Route;
  humanReason?: HumanReason;
  results: FlaggedResult[];
  counts: {
    total: number;
    inRange: number;
    outOfRange: number;
    critical: number;
    unreadable: number;
    incomplete: number;
    sensitive: number;
  };
  /** One line per rule that fired, for the "How it works" trace. */
  reasons: string[];
}

export function isReadable(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasPrintedRange(r: TestResult): boolean {
  return r.low !== undefined || r.high !== undefined;
}

export function isSensitive(r: TestResult): boolean {
  const category = TEST_CATALOGUE[r.code]?.category;
  return category !== undefined && SENSITIVE_CATEGORIES.includes(category);
}

/** A value exactly on a boundary is within range. */
export function flagResult(r: TestResult): FlaggedResult {
  const name = testName(r);
  if (isSensitive(r)) return { result: r, flag: 'SENSITIVE', reason: `${name} is a sensitive test category` };
  if (!TEST_CATALOGUE[r.code]) return { result: r, flag: 'INCOMPLETE', reason: `Unrecognised test code "${r.code}"` };
  if (!isReadable(r.value)) return { result: r, flag: 'UNREADABLE', reason: `${name} value could not be read` };
  if (!hasPrintedRange(r)) return { result: r, flag: 'INCOMPLETE', reason: `${name} has no printed range` };

  const v = r.value;
  const shown = `${name} ${fmtValue(r)}`;
  if (r.criticalHigh !== undefined && v > r.criticalHigh) {
    return { result: r, flag: 'CRITICAL_HIGH', reason: `${shown} is beyond its critical limit (${fmtCriticalLimit(r)})` };
  }
  if (r.criticalLow !== undefined && v < r.criticalLow) {
    return { result: r, flag: 'CRITICAL_LOW', reason: `${shown} is beyond its critical limit (${fmtCriticalLimit(r)})` };
  }
  if (r.high !== undefined && v > r.high) return { result: r, flag: 'HIGH', reason: `${shown} is above range ${fmtRange(r)}` };
  if (r.low !== undefined && v < r.low) return { result: r, flag: 'LOW', reason: `${shown} is below range ${fmtRange(r)}` };
  return { result: r, flag: 'IN_RANGE', reason: `${shown} is within ${fmtRange(r)}` };
}

export function isCritical(flag: Flag): boolean {
  return flag === 'CRITICAL_HIGH' || flag === 'CRITICAL_LOW';
}

export function isOutOfRange(flag: Flag): boolean {
  return flag === 'HIGH' || flag === 'LOW' || isCritical(flag);
}

/**
 * Priority: UNSUPPORTED > CRITICAL > HUMAN (sensitive) > UNREADABLE > HUMAN (incomplete) > ABNORMAL > NORMAL.
 * Critical outranks everything we can read, because a doctor must call first.
 */
export function classify(report: Report): Classification {
  const results = report.kind === 'lab' ? report.results.map(flagResult) : [];
  const count = (pred: (f: Flag) => boolean) => results.filter((r) => pred(r.flag)).length;
  const counts = {
    total: results.length,
    inRange: count((f) => f === 'IN_RANGE'),
    outOfRange: count(isOutOfRange),
    critical: count(isCritical),
    unreadable: count((f) => f === 'UNREADABLE'),
    incomplete: count((f) => f === 'INCOMPLETE'),
    sensitive: count((f) => f === 'SENSITIVE'),
  };
  const fired = (pred: (f: Flag) => boolean) => results.filter((r) => pred(r.flag)).map((r) => r.reason);

  if (report.kind !== 'lab') {
    return { route: 'UNSUPPORTED', results, counts, reasons: ['Not a lab report: this assistant only explains lab reports for now'] };
  }
  if (counts.critical > 0) return { route: 'CRITICAL', results, counts, reasons: fired(isCritical) };
  if (counts.sensitive > 0) {
    return { route: 'HUMAN', humanReason: 'SENSITIVE', results, counts, reasons: fired((f) => f === 'SENSITIVE') };
  }
  if (counts.unreadable > 0) return { route: 'UNREADABLE', results, counts, reasons: fired((f) => f === 'UNREADABLE') };
  if (counts.incomplete > 0) {
    return { route: 'HUMAN', humanReason: 'INCOMPLETE', results, counts, reasons: fired((f) => f === 'INCOMPLETE') };
  }
  if (counts.outOfRange > 0) return { route: 'ABNORMAL', results, counts, reasons: fired(isOutOfRange) };
  return { route: 'NORMAL', results, counts, reasons: [`All ${counts.total} results within printed ranges`] };
}
