// Plain-English labels for the technical names the backend uses.
export const ACTION = {
  reset: 'Demo was reset',
  'transfer.request': 'Transfer requested',
  'hr.change_role': 'Role change attempted',
  'hr.commit_transfer': 'Transfer saved to the HR record',
  'payroll.change_salary': 'Salary change attempted',
  'directory.update_manager': "Manager updated in the company directory",
  'it.open_ticket': 'IT access-review ticket opened',
  'notify.manager': 'New manager notified',
  'finance.open_task': 'Finance task opened',
  'event.redelivered': 'Duplicate event received',
  'task.ack': 'Task acknowledged by its owner',
  'case.complete': 'Case completed',
  kill_switch: 'Automation pause switch changed',
  'policy.activate': 'Policy activation attempted',
}
export const ACTOR = {
  system: 'System', 'agent:runner': 'Workflow agent', 'agent:intake': 'Chat agent',
  'user:manager': 'Manager', 'human:hr.approver': 'HR approver', 'human:hr.admin': 'HR admin',
}
export const OUTCOME = {
  allow: 'Allowed', require_human: 'Needs a human', paused: 'On hold', deny: 'Blocked',
  ok: 'Done', 'already processed': 'Ignored (duplicate)', 'case created': 'Case created',
}
export const NODE = {
  directory_sync: 'Directory sync', it_access_review: 'IT access review', manager_handover: 'Manager handover',
  cost_centre_review: 'Cost-centre review', reimbursement_review: 'Reimbursement review', equipment_review: 'Equipment review',
}
export const STATUS = {
  SUCCEEDED: 'Done', ACKED: 'Done', AWAITING_ACK: 'Waiting for team', PARKED: 'On hold', SKIPPED: 'Not needed', PENDING: 'Queued',
}
export const CLASS = { initiate: 'Automatic', review: 'Human review', 'leave unchanged': 'No change needed' }
export const CASE = { AWAITING_APPROVAL: 'Awaiting approval', RUNNING: 'In progress', COMPLETED: 'Completed' }

export const actionText = a => ACTION[a] || a
export const actorText = a => ACTOR[a] || (a.startsWith('human:') ? a.slice(6) + ' team' : a)
export const outcomeText = o => OUTCOME[o] || (o.startsWith('BLOCKED') ? 'Blocked: a test failed' : o)
