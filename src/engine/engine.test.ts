import { describe, expect, it } from 'vitest';
import { getReport, SENSITIVE_CATEGORIES, TEST_CATALOGUE, type Report } from '../data/reports';
import { briefReplies, suggestionsFor } from './actions';
import { classify, flagResult } from './classify';
import { runOutputChecks } from './checks';
import { clinicianSummary, explain, explainEach, reminder, serious, shareSummary, trend, whatIs } from './explain';
import { routeFreeText } from './guardrails';
import { DISCLAIMER, render, TEMPLATES } from './templates';

const report = (id: string): Report => {
  const r = getReport(id);
  if (!r) throw new Error(`missing ${id}`);
  return r;
};

const base = (results: Report['results']): Report => ({ ...report('DEMO-1001'), results });
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe('routing rules', () => {
  it('routes every demo document to the expected route', () => {
    expect(classify(report('DEMO-1001')).route).toBe('NORMAL');
    expect(classify(report('DEMO-2043')).route).toBe('ABNORMAL');
    expect(classify(report('DEMO-3077')).route).toBe('CRITICAL');
    expect(classify(report('DEMO-4010')).route).toBe('UNREADABLE');
    expect(classify(report('DEMO-4011')).route).toBe('NORMAL');
    expect(classify(report('DEMO-9001')).route).toBe('UNSUPPORTED');
  });

  it('treats a value exactly on a boundary as in range', () => {
    expect(flagResult({ code: 'FBG', value: 99, low: 70, high: 99 }).flag).toBe('IN_RANGE');
    expect(flagResult({ code: 'FBG', value: 70, low: 70, high: 99 }).flag).toBe('IN_RANGE');
    expect(flagResult({ code: 'CHOL', value: 200, high: 200 }).flag).toBe('IN_RANGE');
    expect(flagResult({ code: 'K', value: 6.5, low: 3.5, high: 5.1, criticalHigh: 6.5 }).flag).toBe('HIGH');
  });

  it('lets a critical value outrank abnormal, unreadable and sensitive results', () => {
    const r = base([
      { code: 'FBG', value: 138, low: 70, high: 99 },
      { code: 'TSH', value: null, low: 0.4, high: 4.2 },
      { code: 'BHCG', value: 3, high: 5 },
      { code: 'K', value: 2.4, low: 3.5, high: 5.1, criticalLow: 2.5 },
    ]);
    expect(classify(r).route).toBe('CRITICAL');
  });

  it('always routes every sensitive category to a person, even with normal values', () => {
    for (const cat of SENSITIVE_CATEGORIES) {
      const code = Object.values(TEST_CATALOGUE).find((d) => d.category === cat)!.code;
      const c = classify(base([{ code: 'HB', value: 14, low: 13, high: 17 }, { code, value: 1, low: 0, high: 10 }]));
      expect(c.route).toBe('HUMAN');
      expect(c.humanReason).toBe('SENSITIVE');
    }
  });

  it('routes a missing range or unknown test to a person, and an unreadable value to "ask again"', () => {
    expect(classify(base([{ code: 'TSH', value: 2.4 }])).route).toBe('HUMAN');
    expect(classify(base([{ code: 'VITQ', value: 31, low: 20, high: 50 }])).route).toBe('HUMAN');
    expect(classify(base([{ code: 'FBG', value: Number.NaN, low: 70, high: 99 }])).route).toBe('UNREADABLE');
  });
});

describe('the brief', () => {
  it('normal brief: headline, grouped "fine" line, next step, disclaimer, fits one screen', () => {
    const r = report('DEMO-1001');
    const [brief, suggest] = explain(r, 'NORMAL');
    expect(brief.text).toContain('all 6 results are in the normal range');
    expect(brief.text).toContain('✓ Blood count, sugar, thyroid, cholesterol and kidney tests are in the normal range.');
    expect(brief.text).toContain('Next:');
    expect(brief.text.endsWith(DISCLAIMER)).toBe(true);
    expect(words(brief.text)).toBeLessThanOrEqual(90);
    expect(suggest.templateId).toBe('SUGGEST-01');
    expect(runOutputChecks(brief, { report: r, route: 'NORMAL' }).ok).toBe(true);
  });

  it('flagged brief: fine first, each flag with value, range and trend, never interpreted', () => {
    const r = report('DEMO-2043');
    const [brief] = explain(r, 'ABNORMAL');
    expect(brief.text).toContain('2 things to note');
    expect(brief.text.indexOf('✓')).toBeLessThan(brief.text.indexOf('●'));
    expect(brief.text).toContain('● HbA1c (average sugar over about 3 months): 7.4%. Above the range (4.0–5.6). Lower than last time (8.1%).');
    expect(brief.text).toContain('● Fasting glucose');
    expect(words(brief.text)).toBeLessThanOrEqual(90);
    expect(runOutputChecks(brief, { report: r, route: 'ABNORMAL' }).ok).toBe(true);
  });

  it('critical message has no values, names or units', () => {
    const r = report('DEMO-3077');
    const msgs = explain(r, 'CRITICAL');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).not.toMatch(/\d+\.\d|Potassium|mmol/);
    expect(runOutputChecks(msgs[0], { report: r, route: 'CRITICAL' }).ok).toBe(true);
  });

  it('unreadable photo: says which value, never guesses', () => {
    const r = report('DEMO-4010');
    const [msg] = explain(r, 'UNREADABLE');
    expect(msg.text).toContain('could not read the fasting glucose value');
    expect(msg.text).not.toMatch(/12\.8|2\.4/);
    expect(runOutputChecks(msg, { report: r, route: 'UNREADABLE' }).ok).toBe(true);
  });

  it('every answer passes the output checks and leaves no placeholders', () => {
    const now = Date.UTC(2026, 9, 5);
    for (const id of ['DEMO-1001', 'DEMO-2043', 'DEMO-4011']) {
      const r = report(id);
      const route = classify(r).route;
      const msgs = [
        ...explain(r, route),
        explainEach(r),
        serious(r),
        shareSummary(r),
        reminder(r, route, now).message,
        ...r.results.map((x) => whatIs(r, x.code)).filter((m) => m !== undefined),
        ...(trend(r) ? [trend(r)!] : []),
      ];
      for (const m of msgs) {
        expect(m.text, m.templateId).not.toMatch(/\{[a-z_]+\}/);
        expect(runOutputChecks(m, { report: r, route }).ok, `${id} ${m.templateId}: ${m.text}`).toBe(true);
      }
    }
  });

  it('trend compares with the previous report', () => {
    expect(trend(report('DEMO-2043'))!.text).toContain('HbA1c: 7.4% now, 8.1% about 3 months ago. Lower than last time.');
    expect(trend(report('DEMO-1001'))).toBeUndefined();
  });

  it('builds the clinician summary from data', () => {
    expect(clinicianSummary(report('DEMO-3077'))).toBe(
      'Potassium markedly above the critical limit, up from 4.6. Creatinine and urea also high. Patient has been told a doctor will call within 30 minutes. No values were shared with the patient.',
    );
  });
});

describe('quick replies and suggestions', () => {
  it('offers at most 3 quick replies', () => {
    for (const id of ['DEMO-1001', 'DEMO-2043', 'DEMO-3077', 'DEMO-4010', 'DEMO-9001']) {
      const r = report(id);
      expect(briefReplies(r, classify(r).route).length).toBeLessThanOrEqual(3);
    }
  });

  it('suggests questions about the flagged tests, and drops used ones', () => {
    const r = report('DEMO-2043');
    const s = suggestionsFor(r, 'ABNORMAL', []);
    expect(s.slice(0, 2)).toEqual(['WHAT_IS:HBA1C', 'WHAT_IS:FBG']);
    expect(briefReplies(r, 'ABNORMAL')[0]).toBe('WHAT_IS:HBA1C');
    expect(s).toContain('TREND');
    expect(suggestionsFor(r, 'ABNORMAL', ['SERIOUS'])).not.toContain('SERIOUS');
  });

  it('offers nothing clinical on the critical path', () => {
    expect(suggestionsFor(report('DEMO-3077'), 'CRITICAL', [])).toEqual(['HUMAN', 'UNWELL']);
  });
});

describe('output checks', () => {
  const normal = report('DEMO-1001');
  const ctx = { report: normal, route: 'NORMAL' as const };

  it('rejects an invented number', () => {
    const msg = { ...explainEach(normal), text: explainEach(normal).text.replace('14.2', '15.7') };
    expect(runOutputChecks(msg, ctx).results.find((r) => r.id === 'numbers')?.status).toBe('fail');
  });

  it('rejects banned wording', () => {
    for (const phrase of ['You have diabetes.', 'This could be diagnosed early.', 'Take one tablet.', 'Ask about the dose.', 'Start treatment.', 'There is a cure.', 'Your doctor may prescribe this.', 'Buy this medicine.']) {
      const msg = { ...render('THANKS-01'), text: `Glad that helped. ${phrase}` };
      expect(runOutputChecks(msg, ctx).results.find((r) => r.id === 'wording')?.status, phrase).toBe('fail');
    }
  });

  it('allows the refusal template only word for word', () => {
    expect(runOutputChecks(render('REFUSE-01'), {}).ok).toBe(true);
    const edited = { ...render('REFUSE-01'), text: `${TEMPLATES['REFUSE-01'].text} Try a tablet.` };
    expect(runOutputChecks(edited, {}).ok).toBe(false);
  });

  it('rejects any value in a critical message, even a real one', () => {
    const r = report('DEMO-3077');
    const msg = { ...explain(r, 'CRITICAL')[0] };
    msg.text += '\n\nYour potassium is 6.9.';
    const out = runOutputChecks(msg, { report: r, route: 'CRITICAL' });
    expect(out.ok).toBe(false);
    expect(out.results.find((x) => x.id === 'critical')?.status).toBe('fail');
    expect(out.results.find((x) => x.id === 'numbers')?.status).toBe('pass');
  });

  it('rejects an explanation without the disclaimer', () => {
    const msg = explainEach(normal);
    expect(runOutputChecks({ ...msg, text: msg.text.replace(DISCLAIMER, '') }, ctx).results.find((r) => r.id === 'disclaimer')?.status).toBe('fail');
  });

  it('blocks a message with no registered template', () => {
    expect(runOutputChecks({ text: 'Hello' }, {}).ok).toBe(false);
    expect(runOutputChecks({ templateId: 'BRIEF-NORM-01', version: 9, text: 'Hello' }, {}).ok).toBe(false);
  });

  it('passes every static template against its own text', () => {
    for (const tpl of Object.values(TEMPLATES).filter((t) => t.static)) {
      const route = tpl.id.startsWith('CRIT') || tpl.id === 'SAFE-CRIT-01' ? 'CRITICAL' : undefined;
      expect(runOutputChecks(render(tpl.id), { route }).ok, tpl.id).toBe(true);
    }
  });
});

describe('free-text guardrails', () => {
  const r = report('DEMO-2043');
  const ctx = { report: r, route: 'ABNORMAL' as const };

  it('checks emergency wording before every other rule', () => {
    expect(routeFreeText('I have chest pain', ctx).rule).toBe('EMERGENCY');
    expect(routeFreeText('Should I change my medicine? I also cannot breathe', ctx).rule).toBe('EMERGENCY');
    expect(routeFreeText('I fainted this morning', { report: report('DEMO-3077'), route: 'CRITICAL' }).rule).toBe('EMERGENCY');
    expect(routeFreeText('chest pain').rule).toBe('EMERGENCY');
  });

  it('refuses medicine and diagnosis questions, even when they also ask if it is serious', () => {
    expect(routeFreeText('Is 7.4 dangerous? Should I change my medicine?', ctx).rule).toBe('CLINICAL_QUESTION');
    expect(routeFreeText('Do I have diabetes?', ctx).rule).toBe('CLINICAL_QUESTION');
    expect(routeFreeText('Is this serious?', ctx).rule).toBe('SERIOUS');
  });

  it('answers about a test on the report from the library', () => {
    expect(routeFreeText('what is hba1c', ctx)).toEqual({ rule: 'WHAT_IS', testCode: 'HBA1C' });
    expect(routeFreeText('what about my sugar', ctx)).toEqual({ rule: 'WHAT_IS', testCode: 'FBG' });
  });

  it('never discusses results on the critical path', () => {
    expect(routeFreeText('What is my potassium?', { report: report('DEMO-3077'), route: 'CRITICAL' }).rule).toBe('CRITICAL_THREAD');
  });

  it('handles stop, delete, a person, no report and off-topic', () => {
    expect(routeFreeText('STOP', ctx).rule).toBe('STOP');
    expect(routeFreeText('please delete my report', ctx).rule).toBe('DELETE');
    expect(routeFreeText('can I talk to a person', ctx).rule).toBe('ADVISOR');
    expect(routeFreeText('hello').rule).toBe('NO_REPORT');
    expect(routeFreeText('who won the match?', ctx).rule).toBe('OFF_TOPIC');
  });
});
