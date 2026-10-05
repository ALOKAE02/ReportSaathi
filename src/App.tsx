import { useEffect } from 'react';
import { AboutPage } from './components/AboutPage';
import { HowPage } from './components/HowPage';
import { TopNav } from './components/TopNav';
import { TryPage } from './components/TryPage';
import { SHELF_REPORTS } from './data/reports';
import { useActions, useDemoState } from './state/DemoContext';
import type { Page } from './state/store';

const PAGES: Page[] = ['about', 'try', 'how'];

export function App() {
  const { ui } = useDemoState();
  const actions = useActions();

  // Keep the address bar in step with the page, so #try and #how can be opened directly.
  useEffect(() => {
    const fromHash = () => {
      const page = window.location.hash.replace('#', '') as Page;
      if (PAGES.includes(page)) actions.setPage(page);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [actions]);

  useEffect(() => {
    if (window.location.hash !== `#${ui.page}`) window.history.replaceState(null, '', `#${ui.page}`);
    window.scrollTo({ top: 0 });
  }, [ui.page]);

  // Presenter shortcuts: 1–5 share a document, R resets.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SHELF_REPORTS.length) actions.shareDoc(SHELF_REPORTS[n - 1].id);
      else if (e.key.toLowerCase() === 'r') actions.reset();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  return (
    <div className="app">
      <TopNav />
      <main className="main">
        {ui.page === 'about' && <AboutPage />}
        {ui.page === 'try' && <TryPage />}
        {ui.page === 'how' && <HowPage />}
      </main>
      <footer className="footer">Demo with fictional patients and data. Not medical advice. Concept product, not affiliated with any messaging app.</footer>
    </div>
  );
}
