import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { SHELF_REPORTS, getReport } from '../data/reports';
import { actionLabel, suggestionsFor, type ActionId } from '../engine/actions';
import { fmtTime } from '../engine/format';
import { useActions, useDemoState } from '../state/DemoContext';
import type { ChatMessage } from '../state/store';
import { Logo } from './TopNav';
import { DocIcon } from './TryPage';

function Ticks({ state }: { state: ChatMessage['ticks'] }) {
  if (!state) return null;
  return (
    <svg className={`ticks ticks-${state}`} viewBox="0 0 18 11" width="16" height="10" role="img" aria-label={state}>
      <path d="M1 5.8 4.4 9 10.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      {state !== 'sent' && <path d="M7.4 9 13.6 1.6M7.6 7.6 8.9 9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Light formatting: bold headline on briefs, soft colour for ✓ and ● lines, bold "Next:". */
function Formatted({ m }: { m: ChatMessage }) {
  const lines = m.text.split('\n');
  const isBrief = m.templateId?.startsWith('BRIEF') || m.templateId === 'SHARE-01';
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (line === '') {
      out.push(<span key={i} className="gap" />);
      return;
    }
    let node: ReactNode = line;
    if (line.startsWith('Next:')) node = (<><strong>Next:</strong>{line.slice(5)}</>);
    let cls = 'line';
    if (line.startsWith('✓')) cls += ' line-ok';
    else if (line.startsWith('●')) cls += ' line-note';
    else if (line.startsWith('•')) cls += ' line-bullet';
    else if (isBrief && i === (m.templateId === 'SHARE-01' ? 2 : 0)) cls += ' line-head';
    else if (line.startsWith('This explains your report')) cls += ' line-fine';
    out.push(
      <span key={i} className={cls}>
        {node}
      </span>,
    );
  });
  return <span className="bubble-text">{out}</span>;
}

function Replies({ m, busy }: { m: ChatMessage; busy: boolean }) {
  const actions = useActions();
  const { data } = useDemoState();
  return (
    <div className="replies">
      {m.replies!.map((r) => {
        const used = m.used?.includes(r);
        const nav = r === 'OPEN_HANDOFF';
        return (
          <button key={r} className={`reply${used ? ' used' : ''}${nav ? ' reply-nav' : ''}`} disabled={!nav && (busy || used)} onClick={() => actions.act(r, m.id)}>
            {actionLabel(r, data.conversation.route)}
          </button>
        );
      })}
    </div>
  );
}

function Item({ m, busy }: { m: ChatMessage; busy: boolean }) {
  if (m.kind === 'chip') return <div className="chat-chip">{m.text}</div>;
  if (m.kind === 'status') {
    const urgent = m.templateId === 'CRIT-STATUS-01';
    return (
      <div className="status-wrap">
        <div className={`status-pill${urgent ? ' urgent' : ''}`}>{m.text}</div>
        {m.replies && <Replies m={m} busy={busy} />}
      </div>
    );
  }
  const side = m.from === 'user' ? 'out' : 'in';
  return (
    <div className={`row row-${side}`}>
      <div className={`bubble bubble-${side}${m.kind === 'doc' ? ' bubble-doc' : ''}`}>
        {m.kind === 'doc' && m.doc ? (
          <span className="file">
            <DocIcon type={m.doc.type} />
            <span>
              <span className="file-name">{m.doc.name}</span>
              <span className="file-meta">{m.doc.meta}</span>
            </span>
          </span>
        ) : (
          <Formatted m={m} />
        )}
        <span className="meta">
          {fmtTime(m.at)}
          {m.from === 'user' && <Ticks state={m.ticks} />}
        </span>
      </div>
      {m.replies && <Replies m={m} busy={busy} />}
    </div>
  );
}

function AttachSheet() {
  const actions = useActions();
  return (
    <div className="sheet-backdrop" onClick={() => actions.setAttach(false)}>
      <div className="sheet" role="dialog" aria-label="Share a document" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <strong>Share a document</strong>
          <button className="sheet-close" onClick={() => actions.setAttach(false)} aria-label="Close">
            ×
          </button>
        </div>
        <p className="sheet-sub">Recent files on this phone</p>
        <ul className="sheet-list">
          {SHELF_REPORTS.map((r) => (
            <li key={r.id}>
              <button onClick={() => actions.shareDoc(r.id)}>
                <DocIcon type={r.file.type} />
                <span>
                  <span className="file-name">{r.file.name}</span>
                  <span className="file-meta">{r.file.meta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Phone() {
  const { data, ui } = useDemoState();
  const actions = useActions();
  const conv = data.conversation;
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const report = getReport(conv.reportId);
  const suggestions: ActionId[] = conv.showSuggestions ? suggestionsFor(report, conv.route, conv.usedSuggestions) : [];
  // Four at a time keeps the tray calm; the rest are one tap away.
  const visible = showAll ? suggestions : suggestions.slice(0, 4);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [conv.messages.length, conv.typing, suggestions.length]);

  // On narrow screens the phone sits below the document list: bring it into view after a share.
  const shared = conv.pendingReportId ?? conv.reportId;
  useEffect(() => {
    if (shared && window.matchMedia('(max-width: 980px)').matches) wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [shared]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || conv.optedOut || conv.busy) return;
    actions.sendText(draft);
    setDraft('');
  };

  return (
    <section className="phone-wrap" aria-label="Patient chat" ref={wrapRef}>
      <div className="phone">
        <div className="phone-status" aria-hidden="true">
          <span>{fmtTime(Date.now())}</span>
          <span className="notch" />
          <span className="signal">
            <i />
            <i />
            <i />
          </span>
        </div>
        <header className="chat-header">
          <Logo size={36} />
          <span className="chat-title">
            <strong>ReportSaathi</strong>
            <small>{conv.typing ? 'typing…' : 'AI assistant · Demo Diagnostics Lab'}</small>
          </span>
        </header>

        <div className="chat" ref={scroller} aria-live="polite">
          <div className="day-chip">Today</div>
          {conv.messages.map((m) => (
            <Item key={m.id} m={m} busy={conv.busy} />
          ))}
          {conv.typing && (
            <div className="row row-in">
              <div className="bubble bubble-in typing" aria-label="ReportSaathi is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        {suggestions.length > 0 && !conv.optedOut && (
          <div className="suggest" aria-label="Suggested questions">
            <span className="suggest-label">Suggested for you</span>
            <div className="suggest-row">
              {visible.map((s) => (
                <button key={s} className="suggest-chip" disabled={conv.busy} onClick={() => actions.act(s)}>
                  {actionLabel(s, conv.route)}
                </button>
              ))}
              {suggestions.length > 4 && (
                <button className="suggest-chip suggest-more" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                  {showAll ? 'Fewer' : `More (${suggestions.length - 4})`}
                </button>
              )}
            </div>
          </div>
        )}

        <form className="composer" onSubmit={submit}>
          <button type="button" className="attach" onClick={() => actions.setAttach(true)} aria-label="Attach a document" disabled={conv.busy}>
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
              <path d="M16.5 6.5 8.4 14.6a2 2 0 0 0 2.8 2.8l7.4-7.4a4 4 0 0 0-5.7-5.7l-7.6 7.6a6 6 0 0 0 8.5 8.5l6.4-6.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={conv.optedOut ? 'You opted out. Start over to try again.' : 'Message'}
            disabled={conv.optedOut}
            aria-label="Type a message"
          />
          <button type="submit" className="send" disabled={conv.optedOut || conv.busy || !draft.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path d="M3 20.5 21 12 3 3.5l.01 6.6L15 12 3.01 13.9z" fill="currentColor" />
            </svg>
          </button>
        </form>

        {ui.attachOpen && <AttachSheet />}
      </div>
    </section>
  );
}
