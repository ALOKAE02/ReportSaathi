import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Store } from './store'

const Ctx = createContext<Store | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new Store())
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('AppProvider missing')
  return s
}

export function useSnap() {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

// Re-render once a second so countdowns and toasts stay live.
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}
