import { useEffect, useRef, useState } from 'react'
import { hhmm } from '../state/store'
import { useSnap, useStore } from '../state/AppContext'
import type { ChatMessage } from '../state/types'

function Ticks({ t }: { t?: ChatMessage['ticks'] }) {
  if (!t) return null
  return (
    <span className={t === 'read' ? 'ticks read' : 'ticks'} aria-label={t}>
      {t === 'sent' ? '✓' : '✓✓'}
    </span>
  )
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.from === 'system') {
    return (
      <div className="sys-wrap">
        <div className="sys">{m.text}</div>
      </div>
    )
  }
  const out = m.from === 'patient'
  return (
    <div className={`row ${out ? 'out' : 'in'}`}>
      <div className={`bubble ${out ? 'out' : 'in'} ${m.kind === 'critical' ? 'critical' : ''} ${m.kind === 'status' && m.templateId === 'CRIT-02' ? 'statusbar' : ''} ${m.superseded ? 'superseded' : ''}`}>
        {m.superseded && <div className="sup-tag">Superseded by a correction</div>}
        {m.attachment && (
          <div className="attach">
            <span className="pdf-icon small" aria-hidden>PDF</span>
            <span>{m.attachment}</span>
          </div>
        )}
        {m.text && m.text.split('\n').map((line, i) => (line.trim() === '' ? <div key={i} className="gap" /> : <p key={i}>{line}</p>))}
        <div className="meta">
          {hhmm(m.ts)} <Ticks t={m.ticks} />
        </div>
      </div>
      {m.chip && <div className="chip">{m.chip}</div>}
    </div>
  )
}

export function PhoneChat() {
  const store = useStore()
  const { state, ui } = useSnap()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const lastUsed = state.messages[state.messages.length - 1]?.usedReplies?.length
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [state.messages.length, ui.typing, lastUsed])

  // Offer the unused quick replies of the most recent message that has any.
  const lastWithReplies = [...state.messages].reverse().find((m) => m.quickReplies && m.quickReplies.length > 0)
  const replies = lastWithReplies?.quickReplies?.filter((q) => !lastWithReplies.usedReplies?.includes(q.id)) ?? []

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    store.sendText(text)
    setText('')
  }

  return (
    <div className="phone" role="region" aria-label="Patient chat">
      <div className="phone-head">
        <div className="avatar" aria-hidden>RC</div>
        <div>
          <strong>Report Companion (AI assistant)</strong>
          <small>Demo Diagnostics Lab · automated</small>
        </div>
      </div>
      <div className="chat">
        {state.messages.map((m) => (
          <Bubble key={m.uid} m={m} />
        ))}
        {ui.typing && (
          <div className="row in">
            <div className="bubble in typing" aria-label="Assistant is typing"><i /><i /><i /></div>
          </div>
        )}
        {replies.length > 0 && lastWithReplies && (
          <div className="quick">
            {replies.map((q) => (
              <button key={q.id} onClick={() => store.tapReply(lastWithReplies.uid, q.id)}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={state.stopped ? 'You are opted out. Reset to restart.' : 'Type a message'}
          disabled={state.stopped}
          aria-label="Message"
        />
        <button type="submit" disabled={state.stopped || !text.trim()} aria-label="Send">➤</button>
      </form>
    </div>
  )
}
