import { useActions } from '../state/DemoContext';

const STEPS = [
  { title: 'Share your report', text: 'Forward the PDF or a photo into the chat. No app to install, no login.' },
  { title: 'Read a short brief', text: 'What looks fine comes first. Anything to note comes with its value and normal range.' },
  { title: 'Take the next step', text: 'Book a doctor call, set a re-test reminder, or talk to a person, in one tap.' },
];

const ALWAYS = [
  'Asks before it reads your report',
  'Shows each value with its normal range',
  'Tells you what looks fine first',
  'Brings in a person when it matters',
  'Deletes your report after 30 days',
];

const NEVER = [
  'Diagnose you or name a condition',
  'Suggest medicines or doses',
  'Guess a number it cannot read',
  'Discuss a critical result before a doctor calls you',
];

export function AboutPage() {
  const actions = useActions();
  return (
    <div className="page about">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">A report assistant in your chat app</p>
          <h1>Understand your lab report in 30 seconds.</h1>
          <p className="lead">
            Lab reports are full of numbers and terms. ReportSaathi reads yours and tells you, in simple words, what looks
            fine, what to note, and what to do next.
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => actions.setPage('try')}>
              Try it with a sample report
            </button>
            <button className="btn quiet" onClick={() => actions.setPage('how')}>
              How it keeps you safe
            </button>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="float-bubble main">
            <strong>Your report in 30 seconds</strong>
            <span>✓ 3 things look good</span>
            <span>● 1 thing to discuss with your doctor</span>
          </div>
          <div className="float-bubble ghost one">
            <i />
            <i className="short" />
          </div>
          <div className="float-bubble ghost two">
            <i />
            <i className="short" />
          </div>
        </div>
      </section>

      <section className="section">
        <h2>How it works</h2>
        <ol className="three-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="step-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section promise">
        <div className="promise-col">
          <h2>It will always</h2>
          <ul className="tick-list">
            {ALWAYS.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="promise-col">
          <h2>It will never</h2>
          <ul className="cross-list">
            {NEVER.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section quote">
        <blockquote>
          “Bas itna bata do — sab theek hai ya doctor ko dikhana hai?”
          <span className="quote-tr">“Just tell me: is everything fine, or should I see a doctor?”</span>
        </blockquote>
        <p className="quote-by">Ramesh, 61, retired teacher. The question every brief is built to answer.</p>
      </section>

      <div className="next-row">
        <button className="btn primary" onClick={() => actions.setPage('try')}>
          Next: try it →
        </button>
      </div>
    </div>
  );
}
