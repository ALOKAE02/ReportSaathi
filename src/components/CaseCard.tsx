import { useStore } from '../state/AppContext'
import { hhmm } from '../state/store'
import type { CaseRec } from '../state/types'

const RISK_MS = 10 * 60 * 1000
const CHECKLIST = ['Confirm identity', 'Share the result', 'Advise next step per protocol', 'Record outcome']

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function CaseCard({ c, now }: { c: CaseRec; now: number }) {
  const store = useStore()
  const remaining = c.dueAt - c.skewMs - now
  const done = c.status === 'Reached'
  const level = done ? 'done' : remaining <= 0 ? 'breach' : remaining < RISK_MS ? 'risk' : 'ok'
  const retryIn = c.status === 'No answer' && c.retryAt ? Math.max(0, Math.ceil((c.retryAt - now) / 1000)) : 0

  return (
    <article className={`case ${level}`} aria-label={`Critical case ${c.visitId}`}>
      <div className="case-top">
        <div>
          <div className="case-name"><strong>{c.name}, {c.ageSex}</strong> <span className={`status s-${c.status.replace(' ', '-')}`}>{c.status}</span></div>
          <div className="muted">Visit {c.visitId} · {c.phone} · Received {hhmm(c.receivedAt)}</div>
        </div>
        <div className={`sla ${level}`}>
          {done ? (
            <>
              <span className="sla-time">Reached</span>
              <span className="sla-sub">{c.reachedAt ? `${hhmm(c.reachedAt)}${c.breached ? ' · SLA was breached' : ' · within SLA'}` : ''}</span>
            </>
          ) : (
            <>
              <span className="sla-time" aria-live="off">{remaining <= 0 ? 'SLA breached' : `SLA ${mmss(remaining)} left`}</span>
              <span className="sla-sub">{level === 'risk' ? 'At risk' : level === 'breach' ? 'Escalated to supervisor' : '30-minute protocol'}</span>
            </>
          )}
        </div>
      </div>

      <div className="critbox">
        <div><span className="tag red">Critical</span> <strong>{c.headline}</strong> <span className="muted">({c.limitText})</span></div>
        {c.previousText && <div>Previous: {c.previousText}</div>}
        {c.others.length > 0 && <div>Other flagged: {c.others.join(' · ')}</div>}
      </div>

      <div className="aibox">
        <div className="aibox-label">AI-prepared summary · draft for the clinician, not sent to the patient</div>
        <p>“{c.summary}”</p>
      </div>

      {!done && !c.historical && (
        <div className="case-actions">
          {c.status !== 'Calling' && (
            <button className="primary" onClick={() => store.callPatient(c.id)} disabled={c.status === 'No answer'}>
              📞 Call patient{c.status === 'No answer' ? ` (retry in ${retryIn}s)` : c.status === 'Retry due' ? ' (retry due)' : ''}
            </button>
          )}
          {c.attempts > 0 && <span className="muted">Attempts: {c.attempts} of 3</span>}
        </div>
      )}

      {c.status === 'Calling' && (
        <div className="call">
          <div className="ringing"><span className="dot" /> Calling {c.phone} … <em>simulated call</em></div>
          <ul className="checklist">
            {CHECKLIST.map((label, i) => (
              <li key={label}>
                <label>
                  <input type="checkbox" checked={c.checklist[i]} onChange={() => store.toggleChecklist(c.id, i)} /> {label}
                </label>
              </li>
            ))}
          </ul>
          <div className="case-actions">
            <button className="primary" onClick={() => store.markReached(c.id)}>✓ Mark as reached</button>
            <button onClick={() => store.noAnswer(c.id)}>✗ No answer</button>
          </div>
        </div>
      )}
      {c.status === 'Escalated' && !done && <div className="note">No answer after 3 attempts. Escalated to a supervisor. The case stays open.</div>}
    </article>
  )
}
