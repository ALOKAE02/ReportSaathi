import { REPORTS, fmtValue, printedRange } from '../data/reports'
import type { Report, ReportId } from '../data/reports'
import { allPass, runChecks } from '../engine/checks'
import type { CheckResult } from '../engine/checks'
import { classifyReport } from '../engine/classify'
import type { Classification, Route } from '../engine/classify'
import * as X from '../engine/explain'
import { EXPLANATION_TEMPLATE_IDS, SIGNOFF_LABEL, getTemplate } from '../engine/templates'
import type { Message } from '../engine/types'
import type {
  AppState, AuditEntry, Callback, CallbackKind, CaseRec, ChatMessage, StepId, StepStatus, Trace, TraceLine, UiState,
} from './types'

const KEY = 'rc-demo-v1'
const SLA_MS = 30 * 60 * 1000
const RISK_MS = 10 * 60 * 1000
const RETRY_MS = 10 * 1000 // accelerated for the demo
const MAX_ATTEMPTS = 3
const DEMO_CODE = 'DEMO-4829'
const UNSAFE_TEXT = '\n\nYou have diabetes. Take one tablet daily. Your glucose is 250.'

const STEP_LABELS: [StepId, string][] = [
  ['received', 'Report received'],
  ['rules', 'Rules check'],
  ['route', 'Route'],
  ['built', 'Message built'],
  ['checks', 'Output checks'],
  ['sent', 'Sent or escalated'],
]

let uidN = 0
const uid = (p: string) => `${p}${Date.now().toString(36)}${(uidN++).toString(36)}`
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const hhmm = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const maskName = (r: Report) => `${r.patient.first[0]}. ${r.patient.last[0]}.`

function consentChat(): ChatMessage {
  const m = X.consentMessage()
  return toChat(m, 'system')
}

function toChat(m: Message, from: ChatMessage['from']): ChatMessage {
  return {
    uid: uid('m'), from, text: m.text, ts: Date.now(), templateId: m.templateId, version: m.version, kind: m.kind,
    quickReplies: m.quickReplies, chip: m.chip, attachment: m.attachment,
  }
}

function seedCases(): CaseRec[] {
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  const at = (h: number, m: number) => day.getTime() + (h * 60 + m) * 60000
  const mk = (id: string, visit: string, name: string, ageSex: string, h: number, m: number, mins: number, head: string, lim: string): CaseRec => ({
    id, reportId: 'critical', visitId: visit, name, ageSex, phone: '+91 97••• ••410', receivedAt: at(h, m), dueAt: at(h, m) + SLA_MS,
    skewMs: 0, status: 'Reached', attempts: 1, reachedAt: at(h, m) + mins * 60000, breached: false, seen: true, historical: true,
    headline: head, limitText: lim, others: [], summary: 'Closed case. Patient reached by the clinical team.', checklist: [true, true, true, true],
  })
  return [
    mk('hist-1', 'DEMO-2911', 'Suresh Pillai', '71 M', 8, 14, 12, 'Potassium 6.7 mmol/L', 'critical limit above 6.5'),
    mk('hist-2', 'DEMO-2958', 'Kavita Rao', '49 F', 9, 31, 17, 'Glucose 41 mg/dL', 'critical limit below 50'),
  ]
}

export function initialState(): AppState {
  return {
    v: 1, messages: [consentChat()], trace: null, activeReportId: null, route: null, verified: false, pendingVerify: null,
    stopped: false, cases: seedCases(), callbacks: [], audit: [], toasts: [], paused: { all: false, templates: {} }, devInject: false, lang: 'en',
  }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as AppState
      if (s && s.v === 1) return { ...s, lang: s.lang ?? 'en' }
    }
  } catch {
    /* fall through */
  }
  return initialState()
}

function initialUi(): UiState {
  return { tab: location.hash === '#dashboard' ? 'dashboard' : 'patient', dashTab: 'queue', presentation: false, tools: false, typing: false }
}

export interface Snapshot {
  state: AppState
  ui: UiState
}

export class Store {
  snap: Snapshot = { state: loadState(), ui: initialUi() }
  private listeners = new Set<() => void>()
  private run = 0
  private channel: BroadcastChannel | null = null

  constructor() {
    try {
      this.channel = new BroadcastChannel('report-companion')
      this.channel.onmessage = (e) => {
        // Another window changed the shared state. Adopt it without re-broadcasting.
        this.snap = { ...this.snap, state: e.data as AppState }
        this.emit()
      }
    } catch {
      this.channel = null
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.snap
  private emit() {
    this.listeners.forEach((l) => l())
  }

  private set(fn: (s: AppState) => AppState) {
    const state = fn(this.snap.state)
    this.snap = { ...this.snap, state }
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable: the demo still works in memory */
    }
    this.channel?.postMessage(state)
    this.emit()
  }
  setUi(patch: Partial<UiState>) {
    this.snap = { ...this.snap, ui: { ...this.snap.ui, ...patch } }
    this.emit()
  }
  get s() {
    return this.snap.state
  }

  // ---------- small state helpers ----------
  private addMsg(m: ChatMessage) {
    this.set((s) => ({ ...s, messages: [...s.messages, m] }))
  }
  private patchMsg(id: string, patch: (m: ChatMessage) => ChatMessage) {
    this.set((s) => ({ ...s, messages: s.messages.map((m) => (m.uid === id ? patch(m) : m)) }))
  }
  private audit(e: Omit<AuditEntry, 'id' | 'ts' | 'route' | 'reportId'> & { id?: string }) {
    const entry: AuditEntry = {
      id: e.id ?? uid('a'), ts: Date.now(), reportId: this.s.activeReportId ? REPORTS[this.s.activeReportId].visitId : '—',
      route: this.s.route ?? '—', ...e,
    }
    this.set((s) => (s.audit.some((a) => a.id === entry.id) ? s : { ...s, audit: [...s.audit, entry] }))
  }
  toast(text: string, tone: 'crit' | 'warn' | 'ok') {
    const t = { id: uid('t'), text, tone, ts: Date.now() }
    this.set((s) => ({ ...s, toasts: [...s.toasts.filter((x) => Date.now() - x.ts < 10000), t] }))
  }
  private addCallback(kind: CallbackKind, reason: string, urgent = false) {
    const r = this.s.activeReportId ? REPORTS[this.s.activeReportId] : null
    const cb: Callback = {
      id: uid('cb'), ts: Date.now(), visitId: r?.visitId ?? '—', firstName: r?.patient.first ?? 'Unknown', kind, reason, urgent, done: false,
    }
    this.set((s) => ({ ...s, callbacks: [cb, ...s.callbacks] }))
    this.audit({ action: `Advisor callback created: ${reason}` })
  }

  // ---------- trace ----------
  private newTrace(title: string) {
    const trace: Trace = { title, steps: STEP_LABELS.map(([id, label]) => ({ id, label, status: 'idle', lines: [] })) }
    this.set((s) => ({ ...s, trace }))
  }
  private step(id: StepId, status: StepStatus, lines?: TraceLine[]) {
    this.set((s) =>
      s.trace
        ? { ...s, trace: { ...s.trace, steps: s.trace.steps.map((st) => (st.id === id ? { ...st, status, lines: lines ?? st.lines } : st)) } }
        : s,
    )
  }
  private async beat(rid: number, ms = 450): Promise<boolean> {
    await sleepMs(ms)
    return rid === this.run
  }

  // ---------- chat helpers ----------
  private addPatient(text: string, extra: Partial<ChatMessage> = {}) {
    const m: ChatMessage = { uid: uid('m'), from: 'patient', text, ts: Date.now(), ticks: 'sent', ...extra }
    this.addMsg(m)
    setTimeout(() => this.patchMsg(m.uid, (x) => ({ ...x, ticks: 'delivered' })), 500)
    setTimeout(() => this.patchMsg(m.uid, (x) => ({ ...x, ticks: 'read' })), 1300)
  }

  private async deliver(rid: number, msgs: Message[]): Promise<boolean> {
    for (const m of msgs) {
      this.setUi({ typing: true })
      if (!(await this.beat(rid, Math.min(1400, 600 + m.text.length * 2)))) {
        this.setUi({ typing: false })
        return false
      }
      this.setUi({ typing: false })
      this.addMsg(toChat(m, m.kind === 'system' ? 'system' : 'assistant'))
      if (!(await this.beat(rid, 250))) return false
    }
    return true
  }

  // ---------- the pipeline: built -> checked -> sent ----------
  private safeFallback(report: Report, route: Route): Message[] {
    if (route === 'CRITICAL') return [...X.explain(report, 'CRITICAL'), X.criticalStatus(hhmm(this.criticalDue()))]
    if (route === 'HUMAN') return X.explain(report, 'HUMAN')
    return [X.safeHandoff()]
  }
  private criticalDue(): number {
    const c = [...this.s.cases].reverse().find((x) => x.reportId === this.s.activeReportId && !x.historical)
    return c ? c.dueAt : Date.now() + SLA_MS
  }

  /** Steps 4 to 6. Used by the report run, quick replies, free text and the closing message. */
  private async buildCheckSend(rid: number, report: Report, route: Route, msgs: Message[], opts: { inject?: boolean; note?: TraceLine[] } = {}) {
    // Message built
    this.step('built', 'running')
    if (!(await this.beat(rid))) return
    let outgoing = msgs
    if (opts.inject) {
      outgoing = msgs.map((m, i) => (i === 0 ? { ...m, text: m.text + UNSAFE_TEXT } : m))
      this.set((s) => ({ ...s, devInject: false }))
    }
    this.step('built', 'ok', [
      ...(opts.note ?? []),
      ...outgoing.map((m): TraceLine => ({ text: `${m.templateId} v${m.version} · ${SIGNOFF_LABEL}`, tone: 'muted' })),
      ...(opts.inject ? [{ text: 'Dev toggle: unsafe text injected for this message', tone: 'warn' as const }] : []),
    ])

    // Output checks
    this.step('checks', 'running')
    if (!(await this.beat(rid, 550))) return
    const results: { m: Message; checks: CheckResult[] }[] = outgoing.map((m) => ({ m, checks: runChecks(m, report, route) }))
    const failed = results.some((r) => !allPass(r.checks))
    const checkLines: TraceLine[] = results.flatMap((r) => [
      { text: `${r.m.templateId} v${r.m.version}`, tone: 'muted' as const },
      ...r.checks.map((c): TraceLine => ({
        text: `${c.skipped ? '–' : c.pass ? '✓' : '✗'} ${c.label}${c.skipped ? ' (not applicable)' : ''}${c.detail && !c.pass ? ` — ${c.detail}` : ''}`,
        tone: c.skipped ? 'muted' : c.pass ? 'ok' : 'fail',
      })),
    ])
    this.step('checks', failed ? 'fail' : 'ok', checkLines)

    // Replace the whole batch on any failure: a half-explanation is worse than a handoff.
    let finalMsgs = outgoing
    if (failed) {
      finalMsgs = this.safeFallback(report, route)
      if (route !== 'CRITICAL' && route !== 'HUMAN') this.addCallback('blocked', 'Unsafe message blocked, patient needs an explanation')
      this.audit({ action: `Output check failed (${results.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => c.id)).join(', ')}); blocked ${outgoing.map((m) => m.templateId).join(', ')}` })
    }

    // Send
    this.step('sent', 'running')
    if (!(await this.beat(rid, 300))) return
    const ok = await this.deliver(rid, finalMsgs)
    if (!ok) return
    for (const m of finalMsgs) {
      this.audit({
        templateId: m.templateId, version: m.version,
        checks: failed ? 'FAIL on original, safe template sent' : `pass (${results[0]?.checks.filter((c) => !c.skipped).length ?? 0}/${results[0]?.checks.filter((c) => !c.skipped).length ?? 0})`,
        note: failed ? `Replaced ${outgoing.map((m2) => m2.templateId).join(', ')}` : undefined,
      })
    }
    const escalated = route === 'CRITICAL'
    this.step(
      'sent',
      failed ? 'warn' : 'ok',
      failed
        ? [{ text: `Blocked. Safe template ${finalMsgs[0].templateId} sent instead.`, tone: 'warn' }]
        : [{ text: escalated ? 'Escalated to the clinical team. Human-owned from here.' : 'Sent to the patient.', tone: escalated ? 'crit' : 'ok' }],
    )
  }

  // ---------- actions: patient side ----------
  async pickReport(id: ReportId) {
    if (this.s.stopped) return
    const rid = ++this.run
    this.setUi({ tab: 'patient', typing: false })
    const report = REPORTS[id]
    const cls = classifyReport(report)
    this.set((s) => ({
      ...s, activeReportId: id, route: cls.route, verified: false, pendingVerify: null,
      messages: [s.messages[0]?.templateId === 'CONSENT-01' ? s.messages[0] : consentChat()],
    }))
    this.newTrace(`${report.visitId} · ${maskName(report)}`)
    this.addPatient('', { attachment: `${report.visitId}_report.pdf` })
    this.audit({ action: 'Patient uploaded report' })

    this.step('received', 'running')
    if (!(await this.beat(rid))) return
    this.step('received', 'ok', [
      { text: `Visit ${report.visitId}` },
      { text: `Patient ${maskName(report)}, ${report.patient.age} ${report.patient.sex}, ${report.patient.phone.replace(/\d{3}$/, '•••')}`, tone: 'muted' },
      { text: `${report.results.length} results read`, tone: 'muted' },
    ])

    this.step('rules', 'running')
    if (!(await this.beat(rid, 600))) return
    this.step('rules', cls.route === 'CRITICAL' ? 'fail' : cls.route === 'NORMAL' ? 'ok' : 'warn', this.ruleLines(report, cls))

    this.step('route', 'running')
    if (!(await this.beat(rid))) return
    this.step('route', cls.route === 'CRITICAL' ? 'fail' : cls.route === 'NORMAL' ? 'ok' : 'warn', [
      { text: `Route: ${cls.route}`, tone: cls.route === 'CRITICAL' ? 'crit' : cls.route === 'NORMAL' ? 'ok' : 'warn' },
      ...cls.reasons.map((r): TraceLine => ({ text: r, tone: 'muted' })),
      { text: 'Decided by rules. The model was not involved.', tone: 'muted' },
    ])
    if (cls.route === 'CRITICAL') this.createCase(report)
    this.audit({ action: `Route decided: ${cls.route}` })

    await this.buildAndSend(rid, report, cls)
  }

  private ruleLines(report: Report, cls: Classification): TraceLine[] {
    const lines: TraceLine[] = report.results.map((r, i) => {
      const st = cls.results[i].status
      const val = `${r.name} ${fmtValue(r)} ${r.unit}`
      if (st === 'normal') return { text: `${val} — in range (${printedRange(r)})`, tone: 'ok' }
      if (st === 'critical-high') return { text: `${val} — CRITICAL, above ${r.critHigh}`, tone: 'crit' }
      if (st === 'critical-low') return { text: `${val} — CRITICAL, below ${r.critLow}`, tone: 'crit' }
      if (st === 'unknown' || st === 'unreadable') return { text: `${val} — cannot judge (${st === 'unknown' ? 'no range or unknown test' : 'unreadable'})`, tone: 'warn' }
      return { text: `${val} — ${st} (range ${printedRange(r)})`, tone: 'warn' }
    })
    return lines
  }

  private async buildAndSend(rid: number, report: Report, cls: Classification) {
    const route = cls.route
    const explains = route === 'NORMAL' || route === 'ABNORMAL'
    const tplId = route === 'NORMAL' ? 'NORM-01' : 'OOR-01'
    const pausedBy = explains ? (this.s.paused.all ? 'all' : this.s.paused.templates[tplId] ? 'template' : null) : null

    if (pausedBy) {
      this.step('built', 'warn', [{ text: 'Paused by clinical team', tone: 'warn' }, { text: pausedBy === 'all' ? 'Whole-service switch is on' : `Template ${tplId} switch is on`, tone: 'muted' }])
      this.addCallback('paused', 'AI explanations paused, patient needs an explanation')
      this.step('checks', 'running')
      if (!(await this.beat(rid))) return
      const h = [X.safeHandoff()]
      this.step('checks', 'ok', [{ text: `${h[0].templateId}: all applicable checks pass`, tone: 'ok' }])
      this.step('sent', 'running')
      if (!(await this.deliver(rid, h))) return
      this.audit({ templateId: h[0].templateId, version: h[0].version, checks: 'pass', note: 'AI explanation paused by clinical team' })
      this.step('sent', 'warn', [{ text: 'Paused by clinical team. Handoff sent and advisor callback created.', tone: 'warn' }])
      return
    }

    if (explains && !this.s.verified) {
      this.step('built', 'running', [{ text: 'Waiting for the patient to verify (simulated code).', tone: 'warn' }])
      this.set((s) => ({ ...s, pendingVerify: report.id }))
      await this.deliver(rid, [X.verifyMessage(DEMO_CODE)])
      return
    }

    let msgs = X.explain(report, route, this.s.lang ?? 'en')
    if (route === 'CRITICAL') msgs = [...msgs, X.criticalStatus(hhmm(this.criticalDue()))]
    if (route === 'HUMAN') this.addCallback('human', `Routed to a person: ${cls.reasons.join('; ')}`)
    await this.buildCheckSend(rid, report, route, msgs, { inject: this.s.devInject })
  }

  private createCase(report: Report) {
    const cls = classifyReport(report)
    const critIdx = cls.results.findIndex((r) => r.status === 'critical-high' || r.status === 'critical-low')
    const cr = report.results[critIdx]
    const high = cls.results[critIdx].status === 'critical-high'
    const now = Date.now()
    const others = report.results
      .map((r, i) => ({ r, st: cls.results[i].status }))
      .filter((x) => x.r.code !== cr.code && (x.st === 'high' || x.st === 'low'))
    const highs = others.filter((o) => o.st === 'high').map((o) => o.r.name)
    const lows = others.filter((o) => o.st === 'low').map((o) => o.r.name)
    const prev = report.previous && report.previous.code === cr.code ? report.previous : undefined
    const summary = [
      `${cr.name} markedly ${high ? 'above' : 'below'} the critical limit${prev ? `, ${high ? 'up' : 'down'} from ${prev.value}` : ''}.`,
      highs.length ? `${highs.join(' and ')} also high.` : '',
      lows.length ? `${lows.join(' and ')} also low.` : '',
      'Patient has been told a doctor will call within 30 minutes. No values were shared with the patient.',
    ].filter(Boolean).join(' ')
    const c: CaseRec = {
      id: uid('case'), reportId: report.id, visitId: report.visitId, name: `${report.patient.first} ${report.patient.last}`,
      ageSex: `${report.patient.age} ${report.patient.sex}`, phone: report.patient.phone, receivedAt: now, dueAt: now + SLA_MS, skewMs: 0,
      status: 'New', attempts: 0, breached: false, seen: false,
      headline: `${cr.name} ${fmtValue(cr)} ${cr.unit}`,
      limitText: `critical limit ${high ? 'above' : 'below'} ${high ? cr.critHigh : cr.critLow}; range ${printedRange(cr)}`,
      previousText: prev ? `${prev.value} ${prev.unit}, ${prev.when}` : undefined,
      others: others.map((o) => `${o.r.name} ${fmtValue(o.r)} ${o.r.unit} (${o.st})`),
      summary, checklist: [false, false, false, false],
    }
    this.set((s) => ({ ...s, cases: [c, ...s.cases] }))
    this.toast('🔴 Critical case received → Call patient', 'crit')
    this.audit({ action: 'Critical case created, SLA 30 minutes, human-owned' })
  }

  /** A short run for replies, free text and system events. */
  private async respond(trigger: string, ruleLines: TraceLine[], routeLine: string, msgs: Message[], title = 'Patient message') {
    const rid = ++this.run
    const report = this.s.activeReportId ? REPORTS[this.s.activeReportId] : REPORTS.normal
    const route: Route = this.s.route ?? 'HUMAN'
    this.newTrace(title)
    this.step('received', 'running')
    if (!(await this.beat(rid, 300))) return
    this.step('received', 'ok', [{ text: trigger }])
    this.step('rules', 'ok', ruleLines)
    this.step('route', 'ok', [{ text: routeLine }, { text: 'Decided by rules. The model was not involved.', tone: 'muted' }])
    await this.buildCheckSend(rid, report, route, msgs)
  }

  async tapReply(msgUid: string, replyId: string) {
    const m = this.s.messages.find((x) => x.uid === msgUid)
    const def = m?.quickReplies?.find((q) => q.id === replyId)
    if (!m || !def || m.usedReplies?.includes(replyId)) return
    this.patchMsg(msgUid, (x) => ({ ...x, usedReplies: [...(x.usedReplies ?? []), replyId] }))
    const plain = def.label.replace(/^\S+\s/, '')

    if (replyId === 'open-dashboard') {
      this.audit({ action: 'Presenter opened the clinical dashboard' })
      this.openTab('dashboard')
      return
    }
    this.addPatient(def.label)
    this.audit({ action: `Patient tapped: ${plain}` })

    const report = this.s.activeReportId ? REPORTS[this.s.activeReportId] : REPORTS.normal
    const tap = `Patient tapped "${plain}"`
    const keep = [{ text: `Route stays ${this.s.route ?? '—'}. Nothing re-routed.`, tone: 'muted' as const }]

    if (replyId === 'verify') {
      this.set((s) => ({ ...s, verified: true, pendingVerify: null }))
      const rid = ++this.run
      const r = this.s.activeReportId ? REPORTS[this.s.activeReportId] : null
      if (!r) return
      this.step('built', 'running', [{ text: 'Verified with simulated code.', tone: 'ok' }])
      this.audit({ action: 'Patient verified with simulated demo code' })
      await this.buildAndSend(rid, r, classifyReport(r))
      return
    }
    switch (replyId) {
      case 'remind-yearly':
        return this.respond(tap, keep, 'Reminder requested', [X.reminderYearly(new Date())])
      case 'remind-repeat':
        return this.respond(tap, keep, 'Reminder requested', [X.reminderRepeat(report, new Date())])
      case 'advisor':
      case 'call-me':
        this.addCallback(replyId === 'advisor' ? 'advisor' : 'call-me', replyId === 'advisor' ? 'Patient asked to talk to an advisor' : 'Patient asked for a call')
        return this.respond(tap, keep, 'Handoff to a person', [X.advisorConfirm()])
      case 'not-helpful':
        this.addCallback('not-helpful', 'Patient marked the explanation not helpful')
        return this.respond(tap, keep, 'Handoff to a person', [X.notHelpfulMessage()])
      case 'helpful':
        return this.respond(tap, keep, 'Feedback', [X.feedbackThanks()])
      case 'download':
        return this.respond(tap, keep, 'Document request', [X.downloadMessage(report)])
    }
  }

  private static EMERGENCY = /(chest\s+pain|can'?t\s+breathe|cannot\s+breathe|can not breathe|short(ness)? of breath|difficulty breathing|faint(ing|ed)?|severe bleeding|bleeding (a lot|heavily)|unconscious|seizure|heart attack|stroke|in distress|emergency)/i
  private static MEDICAL = /(do i have|diabet|cancer|disease|diagnos|tablet|pill|medicine|medication|\bdose\b|\bdrug|prescri|treat|cure|insulin|what should i take|which .*(take|use))/i

  async sendText(text: string) {
    const t = text.trim()
    if (!t || this.s.stopped) return
    this.addPatient(t)
    const base: TraceLine[] = [{ text: 'Free text received (content not stored in the audit log)', tone: 'muted' }]
    const rules = (line: string): TraceLine[] => [...base, { text: line }]

    // 1. Emergency wording runs before anything else.
    if (Store.EMERGENCY.test(t)) {
      this.audit({ action: 'Patient free text: emergency wording detected' })
      this.addCallback('urgent', 'Patient used emergency wording', true)
      return this.respond('Free text: emergency check', rules('Emergency wording matched'), 'Guardrail: emergency, runs first', [X.urgentMessage()], 'Free text')
    }
    // 2. Opt-out.
    if (/^\s*stop\s*[.!]?\s*$/i.test(t)) {
      this.audit({ action: 'Patient opted out (STOP)' })
      await this.respond('Free text: STOP', rules('Opt-out keyword'), 'Guardrail: opt-out', [X.stopMessage()], 'Opt-out')
      this.set((s) => ({ ...s, stopped: true }))
      return
    }
    this.audit({ action: 'Patient sent free text' })
    // 3. Critical thread: repeat status, discuss nothing.
    if (this.s.route === 'CRITICAL') {
      return this.respond('Free text on the critical thread', rules('Critical thread: no discussion'), 'Guardrail: critical thread', [X.criticalThreadMessage()], 'Free text')
    }
    // 4. Advisor request.
    if (/\badvisor\b/i.test(t)) {
      this.addCallback('advisor', 'Patient typed advisor')
      return this.respond('Free text: advisor', rules('Advisor keyword'), 'Guardrail: handoff', [X.advisorConfirm()], 'Free text')
    }
    // 5. Diagnosis or medicine question.
    if (Store.MEDICAL.test(t)) {
      return this.respond('Free text: diagnosis or medicine question', rules('Diagnosis / medicine pattern matched'), 'Guardrail: refusal template', [X.refusalMessage()], 'Free text')
    }
    // 6. Fallback.
    return this.respond('Free text: unrecognised', rules('No pattern matched'), 'Guardrail: gentle fallback', [X.fallbackMessage()], 'Free text')
  }

  // ---------- actions: dashboard side ----------
  openTab(tab: 'patient' | 'dashboard') {
    this.setUi({ tab })
    if (tab === 'dashboard' && this.s.cases.some((c) => !c.seen)) {
      this.set((s) => ({ ...s, cases: s.cases.map((c) => ({ ...c, seen: true })) }))
    }
  }

  private patchCase(id: string, fn: (c: CaseRec) => CaseRec) {
    this.set((s) => ({ ...s, cases: s.cases.map((c) => (c.id === id ? fn(c) : c)) }))
  }
  private caseAudit(c: CaseRec, action: string) {
    this.audit({ action: `${action} (case ${c.visitId})` })
  }

  callPatient(id: string) {
    const c = this.s.cases.find((x) => x.id === id)
    if (!c || c.status === 'Reached' || c.status === 'Calling') return
    this.patchCase(id, (x) => ({ ...x, status: 'Calling', checklist: [false, false, false, false], retryAt: undefined }))
    this.caseAudit(c, `Call attempt ${c.attempts + 1} started`)
  }
  toggleChecklist(id: string, i: number) {
    this.patchCase(id, (x) => ({ ...x, checklist: x.checklist.map((v, j) => (j === i ? !v : v)) }))
  }
  noAnswer(id: string) {
    const c = this.s.cases.find((x) => x.id === id)
    if (!c || c.status === 'Reached') return
    const attempts = c.attempts + 1
    this.caseAudit(c, `Call attempt ${attempts}: no answer`)
    if (attempts >= MAX_ATTEMPTS) {
      this.patchCase(id, (x) => ({ ...x, attempts, status: 'Escalated', retryAt: undefined }))
      this.caseAudit(c, `Escalated to supervisor after ${attempts} no-answer attempts`)
      this.toast('🟠 No answer after 3 attempts → Escalated to supervisor', 'warn')
    } else {
      this.patchCase(id, (x) => ({ ...x, attempts, status: 'No answer', retryAt: Date.now() + RETRY_MS }))
      this.caseAudit(c, 'Retry scheduled (accelerated for the demo: 10 seconds)')
    }
  }
  async markReached(id: string) {
    const c = this.s.cases.find((x) => x.id === id)
    if (!c || c.status === 'Reached') return
    const now = Date.now()
    this.patchCase(id, (x) => ({ ...x, status: 'Reached', reachedAt: now, attempts: x.attempts + 1 }))
    this.caseAudit(c, `Marked reached by clinician at ${hhmm(now)}`)
    if (this.s.activeReportId === c.reportId) {
      await this.respond('Clinician marked the patient as reached', [{ text: 'Closing message after a human call', tone: 'muted' }], 'Closing message', [X.criticalClosing()], 'Case closed')
    }
  }
  doneCallback(id: string) {
    this.set((s) => ({ ...s, callbacks: s.callbacks.map((c) => (c.id === id ? { ...c, done: true } : c)) }))
  }

  /** Called every second by the app. Idempotent so two windows can both run it. */
  tick() {
    const now = Date.now()
    for (const c of this.s.cases) {
      if (c.status === 'Reached' || c.historical) continue
      if (!c.breached && c.dueAt - c.skewMs - now <= 0) {
        this.patchCase(c.id, (x) => ({ ...x, breached: true }))
        this.audit({ id: `breach-${c.id}`, action: `SLA breached. Escalated to supervisor (case ${c.visitId})` })
        this.toast('🔴 SLA breached → Escalated to supervisor', 'crit')
      }
      if (c.status === 'No answer' && c.retryAt && c.retryAt <= now) this.patchCase(c.id, (x) => ({ ...x, status: 'Retry due' }))
    }
    if (this.s.toasts.some((t) => now - t.ts > 12000)) this.set((s) => ({ ...s, toasts: s.toasts.filter((t) => now - t.ts <= 12000) }))
  }

  setPaused(all: boolean) {
    this.set((s) => ({ ...s, paused: { ...s.paused, all } }))
    this.audit({ action: `Clinical team turned AI explanations ${all ? 'OFF' : 'ON'} (whole service)` })
  }
  setTemplatePaused(id: string, on: boolean) {
    this.set((s) => ({ ...s, paused: { ...s.paused, templates: { ...s.paused.templates, [id]: on } } }))
    this.audit({ action: `Clinical team turned template ${id} ${on ? 'OFF' : 'ON'}` })
  }

  // ---------- hidden presenter tools ----------
  setLang(lang: 'en' | 'hi') {
    this.set((s) => ({ ...s, lang }))
    this.audit({ action: `Language set to ${lang === 'hi' ? 'Hindi' : 'English'}` })
  }
  toggleInject() {
    this.set((s) => ({ ...s, devInject: !s.devInject }))
  }
  fastForward(to: 'risk' | 'breach') {
    const c = this.s.cases.find((x) => !x.historical && x.status !== 'Reached')
    if (!c) return
    const remaining = c.dueAt - c.skewMs - Date.now()
    const target = to === 'risk' ? RISK_MS - 5000 : 3000
    if (remaining <= target) return
    this.patchCase(c.id, (x) => ({ ...x, skewMs: x.skewMs + (remaining - target) }))
    this.audit({ action: `Demo: timer fast-forwarded (case ${c.visitId})` })
  }
  async amendReport() {
    const r = this.s.activeReportId ? REPORTS[this.s.activeReportId] : null
    if (!r || this.s.route === 'CRITICAL') return
    this.set((s) => ({
      ...s, messages: s.messages.map((m) => (m.kind === 'explanation' || m.templateId === 'HANDOFF-01' ? { ...m, superseded: true } : m)),
    }))
    this.audit({ action: 'Report amended: earlier explanation marked superseded' })
    this.addCallback('correction', 'Report amended, patient needs a walk-through')
    await this.respond('Report amended by the lab', [{ text: 'Amendment flag set by lab staff', tone: 'muted' }], 'Correction notice', [X.correctionMessage(r)], 'Report correction')
  }

  reset() {
    this.run++
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    this.setUi({ typing: false, tab: 'patient' })
    this.set(() => initialState())
    try {
      localStorage.removeItem(KEY) // Reset clears localStorage; the next change writes the clean state again
    } catch {
      /* ignore */
    }
  }
}

export const templateName = (id: string) => getTemplate(id)?.name ?? id
export { EXPLANATION_TEMPLATE_IDS }
