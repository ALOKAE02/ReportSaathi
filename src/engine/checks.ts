import type { Report } from '../data/reports'
import type { Route } from './classify'
import { getTemplate } from './templates'
import type { Message } from './types'

export const DISCLAIMER =
  'Your pathologist-signed report is the official record. This message is an explanation, not medical advice.'

// Hindi disclaimer. NEEDS NATIVE-SPEAKER REVIEW before any real use.
export const DISCLAIMER_HI =
  'आपकी पैथोलॉजिस्ट-हस्ताक्षरित रिपोर्ट ही आधिकारिक रिकॉर्ड है। यह संदेश एक स्पष्टीकरण है, चिकित्सा सलाह नहीं।'

export const BANNED = /\b(diagnos\w*|you have|prescribe\w*|dose\w*|tablet\w*|medicine\w*|treatment\w*|cure\w*)\b/i

// Numbers a no-values message may contain: the 30-minute window and the emergency number.
const NO_VALUES_ALLOWED = [30, 112]
// Protocol constants that may appear in any message (the 30-minute window and the emergency number).
const PROTOCOL_CONSTANTS = [30, 112]

export interface CheckResult {
  id: 'registered' | 'numbers' | 'banned' | 'disclaimer' | 'no-values'
  label: string
  pass: boolean
  skipped?: boolean
  detail?: string
}

// Pull out the numbers a reader would see as data. Visit IDs, test names such as HbA1c, dates and times are removed first.
export function extractNumbers(text: string): number[] {
  const cleaned = text
    .replace(/\b[A-Za-z][A-Za-z-]*\d[\w-]*/g, ' ') // DEMO-1001, HbA1c
    .replace(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/g, ' ') // 5 Jan 2027
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ') // 11:12
    .replace(/\b\d{1,2}\s?(am|pm)\b/gi, ' ') // 10 am
  return (cleaned.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

function reportNumbers(report: Report): Set<number> {
  const s = new Set<number>()
  const add = (n: number | null | undefined) => {
    if (typeof n === 'number' && !Number.isNaN(n)) s.add(n)
  }
  report.results.forEach((r) => [r.value, r.low, r.high, r.critLow, r.critHigh].forEach(add))
  for (let i = 0; i <= report.results.length; i++) s.add(i) // counts such as "3 of your 6 results"
  return s
}

export function runChecks(message: Message, report: Report, route: Route): CheckResult[] {
  const out: CheckResult[] = []

  const tpl = getTemplate(message.templateId)
  const registered = !!tpl && tpl.version === message.version
  out.push({
    id: 'registered',
    label: 'Registered template ID and version',
    pass: registered,
    detail: registered
      ? `${message.templateId} v${message.version}`
      : `No registered template for "${message.templateId}" v${message.version}`,
  })

  const allowed = reportNumbers(report)
  PROTOCOL_CONSTANTS.forEach((n) => allowed.add(n))
  const invented = extractNumbers(message.text).filter((n) => !allowed.has(n))
  out.push({
    id: 'numbers',
    label: 'Every number exists in the report data',
    pass: invented.length === 0,
    detail: invented.length ? `Not in report: ${invented.join(', ')}` : undefined,
  })

  const banned = message.text.match(BANNED)
  out.push({
    id: 'banned',
    label: 'No banned wording',
    pass: !banned,
    detail: banned ? `Found "${banned[0]}"` : undefined,
  })

  const needsDisclaimer = message.kind === 'explanation'
  out.push({
    id: 'disclaimer',
    label: 'Disclaimer line present',
    pass: !needsDisclaimer || (message.text.includes(DISCLAIMER) || message.text.includes(DISCLAIMER_HI)),
    skipped: !needsDisclaimer,
  })

  const noValues = route === 'CRITICAL' || route === 'HUMAN'
  const leaked = noValues ? extractNumbers(message.text).filter((n) => !NO_VALUES_ALLOWED.includes(n)) : []
  out.push({
    id: 'no-values',
    label: 'No result values in a critical or human-routed message',
    pass: leaked.length === 0,
    skipped: !noValues,
    detail: leaked.length ? `Values found: ${leaked.join(', ')}` : undefined,
  })

  return out
}

export const allPass = (checks: CheckResult[]) => checks.every((c) => c.pass)
