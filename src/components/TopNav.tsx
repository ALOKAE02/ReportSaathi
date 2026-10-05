import { useActions, useDemoState } from '../state/DemoContext';
import type { Page } from '../state/store';

const LINKS: { page: Page; label: string }[] = [
  { page: 'about', label: 'What it is' },
  { page: 'try', label: 'Try it' },
  { page: 'how', label: 'How it works' },
];

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#5F8F81" />
      <path d="M9 11.5c0-1.9 1.6-3.5 3.5-3.5h7c1.9 0 3.5 1.6 3.5 3.5v5c0 1.9-1.6 3.5-3.5 3.5H15l-3.6 3v-3A3.5 3.5 0 0 1 9 16.5z" fill="#F6F8F5" />
      <path d="M13 13.5l2 2 4-4" fill="none" stroke="#5F8F81" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TopNav() {
  const { ui, data } = useDemoState();
  const actions = useActions();
  const waiting = data.handoffs.filter((h) => (h.kind === 'critical' || h.urgent) && h.status !== 'Reached').length;

  return (
    <header className="topnav">
      <button className="brand" onClick={() => actions.setPage('about')}>
        <Logo />
        <span>ReportSaathi</span>
      </button>
      <nav className="steps-nav" aria-label="Pages">
        {LINKS.map((l, i) => (
          <button
            key={l.page}
            className={`nav-link${ui.page === l.page ? ' active' : ''}`}
            aria-current={ui.page === l.page ? 'page' : undefined}
            onClick={() => actions.setPage(l.page)}
          >
            <span className="nav-num">{i + 1}</span>
            {l.label}
            {l.page === 'how' && waiting > 0 && <span className="nav-dot" aria-label="An urgent handoff is waiting" />}
          </button>
        ))}
      </nav>
      <button className="reset" onClick={actions.reset} title="Start the demo again (R)">
        Start over
      </button>
    </header>
  );
}
