import http from 'node:http'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { Server as SocketIOServer } from 'socket.io'
import bcrypt from 'bcryptjs'
import { getDb, query, get, run } from './src/server/db'
import {
  generateTicket,
  callNextTicket,
  recallTicket,
  startServingTicket,
  completeTicket,
  skipTicket,
  getQueueSnapshot,
  getQueueSettings,
  updateQueueSettings,
  resetQueueSequences
} from './src/server/queueService'
import {
  authMiddleware,
  requireRole,
  generateToken,
  AuthRequest,
  AuthUser
} from './src/server/auth'
import {
  printTicketSilently,
  getInstalledPrinters,
  getConfiguredPrinter,
  setConfiguredPrinter,
  formatTicketText
} from './src/server/printService'

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const isProd = process.env.NODE_ENV === 'production'

async function startServer() {
  await getDb()
  const app = express()
  const httpServer = http.createServer(app)

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  app.use(express.json())
  app.use(cookieParser())

  // Socket.IO real-time handlers
  io.on('connection', (socket) => {
    socket.emit('queue:snapshot_updated', getQueueSnapshot())

    socket.on('queue:get_snapshot', () => {
      socket.emit('queue:snapshot_updated', getQueueSnapshot())
    })

    socket.on('disconnect', () => {
      // client disconnected
    })
  })

  function broadcastSnapshot() {
    io.emit('queue:snapshot_updated', getQueueSnapshot())
  }

  function broadcastAnnouncement(payload: { ticket_number: string; counter_name: string; queue_type: string; isRecall?: boolean }) {
    io.emit('queue:ticket_called', payload)
  }

  // --- Auth Routes ---
  app.post('/api/auth/login', (req, res) => {
    try {
      const { username, password } = req.body
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' })
      }

      const user = get<any>(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username.trim(), username.trim()]
      )

      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' })
      }

      if (user.is_active === 0) {
        return res.status(403).json({ error: 'This account has been deactivated' })
      }

      const isMatch = bcrypt.compareSync(password, user.password_hash)
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password' })
      }

      let counter_name: string | null = null
      if (user.counter_id) {
        const counter = get<{ name: string }>('SELECT name FROM counters WHERE id = ?', [user.counter_id])
        counter_name = counter?.name ?? null
      }

      const authUser: AuthUser = {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        counter_id: user.counter_id,
        counter_name,
        is_active: user.is_active
      }

      const token = generateToken(authUser)

      res.cookie('dbbque_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
      })

      return res.json({ token, user: authUser })
    } catch (err: any) {
      console.error('Login error:', err)
      return res.status(500).json({ error: 'Internal server error during login' })
    }
  })

  app.post('/api/auth/signup', (req, res) => {
    try {
      const { username, name, email, password } = req.body
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' })
      }

      const uname = (username || email.split('@')[0]).trim().toLowerCase()
      const existing = get('SELECT id FROM users WHERE username = ? OR email = ?', [uname, email])
      if (existing) {
        return res.status(400).json({ error: 'Username or email already in use' })
      }

      const hash = bcrypt.hashSync(password, 10)
      // Public signup is strictly non-privileged ('user' role)
      const result = run(
        `INSERT INTO users (username, name, email, password_hash, role, counter_id, is_active, created_at)
         VALUES (?, ?, ?, ?, 'user', NULL, 1, datetime('now'))`,
        [uname, name, email, hash]
      )

      const newUser: AuthUser = {
        id: result.lastInsertRowid,
        username: uname,
        name,
        email,
        role: 'user',
        counter_id: null,
        is_active: 1
      }

      const token = generateToken(newUser)
      res.cookie('dbbque_token', token, { httpOnly: true, sameSite: 'lax' })

      return res.json({ token, user: newUser })
    } catch (err: any) {
      console.error('Signup error:', err)
      return res.status(500).json({ error: 'Internal server error during registration' })
    }
  })

  app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res) => {
    res.json({ user: req.user })
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('dbbque_token')
    res.json({ message: 'Logged out successfully' })
  })

  // --- Queue Public / Display / Kiosk Routes ---
  app.get('/api/queue/snapshot', (_req, res) => {
    res.json(getQueueSnapshot())
  })

  app.post('/api/queue/ticket', (req, res) => {
    try {
      const { queue_type } = req.body
      if (queue_type !== 'priority' && queue_type !== 'regular') {
        return res.status(400).json({ error: "Invalid queue_type. Must be 'priority' or 'regular'" })
      }

      const ticket = generateTicket(queue_type)
      broadcastSnapshot()
      io.emit('queue:ticket_created', ticket)

      res.status(201).json({ ticket })
    } catch (err: any) {
      console.error('Create ticket error:', err)
      res.status(500).json({ error: err.message || 'Failed to generate ticket' })
    }
  })

  // --- Automatic Physical Ticket Printing Endpoints ---
  app.post('/api/print/ticket', async (req, res) => {
    try {
      const { ticket_number, queue_type, created_at, waiting_ahead } = req.body

      // 1. Strict input validation
      if (!ticket_number || typeof ticket_number !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing or invalid ticket_number' })
      }
      if (queue_type !== 'priority' && queue_type !== 'regular') {
        return res.status(400).json({ success: false, message: 'Invalid queue_type' })
      }

      // 2. Dispatch silent print to Windows printer spooler
      const result = await printTicketSilently({
        ticket_number: ticket_number.trim(),
        queue_type,
        created_at: String(created_at || new Date().toISOString()),
        waiting_ahead: typeof waiting_ahead === 'number' ? waiting_ahead : undefined
      })

      if (result.success) {
        return res.json(result)
      } else {
        return res.status(502).json(result)
      }
    } catch (err: any) {
      console.error('[dbbque] Print endpoint error:', err)
      return res.status(500).json({ success: false, message: err?.message || 'Internal printing service error' })
    }
  })

  app.get('/api/print/config', (_req, res) => {
    res.json({
      configuredPrinter: getConfiguredPrinter() || 'Default Windows Printer',
      isWindows: process.platform === 'win32'
    })
  })

  app.get('/api/print/printers', async (_req, res) => {
    try {
      const printers = await getInstalledPrinters()
      res.json({
        printers,
        configuredPrinter: getConfiguredPrinter() || 'Default Windows Printer',
        isWindows: process.platform === 'win32'
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list printers' })
    }
  })

  app.post('/api/print/config', authMiddleware, requireRole('admin'), (req: AuthRequest, res) => {
    try {
      const { printer_name } = req.body
      setConfiguredPrinter(typeof printer_name === 'string' ? printer_name : '')
      res.json({
        message: 'Printer configuration updated',
        configuredPrinter: getConfiguredPrinter() || 'Default Windows Printer'
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update printer config' })
    }
  })

  app.post('/api/print/test', authMiddleware, requireRole('admin'), async (_req: AuthRequest, res) => {
    try {
      const result = await printTicketSilently({
        ticket_number: 'TEST-001',
        queue_type: 'priority',
        created_at: new Date().toISOString(),
        waiting_ahead: 0
      })
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Test print failed' })
    }
  })

  // --- Counter Staff Queue Operations ---
  app.post('/api/queue/call-next', authMiddleware, requireRole('counter', 'admin'), async (req: AuthRequest, res) => {
    try {
      const counterId = req.user?.role === 'counter'
        ? req.user.counter_id
        : (req.body.counter_id || req.user?.counter_id)

      if (!counterId) {
        return res.status(400).json({ error: 'No counter assigned to this account. Please select or assign a counter.' })
      }

      const result = await callNextTicket(counterId, req.user!.id)
      broadcastSnapshot()

      if (result.ticket) {
        broadcastAnnouncement({
          ticket_number: result.ticket.ticket_number,
          counter_name: result.ticket.counter_name || `Counter ${counterId}`,
          queue_type: result.ticket.queue_type,
          isRecall: false
        })
      }

      res.json(result)
    } catch (err: any) {
      console.error('Call next error:', err)
      res.status(500).json({ error: err.message || 'Failed to call next ticket' })
    }
  })

  app.post('/api/queue/recall', authMiddleware, requireRole('counter', 'admin'), (req: AuthRequest, res) => {
    try {
      const counterId = req.user?.role === 'counter'
        ? req.user.counter_id
        : (req.body.counter_id || req.user?.counter_id)

      if (!counterId) {
        return res.status(400).json({ error: 'No counter assigned to this account' })
      }

      const ticket = recallTicket(counterId, req.user!.id)
      broadcastSnapshot()

      broadcastAnnouncement({
        ticket_number: ticket.ticket_number,
        counter_name: ticket.counter_name || `Counter ${counterId}`,
        queue_type: ticket.queue_type,
        isRecall: true
      })

      res.json({ ticket })
    } catch (err: any) {
      console.error('Recall ticket error:', err)
      res.status(500).json({ error: err.message || 'Failed to recall ticket' })
    }
  })

  app.post('/api/queue/start-serving', authMiddleware, requireRole('counter', 'admin'), (req: AuthRequest, res) => {
    try {
      const counterId = req.user?.role === 'counter'
        ? req.user.counter_id
        : (req.body.counter_id || req.user?.counter_id)

      if (!counterId) {
        return res.status(400).json({ error: 'No counter assigned' })
      }

      const ticket = startServingTicket(counterId, req.user!.id)
      broadcastSnapshot()
      res.json({ ticket })
    } catch (err: any) {
      console.error('Start serving error:', err)
      res.status(500).json({ error: err.message || 'Failed to start serving ticket' })
    }
  })

  app.post('/api/queue/complete', authMiddleware, requireRole('counter', 'admin'), (req: AuthRequest, res) => {
    try {
      const counterId = req.user?.role === 'counter'
        ? req.user.counter_id
        : (req.body.counter_id || req.user?.counter_id)

      if (!counterId) {
        return res.status(400).json({ error: 'No counter assigned' })
      }

      const ticket = completeTicket(counterId, req.user!.id)
      broadcastSnapshot()
      res.json({ ticket })
    } catch (err: any) {
      console.error('Complete ticket error:', err)
      res.status(500).json({ error: err.message || 'Failed to complete ticket' })
    }
  })

  app.post('/api/queue/skip', authMiddleware, requireRole('counter', 'admin'), (req: AuthRequest, res) => {
    try {
      const counterId = req.user?.role === 'counter'
        ? req.user.counter_id
        : (req.body.counter_id || req.user?.counter_id)

      if (!counterId) {
        return res.status(400).json({ error: 'No counter assigned' })
      }

      const ticket = skipTicket(counterId, req.user!.id)
      broadcastSnapshot()
      res.json({ ticket })
    } catch (err: any) {
      console.error('Skip ticket error:', err)
      res.status(500).json({ error: err.message || 'Failed to skip ticket' })
    }
  })

  // --- Admin Endpoints ---
  app.get('/api/admin/users', authMiddleware, requireRole('admin'), (_req, res) => {
    const users = query(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.counter_id, u.is_active, u.created_at, c.name as counter_name
       FROM users u
       LEFT JOIN counters c ON u.counter_id = c.id
       ORDER BY u.id ASC`
    )
    res.json({ users })
  })

  app.post('/api/admin/users', authMiddleware, requireRole('admin'), (req: AuthRequest, res) => {
    try {
      const { username, name, email, password, role, counter_id } = req.body
      if (!username || !name || !password || !role) {
        return res.status(400).json({ error: 'Missing required user fields' })
      }

      const existing = get('SELECT id FROM users WHERE username = ?', [username.trim()])
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' })
      }

      const hash = bcrypt.hashSync(password, 10)
      const result = run(
        `INSERT INTO users (username, name, email, password_hash, role, counter_id, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
        [username.trim(), name, email || null, hash, role, counter_id || null]
      )

      broadcastSnapshot()
      res.status(201).json({ id: result.lastInsertRowid, message: 'User created successfully' })
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create user' })
    }
  })

  app.put('/api/admin/users/:id', authMiddleware, requireRole('admin'), (req: AuthRequest, res) => {
    try {
      const userId = Number(req.params.id)
      const { name, email, role, counter_id, is_active, password } = req.body

      const user = get('SELECT * FROM users WHERE id = ?', [userId])
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      if (password && password.trim()) {
        const hash = bcrypt.hashSync(password.trim(), 10)
        run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId])
      }

      run(
        `UPDATE users SET
          name = COALESCE(?, name),
          email = COALESCE(?, email),
          role = COALESCE(?, role),
          counter_id = ?,
          is_active = COALESCE(?, is_active)
        WHERE id = ?`,
        [name, email, role, counter_id !== undefined ? counter_id : user.counter_id, is_active, userId]
      )

      broadcastSnapshot()
      res.json({ message: 'User updated successfully' })
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update user' })
    }
  })

  app.get('/api/admin/counters', authMiddleware, requireRole('admin'), (_req, res) => {
    const counters = query(
      `SELECT c.*, u.name as assigned_staff_name, u.username as assigned_staff_username
       FROM counters c
       LEFT JOIN users u ON u.counter_id = c.id AND u.is_active = 1
       ORDER BY c.id ASC`
    )
    res.json({ counters })
  })

  app.post('/api/admin/counters', authMiddleware, requireRole('admin'), (req, res) => {
    try {
      const { name, code } = req.body
      if (!name || !code) {
        return res.status(400).json({ error: 'Name and code are required' })
      }

      const result = run(
        `INSERT INTO counters (name, code, is_active, updated_at) VALUES (?, ?, 1, datetime('now'))`,
        [name.trim(), code.trim().toUpperCase()]
      )

      broadcastSnapshot()
      res.status(201).json({ id: result.lastInsertRowid, message: 'Counter created successfully' })
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create counter' })
    }
  })

  app.put('/api/admin/counters/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
      const counterId = Number(req.params.id)
      const { name, code, is_active } = req.body

      run(
        `UPDATE counters SET
          name = COALESCE(?, name),
          code = COALESCE(?, code),
          is_active = COALESCE(?, is_active),
          updated_at = datetime('now')
        WHERE id = ?`,
        [name, code ? code.toUpperCase() : null, is_active, counterId]
      )

      broadcastSnapshot()
      res.json({ message: 'Counter updated successfully' })
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update counter' })
    }
  })

  app.get('/api/admin/history', authMiddleware, requireRole('admin'), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const tickets = query<any>(
      `SELECT t.*, u.name as called_by_name
       FROM tickets t
       LEFT JOIN users u ON t.called_by_user_id = u.id
       ORDER BY t.id DESC
       LIMIT ?`,
      [limit]
    )
    res.json({ tickets })
  })

  app.get('/api/admin/audit-logs', authMiddleware, requireRole('admin'), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const logs = query(
      `SELECT a.*, u.name as user_name, u.username
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.id DESC
       LIMIT ?`,
      [limit]
    )
    res.json({ logs })
  })

  app.get('/api/admin/settings', authMiddleware, requireRole('admin'), (_req, res) => {
    res.json({ settings: getQueueSettings() })
  })

  app.post('/api/admin/settings', authMiddleware, requireRole('admin'), (req: AuthRequest, res) => {
    try {
      const updated = updateQueueSettings(req.body, req.user?.id)
      broadcastSnapshot()
      res.json({ settings: updated, message: 'Queue settings updated' })
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update settings' })
    }
  })

  app.post('/api/admin/reset-queue', authMiddleware, requireRole('admin'), (req: AuthRequest, res) => {
    try {
      const updated = resetQueueSequences(req.user?.id)
      broadcastSnapshot()
      res.json({ settings: updated, message: 'Queue sequences reset successfully' })
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to reset queue' })
    }
  })

  // --- Vite Dev or Production Static Handler ---
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true
      },
      appType: 'spa'
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.resolve(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`[dbbque] Server listening on http://${HOST}:${PORT}`)
  })
}

startServer().catch((err) => {
  console.error('[dbbque] Fatal startup error:', err)
  process.exit(1)
})
