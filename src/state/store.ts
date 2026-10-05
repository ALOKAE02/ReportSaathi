import type { ActionId } from '../engine/actions';
import type { CheckResult } from '../engine/checks';
import type { Route } from '../engine/classify';

export type Page = 'about' | 'try' | 'how';

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot';
  kind: 'text' | 'doc' | 'status' | 'chip';
  text: string;
  at: number;
  templateId?: string;
  version?: number;
  /** Quick-reply buttons under this message (max 3). */
  replies?: ActionId[];
  used?: ActionId[];
  doc?: { name: string; meta: string; type: 'pdf' | 'image' };
  ticks?: 'sent' | 'delivered' | 'read';
}

export type StepKey = 'consent' | 'read' | 'rules' | 'brief' | 'checks' | 'outcome';
export type StepStatus = 'idle' | 'active' | 'ok' | 'note' | 'alert' | 'fail' | 'skip';

export interface TraceStep {
  status: StepStatus;
  detail: string[];
}

export interface TraceMessageEntry {
  type: 'message';
  id: string;
  at: number;
  templateId: string;
  version: number | null;
  checks: CheckResult[];
  outcome: 'sent' | 'blocked';
  note?: string;
}

export interface TraceEventEntry {
  type: 'event';
  id: string;
  at: number;
  text: string;
  tone: 'info' | 'note' | 'alert';
}

export type TraceEntry = TraceMessageEntry | TraceEventEntry;

export interface Trace {
  reportId?: string;
  docTitle?: string;
  patientMasked?: string;
  route?: Route;
  steps: Record<StepKey, TraceStep>;
  log: TraceEntry[];
}

export interface Conversation {
  reportId?: string;
  /** Shared but not yet read: waiting for consent. */
  pendingReportId?: string;
  route?: Route;
  consentAt?: number;
  optedOut: boolean;
  handoffId?: string;
  messages: ChatMessage[];
  /** Suggested questions already used. */
  usedSuggestions: ActionId[];
  showSuggestions: boolean;
  typing: boolean;
  busy: boolean;
}

export interface Handoff {
  id: string;
  at: number;
  reportId: string;
  kind: 'critical' | 'callback';
  /** Emergency wording or "I feel unwell": call now, not later today. */
  urgent?: boolean;
  reason: string;
  status: 'Waiting' | 'Calling' | 'Reached';
  dueAt?: number;
  reachedAt?: number;
  summary?: string;
}

export interface DemoData {
  conversation: Conversation;
  trace: Trace;
  handoffs: Handoff[];
}

export interface UiState {
  page: Page;
  attachOpen: boolean;
}

export interface DemoState {
  version: 2;
  data: DemoData;
  ui: UiState;
}

export const STEP_KEYS: StepKey[] = ['consent', 'read', 'rules', 'brief', 'checks', 'outcome'];

export function emptyTrace(): Trace {
  const steps = Object.fromEntries(STEP_KEYS.map((k) => [k, { status: 'idle', detail: [] }])) as unknown as Record<StepKey, TraceStep>;
  return { steps, log: [] };
}

export function emptyConversation(): Conversation {
  return { optedOut: false, messages: [], usedSuggestions: [], showSuggestions: false, typing: false, busy: false };
}

export function initialState(ui?: Partial<UiState>): DemoState {
  return {
    version: 2,
    data: { conversation: emptyConversation(), trace: emptyTrace(), handoffs: [] },
    ui: { page: 'about', attachOpen: false, ...ui },
  };
}

const STORAGE_KEY = 'reportsaathi-demo-v2';
const CHANNEL = 'reportsaathi-demo';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function load(): DemoState | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed?.version !== 2 || !parsed.data || !parsed.ui) return undefined;
    // Transient flags never survive a reload.
    parsed.data.conversation.typing = false;
    parsed.data.conversation.busy = false;
    parsed.ui.attachOpen = false;
    return parsed;
  } catch {
    return undefined;
  }
}

function save(state: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private window). The demo still runs in memory.
  }
}

export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface Store {
  getState(): DemoState;
  subscribe(listener: () => void): () => void;
  /** Clone, mutate the draft, publish. State is small, so cloning keeps updates simple and safe. */
  mutate(fn: (draft: DemoState) => void): void;
  replace(next: DemoState): void;
}

export function createStore(): Store {
  let state = load() ?? initialState();
  const listeners = new Set<() => void>();
  const windowId = uid('win');
  let channel: BroadcastChannel | undefined;

  const publish = (next: DemoState, broadcast: boolean) => {
    state = next;
    save(state);
    if (broadcast) channel?.postMessage({ from: windowId, data: state.data });
    listeners.forEach((l) => l());
  };

  try {
    channel = new BroadcastChannel(CHANNEL);
    // A second window (for example "How it works" on another screen) mirrors the shared data.
    channel.onmessage = (e: MessageEvent<{ from: string; data: DemoData }>) => {
      if (e.data?.from === windowId || !e.data?.data) return;
      publish({ ...state, data: e.data.data }, false);
    };
  } catch {
    channel = undefined;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mutate(fn) {
      const draft = structuredClone(state);
      fn(draft);
      publish(draft, true);
    },
    replace(next) {
      publish(next, true);
    },
  };
}
