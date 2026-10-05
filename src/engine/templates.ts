// Template registry. Every outgoing assistant message must carry a registered template ID and
// version. A message without one is blocked by the output checks.

export const LAB_NAME = 'Demo Diagnostics Lab';
export const ASSISTANT_NAME = 'ReportSaathi';

/** Short line at the end of every message that explains results. */
export const DISCLAIMER = 'This explains your report. It is not medical advice.';

/**
 * Fixed protocol phrases that contain numbers but are not result values.
 * They are part of the reviewed template text, so the number check ignores them.
 */
export const REVIEWED_PHRASES = [
  'within 30 minutes',
  'after 30 days',
  'call 112',
  'about 3 months',
  'between 10 am and 6 pm',
];

export type TemplateKind = 'brief' | 'explanation' | 'escalation' | 'handoff' | 'guardrail' | 'confirmation' | 'notice';

export interface Template {
  id: string;
  version: number;
  kind: TemplateKind;
  purpose: string;
  text: string;
  requiresDisclaimer: boolean;
  /** Static templates have no placeholders. */
  static: boolean;
  /**
   * Only for fixed refusal text that must name what it refuses. The exemption applies only when
   * the message is word for word the registered text, so edited or generated text is still checked.
   */
  verbatimWordingAllowed?: boolean;
  signOff: string;
}

type TemplateInput = Omit<Template, 'signOff' | 'static' | 'version' | 'requiresDisclaimer'> & {
  version?: number;
  requiresDisclaimer?: boolean;
};

function t(input: TemplateInput): Template {
  return {
    version: 1,
    requiresDisclaimer: false,
    ...input,
    static: !/\{[a-z_]+\}/.test(input.text),
    signOff: 'demo, pending',
  };
}

const LIST: Template[] = [
  // Greeting and consent
  t({ id: 'GREET-01', kind: 'notice', purpose: 'Greeting when the chat opens',
    text: 'Namaste! I am ReportSaathi, the report assistant from Demo Diagnostics Lab.\n\nShare a report and I will explain it in simple words.' }),
  t({ id: 'CONSENT-01', kind: 'confirmation', purpose: 'Consent before the first read',
    text: 'Namaste {first_name}. I can explain this report in simple words.\n\nYour report stays private and is deleted after 30 days. OK to continue?' }),
  t({ id: 'CONSENT-AGAIN-01', kind: 'confirmation', purpose: 'Patient typed something before giving consent',
    text: 'Before I read your report, I need your OK. It stays private and is deleted after 30 days. Shall I continue?' }),
  t({ id: 'CONSENT-NO-01', kind: 'confirmation', purpose: 'Consent declined',
    text: 'No problem. I have not read your report. Share it again any time.' }),
  t({ id: 'READ-01', kind: 'notice', purpose: 'Reading the report',
    text: 'Thank you. Reading your report now. I check every value before I reply.' }),

  // The brief: headline, what looks fine, what to note, what next
  t({ id: 'BRIEF-NORM-01', kind: 'brief', purpose: 'Brief: everything in range', requiresDisclaimer: true,
    text: 'Your {title} ({date}): all {n} results are in the normal range.\n\n✓ {fine_line}\n\nNext: nothing to do now. Keep this report for your next check-up.\n\n{disclaimer}' }),
  t({ id: 'BRIEF-FLAG-01', kind: 'brief', purpose: 'Brief: some values outside the range', requiresDisclaimer: true,
    text: 'Your {title} ({date}): mostly in range. {m_text} to note.\n\n✓ {fine_line}\n\n{flag_lines}\n\nNext: worth sharing with your doctor. I can book a call for you.\n\n{disclaimer}' }),
  t({ id: 'SUGGEST-01', kind: 'notice', purpose: 'Points the patient to suggested questions',
    text: 'You can tap a suggestion below, or ask in your own words.' }),

  // Follow-up answers
  t({ id: 'EXPLAIN-01', kind: 'explanation', purpose: 'Every result, one line each', requiresDisclaimer: true,
    text: '{result_lines}\n\n{disclaimer}' }),
  t({ id: 'LIB-01', kind: 'explanation', purpose: 'What is a test (approved library)', requiresDisclaimer: true,
    text: '{about}\n\nYours: {value} (range {range}).\n\n{closing}\n\n{disclaimer}' }),
  t({ id: 'TREND-01', kind: 'explanation', purpose: 'Compare with the previous report', requiresDisclaimer: true,
    text: 'Compared with your last report:\n\n{trend_lines}\n\nYour doctor can tell you what the change means for you.\n\n{disclaimer}' }),
  t({ id: 'SERIOUS-01', kind: 'guardrail', purpose: '"Is this serious?"',
    text: 'I cannot say what this means for your health. Only your doctor can.\n\nWhat I can say: {m_text} outside the printed range. A result outside the range can have many causes.\n\nShall I book a doctor call?' }),
  t({ id: 'BOOK-01', kind: 'handoff', purpose: 'Offer a doctor call',
    text: 'Dr. Mehta has slots today. Shall I book one?\n\nI will share this brief, so you do not have to explain again.' }),
  t({ id: 'BOOK-TIMES-01', kind: 'handoff', purpose: 'Other slots',
    text: 'Dr. Mehta also has 6:15 pm today and 10:00 am tomorrow.' }),
  t({ id: 'BOOKED-01', kind: 'confirmation', purpose: 'Doctor call booked',
    text: 'Booked: a call with Dr. Mehta, {slot}.\n\nI have shared your brief with the doctor. I will remind you an hour before.' }),
  t({ id: 'SHARE-01', kind: 'confirmation', purpose: 'Shareable summary for family',
    text: 'Here is a short summary you can forward to family. It has no ID numbers.\n\n{summary}' }),
  t({ id: 'REMIND-01', kind: 'confirmation', purpose: 'Re-test reminder',
    text: 'Done. I will remind you around {date} to re-test {tests}.\n\nThe lab\'s medical team sets this interval. If your doctor suggests another date, just tell me.' }),
  t({ id: 'REMIND-YEAR-01', kind: 'confirmation', purpose: 'Yearly check-up reminder',
    text: 'Done. I will remind you around {date} for your yearly check-up.\n\nThe lab\'s medical team sets this interval.' }),
  t({ id: 'THANKS-01', kind: 'confirmation', purpose: 'Patient says it was clear',
    text: 'Glad that helped. Ask me anything else about your report.' }),
  t({ id: 'HANDOFF-01', kind: 'handoff', purpose: 'A person will call',
    text: 'A person from our team will call you today between 10 am and 6 pm.\n\nThey already have your report and this chat, so you will not need to repeat anything.' }),
  t({ id: 'DELETE-01', kind: 'confirmation', purpose: 'Delete my report',
    text: 'Done. Your report and this chat are deleted. Share a report any time to start again.' }),
  t({ id: 'STOP-01', kind: 'confirmation', purpose: 'Opt-out',
    text: 'Done. We will not send you any more messages. Your signed report is still available from the lab.' }),

  // Honest about limits
  t({ id: 'UNREAD-01', kind: 'guardrail', purpose: 'A value could not be read',
    text: 'I could not read the {tests} value clearly in this photo. I will not guess a number.\n\nCould you send a clearer photo? Tip: lay the page flat, in good light.' }),
  t({ id: 'OOS-01', kind: 'guardrail', purpose: 'Not a lab report',
    text: 'This looks like a {doc_title}. I cannot explain that yet.\n\nRight now I explain lab reports: blood count, sugar, thyroid, cholesterol and kidney tests.' }),
  t({ id: 'SCOPE-01', kind: 'notice', purpose: 'What the assistant can do',
    text: 'I explain lab reports in simple words: blood count, sugar, thyroid, cholesterol and kidney tests.\n\nInsurance policies and bank statements are planned for later.' }),
  t({ id: 'HUMAN-01', kind: 'handoff', purpose: 'Sensitive or unrecognised result: a person explains it',
    text: 'Thank you, {first_name}. A member of our team needs to go through this report with you, so I will not explain it here.\n\nThey will call you today between 10 am and 6 pm.' }),

  // Critical path
  t({ id: 'CRIT-01', kind: 'escalation', purpose: 'Critical value: no details, a doctor calls first',
    text: '{first_name}, your {title} needs prompt attention from a doctor.\n\nA doctor from our team will call you within 30 minutes. Please keep your phone close.\n\nIf you feel unwell, please do not wait. Call 112 or go to the nearest hospital.' }),
  t({ id: 'CRIT-STATUS-01', kind: 'escalation', purpose: 'Handoff status bubble',
    text: 'Handed to a doctor · call due by {due_time}' }),
  t({ id: 'CRIT-PRIORITY-01', kind: 'escalation', purpose: 'Patient asks for a person on the critical path',
    text: 'You are first in line. A doctor from our team will call you within 30 minutes.' }),
  t({ id: 'CRIT-THREAD-01', kind: 'guardrail', purpose: 'Any question on the critical path before the call',
    text: 'A doctor from our team is calling you within 30 minutes. They will go through your results with you.\n\nIf you feel unwell, please call 112.' }),
  t({ id: 'CRIT-THREAD-02', kind: 'guardrail', purpose: 'Any question on the critical path after the call',
    text: 'Our doctor has already spoken with you. For anything new, they are the right person.\n\nIf you feel unwell, please call 112.' }),
  t({ id: 'CRIT-CLOSE-01', kind: 'notice', purpose: 'Closing message after the doctor reaches the patient',
    text: 'Our doctor has spoken with you. Your signed report is available to download.' }),

  // Guardrails for free text
  t({ id: 'REFUSE-01', kind: 'guardrail', purpose: 'Diagnosis or medicine question', verbatimWordingAllowed: true,
    text: 'I cannot advise on medicines or diagnose conditions. Your doctor is the right person for that.\n\nShall I book a doctor call? I will share this brief, so you do not have to explain again.' }),
  t({ id: 'URGENT-01', kind: 'guardrail', purpose: 'Emergency wording',
    text: 'This sounds urgent. Please call 112 or go to the nearest hospital now.\n\nI am also asking our team to call you.' }),
  t({ id: 'OFFTOPIC-01', kind: 'guardrail', purpose: 'Not about the report',
    text: 'I can only help with your report. Tap a suggestion below, or ask about a test on it.' }),
  t({ id: 'NOREPORT-01', kind: 'guardrail', purpose: 'Message before any report is shared',
    text: 'Share a report first, and I will explain it. Tap the clip to attach one.' }),
  t({ id: 'SAFE-01', kind: 'handoff', purpose: 'Safe handoff when an output check fails',
    text: 'I am not able to help with this here. A person from our team will call you today between 10 am and 6 pm.' }),
  t({ id: 'SAFE-CRIT-01', kind: 'handoff', purpose: 'Safe handoff on the critical path when a check fails',
    text: 'A doctor from our team will call you within 30 minutes. If you feel unwell, please call 112.' }),
];

export const TEMPLATES: Record<string, Template> = Object.fromEntries(LIST.map((tpl) => [tpl.id, tpl]));

export function getTemplate(id: string | undefined, version: number | undefined): Template | undefined {
  if (!id) return undefined;
  const tpl = TEMPLATES[id];
  return tpl && tpl.version === version ? tpl : undefined;
}

/** An outgoing assistant message, before or after the output checks. */
export interface Message {
  templateId?: string;
  version?: number;
  text: string;
}

export function render(id: string, vars: Record<string, string | number> = {}): Message {
  const tpl = TEMPLATES[id];
  if (!tpl) throw new Error(`Unregistered template ${id}`);
  const text = tpl.text.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
    key === 'disclaimer' ? DISCLAIMER : key in vars ? String(vars[key]) : whole,
  );
  return { templateId: tpl.id, version: tpl.version, text };
}
