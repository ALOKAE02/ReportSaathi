import type { ReportId } from '../data/reports'
import type { Route } from '../engine/classify'
import type { MessageKind, QuickReplyDef } from '../engine/types'

export interface ChatMessage {
  uid: string
  from: 'patient' | 'assistant' | 'system'
  text: string
  ts: number
  ticks?: 'sent' | 'delivered' | 'read'
  templateId?: string
  version?: string
  kind?: MessageKind
  quickReplies?: QuickReplyDef[]
  usedReplies?: string[]
  chip?: string
  attachment?: string
  superseded?: boolean
}

export type StepStatus = 'idle' | 'running' | 'ok' | 'fail' | 'warn'
export type StepId = 'received' | 'rules' | 'route' | 'built' | 'checks' | 'sent'
export interface TraceLine {
  text: string
  tone?: 'ok' | 'fail' | 'warn' | 'crit' | 'muted'
}
export interface TraceStep {
  id: StepId
  label: string
  status: StepStatus
  lines: TraceLine[]
}
export interface Trace {
  title: string
  steps: TraceStep[]
}

export type CaseStatus = 'New' | 'Calling' | 'No answer' | 'Retry due' | 'Escalated' | 'Reached'

export interface CaseRec {
  id: string
  reportId: ReportId
  visitId: string
  name: string
  ageSex: string
  phone: string
  receivedAt: number
  dueAt: number
  skewMs: number // demo fast-forward
  status: CaseStatus
  attempts: number
  retryAt?: number
  reachedAt?: number
  breached: boolean
  seen: boolean
  historical?: boolean
  headline: string // e.g. "Potassium 6.9 mmol/L"
  limitText: string
  previousText?: string
  others: string[]
  summary: string
  checklist: boolean[]
}

export type CallbackKind = 'advisor' | 'not-helpful' | 'call-me' | 'urgent' | 'paused' | 'blocked' | 'human' | 'correction'
export interface Callback {
  id: string
  ts: number
  visitId: string
  firstName: string
  kind: CallbackKind
  reason: string
  urgent: boolean
  done: boolean
}

export interface AuditEntry {
  id: string
  ts: number
  reportId: string
  route: Route | '—'
  templateId?: string
  version?: string
  checks?: string
  action?: string
  note?: string
}

export interface Toast {
  id: string
  text: string
  tone: 'crit' | 'warn' | 'ok'
  ts: number
}

// Shared across windows and persisted to localStorage.
export interface AppState {
  v: 1
  messages: ChatMessage[]
  trace: Trace | null
  activeReportId: ReportId | null
  route: Route | null
  verified: boolean
  pendingVerify: ReportId | null
  stopped: boolean
  cases: CaseRec[]
  callbacks: Callback[]
  audit: AuditEntry[]
  toasts: Toast[]
  paused: { all: boolean; templates: Record<string, boolean> }
  devInject: boolean
  lang: 'en' | 'hi'
}

// Per-window only. Not persisted, not synced.
export interface UiState {
  tab: 'patient' | 'dashboard'
  dashTab: 'queue' | 'audit'
  presentation: boolean
  tools: boolean
  typing: boolean
}
