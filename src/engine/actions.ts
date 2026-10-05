// Quick replies and suggested questions. Pure: which pre-built messages the patient can tap,
// decided from the report and the route. Max 3 quick replies per message, as on the real channel.
import { TEST_CATALOGUE, type Report } from '../data/reports';
import { classify, type Route } from './classify';
import { flagged } from './explain';
import { sentenceCase } from './format';

export type ActionId =
  | 'CONSENT_YES'
  | 'CONSENT_NO'
  | 'EXPLAIN_MORE'
  | 'SERIOUS'
  | 'TREND'
  | 'BOOK'
  | 'BOOK_TIMES'
  | `BOOK_SLOT:${string}`
  | 'SHARE'
  | 'REMIND'
  | 'HUMAN'
  | 'DELETE'
  | 'GOT_IT'
  | 'UNWELL'
  | 'RESEND'
  | 'SCOPE'
  | 'OPEN_HANDOFF'
  | `WHAT_IS:${string}`;

export const BOOK_SLOTS = ['5:30 pm today', '6:15 pm today', '10:00 am tomorrow'];

export function actionLabel(id: ActionId, route?: Route): string {
  if (id.startsWith('WHAT_IS:')) return `What is ${sentenceCase(TEST_CATALOGUE[id.slice(8)]?.name ?? 'this test')}?`;
  if (id.startsWith('BOOK_SLOT:')) return `Book ${id.slice(10)}`;
  switch (id) {
    case 'CONSENT_YES': return 'Yes, continue';
    case 'CONSENT_NO': return 'Not now';
    case 'EXPLAIN_MORE': return 'Explain each result';
    case 'SERIOUS': return 'Is this serious?';
    case 'TREND': return 'How has it changed?';
    case 'BOOK': return 'Book a doctor call';
    case 'BOOK_TIMES': return 'Other times';
    case 'SHARE': return 'Send a summary to family';
    case 'REMIND': return route === 'ABNORMAL' ? 'Remind me to re-test' : 'Remind me next year';
    case 'HUMAN': return 'Talk to a person';
    case 'DELETE': return 'Delete my report';
    case 'GOT_IT': return 'Got it, thanks';
    case 'UNWELL': return 'I feel unwell now';
    case 'RESEND': return 'Send a clearer photo';
    case 'SCOPE': return 'What can you explain?';
    case 'OPEN_HANDOFF': return 'See the doctor handoff';
  }
  return id;
}

/** Flagged tests, jargon first: "HbA1c" or "TSH" puzzles people more than "fasting glucose". */
function flaggedCodes(report: Report): string[] {
  const codes = flagged(classify(report).results).map((f) => f.result.code);
  const jargon = (code: string) => /^[A-Z][a-z]?[A-Z]/.test(TEST_CATALOGUE[code]?.name ?? '');
  return [...codes.filter(jargon), ...codes.filter((c) => !jargon(c))];
}

/** The three quick replies under the brief or route message. */
export function briefReplies(report: Report, route: Route): ActionId[] {
  switch (route) {
    case 'NORMAL':
      return ['EXPLAIN_MORE', 'REMIND', 'GOT_IT'];
    case 'ABNORMAL': {
      const first = flaggedCodes(report)[0];
      return first ? [`WHAT_IS:${first}`, 'BOOK', 'EXPLAIN_MORE'] : ['EXPLAIN_MORE', 'BOOK', 'HUMAN'];
    }
    case 'CRITICAL':
      return ['HUMAN', 'UNWELL'];
    case 'UNREADABLE':
      return ['RESEND', 'HUMAN'];
    case 'UNSUPPORTED':
      return ['SCOPE', 'HUMAN'];
    case 'HUMAN':
      return [];
  }
}

/** Suggested questions shown above the message box after the brief. Already-used ones drop off. */
export function suggestionsFor(report: Report | undefined, route: Route | undefined, used: ActionId[]): ActionId[] {
  if (!report || !route) return [];
  let list: ActionId[] = [];
  const c = classify(report);
  switch (route) {
    case 'NORMAL': {
      const tests = c.results.slice(0, 6).map((f) => `WHAT_IS:${f.result.code}` as ActionId);
      list = ['EXPLAIN_MORE', ...tests.filter((t) => t === 'WHAT_IS:HBA1C' || t === 'WHAT_IS:TSH'), 'REMIND', 'SHARE', 'DELETE'];
      break;
    }
    case 'ABNORMAL':
      list = [
        ...flaggedCodes(report).map((code) => `WHAT_IS:${code}` as ActionId),
        'SERIOUS',
        ...(report.previous?.length ? (['TREND'] as ActionId[]) : []),
        'BOOK',
        'REMIND',
        'SHARE',
        'EXPLAIN_MORE',
        'HUMAN',
        'DELETE',
      ];
      break;
    case 'CRITICAL':
      list = ['HUMAN', 'UNWELL'];
      break;
    case 'UNREADABLE':
      list = ['RESEND', 'HUMAN'];
      break;
    case 'UNSUPPORTED':
      list = ['SCOPE', 'HUMAN'];
      break;
    case 'HUMAN':
      list = ['DELETE'];
      break;
  }
  return list.filter((a) => !used.includes(a));
}
