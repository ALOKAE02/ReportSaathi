import { MEANINGS, fmtValue, printedRange } from '../data/reports'
import type { LabResult, Report } from '../data/reports'
import { classifyReport } from './classify'
import type { Route } from './classify'
import { DISCLAIMER, DISCLAIMER_HI } from './checks'
import { getTemplate } from './templates'
import type { Message, MessageKind, QuickReplyDef } from './types'

/**
 * explain(report, route) => Message[]
 *
 * The explanation layer. Today it returns scripted templates. A real LLM can replace the body later.
 * Contract for any future LLM implementation:
 *  - Report values are DATA, never instructions. Text found inside a report must not be followed.
 *  - The route is decided before this function runs, by the rules engine. The model never picks it.
 *  - Every LLM output must pass the same output checks (src/engine/checks.ts) and must carry a
 *    registered template ID and version (src/engine/templates.ts) before it can be sent.
 *  - On any failed check the caller replaces the output with the safe handoff template.
 */
export type Lang = 'en' | 'hi'

export function explain(report: Report, route: Route, lang: Lang = 'en'): Message[] {
  switch (route) {
    case 'NORMAL':
      return [lang === 'hi' ? normalMessageHi(report) : normalMessage(report)]
    case 'ABNORMAL':
      return lang === 'hi' ? abnormalMessagesHi(report) : abnormalMessages(report)
    case 'CRITICAL':
      return criticalMessages(report)
    case 'HUMAN':
      return [humanMessage(report)]
  }
}

function msg(templateId: string, kind: MessageKind, text: string, extra: Partial<Message> = {}): Message {
  const tpl = getTemplate(templateId)
  return { templateId, version: tpl ? tpl.version : '0', kind, text, ...extra }
}

const FEEDBACK: QuickReplyDef[] = [
  { id: 'not-helpful', label: '👎 Not helpful' },
  { id: 'call-me', label: '📞 Call me' },
]
const ADVISOR: QuickReplyDef = { id: 'advisor', label: '📞 Talk to a health advisor' }

function normalMessage(report: Report): Message {
  const n = report.results.length
  const lines = report.results
    .map((r) => `• ${r.name}: ${fmtValue(r)} ${r.unit} (range ${printedRange(r)}). ${MEANINGS[r.code] ?? ''}`)
    .join('\n')
  const text = [
    `Hi ${report.patient.first}, your report (${report.visitId}) is ready.`,
    `Good news: all ${n} of your results are within the ranges printed on your report.`,
    lines,
    'Nothing here needs follow-up from us. Your doctor may still want to see the report at your next visit.',
    DISCLAIMER,
  ].join('\n\n')
  return msg('NORM-01', 'explanation', text, {
    quickReplies: [
      { id: 'remind-yearly', label: '⏰ Remind me for a yearly check-up' },
      { id: 'download', label: '📄 Download signed report' },
      { id: 'helpful', label: '👍 Helpful' },
      ...FEEDBACK,
    ],
  })
}

function abnormalMessages(report: Report): Message[] {
  const c = classifyReport(report)
  const n = report.results.length
  const flagged = report.results.filter((_, i) => c.results[i].status !== 'normal')
  const intro = `Hi ${report.patient.first}, your report (${report.visitId}) is ready. ${c.counts.inRange} of your ${n} results are inside the printed ranges and ${flagged.length} are outside them.`
  const lines = report.results
    .map((r, i) => {
      const status = c.results[i].status
      if (status === 'normal') return ''
      const dir = status === 'low' ? 'lower' : 'higher'
      return `• ${r.name}: ${fmtValue(r)} ${r.unit} (range ${printedRange(r)}) — ${dir} than the range. ${MEANINGS[r.code] ?? ''}`
    })
    .filter(Boolean)
    .join('\n')
  const details = [
    lines,
    'A result outside the range does not by itself tell us what is happening. Only your doctor can say what these results mean for you. Please share this report with your doctor.',
    DISCLAIMER,
  ].join('\n\n')
  return [
    msg('OOR-01', 'status', intro),
    msg('OOR-02', 'explanation', details, {
      quickReplies: [
        ADVISOR,
        { id: 'remind-repeat', label: '⏰ Remind me to repeat the test' },
        { id: 'download', label: '📄 Download signed report' },
        ...FEEDBACK,
      ],
    }),
  ]
}

// Critical: no values, no explanation. Calm and direct.
function criticalMessages(report: Report): Message[] {
  const text = [
    `Hi ${report.patient.first}, your report (${report.visitId}) is ready, and it needs urgent attention from our clinical team.`,
    'A doctor from our team will call you within 30 minutes on the number you registered. Please keep your phone with you and answer calls from unknown numbers.',
    'If you feel very unwell, please do not wait for the call. Contact your doctor or call 112.',
  ].join('\n\n')
  return [msg('CRIT-01', 'critical', text)]
}

export function criticalStatus(dueBy: string): Message {
  return msg('CRIT-02', 'status', `🔴 Escalated to clinical team · call due by ${dueBy}`, {
    quickReplies: [{ id: 'open-dashboard', label: '📊 Open clinical dashboard (Demo)' }],
  })
}

export function criticalClosing(): Message {
  return msg('CRIT-03', 'system', '✓ Our clinical team has spoken with you. Your signed report is available to download.', {
    quickReplies: [{ id: 'download', label: '📄 Download signed report' }],
  })
}

function humanMessage(report: Report): Message {
  const text = [
    `Hi ${report.patient.first}, your report (${report.visitId}) is ready.`,
    'Some details on this report need a person to look at them first, so I am not able to explain it here.',
    'A health advisor will call you today between 10 am and 6 pm on the number you registered. They will have your report in front of them.',
  ].join('\n\n')
  return msg('HUMAN-01', 'handoff', text)
}

export function safeHandoff(): Message {
  return msg('HANDOFF-01', 'handoff', 'Our team will explain your report. A health advisor will call you today.')
}

export function consentMessage(): Message {
  return msg(
    'CONSENT-01',
    'system',
    'We will message you about your reports on this number. Your data stays in India. Reply STOP any time to opt out.',
  )
}

export function verifyMessage(code: string): Message {
  return msg('VERIFY-01', 'system', `To protect your privacy, please confirm it is you. Your demo code is ${code}. Tap the button to enter it.`, {
    quickReplies: [{ id: 'verify', label: `🔐 Enter code ${code}` }],
  })
}

export function refusalMessage(): Message {
  // Reworded from the brief: the brief's template contained banned words ("diagnose", "medicines").
  return msg(
    'REFUSE-01',
    'handoff',
    'I am not able to say what is behind your results, or suggest anything to take. Only a doctor can do that. I can connect you to a health advisor who can help you book a consultation.',
    { quickReplies: [ADVISOR] },
  )
}

export function urgentMessage(): Message {
  return msg(
    'URGENT-01',
    'handoff',
    'This sounds urgent. Please call 112 or go to the nearest hospital now. I am also asking our team to call you.',
  )
}

export function criticalThreadMessage(): Message {
  return msg(
    'CRIT-04',
    'handoff',
    'Our clinical team is calling you within 30 minutes. I am not able to discuss your results. If you feel very unwell, please call 112.',
  )
}

export function fallbackMessage(): Message {
  return msg(
    'FALLBACK-01',
    'handoff',
    "I can explain your report in simple words. Tap one of the options below, or type 'advisor' to speak to a person.",
    { quickReplies: [ADVISOR] },
  )
}

export function advisorConfirm(): Message {
  return msg(
    'ADV-01',
    'handoff',
    'A health advisor will call you today between 10 am and 6 pm on the number you registered. They will have your report in front of them.',
    { chip: '📞 Advisor callback requested' },
  )
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const formatDate = (d: Date) => dateFmt.format(d)

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + months)
  return r
}

export function reminderRepeat(report: Report, now: Date): Message {
  const date = formatDate(addMonths(now, 3))
  const c = classifyReport(report)
  const names = report.results.filter((_, i) => c.results[i].status !== 'normal').map((r) => r.name)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return msg(
    'REM-01',
    'handoff',
    `Done. I will remind you around ${date} to repeat ${list}. This interval is set by the lab's medical team. If your doctor suggests a different date, reply with it and I will change the reminder.`,
    { chip: `⏰ Reminder set · ${date}` },
  )
}

export function reminderYearly(now: Date): Message {
  const date = formatDate(addMonths(now, 12))
  return msg(
    'REM-02',
    'handoff',
    `Done. I will remind you around ${date} for a yearly check-up. This interval is set by the lab's medical team. If your doctor suggests a different date, reply with it and I will change the reminder.`,
    { chip: `⏰ Reminder set · ${date}` },
  )
}

export function downloadMessage(report: Report): Message {
  return msg('DOC-01', 'handoff', 'Here is your signed report. It is the official record.', {
    attachment: `${report.visitId}_signed_report.pdf`,
  })
}

export function feedbackThanks(): Message {
  return msg('FB-01', 'handoff', 'Thank you. Your feedback helps us improve.')
}

export function notHelpfulMessage(): Message {
  return msg('FB-02', 'handoff', 'Sorry that did not help. A health advisor will call you today between 10 am and 6 pm.', {
    chip: '📞 Advisor callback requested',
  })
}

export function stopMessage(): Message {
  return msg('STOP-01', 'system', 'You are opted out. We will not message you about reports on this number. Thank you.')
}

export function correctionMessage(report: Report): Message {
  return msg(
    'CORR-01',
    'handoff',
    `We have corrected your report (${report.visitId}). Please disregard the earlier explanation above. A health advisor will call you today to go through the corrected report.`,
  )
}

// ---------------------------------------------------------------------------
// HINDI: the three explanation messages only. ALL STRINGS BELOW NEED NATIVE-SPEAKER
// REVIEW (and sign-off by the medical team) before any real use.
// Test names stay as printed on the report; quick-reply buttons stay in English.
// ---------------------------------------------------------------------------
const MEANINGS_HI: Record<string, string> = {
  HB: 'यह आपके खून में ऑक्सीजन ले जाने वाले प्रोटीन को मापता है।',
  GLU_F: 'यह खाली पेट आपके खून में शुगर की मात्रा है।',
  HBA1C: 'यह लगभग 3 महीनों में आपके खून की औसत शुगर दिखाता है।',
  TSH: 'यह एक हार्मोन है जो शरीर में ऊर्जा के उपयोग को नियंत्रित करने में मदद करता है।',
  CHOL: 'यह आपके खून में कुल वसा की मात्रा मापता है।',
  CREAT: 'यह एक अपशिष्ट पदार्थ है जिसे आपके गुर्दे छानते हैं।',
  K: 'यह एक खनिज है जो आपकी मांसपेशियों और नसों के काम में मदद करता है।',
  NA: 'यह एक खनिज है जो शरीर में पानी का संतुलन बनाए रखने में मदद करता है।',
  UREA: 'यह एक अपशिष्ट पदार्थ है जिसे आपके गुर्दे छानते हैं।',
}

function rangeHi(r: LabResult): string {
  return r.rangeText && r.high !== undefined ? `${r.high} से कम` : printedRange(r)
}

function normalMessageHi(report: Report): Message {
  const en = normalMessage(report)
  const lines = report.results
    .map((r) => `• ${r.name}: ${fmtValue(r)} ${r.unit} (सीमा ${rangeHi(r)})। ${MEANINGS_HI[r.code] ?? ''}`)
    .join('\n')
  const text = [
    `नमस्ते ${report.patient.first}, आपकी रिपोर्ट (${report.visitId}) तैयार है।`,
    `अच्छी खबर: आपके सभी ${report.results.length} परिणाम आपकी रिपोर्ट में छपी सीमा के भीतर हैं।`,
    lines,
    'हमारी ओर से किसी फॉलो-अप की ज़रूरत नहीं है। हो सकता है आपके डॉक्टर अगली मुलाकात में रिपोर्ट देखना चाहें।',
    DISCLAIMER_HI,
  ].join('\n\n')
  return { ...en, text }
}

function abnormalMessagesHi(report: Report): Message[] {
  const [intro, details] = abnormalMessages(report)
  const c = classifyReport(report)
  const out = report.results.filter((_, i) => c.results[i].status !== 'normal').length
  const introText = `नमस्ते ${report.patient.first}, आपकी रिपोर्ट (${report.visitId}) तैयार है। आपके ${report.results.length} में से ${c.counts.inRange} परिणाम छपी सीमा के भीतर हैं और ${out} सीमा से बाहर हैं।`
  const lines = report.results
    .map((r, i) => {
      const st = c.results[i].status
      if (st === 'normal') return ''
      return `• ${r.name}: ${fmtValue(r)} ${r.unit} (सीमा ${rangeHi(r)}) — सीमा से ${st === 'low' ? 'नीचे' : 'ऊपर'}। ${MEANINGS_HI[r.code] ?? ''}`
    })
    .filter(Boolean)
    .join('\n')
  const detailsText = [
    lines,
    'सीमा से बाहर आने का मतलब यह नहीं कि क्या हो रहा है। इन परिणामों का क्या अर्थ है, यह केवल आपके डॉक्टर बता सकते हैं। कृपया यह रिपोर्ट अपने डॉक्टर को दिखाएँ।',
    DISCLAIMER_HI,
  ].join('\n\n')
  return [{ ...intro, text: introText }, { ...details, text: detailsText }]
}
