import { actionText, actorText, outcomeText, NODE, STATUS, CLASS } from './labels.js'

export const tone = s => ({ SUCCEEDED: 'ok', ACKED: 'ok', allow: 'ok', ok: 'ok', AWAITING_ACK: 'warn', require_human: 'warn',
  PARKED: 'bad', paused: 'bad', deny: 'bad', SKIPPED: 'mut', COMPLETED: 'ok', RUNNING: 'warn', 'already processed': 'warn' }[s]
  || (String(s).startsWith('BLOCKED') ? 'bad' : ''))
const icon = t => ({ ok: '✓', warn: '!', bad: '✕' }[t] || '•')

export function Card({ title, lead, children, className = '' }) {
  return <section className={'card ' + className}>{title && <h2>{title}</h2>}{lead && <p className="lead">{lead}</p>}{children}</section>
}

export function Tile({ label, value, hint, accent }) {
  return <div className={'card tile' + (accent ? ' accent' : '')}><div className="label">{label}</div><div className="val">{value}</div><div className="hint">{hint}</div></div>
}

const STEPS = ['Requested', 'Approved', 'Committed', 'Executing', 'Completed']
export function Stepper({ status }) {
  const at = { AWAITING_APPROVAL: 1, RUNNING: 3, COMPLETED: 5 }[status] ?? 0
  return (
    <div className="stepper">
      {STEPS.map((n, i) => (
        <div key={n} className={'step ' + (i < at ? 'done' : i === at ? 'active' : '')}>
          <div className="dot">{i < at ? '✓' : i + 1}</div>{n}
        </div>
      ))}
    </div>
  )
}

export function Bars({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.n))
  return rows.map(r => (
    <div className="bar" key={r.name}>
      <span className="name">{r.name}</span>
      <span className="track"><span className="fill" style={{ width: (r.n / max) * 100 + '%', background: `var(--${r.color})` }} /></span>
      <span className="n">{r.n}</span>
    </div>
  ))
}

// Explains the Recent activity list in plain English.
export function Feed({ audit }) {
  return (
    <>
      <ul className="feed">
        {audit.length === 0 && <li className="mut">Nothing has happened yet.</li>}
        {audit.slice(-6).reverse().map(a => {
          const t = tone(a.outcome)
          return (
            <li key={a.n}>
              <span className={'ico ' + t}>{icon(t)}</span>
              <div className="main">
                <div className="title">{actionText(a.action)}</div>
                <div className="meta">by {actorText(a.actor)} at {a.t} · <span className={t}>{outcomeText(a.outcome)}</span></div>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="help">
        <b>How to read this.</b> Every line is one thing that happened: <b>what</b> was done, <b>who</b> (a person or an AI agent) did it,
        and what the <b>Guardrail Gateway</b> decided.
        <div className="row">
          <span className="chip ok">Allowed · routine, safe</span>
          <span className="chip warn">Needs a human · reserved decision</span>
          <span className="chip bad">On hold / Blocked</span>
        </div>
      </div>
    </>
  )
}

export function Tasks({ tasks, onAck }) {
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Work item</th><th>Type</th><th>Owner</th><th>Status</th><th>Why</th><th /></tr></thead>
        <tbody>
          {tasks.length === 0 && <tr><td colSpan="6" className="mut">No work items yet. Raise and approve a transfer to see them appear.</td></tr>}
          {tasks.map((t, i) => (
            <tr key={i}>
              <td><b>{NODE[t.node] || t.node}</b>{t.receipt && <span className="sub">receipt {t.receipt}</span>}</td>
              <td>{CLASS[t.cls] || t.cls}</td><td>{t.owner}</td>
              <td><span className={'chip ' + tone(t.status)}>{STATUS[t.status] || t.status}</span></td>
              <td>{t.reason}</td>
              <td>{t.status === 'AWAITING_ACK' && <button className="btn sm primary" onClick={() => onAck(t.node)}>Mark as done</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Simulation({ r }) {
  if (!r) return <p className="mut">Press “Simulate v2 vs v1” to see which employees would be affected. Nothing is changed.</p>
  return (
    <>
      <div className="row" style={{ margin: '4px 0 14px' }}>
        <span className="chip warn">Finance reviews: {r.v1_reviews} → {r.v2_reviews}</span>
        <span className="chip ok">Changes made during preview: {r.writes}</span>
        <span className={'chip ' + (r.golden_v2_pass ? 'ok' : 'bad')}>Tests for v2: {r.golden_v2_pass ? 'all pass' : 'FAILING'}</span>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Employee</th><th>Open reimbursement</th><th>Group</th><th>Under v1</th><th>Under v2</th><th /></tr></thead>
        <tbody>
          {r.rows.map(x => (
            <tr key={x.emp}>
              <td>{x.emp}</td><td>₹{x.reimb}</td>
              <td>{x.status} → {x.dest} <span className="sub">{x.scope === 'in scope' ? 'included in comparison' : 'shown for coverage only'}</span></td>
              <td>{x.v1}</td><td>{x.v2}</td>
              <td>{x.changed && <span className="chip warn">new review</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  )
}

export function Audit({ audit }) {
  return (
    <div className="scroll tablewrap">
      <table>
        <thead><tr><th>#</th><th>Time</th><th>Who</th><th>What happened</th><th>Decision</th><th>Policy</th><th>Tamper-proof seal</th></tr></thead>
        <tbody>
          {[...audit].reverse().map(a => (
            <tr key={a.n}>
              <td>{a.n}</td><td>{a.t}</td><td>{actorText(a.actor)}<span className="sub"><code>{a.actor}</code></span></td>
              <td>{actionText(a.action)}<span className="sub"><code>{a.action}</code></span></td>
              <td><span className={'chip ' + tone(a.outcome)}>{outcomeText(a.outcome)}</span></td><td>{a.policy}</td>
              <td><code>{a.hash}</code><span className="sub">follows {a.prev}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
