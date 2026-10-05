import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createActions, type Actions } from './flows';
import { createStore, type DemoState, type Store } from './store';

interface DemoContextValue {
  store: Store;
  actions: Actions;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => {
    const store = createStore();
    return { store, actions: createActions(store) };
  }, []);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

function useDemoContext(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used inside DemoProvider');
  return ctx;
}

export function useDemoState(): DemoState {
  const { store } = useDemoContext();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useActions(): Actions {
  return useDemoContext().actions;
}

/** Re-renders every `ms` so countdowns stay live. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
