// Free-text guardrails. Pure and deterministic: decides how a typed message is answered.
// Emergency wording is checked before every other rule.
import { TEST_CATALOGUE, type Report } from '../data/reports';
import type { Route } from './classify';

export const EMERGENCY_PATTERN =
  /chest pain|can(?:no|')?t breathe|cannot breathe|can not breathe|trouble breathing|short(?:ness)? of breath|breathless|faint|passed out|unconscious|collaps|severe bleeding|bleeding (?:a lot|heavily|badly)|heart attack|stroke|seizure|distress|emergency|suicid|kill myself|want to die/i;

export const STOP_PATTERN = /^\s*stop\s*[.!]?\s*$/i;
export const DELETE_PATTERN = /\bdelete\b|\berase\b|remove my (?:report|data)/i;

/** Diagnosis, medicine or treatment: always refused, with a doctor call offered. */
export const CLINICAL_QUESTION_PATTERN =
  /diabet|diagnos|do i have|have i got|disease|condition|medicine|medication|tablet|pill|drug|dose|dosage|prescri|treat|cure|insulin|metformin|what should i (?:take|eat)|should i (?:take|stop|start|change)/i;

export const SERIOUS_PATTERN = /serious|dangerous|worried|worry|scared|concern|is (?:it|this) bad|should i be/i;
export const ADVISOR_PATTERN = /\bperson\b|\bhuman\b|\bsomeone\b|\badvisor\b|\bagent\b|call me|speak to|talk to/i;
export const THANKS_PATTERN = /thank|got it|\bok(?:ay)?\b|understood|clear now|\bdhanyavaad\b|\bshukriya\b/i;
export const BOOK_PATTERN = /\bbook\b|appointment|consult|see a doctor|doctor call/i;
export const TREND_PATTERN = /last time|previous|changed|compare|better|worse|improv/i;

export type FreeTextRule =
  | 'EMERGENCY'
  | 'STOP'
  | 'DELETE'
  | 'NO_REPORT'
  | 'CRITICAL_THREAD'
  | 'CLINICAL_QUESTION'
  | 'SERIOUS'
  | 'ADVISOR'
  | 'BOOK'
  | 'TREND'
  | 'WHAT_IS'
  | 'THANKS'
  | 'OFF_TOPIC';

export interface FreeTextDecision {
  rule: FreeTextRule;
  testCode?: string;
}

export interface FreeTextContext {
  report?: Report;
  route?: Route;
  clinicianReached?: boolean;
}

/** Finds a test on this report that the message names ("what is hba1c?", "my sugar"). */
export function mentionedTest(text: string, report?: Report): string | undefined {
  if (!report) return undefined;
  const lower = text.toLowerCase();
  for (const r of report.results) {
    const def = TEST_CATALOGUE[r.code];
    if (!def) continue;
    const names = [def.name.toLowerCase(), def.code.toLowerCase()];
    if (r.code === 'HB') names.push('hemoglobin', 'hb');
    if (r.code === 'FBG') names.push('glucose', 'sugar');
    if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower))) return r.code;
  }
  return undefined;
}

export function routeFreeText(text: string, ctx: FreeTextContext = {}): FreeTextDecision {
  if (EMERGENCY_PATTERN.test(text)) return { rule: 'EMERGENCY' };
  if (STOP_PATTERN.test(text)) return { rule: 'STOP' };
  if (DELETE_PATTERN.test(text) && ctx.report) return { rule: 'DELETE' };
  if (!ctx.report || !ctx.route) return { rule: 'NO_REPORT' };
  if (ctx.route === 'CRITICAL') return { rule: 'CRITICAL_THREAD' };
  if (CLINICAL_QUESTION_PATTERN.test(text)) return { rule: 'CLINICAL_QUESTION' };
  if (SERIOUS_PATTERN.test(text) && ctx.route === 'ABNORMAL') return { rule: 'SERIOUS' };
  if (ADVISOR_PATTERN.test(text)) return { rule: 'ADVISOR' };
  if (BOOK_PATTERN.test(text)) return { rule: 'BOOK' };
  if (TREND_PATTERN.test(text) && ctx.report.previous?.length) return { rule: 'TREND' };
  const code = mentionedTest(text, ctx.report);
  if (code && (ctx.route === 'NORMAL' || ctx.route === 'ABNORMAL')) return { rule: 'WHAT_IS', testCode: code };
  if (THANKS_PATTERN.test(text)) return { rule: 'THANKS' };
  return { rule: 'OFF_TOPIC' };
}
