import { describe, expect, it } from 'vitest'
import { REPORTS } from '../data/reports'
import type { LabResult, Report } from '../data/reports'
import { allPass, runChecks } from './checks'
import { classifyReport, classifyResult } from './classify'
import { explain } from './explain'
import type { Message } from './types'

const hb = (over: Partial<LabResult>): LabResult => ({
  code: 'HB', name: 'Hemoglobin', value: 14, unit: 'g/dL', low: 13, high: 17, ...over,
})
const report = (results: LabResult[]): Report => ({ ...REPORTS.normal, results })

describe('routing', () => {
  it('routes the three demo reports', () => {
    expect(classifyReport(REPORTS.normal).route).toBe('NORMAL')
    expect(classifyReport(REPORTS.abnormal).route).toBe('ABNORMAL')
    expect(classifyReport(REPORTS.critical).route).toBe('CRITICAL')
  })

  it('treats a value exactly on a boundary as in range', () => {
    expect(classifyResult(hb({ value: 13 }))).toBe('normal')
    expect(classifyResult(hb({ value: 17 }))).toBe('normal')
    expect(classifyResult(hb({ value: 17.01 }))).toBe('high')
    expect(classifyResult(hb({ value: 12.99 }))).toBe('low')
    expect(classifyResult(hb({ value: 20, critHigh: 20 }))).toBe('high')
  })

  it('lets a critical value outrank an abnormal one', () => {
    const r = report([hb({ value: 18 }), hb({ code: 'K', name: 'Potassium', value: 7, low: 3.5, high: 5.1, critHigh: 6.5 })])
    expect(classifyReport(r).route).toBe('CRITICAL')
  })

  it('always routes a sensitive category to a human', () => {
    const r = report([hb({}), hb({ code: 'HB', name: 'HIV screen', category: 'HIV' })])
    expect(classifyReport(r).route).toBe('HUMAN')
  })

  it('routes a missing range, unknown code or unreadable value to a human', () => {
    expect(classifyReport(REPORTS.incomplete).route).toBe('HUMAN')
    expect(classifyReport(report([hb({ low: undefined, high: undefined })])).route).toBe('HUMAN')
    expect(classifyReport(report([hb({ code: 'XYZ' })])).route).toBe('HUMAN')
    expect(classifyReport(report([hb({ value: null })])).route).toBe('HUMAN')
  })

  it('still escalates a critical value when other results are unclear', () => {
    const r = report([hb({ value: 1, critLow: 5 }), hb({ code: 'XYZ' })])
    expect(classifyReport(r).route).toBe('CRITICAL')
  })
})

describe('explanation messages pass their own checks', () => {
  for (const id of ['normal', 'abnormal', 'critical', 'incomplete'] as const) {
    it(`${id}`, () => {
      const rep = REPORTS[id]
      const route = classifyReport(rep).route
      for (const m of explain(rep, route)) expect(allPass(runChecks(m, rep, route))).toBe(true)
    })
  }

  it('sends no values in the critical message', () => {
    const [m] = explain(REPORTS.critical, 'CRITICAL')
    expect(m.text).not.toMatch(/6\.9|2\.9|potassium/i)
  })
})

describe('Hindi explanations', () => {
  for (const id of ['normal', 'abnormal'] as const) {
    it(`${id} passes the same checks`, () => {
      const rep = REPORTS[id]
      const route = classifyReport(rep).route
      for (const m of explain(rep, route, 'hi')) expect(allPass(runChecks(m, rep, route))).toBe(true)
    })
  }
})

describe('output checks', () => {
  const base = explain(REPORTS.normal, 'NORMAL')[0]
  const failing = (m: Message, route = 'NORMAL' as const, rep = REPORTS.normal) =>
    runChecks(m, rep, route).filter((c) => !c.pass).map((c) => c.id)

  it('rejects an invented number', () => {
    expect(failing({ ...base, text: base.text + '\n\nGlucose is 250 mg/dL.' })).toContain('numbers')
  })

  it('rejects banned wording', () => {
    expect(failing({ ...base, text: base.text + ' Take one tablet daily.' })).toContain('banned')
    expect(failing({ ...base, text: base.text + ' You have diabetes.' })).toContain('banned')
  })

  it('rejects a missing disclaimer on an explanation', () => {
    expect(failing({ ...base, text: 'All good.' })).toContain('disclaimer')
  })

  it('rejects any value in a critical message', () => {
    const [crit] = explain(REPORTS.critical, 'CRITICAL')
    expect(failing({ ...crit, text: crit.text + ' Your potassium is 4.', }, 'CRITICAL' as never, REPORTS.critical)).toContain('no-values')
    expect(failing({ ...crit, text: crit.text + ' Potassium 6.9.' }, 'CRITICAL' as never, REPORTS.critical)).toContain('no-values')
  })

  it('blocks a message with no registered template', () => {
    expect(failing({ ...base, templateId: 'MADE-UP-99' })).toContain('registered')
    expect(failing({ ...base, version: '9.9' })).toContain('registered')
  })
})
