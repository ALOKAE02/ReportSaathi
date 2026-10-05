import { getReport } from '../data/reports';
import { classify, isCritical, isOutOfRange } from '../engine/classify';
import { fmtCountdown, fmtCriticalLimit, fmtRange, fmtTime, fmtValue, maskPhone, testName } from '../engine/format';
import { useActions, useNow } from '../state/DemoContext';
import type { Handoff } from '../state/store';

const AT_RISK_MS = 10 * 60_000;

export function HandoffCard({ h }: { h: Handoff }) {
  const actions = useActions();
  const now = useNow(1000);
  const report = getReport(h.reportId);
  if (!report) return null;

  const reached = h.status === 'Reached';
  const critical = h.kind === 'critical';
  const left = (h.dueAt ?? now) - now;
  const sla = reached ? 'done' : left <= 0 ? 'late' : left <= AT_RISK_MS ? 'soon' : 'ok';
  const c = classify(report);
  const crit = c.results.filter((f) => isCritical(f.flag));
  const others = c.results.filter((f) => isOutOfRange(f.flag) && !isCritical(f.flag));

  return (
    <article className={`handoff${critical || h.urgent ? ' handoff-critical' : ''}${reached ? ' handoff-done' : ''}`}>
      <header className="handoff-head">
        <div>
          <strong>
            {report.patient.name}, {report.patient.age} {report.patient.sex}
          </strong>
          <span className="muted small">
            {report.title} · {maskPhone(report.patient.phone)} · {fmtTime(h.at)}
          </span>
        </div>
        <span className={`pill ${reached ? 'pill-ok' : critical || h.urgent ? 'pill-urgent' : 'pill-soft'}`}>
          {!reached && h.urgent ? `Urgent · ${h.status}` : h.status}
        </span>
      </header>
      <p className="handoff-reason">{h.reason}</p>

      {critical && (
        <>
          <div className={`timer timer-${sla}`}>
            {reached ? (
              <span>Reached at {fmtTime(h.reachedAt!)}</span>
            ) : (
              <>
                <span className="timer-value">{fmtCountdown(left)}</span>
                <span>{sla === 'late' ? 'past the 30-minute target' : `left to call · due ${fmtTime(h.dueAt!)}`}</span>
              </>
            )}
          </div>
          <div className="for-doctor">
            <span className="small-label">For the doctor only</span>
            {crit.map(({ result: r }) => (
              <p key={r.code} className="crit-line">
                <strong>
                  {testName(r)} {fmtValue(r)}
                </strong>{' '}
                · critical limit {fmtCriticalLimit(r)} · range {fmtRange(r)}
              </p>
            ))}
            {report.previous?.map((p) => (
              <p key={p.code} className="small">
                Previous {testName({ code: p.code, value: p.value })}: {fmtValue({ code: p.code, value: p.value })}, about {p.monthsAgo} months ago
              </p>
            ))}
            {others.length > 0 && (
              <p className="small">
                Also flagged: {others.map(({ result: r, flag }) => `${testName(r)} ${fmtValue(r)} (${flag === 'HIGH' ? 'high' : 'low'})`).join(', ')}
              </p>
            )}
            {h.summary && (
              <p className="ai-draft">
                <span className="small-label">AI-prepared summary · draft, not sent to the patient</span>
                {h.summary}
              </p>
            )}
          </div>
        </>
      )}

      {!reached && (
        <div className="handoff-actions">
          {h.status === 'Waiting' && (
            <button className="btn primary small" onClick={() => actions.callHandoff(h.id)}>
              Call patient
            </button>
          )}
          {h.status === 'Calling' && (
            <>
              <span className="calling">
                <i aria-hidden="true" /> Calling… (simulated)
              </span>
              <button className="btn primary small" onClick={() => actions.markReached(h.id)}>
                Mark as reached
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
