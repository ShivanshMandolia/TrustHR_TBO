import { STATUS } from './labels.js'
// Visual lifecycle event graph: event -> impact nodes, coloured by live status.
const NODES = [
  { id: 'directory_sync', label: 'Directory sync', x: 300, y: 20 },
  { id: 'it_access_review', label: 'IT access review', x: 300, y: 85 },
  { id: 'cost_centre_review', label: 'Cost-centre review', x: 300, y: 150 },
  { id: 'reimbursement_review', label: 'Reimbursement review', x: 300, y: 215 },
  { id: 'equipment_review', label: 'Equipment review', x: 300, y: 280 },
  { id: 'manager_handover', label: 'Manager handover', x: 580, y: 20 },
]
const W = 190, H = 46
const tone = s => ({ SUCCEEDED: 'ok', ACKED: 'ok', AWAITING_ACK: 'warn', PARKED: 'bad', SKIPPED: 'mut' }[s] || 'mut')
const sub = t => !t ? 'not planned yet' : t.status === 'SKIPPED' ? 'no change needed' : (STATUS[t.status] || t.status).toLowerCase()

export default function Graph({ tasks }) {
  const by = Object.fromEntries(tasks.map(t => [t.node, t]))
  const live = tasks.length > 0
  const link = (x1, y1, x2, y2, on) =>
    <path className={on ? 'live' : ''} d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`} />
  return (
    <>
      <svg className="graph" viewBox="0 0 800 335" role="img" aria-label="Lifecycle event graph">
        {NODES.filter(n => n.id !== 'manager_handover').map(n => link(150, 160, n.x, n.y + H / 2, live && by[n.id]?.status !== 'SKIPPED'))}
        {link(300 + W, 20 + H / 2, 580, 20 + H / 2, !!by.manager_handover)}
        <g className="evt">
          <rect className="n" x="10" y="135" width="140" height="50" rx="10" />
          <text x="80" y="157" textAnchor="middle" fontWeight="600">Transferred</text>
          <text x="80" y="173" textAnchor="middle" fontSize="10">Sales → Finance</text>
        </g>
        {NODES.map(n => {
          const t = by[n.id]
          return (
            <g key={n.id} className={t ? tone(t.status) : 'mut'}>
              <rect className="n" x={n.x} y={n.y} width={W} height={H} rx="10" />
              <text x={n.x + 12} y={n.y + 20} fontWeight="600">{n.label}</text>
              <text className="sub" x={n.x + 12} y={n.y + 36}>{sub(t)}{t?.owner && t.owner !== '-' ? ` · ${t.owner}` : ''}</text>
            </g>
          )
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--ok)' }} />done</span>
        <span><i style={{ background: 'var(--warn)' }} />awaiting human</span>
        <span><i style={{ background: 'var(--bad)' }} />parked (kill switch)</span>
        <span><i style={{ background: 'var(--line)' }} />skipped / not planned</span>
      </div>
    </>
  )
}
