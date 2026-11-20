import { useEffect, useState, useCallback } from 'react'
import { call } from './api.js'
import { Card, Tile, Stepper, Bars, Feed, Tasks, Simulation, Audit } from './components.jsx'
import { CASE } from './labels.js'
import Graph from './Graph.jsx'
import Chat from './Chat.jsx'

const VIEWS = [
  ['dashboard', '▦ Dashboard', 'Dashboard', 'Your overview: what is happening, what needs you, and what to do next.'],
  ['chat', '✉ Assistant', 'Assistant', 'Ask in plain English. The assistant can raise requests, but people make the important decisions.'],
  ['graph', '⬡ Event Graph', 'Event Graph', 'See how one employee change turns into work for IT, Finance, the directory and the new manager.'],
  ['policy', '⚖ Policies', 'Policy Simulator', 'Preview how changing a rule affects people before it goes live.'],
  ['audit', '⛓ Audit Log', 'Audit Log', 'A tamper-evident record of everything that happened. Each entry is sealed to the one before it.'],
]
const THEMES = [['classic', 'Classic'], ['dark', 'Dark']]
const load = (k, d) => { try { const v = localStorage.getItem(k); return THEMES.some(t => t[0] === v) ? v : d } catch { return d } }

export default function App() {
  const [s, setS] = useState(null)
  const [view, setView] = useState('dashboard')
  const [theme, setTheme] = useState(() => load('trusthr-theme', 'classic'))
  const [sim, setSim] = useState(null)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('trusthr-theme', theme) } catch { /* ignore */ }
  }, [theme])

  const refresh = useCallback(async () => { const st = await call('state'); setS(st); return st }, [])
  useEffect(() => { refresh().catch(() => setS(false)) }, [refresh])

  const toast = (text, kind = '') => {
    const id = Math.random(); setToasts(t => [...t, { id, text, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500)
  }
  const act = async (path, body = {}, quiet) => {
    const r = await call(path, body)
    if (!quiet) toast(r.verdict ? `Gateway said ${r.verdict.replace('_', ' ').toUpperCase()}: ${r.msg}` : r.msg || 'Done', r.verdict && r.verdict !== 'allow' ? 'warn' : '')
    await refresh(); return r
  }
  const simulate = async () => setSim(await call('simulate', {}))

  if (s === false) return <p style={{ padding: 24 }}>The backend is not running. Start it with <code>python3 demo/server.py</code>, then refresh.</p>
  if (!s) return <p style={{ padding: 24 }}>Loading…</p>

  const v = a => s.audit.filter(x => x.outcome === a).length
  const auto = s.tasks.filter(t => t.status === 'SUCCEEDED').length
  const human = s.tasks.filter(t => t.status === 'ACKED').length
  const rate = auto + human ? Math.round((auto / (auto + human)) * 100) + '%' : 'N/A'
  const waiting = s.tasks.filter(t => t.status === 'AWAITING_ACK').length
  const cur = VIEWS.find(x => x[0] === view)
  const ack = node => act('ack', { node })

  // Guided "what do I do next" banner
  const next = !s.case
    ? { n: 1, h: 'Start by raising a transfer', p: 'A manager asks to move employee E-104 from Sales to Finance.', b: 'Raise transfer', go: () => act('request') }
    : s.case.status === 'AWAITING_APPROVAL'
      ? { n: 2, h: 'HR needs to approve', p: 'AI agents cannot approve this: transfers are a reserved decision for a named human.', b: 'Approve as HR', go: () => act('approve') }
      : waiting > 0
        ? { n: 3, h: `${waiting} team task${waiting > 1 ? 's are' : ' is'} waiting`, p: 'Open the Event Graph to see the work created from the transfer, then mark each task as done.', b: 'Open Event Graph', go: () => setView('graph') }
        : s.case.status === 'COMPLETED'
          ? { n: 4, h: 'Transfer complete. Now try changing a policy', p: 'Preview what a rule change would do before it goes live.', b: 'Open Policies', go: () => setView('policy') }
          : { n: 3, h: 'Work is running', p: 'The workflow is dispatching tasks.', b: 'Open Event Graph', go: () => setView('graph') }

  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="logo">✦</span>TrustHR</div>
        <nav className="tabs" aria-label="Main">
          {VIEWS.map(([id, label]) => (
            <button key={id} className={'tab' + (view === id ? ' on' : '')} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}>
              {label}{id === 'graph' && waiting > 0 && <span className="badge">{waiting}</span>}
            </button>
          ))}
        </nav>
        <div className="actions">
          <button className={'btn sm ' + (s.paused ? 'primary' : 'danger')} title="Stops AI agents from doing any new work until resumed" onClick={() => act('pause', { on: !s.paused })}>
            {s.paused ? '▶ Resume automation' : '⏸ Pause automation'}
          </button>
          <button className="btn sm" onClick={() => { setSim(null); act('reset') }}>Reset demo</button>
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map(([id, n]) => <button key={id} className={theme === id ? 'on' : ''} onClick={() => setTheme(id)}>{n}</button>)}
          </div>
        </div>
      </header>

      <main className="page">
        <div className="pagehead"><h1>{cur[2]}</h1><p>{cur[3]}</p></div>

        {view === 'dashboard' && (
          <div className="stack">
            <div className="hero">
              <span className="num">{next.n}</span>
              <div className="txt"><h2>{next.h}</h2><p>{next.p}</p></div>
              <button className="btn primary" onClick={next.go}>{next.b} →</button>
            </div>
            {s.paused && <div className="hero" style={{ background: 'var(--bad-bg)', borderColor: 'var(--bad)' }}><div className="txt"><h2>Automation is paused</h2><p>New work from AI agents is being held for a human. Press Resume automation to release it.</p></div></div>}
            <div className="grid g-4">
              <Tile accent label="Transfer case" value={s.case ? CASE[s.case.status] : 'No case yet'} hint={s.case ? `${s.case.id} · Sales → Finance` : 'Raise a transfer to begin'} />
              <Tile label="Work items created" value={s.task_count} hint={`${s.receipts} sent to other systems exactly once`} />
              <Tile label="Handled automatically" value={rate} hint={`${auto} by AI · ${human} by people`} />
              <Tile label="Waiting on people" value={waiting} hint={`${s.approvals.length} approval(s) requested`} />
            </div>
            <Card title="Case progress" lead="Where the transfer is in its lifecycle.">
              <Stepper status={s.case?.status} />
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn primary" onClick={() => act('request')}>Raise transfer</button>
                <button className="btn primary" onClick={() => act('approve')}>Approve as HR</button>
                <button className="btn" title="Sends the same event again to prove no duplicate work is created" onClick={() => act('redeliver')}>Send duplicate event</button>
                <button className="btn danger" title="An AI agent tries a reserved action; the gateway should refuse" onClick={() => act('agent_role_change')}>Let an agent change a role</button>
                <button className="btn" title="Re-run the original decision under the policy version that was active then" onClick={() => act('replay')}>Replay original decision</button>
              </div>
            </Card>
            <div className="grid g-main">
              <Card title="Work created by this transfer" lead="Each row is a task for IT, Finance, the directory or the new manager."><Tasks tasks={s.tasks} onAck={ack} /></Card>
              <div className="stack">
                <Card title="Recent activity" lead="The latest things that happened, newest first."><Feed audit={s.audit} /></Card>
                <Card title="Guardrail decisions" lead="How often the gateway let work through or stopped it.">
                  <Bars rows={[
                    { name: 'Allowed', n: v('allow'), color: 'ok' }, { name: 'Needs a human', n: v('require_human'), color: 'warn' },
                    { name: 'On hold', n: v('paused'), color: 'bad' }, { name: 'Blocked', n: v('deny'), color: 'bad' }]} />
                </Card>
              </div>
            </div>
          </div>
        )}

        {view === 'chat' && (
          <div className="grid g-main">
            <Card title="Chat with the HR assistant"><Chat s={s} act={act} goto={setView} /></Card>
            <div className="stack">
              <Card title="Live case"><Stepper status={s.case?.status} /></Card>
              <Card title="Work items"><Tasks tasks={s.tasks} onAck={ack} /></Card>
            </div>
          </div>
        )}

        {view === 'graph' && (
          <div className="grid g-main">
            <Card title="How the change spreads" lead="The transfer on the left triggers each box on the right. Dashed boxes need no action.">
              <Graph tasks={s.tasks} />
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn primary" onClick={() => act('approve')}>Approve as HR</button>
                <button className="btn" onClick={() => act('redeliver')}>Send duplicate event</button>
              </div>
            </Card>
            <Card title="Work items" lead="Press “Mark as done” when a team has finished its task."><Tasks tasks={s.tasks} onAck={ack} /></Card>
          </div>
        )}

        {view === 'policy' && (
          <div className="stack">
            <div className="grid g-2">
              {Object.values(s.policies).map(p => (
                <Card key={p.version} title={`Reimbursement rule ${p.version}${s.active === p.version ? ' (in force)' : ' (draft)'}`}>
                  <p style={{ margin: '6px 0 12px' }}>{p.text}</p>
                  <span className={'chip ' + (s.golden[p.version] ? 'ok' : 'bad')}>Built-in tests: {s.golden[p.version] ? 'passing' : 'failing'}</span>
                </Card>
              ))}
            </div>
            <Card title="Preview a policy change" lead="Compare the old and new rule on the same employees. This is read-only and creates no tasks.">
              <div className="row" style={{ marginBottom: 14 }}>
                <button className="btn primary" onClick={simulate}>Simulate v2 vs v1</button>
                <button className="btn" onClick={() => act('activate', { version: 'v2' })}>Make v2 live</button>
                <button className="btn danger" title="Edits v2 so one of its tests fails, to show activation being blocked" onClick={() => act('break_policy')}>Break a v2 test (demo)</button>
              </div>
              <Simulation r={sim} />
            </Card>
          </div>
        )}

        {view === 'audit' && <Card title="Everything that happened" lead="Plain-English description first, technical name underneath."><Audit audit={s.audit} /></Card>}
      </main>

      <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}</div>
    </>
  )
}
