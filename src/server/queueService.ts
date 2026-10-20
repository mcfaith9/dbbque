import { query, get, run } from './db'

export interface Ticket {
  id: number
  ticket_number: string
  queue_type: 'priority' | 'regular'
  sequence_number: number
  status: 'waiting' | 'calling' | 'serving' | 'completed' | 'skipped'
  counter_id: number | null
  counter_name: string | null
  called_by_user_id: number | null
  created_at: string
  called_at: string | null
  served_at: string | null
  completed_at: string | null
  recalled_count: number
}

export interface Counter {
  id: number
  name: string
  code: string
  is_active: number
  current_ticket_id: number | null
  updated_at: string
  current_ticket?: Ticket | null
  assigned_user?: { id: number; name: string; username: string } | null
}

export interface QueueSettings {
  id: number
  priority_ratio: number
  regular_ratio: number
  prefix_priority: string
  prefix_regular: string
  next_priority_seq: number
  next_regular_seq: number
  consecutive_priority_calls: number
  updated_at: string
}

// In-process lock to serialize concurrent "Call Next" operations safely
let callLock: Promise<any> = Promise.resolve()

function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const next = callLock.then(fn, fn)
  callLock = next
  return next
}

export function getQueueSettings(): QueueSettings {
  const row = get<QueueSettings>('SELECT * FROM queue_settings WHERE id = 1')
  if (!row) {
    throw new Error('Queue settings not found')
  }
  return row
}

export function updateQueueSettings(settings: Partial<QueueSettings>, userId?: number): QueueSettings {
  const current = getQueueSettings()
  const priorityRatio = settings.priority_ratio ?? current.priority_ratio
  const regularRatio = settings.regular_ratio ?? current.regular_ratio
  const prefixPriority = settings.prefix_priority ?? current.prefix_priority
  const prefixRegular = settings.prefix_regular ?? current.prefix_regular

  run(
    `UPDATE queue_settings SET
      priority_ratio = ?,
      regular_ratio = ?,
      prefix_priority = ?,
      prefix_regular = ?,
      updated_at = datetime('now')
    WHERE id = 1`,
    [priorityRatio, regularRatio, prefixPriority, prefixRegular]
  )

  run(
    `INSERT INTO audit_logs (action, details, user_id, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    ['UPDATE_SETTINGS', JSON.stringify({ priorityRatio, regularRatio, prefixPriority, prefixRegular }), userId ?? null]
  )

  return getQueueSettings()
}

export function resetQueueSequences(userId?: number): QueueSettings {
  run(
    `UPDATE queue_settings SET
      next_priority_seq = 1,
      next_regular_seq = 1,
      consecutive_priority_calls = 0,
      updated_at = datetime('now')
    WHERE id = 1`
  )

  run(
    `UPDATE counters SET current_ticket_id = NULL, updated_at = datetime('now')`
  )

  run(
    `UPDATE tickets SET status = 'skipped', completed_at = datetime('now') WHERE status IN ('waiting', 'calling', 'serving')`
  )

  run(
    `INSERT INTO audit_logs (action, details, user_id, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    ['RESET_DAILY_QUEUE', 'Reset queue sequences and cleared in-progress tickets', userId ?? null]
  )

  return getQueueSettings()
}

export function generateTicket(queueType: 'priority' | 'regular'): Ticket {
  const settings = getQueueSettings()
  let seq = queueType === 'priority' ? settings.next_priority_seq : settings.next_regular_seq
  const prefix = queueType === 'priority' ? settings.prefix_priority : settings.prefix_regular

  const formattedSeq = String(seq).padStart(3, '0')
  const ticketNumber = `${prefix}-${formattedSeq}`

  // Insert ticket
  const insertRes = run(
    `INSERT INTO tickets (ticket_number, queue_type, sequence_number, status, created_at)
     VALUES (?, ?, ?, 'waiting', datetime('now'))`,
    [ticketNumber, queueType, seq]
  )

  // Increment sequence
  if (queueType === 'priority') {
    run(`UPDATE queue_settings SET next_priority_seq = ? WHERE id = 1`, [seq + 1])
  } else {
    run(`UPDATE queue_settings SET next_regular_seq = ? WHERE id = 1`, [seq + 1])
  }

  const created = get<Ticket>('SELECT * FROM tickets WHERE id = ?', [insertRes.lastInsertRowid])
  if (!created) {
    throw new Error('Failed to retrieve created ticket')
  }

  run(
    `INSERT INTO audit_logs (action, details, user_id, created_at)
     VALUES (?, ?, NULL, datetime('now'))`,
    ['GENERATE_TICKET', JSON.stringify({ ticketNumber, queueType, id: created.id })]
  )

  return created
}

export function callNextTicket(counterId: number, userId: number): Promise<{ ticket: Ticket | null; message?: string }> {
  return withLock(async () => {
    const counter = get<Counter>('SELECT * FROM counters WHERE id = ?', [counterId])
    if (!counter) {
      throw new Error(`Counter #${counterId} not found`)
    }

    // If counter already has an active ticket, complete it automatically before taking next
    if (counter.current_ticket_id) {
      const activeTicket = get<Ticket>('SELECT * FROM tickets WHERE id = ?', [counter.current_ticket_id])
      if (activeTicket && (activeTicket.status === 'calling' || activeTicket.status === 'serving')) {
        run(
          `UPDATE tickets SET status = 'completed', completed_at = datetime('now') WHERE id = ?`,
          [activeTicket.id]
        )
      }
      run(`UPDATE counters SET current_ticket_id = NULL, updated_at = datetime('now') WHERE id = ?`, [counterId])
    }

    const settings = getQueueSettings()
    const priorityWaiting = query<Ticket>(
      `SELECT * FROM tickets WHERE queue_type = 'priority' AND status = 'waiting' ORDER BY id ASC`
    )
    const regularWaiting = query<Ticket>(
      `SELECT * FROM tickets WHERE queue_type = 'regular' AND status = 'waiting' ORDER BY id ASC`
    )

    if (priorityWaiting.length === 0 && regularWaiting.length === 0) {
      return { ticket: null, message: 'No tickets currently waiting in queue' }
    }

    let selectedTicket: Ticket | null = null
    let newConsecutivePriority = settings.consecutive_priority_calls

    // Fair calling logic:
    // If consecutive priority calls is below the priority ratio, give priority tickets preference
    if (newConsecutivePriority < settings.priority_ratio) {
      if (priorityWaiting.length > 0) {
        selectedTicket = priorityWaiting[0]
        newConsecutivePriority += 1
      } else if (regularWaiting.length > 0) {
        selectedTicket = regularWaiting[0]
        newConsecutivePriority = 0
      }
    } else {
      // Priority turn completed, give regular tickets turn
      if (regularWaiting.length > 0) {
        selectedTicket = regularWaiting[0]
        newConsecutivePriority = 0
      } else if (priorityWaiting.length > 0) {
        selectedTicket = priorityWaiting[0]
        newConsecutivePriority = 1
      }
    }

    if (!selectedTicket) {
      return { ticket: null, message: 'No suitable ticket found' }
    }

    // Atomic assignment of selected ticket to counter
    run(
      `UPDATE tickets SET
        status = 'calling',
        counter_id = ?,
        counter_name = ?,
        called_by_user_id = ?,
        called_at = datetime('now')
      WHERE id = ? AND status = 'waiting'`,
      [counter.id, counter.name, userId, selectedTicket.id]
    )

    // Update counter's current ticket
    run(
      `UPDATE counters SET current_ticket_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [selectedTicket.id, counter.id]
    )

    // Update settings consecutive count
    run(
      `UPDATE queue_settings SET consecutive_priority_calls = ?, updated_at = datetime('now') WHERE id = 1`,
      [newConsecutivePriority]
    )

    const updatedTicket = get<Ticket>('SELECT * FROM tickets WHERE id = ?', [selectedTicket.id])

    run(
      `INSERT INTO audit_logs (action, details, user_id, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      ['CALL_NEXT', JSON.stringify({ ticketId: selectedTicket.id, ticketNumber: selectedTicket.ticket_number, counterId, counterName: counter.name }), userId]
    )

    return { ticket: updatedTicket ?? null }
  })
}

export function recallTicket(counterId: number, userId: number): Ticket {
  const counter = get<Counter>('SELECT * FROM counters WHERE id = ?', [counterId])
  if (!counter || !counter.current_ticket_id) {
    throw new Error('Counter does not have an active ticket to recall')
  }

  const ticket = get<Ticket>('SELECT * FROM tickets WHERE id = ?', [counter.current_ticket_id])
  if (!ticket) {
    throw new Error('Active ticket not found')
  }

  run(
    `UPDATE tickets SET
      recalled_count = recalled_count + 1,
      called_at = datetime('now')
    WHERE id = ?`,
    [ticket.id]
  )

  run(
    `INSERT INTO audit_logs (action, details, user_id, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    ['RECALL_TICKET', JSON.stringify({ ticketId: ticket.id, ticketNumber: ticket.ticket_number, counterId }), userId]
  )

  return get<Ticket>('SELECT * FROM tickets WHERE id = ?', [ticket.id])!
}

export function startServingTicket(counterId: number, userId: number): Ticket {
  const counter = get<Counter>('SELECT * FROM counters WHERE id = ?', [counterId])
  if (!counter || !counter.current_ticket_id) {
    throw new Error('Counter does not have an active ticket')
  }

  run(
    `UPDATE tickets SET status = 'serving', served_at = datetime('now') WHERE id = ?`,
    [counter.current_ticket_id]
  )

  run(
    `INSERT INTO audit_logs (action, details, user_id, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    ['START_SERVING', JSON.stringify({ ticketId: counter.current_ticket_id, counterId }), userId]
  )

  return get<Ticket>('SELECT * FROM tickets WHERE id = ?', [counter.current_ticket_id])!
}

export function completeTicket(counterId: number, userId: number): Ticket {
  const counter = get<Counter>('SELECT * FROM counters WHERE id = ?', [counterId])
  if (!counter || !counter.current_ticket_id) {
    throw new Error('Counter does not have an active ticket to complete')
  }

  const ticketId = counter.current_ticket_id

  run(
    `UPDATE tickets SET status = 'completed', completed_at = datetime('now') WHERE id = ?`,
    [ticketId]
  )

  run(
    `UPDATE counters SET current_ticket_id = NULL, updated_at = datetime('now') WHERE id = ?`,
    [counterId]
  )

  run(
    `INSERT INTO audit_logs (action, details, user_id, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    ['COMPLETE_TICKET', JSON.stringify({ ticketId, counterId }), userId]
  )

  return get<Ticket>('SELECT * FROM tickets WHERE id = ?', [ticketId])!
}

export function skipTicket(counterId: number, userId: number): Ticket {
  const counter = get<Counter>('SELECT * FROM counters WHERE id = ?', [counterId])
  if (!counter || !counter.current_ticket_id) {
    throw new Error('Counter does not have an active ticket to skip')
  }

  const ticketId = counter.current_ticket_id

  run(
    `UPDATE tickets SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`,
    [ticketId]
  )

  run(
    `UPDATE counters SET current_ticket_id = NULL, updated_at = datetime('now') WHERE id = ?`,
    [counterId]
  )

  run(
    `INSERT INTO audit_logs (action, details, user_id, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    ['SKIP_TICKET', JSON.stringify({ ticketId, counterId }), userId]
  )

  return get<Ticket>('SELECT * FROM tickets WHERE id = ?', [ticketId])!
}

export function getQueueSnapshot() {
  const settings = getQueueSettings()
  const waitingTickets = query<Ticket>(
    `SELECT * FROM tickets WHERE status = 'waiting' ORDER BY id ASC`
  )
  const callingTickets = query<Ticket>(
    `SELECT * FROM tickets WHERE status IN ('calling', 'serving') ORDER BY called_at DESC`
  )
  const recentCompleted = query<Ticket>(
    `SELECT * FROM tickets WHERE status IN ('completed', 'skipped') ORDER BY completed_at DESC LIMIT 10`
  )

  const counters = query<Counter>(`SELECT * FROM counters ORDER BY id ASC`).map(c => {
    let current_ticket: Ticket | null = null
    if (c.current_ticket_id) {
      current_ticket = get<Ticket>('SELECT * FROM tickets WHERE id = ?', [c.current_ticket_id]) ?? null
    }
    const user = get<{ id: number; name: string; username: string }>(
      'SELECT id, name, username FROM users WHERE counter_id = ? AND is_active = 1 LIMIT 1',
      [c.id]
    )
    return {
      ...c,
      current_ticket,
      assigned_user: user ?? null
    }
  })

  const priorityWaitingCount = waitingTickets.filter(t => t.queue_type === 'priority').length
  const regularWaitingCount = waitingTickets.filter(t => t.queue_type === 'regular').length
  const totalWaiting = waitingTickets.length
  const totalCompleted = query<{ cnt: number }>(`SELECT count(*) as cnt FROM tickets WHERE status = 'completed'`)[0]?.cnt ?? 0

  return {
    settings,
    waitingTickets,
    callingTickets,
    recentCompleted,
    counters,
    stats: {
      totalWaiting,
      priorityWaitingCount,
      regularWaitingCount,
      totalCompleted
    }
  }
}
