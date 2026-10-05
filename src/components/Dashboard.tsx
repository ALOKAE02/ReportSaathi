import { useNow, useSnap, useStore } from '../state/AppContext'
import { EXPLANATION_TEMPLATE_IDS, getTemplate } from '../engine/templates'
import { hhmm } from '../state/store'
import { CaseCard, mmss } from './CaseCard'

export function Dashboard() {
  const store = useStore()
  const { state, ui } = useSnap()
  const now = useNow()

  const live = state.cases.filter((c) => !c.historical)
  const closed = state.cases.filter((c) => c.historical || c.status === 'Reached')
  const open = live.filter((c) => c.status !== 'Reached')
  const withinSla = state.cases.length ? Math.round((state.cases.filter((c) => !c.breached).length / state.cases.length) * 100) : 100
  const openCallbacks = state.callbacks.filter((c) => !c.done)
  const count = (k: string) => state.callbacks.filter((c) => c.kind === k).length

  const exportAudit = () => {
    const blob = new Blob([JSON.stringify(state.audit.map((a) => ({ ...a, time: new Date(a.ts).toISOString() })), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'report-companion-audit.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <main className="dash">
      <div className="counts">
        <div><strong>Critical today: {2 + live.length}</strong><span>Within SLA: {withinSla}%</span><em>demo data</em></div>
        <div><strong>{openCallbacks.length}</strong><span>Open advisor callbacks</span></div>
        <div><strong>{count('not-helpful')}</strong><span>👎 Not helpful</span></div>
        <div><strong>{count('call-me')}</strong><span>📞 Call me</span></div>
      </div>

      <div className="killswitch">
        <label className="switch">
          <input type="checkbox" checked={state.paused.all} onChange={(e) => store.setPaused(e.target.checked)} />
          <span><strong>Pause AI explanations</strong> (whole service)</span>
        </label>
        {EXPLANATION_TEMPLATE_IDS.map((id) => (
          <label key={id} className="switch small">
            <input type="checkbox" checked={!!state.paused.templates[id]} onChange={(e) => store.setTemplatePaused(id, e.target.checked)} />
            <span>Pause {id} · {getTemplate(id)?.name}</span>
          </label>
        ))}
        <span className="muted">The critical path is always human and is not affected.</span>
      </div>

      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={ui.dashTab === 'queue'} className={ui.dashTab === 'queue' ? 'on' : ''} onClick={() => store.setUi({ dashTab: 'queue' })}>Queue</button>
        <button role="tab" aria-selected={ui.dashTab === 'audit'} className={ui.dashTab === 'audit' ? 'on' : ''} onClick={() => store.setUi({ dashTab: 'audit' })}>Audit ({state.audit.length})</button>
      </div>

      {ui.dashTab === 'queue' ? (
        <div className="grid2">
          <section>
            <h2>Critical queue</h2>
            {open.length === 0 && <div className="empty">No open critical cases. Pick the 🔴 report in the patient view to send one.</div>}
            {open.map((c) => <CaseCard key={c.id} c={c} now={now} />)}
            <h3>Closed today</h3>
            {closed.map((c) =>
              c.historical ? (
                <div className="closed-row" key={c.id}>
                  <span>✓ {c.name}, {c.ageSex} · {c.visitId} · {c.headline}</span>
                  <span className="muted">Received {hhmm(c.receivedAt)} · reached in {mmss((c.reachedAt ?? 0) - c.receivedAt)} (demo)</span>
                </div>
              ) : (
                <CaseCard key={c.id} c={c} now={now} />
              ),
            )}
          </section>
          <section>
            <h2>Advisor callbacks <span className="muted small">non-urgent unless marked</span></h2>
            {state.callbacks.length === 0 && <div className="empty">No callbacks yet.</div>}
            {state.callbacks.map((cb) => (
              <div key={cb.id} className={`cb ${cb.urgent ? 'urgent' : ''} ${cb.done ? 'done' : ''}`}>
                <div>
                  {cb.urgent && <span className="tag red">Urgent</span>} <strong>{cb.firstName}</strong> · {cb.visitId}
                  <div className="muted">{cb.reason} · {hhmm(cb.ts)}</div>
                </div>
                {!cb.done ? <button onClick={() => store.doneCallback(cb.id)}>Mark done</button> : <span className="muted">Done</span>}
              </div>
            ))}
          </section>
        </div>
      ) : (
        <section>
          <div className="audit-head">
            <h2>Audit log</h2>
            <button onClick={exportAudit}>Export JSON</button>
          </div>
          <p className="muted">Names and phone numbers are never written here. Identifiers are visit IDs only.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Report</th><th>Route</th><th>Template</th><th>Checks</th><th>Action / note</th></tr></thead>
              <tbody>
                {[...state.audit].reverse().map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.ts).toLocaleTimeString('en-GB')}</td>
                    <td>{a.reportId}</td>
                    <td>{a.route}</td>
                    <td>{a.templateId ? `${a.templateId} v${a.version}` : ''}</td>
                    <td className={a.checks?.startsWith('FAIL') ? 'bad' : ''}>{a.checks ?? ''}</td>
                    <td>{[a.action, a.note].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
                {state.audit.length === 0 && <tr><td colSpan={6} className="muted">Nothing logged yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
