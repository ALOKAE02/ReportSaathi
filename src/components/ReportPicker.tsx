import { DEMO_REPORT_IDS, REPORTS } from '../data/reports'
import { useSnap, useStore } from '../state/AppContext'

export function ReportPicker() {
  const store = useStore()
  const { state } = useSnap()
  return (
    <section className="panel picker" aria-label="Demo reports">
      <h2>Choose a demo report</h2>
      <p className="muted">Tap a card to upload it in the chat. Keys 1, 2, 3.</p>
      {DEMO_REPORT_IDS.map((id, i) => {
        const r = REPORTS[id]
        return (
          <button
            key={id}
            className={`pdf-card ${state.activeReportId === id ? 'selected' : ''}`}
            onClick={() => store.pickReport(id)}
            disabled={state.stopped}
          >
            <span className="pdf-icon" aria-hidden>PDF</span>
            <span className="pdf-body">
              <span className="pdf-title">
                <span aria-hidden>{r.dot}</span> {r.label}
              </span>
              <span className="pdf-meta">{r.visitId} · {r.patient.first} {r.patient.last}, {r.patient.age} {r.patient.sex}</span>
              <span className="pdf-meta">{r.blurb}</span>
            </span>
            <kbd>{i + 1}</kbd>
          </button>
        )
      })}
      <p className="muted small">
        Keys: <kbd>D</kbd> dashboard · <kbd>P</kbd> patient · <kbd>R</kbd> reset
      </p>
    </section>
  )
}
