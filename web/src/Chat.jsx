import { useEffect, useRef, useState } from 'react'

const HELLO = { from: 'bot', text: 'Hi! I am the HR assistant. I can raise a transfer, show status, or explain what the gateway does. Try a suggestion below.' }
const SUGGEST = ['Move E-104 from Sales to Finance', 'Approve the transfer', 'Change E-104 role to Finance Analyst', 'What is the status?', 'Simulate policy v2']

export default function Chat({ s, act, goto }) {
  const [msgs, setMsgs] = useState([HELLO])
  const [text, setText] = useState('')
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  const push = (from, t) => setMsgs(m => [...m, { from, text: t }])

  async function send(raw) {
    const q = raw.trim(); if (!q) return
    push('me', q); setText('')
    const l = q.toLowerCase()
    if (/role|salary|grade/.test(l)) {
      const r = await act('agent_role_change', {}, true)
      push('bot', `I tried that as an agent and the Guardrail Gateway answered ${r.verdict.toUpperCase()}: ${r.msg}. A named HR approver must decide this.`)
    } else if (/approve/.test(l)) {
      const r = await act('approve', {}, true)
      push('bot', `Acting as the named HR approver (human path). ${r.msg}. Watch the Event Graph tab.`)
    } else if (/move|transfer/.test(l)) {
      const r = await act('request', {}, true)
      push('bot', `Understood: E-104, Sales → Finance, effective on the demo date.\n${r.msg}`)
    } else if (/status|where|progress/.test(l)) {
      if (!s.case) return push('bot', 'There is no open case yet.')
      const open = s.tasks.filter(t => t.status === 'AWAITING_ACK').map(t => t.node)
      push('bot', `Case ${s.case.id} is ${s.case.status}.${open.length ? `\nWaiting on humans: ${open.join(', ')}.` : ''}`)
    } else if (/simulat|policy|v2/.test(l)) {
      push('bot', 'Opening the Policy Simulator so you can compare v1 and v2 on the same snapshot.'); goto('policy')
    } else if (/pause|kill/.test(l)) {
      await act('pause', { on: true }, true); push('bot', 'Kill switch ON. New dispatches will park.')
    } else if (/resume/.test(l)) {
      await act('pause', { on: false }, true); push('bot', 'Resumed. Parked work is released.')
    } else {
      push('bot', 'I can raise a transfer, approve it, check status, simulate a policy, or try a blocked role change.')
    }
  }

  return (
    <div className="chat">
      <div className="msgs">
        {msgs.map((m, i) => (
          <div key={i} className={'bubble ' + m.from}><span className="who">{m.from === 'bot' ? 'HR assistant' : 'You'}</span>{m.text}</div>
        ))}
        <div ref={end} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {SUGGEST.map(x => <button key={x} className="btn sm" onClick={() => send(x)}>{x}</button>)}
      </div>
      <form className="compose" onSubmit={e => { e.preventDefault(); send(text) }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a request…" aria-label="Message" />
        <button className="btn primary" type="submit">Send</button>
      </form>
    </div>
  )
}
