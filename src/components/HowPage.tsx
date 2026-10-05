import { useState } from 'react';
import { getReport } from '../data/reports';
import { runOutputChecks, type CheckOutcome } from '../engine/checks';
import { fmtTime } from '../engine/format';
import { render, type Message } from '../engine/templates';
import { useActions, useDemoState } from '../state/DemoContext';
import { STEP_KEYS, type StepKey, type StepStatus, type TraceEntry } from '../state/store';
import { HandoffCard } from './HandoffCard';

const STEP_INFO: Record<StepKey, { title: string; text: string }> = {
  consent: { title: 'Ask first', text: 'Nothing is read until the patient says OK. The time is logged.' },
  read: { title: 'Read and check', text: 'Is it a lab report? Can every value be read clearly? If not, say so.' },
  rules: { title: 'Rules decide the route', text: 'Fixed rules sort it: all fine, something to note, critical, or for a person.' },
  brief: { title: 'Build the brief', text: 'Words come only from reviewed templates and the approved library.' },
  checks: { title: 'Safety checks', text: 'Every message is checked before it is sent. A failing one is never sent.' },
  outcome: { title: 'Send, or hand to a person', text: 'The brief and next steps go out, or a doctor or team member takes over.' },
};

const STATUS_TEXT: Record<StepStatus, string> = {
  idle: 'Waiting',
  active: 'Working…',
  ok: 'Done',
  note: 'Done, with care',
  alert: 'Handed over',
  fail: 'Blocked',
  skip: 'Skipped',
};

const RAILS = [
  { title: 'Consent first', text: 'No report is read before the patient says OK.', how: 'The consent step gates reading, with a timestamp.' },
  { title: 'Rules decide, not the AI', text: 'Fixed, tested rules sort every report before any words are written.', how: 'classify.ts · unit-tested' },
  { title: 'Explain, never diagnose', text: 'No condition names, no medicines, no doses. Ever.', how: 'Banned-wording check on every message' },
  { title: 'Every number is real', text: 'Each number in a reply must exist in the report.', how: 'Number check on every message' },
  { title: 'Critical goes to a doctor', text: 'No values in chat. A doctor calls within 30 minutes.', how: 'No-values check + doctor handoff' },
  { title: 'Honest about limits', text: 'If a value is unclear, it says so and asks again. It never guesses.', how: 'Unreadable values stop the brief' },
  { title: 'Only approved words', text: 'Every reply comes from a reviewed template, with an ID and version.', how: 'Unregistered messages are blocked' },
  { title: 'Emergency first', text: 'Words like “chest pain” get an urgent reply before anything else.', how: 'Checked before every other rule' },
  { title: 'Your data, your control', text: '“Delete my report” and “Stop” work any time. Reports auto-delete after 30 days.', how: 'Handled before any answer' },
];

const BREAK_TESTS: { label: string; build: () => Message; reportId: string; critical?: boolean }[] = [
  {
    label: 'Invent a number',
    reportId: 'DEMO-2043',
    build: () => ({ ...render('THANKS-01'), text: 'Glad that helped. Your HbA1c is 6.2%, so it is fine.' }),
  },
  {
    label: 'Give a diagnosis',
    reportId: 'DEMO-2043',
    build: () => ({ ...render('THANKS-01'), text: 'Glad that helped. You have diabetes.' }),
  },
  {
    label: 'Suggest a medicine',
    reportId: 'DEMO-2043',
    build: () => ({ ...render('THANKS-01'), text: 'Glad that helped. Take one tablet of metformin daily.' }),
  },
  {
    label: 'Leak a critical value',
    reportId: 'DEMO-3077',
    critical: true,
    build: () => ({ ...render('CRIT-PRIORITY-01'), text: 'Your potassium is 6.9 mmol/L, which is very high.' }),
  },
  {
    label: 'Skip the template',
    reportId: 'DEMO-1001',
    build: () => ({ text: 'Everything looks great, you are super healthy!' }),
  },
];

function LogEntry({ e }: { e: TraceEntry }) {
  if (e.type === 'event') {
    return (
      <li className={`log-event tone-${e.tone}`}>
        <span className="log-time">{fmtTime(e.at)}</span>
        {e.text}
      </li>
    );
  }
  return (
    <li className={`log-msg${e.outcome === 'blocked' ? ' blocked' : ''}`}>
      <div className="log-head">
        <code>
          {e.templateId}
          {e.version !== null ? ` v${e.version}` : ''}
        </code>
        <span className={`pill ${e.outcome === 'sent' ? 'pill-ok' : 'pill-bad'}`}>{e.outcome === 'sent' ? 'Sent' : 'Blocked'}</span>
        <span className="log-time">{fmtTime(e.at)}</span>
      </div>
      <ul className="chips">
        {e.checks.filter((c) => c.status !== 'na').map((c) => (
          <li key={c.id} className={`chk chk-${c.status}`} title={c.detail}>
            {c.status === 'pass' ? '✓' : '✕'} {c.label}
          </li>
        ))}
      </ul>
      {e.note && <p className="log-note">{e.note}</p>}
    </li>
  );
}

function BreakIt() {
  const [picked, setPicked] = useState<number | null>(null);
  let result: { msg: Message; out: CheckOutcome; safe: string } | null = null;
  if (picked !== null) {
    const test = BREAK_TESTS[picked];
    const msg = test.build();
    const out = runOutputChecks(msg, { report: getReport(test.reportId), route: test.critical ? 'CRITICAL' : 'ABNORMAL' });
    result = { msg, out, safe: render(test.critical ? 'SAFE-CRIT-01' : 'SAFE-01').text };
  }
  return (
    <section className="card break">
      <h2>Try to break it</h2>
      <p className="muted">Pick an unsafe reply an AI might write. The real checks run on it right here.</p>
      <div className="break-buttons">
        {BREAK_TESTS.map((t, i) => (
          <button key={t.label} className={`chip-btn${picked === i ? ' on' : ''}`} onClick={() => setPicked(i)}>
            {t.label}
          </button>
        ))}
      </div>
      {result && (
        <div className="break-result">
          <div className="draft">
            <span className="small-label">Draft reply</span>
            <p>“{result.msg.text}”</p>
          </div>
          <ul className="check-rows">
            {result.out.results.filter((r) => r.status !== 'na').map((r) => (
              <li key={r.id} className={`chk-row chk-${r.status}`}>
                <span>{r.status === 'pass' ? '✓' : '✕'}</span>
                <span>
                  {r.label}
                  {r.status === 'fail' && r.detail && <small>{r.detail}</small>}
                </span>
              </li>
            ))}
          </ul>
          <div className={`verdict ${result.out.ok ? 'ok' : 'blocked'}`}>
            {result.out.ok ? (
              'This reply would be sent.'
            ) : (
              <>
                <strong>Blocked. Never sent.</strong> The patient gets this instead: “{result.safe}”
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function HowPage() {
  const { data } = useDemoState();
  const actions = useActions();
  const { trace, handoffs } = data;
  const ran = STEP_KEYS.some((k) => trace.steps[k].status !== 'idle');
  const log = [...trace.log].reverse();
  // Critical cases first, then urgent callbacks, then the rest; newest first within each.
  const rank = (h: (typeof handoffs)[number]) => (h.kind === 'critical' ? 0 : h.urgent ? 1 : 2);
  const open = handoffs.filter((h) => h.status !== 'Reached').sort((a, b) => rank(a) - rank(b) || b.at - a.at);
  const done = handoffs.filter((h) => h.status === 'Reached');

  return (
    <div className="page how">
      <header className="page-head">
        <h1>How it works</h1>
        <p className="lead">
          Every reply passes the same six steps and the same safety rails. Fixed rules decide what may be said. The AI only
          writes the words, and only from approved text.
        </p>
      </header>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>The steps</h2>
            <p className="muted">
              {ran ? (
                <>
                  Live from your last chat: <code>{trace.reportId}</code> · {trace.docTitle} · {trace.patientMasked}
                </>
              ) : (
                'Share a report on the Try it page and watch these fill in.'
              )}
            </p>
          </div>
          {trace.route && <span className={`route route-${trace.route.toLowerCase()}`}>{routeName(trace.route)}</span>}
        </div>
        <ol className="timeline">
          {STEP_KEYS.map((k, i) => {
            const s = trace.steps[k];
            return (
              <li key={k} className={`tl s-${s.status}`}>
                <span className="tl-dot" aria-hidden="true">
                  {s.status === 'ok' ? '✓' : s.status === 'fail' ? '✕' : s.status === 'alert' || s.status === 'note' ? '!' : s.status === 'skip' ? '–' : i + 1}
                </span>
                <div className="tl-body">
                  <div className="tl-title">
                    {STEP_INFO[k].title}
                    {ran && <span className="tl-state">{STATUS_TEXT[s.status]}</span>}
                  </div>
                  <p className="tl-text">{STEP_INFO[k].text}</p>
                  {s.detail.length > 0 && (
                    <ul className="tl-detail">
                      {s.detail.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {!ran && (
          <button className="btn primary small" onClick={() => actions.setPage('try')}>
            Go to Try it
          </button>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">The rails</h2>
        <p className="muted section-sub">Nine rules the assistant cannot step over, and how each one is enforced in code.</p>
        <div className="rails">
          {RAILS.map((r) => (
            <article key={r.title} className="rail">
              <h3>{r.title}</h3>
              <p>{r.text}</p>
              <span className="rail-how">{r.how}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="how-grid">
        <section className="card">
          <h2>When a person takes over</h2>
          <p className="muted">Critical values, unclear reports and “talk to a person” all land here, with the full context.</p>
          {handoffs.length === 0 && <div className="empty">No handoffs yet. Share the kidney panel report to see a doctor handoff.</div>}
          <div className="handoffs">
            {[...open, ...done].map((h) => (
              <HandoffCard key={h.id} h={h} />
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Every message, checked</h2>
          <p className="muted">Each reply in your last chat, its template and the checks it passed.</p>
          {log.length === 0 ? <div className="empty">Nothing sent yet.</div> : <ul className="log">{log.map((e) => <LogEntry key={e.id} e={e} />)}</ul>}
        </section>
      </div>

      <BreakIt />
    </div>
  );
}

function routeName(route: string): string {
  return (
    {
      NORMAL: 'All in range',
      ABNORMAL: 'Something to note',
      CRITICAL: 'Critical: doctor first',
      HUMAN: 'For a person',
      UNREADABLE: 'Unclear: asked again',
      UNSUPPORTED: 'Not a lab report',
    } as Record<string, string>
  )[route];
}
