import { KNOWN_CODES, SENSITIVE_CATEGORIES } from '../data/reports'
import type { LabResult, Report } from '../data/reports'

// Routing is decided here and nowhere else. No React imports. The chat copy never decides a route.
export type Route = 'NORMAL' | 'ABNORMAL' | 'CRITICAL' | 'HUMAN'

export type ResultStatus =
  | 'normal'
  | 'low'
  | 'high'
  | 'critical-low'
  | 'critical-high'
  | 'unknown' // no printed range, or an unrecognised test code
  | 'unreadable'

export interface Classification {
  route: Route
  reasons: string[]
  results: { code: string; name: string; status: ResultStatus }[]
  counts: { inRange: number; outOfRange: number; critical: number; unknown: number }
}

export function isSensitive(r: LabResult): boolean {
  if (!r.category) return false
  const c = r.category.toLowerCase()
  return SENSITIVE_CATEGORIES.some((s) => c.includes(s.toLowerCase()))
}

export function classifyResult(r: LabResult): ResultStatus {
  if (r.value === null || Number.isNaN(r.value)) return 'unreadable'
  if (!KNOWN_CODES.includes(r.code)) return 'unknown'
  if (r.low === undefined && r.high === undefined) return 'unknown'
  if (r.critHigh !== undefined && r.value > r.critHigh) return 'critical-high'
  if (r.critLow !== undefined && r.value < r.critLow) return 'critical-low'
  // A value exactly on a boundary is within range.
  if (r.high !== undefined && r.value > r.high) return 'high'
  if (r.low !== undefined && r.value < r.low) return 'low'
  return 'normal'
}

export function classifyReport(report: Report): Classification {
  const results = report.results.map((r) => ({ code: r.code, name: r.name, status: classifyResult(r) }))
  const critical = results.filter((r) => r.status === 'critical-high' || r.status === 'critical-low')
  const unknown = results.filter((r) => r.status === 'unknown' || r.status === 'unreadable')
  const outOfRange = results.filter((r) => r.status === 'low' || r.status === 'high')
  const counts = {
    inRange: results.filter((r) => r.status === 'normal').length,
    outOfRange: outOfRange.length + critical.length,
    critical: critical.length,
    unknown: unknown.length,
  }

  const humanReasons: string[] = []
  report.results.forEach((r, i) => {
    if (isSensitive(r)) humanReasons.push(`Sensitive category: ${r.category}`)
    if (results[i].status === 'unreadable') humanReasons.push(`Unreadable value: ${r.name}`)
    else if (!KNOWN_CODES.includes(r.code)) humanReasons.push(`Unrecognised test code: ${r.code}`)
    else if (results[i].status === 'unknown') humanReasons.push(`No printed range: ${r.name}`)
  })

  // Critical outranks everything. Then anything the assistant must not explain. Then abnormal, then normal.
  if (critical.length > 0) {
    return { route: 'CRITICAL', reasons: critical.map((c) => `${c.name} beyond critical limit`), results, counts }
  }
  if (humanReasons.length > 0) return { route: 'HUMAN', reasons: humanReasons, results, counts }
  if (outOfRange.length > 0) {
    return { route: 'ABNORMAL', reasons: outOfRange.map((c) => `${c.name} outside printed range`), results, counts }
  }
  return { route: 'NORMAL', reasons: ['All results inside printed ranges'], results, counts }
}
