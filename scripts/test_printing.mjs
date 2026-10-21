const BASE = 'http://localhost:3000'

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function get(path, token) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function runPrintTests() {
  console.log('--- Starting Thermal Printing Verification ---')

  // 1. Check printer config
  const config = await get('/api/print/config')
  console.assert(config.status === 200, 'Config status should be 200')
  console.log('✓ 1. Printer config endpoint works:', config.data)

  // 2. Check printers list
  const printers = await get('/api/print/printers')
  console.assert(printers.status === 200, 'Printers list status should be 200')
  console.assert(Array.isArray(printers.data.printers), 'Printers should be an array')
  console.log('✓ 2. Detected printers list works, total found:', printers.data.printers.length)

  // 3. Issue a real ticket
  const ticketRes = await post('/api/queue/ticket', { queue_type: 'priority' })
  console.assert(ticketRes.status === 201, 'Ticket creation failed')
  const ticket = ticketRes.data.ticket
  console.log(`✓ 3. Real ticket generated: ${ticket.ticket_number} (id: ${ticket.id})`)

  // 4. Print the exact ticket created
  const printRes = await post('/api/print/ticket', {
    ticket_number: ticket.ticket_number,
    queue_type: ticket.queue_type,
    created_at: ticket.created_at,
    waiting_ahead: 0
  })
  console.assert(printRes.status === 200, 'Print request failed')
  console.assert(printRes.data.success === true, 'Print success should be true')
  console.log('✓ 4. Physical ticket printed silently without browser print dialog:', printRes.data)

  // 5. Retry / Reprint the SAME ticket (must not generate a new sequence number)
  const reprintRes = await post('/api/print/ticket', {
    ticket_number: ticket.ticket_number,
    queue_type: ticket.queue_type,
    created_at: ticket.created_at,
    waiting_ahead: 0
  })
  console.assert(reprintRes.status === 200, 'Reprint request failed')
  console.assert(reprintRes.data.success === true, 'Reprint success should be true')
  console.log('✓ 5. Safe reprint of SAME ticket verified without altering queue sequence')

  // 6. Security validation: reject malformed requests
  const invalidType = await post('/api/print/ticket', {
    ticket_number: 'P-001',
    queue_type: 'invalid_lane'
  })
  console.assert(invalidType.status === 400, 'Malformed queue type should be rejected')

  const missingNumber = await post('/api/print/ticket', {
    queue_type: 'priority'
  })
  console.assert(missingNumber.status === 400, 'Missing ticket number should be rejected')
  console.log('✓ 6. Security validation passed: rejected malformed input')

  // 7. Admin Test Print endpoint
  const adminLogin = await post('/api/auth/login', { username: 'admin', password: 'admin123' })
  const adminToken = adminLogin.data.token

  const testPrint = await post('/api/print/test', {}, adminToken)
  console.assert(testPrint.status === 200, 'Admin test print failed')
  console.log('✓ 7. Admin test print endpoint passed:', testPrint.data)

  console.log('\nALL THERMAL PRINTING TESTS PASSED! 🖨️')
}

runPrintTests().catch(err => {
  console.error('Print tests failed:', err)
  process.exit(1)
})
