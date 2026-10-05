import { SHELF_REPORTS, type Report } from '../data/reports';
import { useActions, useDemoState } from '../state/DemoContext';
import { Phone } from './Phone';

export function DocIcon({ type }: { type: 'pdf' | 'image' }) {
  return type === 'pdf' ? (
    <svg viewBox="0 0 28 34" width="26" height="32" aria-hidden="true">
      <path d="M3 2h15l7 7v23H3z" fill="#fff" stroke="#B9CBC4" strokeWidth="1.4" />
      <path d="M18 2v7h7" fill="none" stroke="#B9CBC4" strokeWidth="1.4" />
      <rect x="3" y="20" width="22" height="9" rx="1" fill="#C98B7A" />
      <text x="14" y="27" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">PDF</text>
    </svg>
  ) : (
    <svg viewBox="0 0 30 30" width="28" height="28" aria-hidden="true">
      <rect x="2" y="4" width="26" height="22" rx="4" fill="#E7EEF3" stroke="#B5C8D6" strokeWidth="1.4" />
      <circle cx="10" cy="11" r="2.6" fill="#8FB0C6" />
      <path d="M4 23l7-7 5 5 4-3 6 5" fill="none" stroke="#7FA2BA" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function DocCard({ r, index }: { r: Report; index: number }) {
  const actions = useActions();
  const { data } = useDemoState();
  const active = data.conversation.reportId === r.id || data.conversation.pendingReportId === r.id || getRetakeParent(r.id, data.conversation.reportId);
  return (
    <button className={`doc-card${active ? ' active' : ''}`} onClick={() => actions.shareDoc(r.id)}>
      <DocIcon type={r.file.type} />
      <span className="doc-info">
        <span className="doc-title">{r.title}</span>
        <span className="doc-meta">
          {r.patient.name}, {r.patient.age} · {r.file.type === 'pdf' ? 'PDF' : 'Photo'}
        </span>
      </span>
      <span className={`tone tone-${r.tone}`}>{r.blurb}</span>
      <kbd className="key" aria-label={`Shortcut ${index + 1}`}>
        {index + 1}
      </kbd>
    </button>
  );
}

function getRetakeParent(id: string, current?: string) {
  return !!current && SHELF_REPORTS.find((r) => r.id === id)?.retakeId === current;
}

export function TryPage() {
  const { data } = useDemoState();
  const actions = useActions();
  const critical = data.handoffs.find((h) => h.id === data.conversation.handoffId && h.status !== 'Reached');

  return (
    <div className="page try">
      <div className="try-grid">
        <aside className="shelf" aria-labelledby="shelf-title">
          <h1>Try it</h1>
          <p className="lead">Share a sample report into the chat, as a patient would. Then tap a suggestion, or type a question.</p>
          <h2 id="shelf-title" className="shelf-title">Documents on this phone</h2>
          <p className="muted">Tap one to share it, or use the clip inside the chat.</p>
          <div className="doc-list">
            {SHELF_REPORTS.map((r, i) => (
              <DocCard key={r.id} r={r} index={i} />
            ))}
          </div>

          {critical ? (
            <div className="side-note urgent">
              <strong>A doctor has this report now.</strong>
              <span>The chat shares no values. The doctor calls first.</span>
              <button className="link" onClick={() => actions.setPage('how')}>
                See the handoff →
              </button>
            </div>
          ) : (
            <div className="side-note">
              <strong>Curious what happened behind the reply?</strong>
              <span>Every step and safety check is shown on the next page.</span>
              <button className="link" onClick={() => actions.setPage('how')}>
                How it works →
              </button>
            </div>
          )}
        </aside>

        <Phone />
      </div>
    </div>
  );
}
