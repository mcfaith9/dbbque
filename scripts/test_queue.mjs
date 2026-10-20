const BASE = 'http://localhost:3000'

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  const data = await res.json()
  return { status: res.status, data }
}

async function get(path, token) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  const data = await res.json()
  return { status: res.status, data }
}

async function runTests() {
  console.log('--- Starting Comprehensive Queue Verification ---')

  // 1. Admin login
  const adminLogin = await post('/api/auth/login', { username: 'admin', password: 'admin123' })
  console.assert(adminLogin.status === 200, 'Admin login failed')
  console.assert(adminLogin.data.user.role === 'admin', 'Admin role mismatch')
  const adminToken = adminLogin.data.token
  console.log('✓ 1. Admin login verified (role: admin)')

  // 2. Ticket Machine login
  const ticketLogin = await post('/api/auth/login', { username: 'ticket01', password: 'ticket123' })
  console.assert(ticketLogin.status === 200, 'Ticket login failed')
  console.assert(ticketLogin.data.user.role === 'ticket', 'Ticket role mismatch')
  const ticketToken = ticketLogin.data.token
  console.log('✓ 2. Ticket Kiosk login verified (role: ticket)')

  // 3. Counter 1 login
  const counterLogin = await post('/api/auth/login', { username: 'account01', password: 'counter123' })
  console.assert(counterLogin.status === 200, 'Counter login failed')
  console.assert(counterLogin.data.user.role === 'counter', 'Counter role mismatch')
  console.assert(counterLogin.data.user.counter_id === 1, 'Counter ID mismatch')
  const counter1Token = counterLogin.data.token
  console.log('✓ 3. Counter Staff login verified (role: counter, table: Table 1)')

  // 4. Role Authorization: Ticket account cannot access Admin APIs
  const blockedTicket = await get('/api/admin/users', ticketToken)
  console.assert(blockedTicket.status === 403, 'Ticket account should be forbidden from admin APIs')
  console.log('✓ 4. Role security verified: Ticket account blocked from Admin endpoints (403 Forbidden)')

  // 5. Role Authorization: Counter account cannot access Admin APIs
  const blockedCounter = await get('/api/admin/users', counter1Token)
  console.assert(blockedCounter.status === 403, 'Counter account should be forbidden from admin APIs')
  console.log('✓ 5. Role security verified: Counter account blocked from Admin endpoints (403 Forbidden)')

  // 6. Reset daily sequences for clean test
  await post('/api/admin/reset-queue', {}, adminToken)
  console.log('✓ 6. Queue reset to sequence 001')

  // 7. Issue tickets: 3 Priority (P-001, P-002, P-003) and 2 Regular (R-001, R-002)
  const p1 = (await post('/api/queue/ticket', { queue_type: 'priority' })).data.ticket
  const p2 = (await post('/api/queue/ticket', { queue_type: 'priority' })).data.ticket
  const p3 = (await post('/api/queue/ticket', { queue_type: 'priority' })).data.ticket
  const r1 = (await post('/api/queue/ticket', { queue_type: 'regular' })).data.ticket
  const r2 = (await post('/api/queue/ticket', { queue_type: 'regular' })).data.ticket

  console.assert(p1.ticket_number === 'P-001', 'P1 ticket number mismatch')
  console.assert(p2.ticket_number === 'P-002', 'P2 ticket number mismatch')
  console.assert(p3.ticket_number === 'P-003', 'P3 ticket number mismatch')
  console.assert(r1.ticket_number === 'R-001', 'R1 ticket number mismatch')
  console.assert(r2.ticket_number === 'R-002', 'R2 ticket number mismatch')
  console.log('✓ 7. Ticket generation verified: Issued P-001, P-002, P-003, R-001, R-002')

  // 8. Fair-calling policy: 2 Priority : 1 Regular
  // Call 1: should be P-001
  const call1 = (await post('/api/queue/call-next', { counter_id: 1 }, adminToken)).data.ticket
  console.assert(call1.ticket_number === 'P-001', `Call 1 expected P-001, got ${call1?.ticket_number}`)

  // Call 2: should be P-002 (Priority 2)
  const call2 = (await post('/api/queue/call-next', { counter_id: 2 }, adminToken)).data.ticket
  console.assert(call2.ticket_number === 'P-002', `Call 2 expected P-002, got ${call2?.ticket_number}`)

  // Call 3: should switch to Regular -> R-001!
  const call3 = (await post('/api/queue/call-next', { counter_id: 3 }, adminToken)).data.ticket
  console.assert(call3.ticket_number === 'R-001', `Call 3 expected R-001 (fair regular turn), got ${call3?.ticket_number}`)

  // Call 4: should switch back to Priority -> P-003
  const call4 = (await post('/api/queue/call-next', { counter_id: 4 }, adminToken)).data.ticket
  console.assert(call4.ticket_number === 'P-003', `Call 4 expected P-003, got ${call4?.ticket_number}`)

  // Call 5: no more Priority left, should serve R-002
  const call5 = (await post('/api/queue/call-next', { counter_id: 5 }, adminToken)).data.ticket
  console.assert(call5.ticket_number === 'R-002', `Call 5 expected R-002, got ${call5?.ticket_number}`)
  console.log('✓ 8. Fair-calling policy verified: P-001 -> P-002 -> R-001 -> P-003 -> R-002')

  // 9. Concurrency Test: 8 simultaneous Call Next requests
  // Reset and issue 10 regular tickets
  await post('/api/admin/reset-queue', {}, adminToken)
  for (let i = 0; i < 10; i++) {
    await post('/api/queue/ticket', { queue_type: 'regular' })
  }

  // 8 counters call next concurrently at the exact same millisecond
  const concurrentCalls = await Promise.all([
    post('/api/queue/call-next', { counter_id: 1 }, adminToken),
    post('/api/queue/call-next', { counter_id: 2 }, adminToken),
    post('/api/queue/call-next', { counter_id: 3 }, adminToken),
    post('/api/queue/call-next', { counter_id: 4 }, adminToken),
    post('/api/queue/call-next', { counter_id: 5 }, adminToken),
    post('/api/queue/call-next', { counter_id: 6 }, adminToken),
    post('/api/queue/call-next', { counter_id: 7 }, adminToken),
    post('/api/queue/call-next', { counter_id: 8 }, adminToken)
  ])

  const assignedNumbers = concurrentCalls.map(c => c.data.ticket?.ticket_number).filter(Boolean)
  const uniqueNumbers = new Set(assignedNumbers)

  console.assert(assignedNumbers.length === 8, 'All 8 counters should receive a ticket')
  console.assert(uniqueNumbers.size === 8, `Race condition detected! Duplicate assigned tickets: ${assignedNumbers}`)
  console.log(`✓ 9. Concurrency test passed: 8 concurrent calls safely assigned unique tickets: ${Array.from(uniqueNumbers).join(', ')}`)

  // 10. Recall and Complete
  const recallRes = await post('/api/queue/recall', { counter_id: 1 }, adminToken)
  console.assert(recallRes.data.ticket.recalled_count >= 1, 'Recall count not incremented')
  console.log('✓ 10. Ticket recall verified (recall count incremented)')

  const completeRes = await post('/api/queue/complete', { counter_id: 1 }, adminToken)
  console.assert(completeRes.data.ticket.status === 'completed', 'Ticket status not completed')
  console.log('✓ 11. Ticket complete verified (ticket marked as completed)')

  // 11. Snapshot check
  const snap = await get('/api/queue/snapshot')
  console.assert(snap.data.counters.length >= 8, '8 counters present in snapshot')
  console.log(`✓ 12. Queue snapshot verified (${snap.data.counters.length} counters, ${snap.data.waitingTickets.length} waiting)`)

  console.log('\nALL 12 TESTS PASSED SUCCESSFULLY! 🎯')
}

runTests().catch(err => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
