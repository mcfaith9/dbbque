import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { type Database } from 'sql.js'
import bcrypt from 'bcryptjs'

const DB_DIR = path.resolve(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'dbbque.sqlite')

let dbInstance: Database | null = null

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }

  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    dbInstance = new SQL.Database(fileBuffer)
  } else {
    dbInstance = new SQL.Database()
  }

  initSchema(dbInstance)
  saveDb()
  return dbInstance
}

export function saveDb(): void {
  if (!dbInstance) return
  try {
    const data = dbInstance.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(DB_PATH, buffer)
  } catch (err) {
    console.error('Failed to save SQLite database to disk:', err)
  }
}

export function query<T = any>(sqlStr: string, params: any[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized')
  const stmt = dbInstance.prepare(sqlStr)
  stmt.bind(params)
  const results: T[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return results
}

export function get<T = any>(sqlStr: string, params: any[] = []): T | undefined {
  const rows = query<T>(sqlStr, params)
  return rows[0]
}

export function run(sqlStr: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
  if (!dbInstance) throw new Error('Database not initialized')
  dbInstance.run(sqlStr, params)

  const res = dbInstance.exec('SELECT last_insert_rowid() as id, changes() as changes')
  const lastInsertRowid = res[0]?.values[0]?.[0] as number ?? 0
  const changes = res[0]?.values[0]?.[1] as number ?? 0

  saveDb()

  return { changes, lastInsertRowid }
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'counter', 'ticket', 'user')),
      counter_id INTEGER NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      current_ticket_id INTEGER NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      priority_ratio INTEGER DEFAULT 2,
      regular_ratio INTEGER DEFAULT 1,
      prefix_priority TEXT DEFAULT 'P',
      prefix_regular TEXT DEFAULT 'R',
      next_priority_seq INTEGER DEFAULT 1,
      next_regular_seq INTEGER DEFAULT 1,
      consecutive_priority_calls INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL,
      queue_type TEXT NOT NULL CHECK(queue_type IN ('priority', 'regular')),
      sequence_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('waiting', 'calling', 'serving', 'completed', 'skipped')),
      counter_id INTEGER NULL,
      counter_name TEXT NULL,
      called_by_user_id INTEGER NULL,
      created_at TEXT NOT NULL,
      called_at TEXT NULL,
      served_at TEXT NULL,
      completed_at TEXT NULL,
      recalled_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      user_id INTEGER NULL,
      created_at TEXT NOT NULL
    );
  `)

  // Ensure default queue_settings
  const settingsCheck = db.exec('SELECT count(*) as cnt FROM queue_settings WHERE id = 1')
  const settingsCount = settingsCheck[0]?.values[0]?.[0] as number
  if (!settingsCount || settingsCount === 0) {
    db.run(`
      INSERT INTO queue_settings (id, priority_ratio, regular_ratio, prefix_priority, prefix_regular, next_priority_seq, next_regular_seq, consecutive_priority_calls, updated_at)
      VALUES (1, 2, 1, 'P', 'R', 1, 1, 0, datetime('now'))
    `)
  }

  // Ensure 8 default counters
  for (let i = 1; i <= 8; i++) {
    const counterCheck = db.exec(`SELECT count(*) as cnt FROM counters WHERE id = ${i}`)
    const cnt = counterCheck[0]?.values[0]?.[0] as number
    if (!cnt || cnt === 0) {
      db.run(`
        INSERT INTO counters (id, name, code, is_active, current_ticket_id, updated_at)
        VALUES (${i}, 'Table ${i}', 'T${i}', 1, NULL, datetime('now'))
      `)
    }
  }

  // Seed default accounts if users table is empty
  const userCheck = db.exec('SELECT count(*) as cnt FROM users')
  const userCount = userCheck[0]?.values[0]?.[0] as number

  if (!userCount || userCount === 0) {
    const saltRounds = 10
    const adminHash = bcrypt.hashSync('admin123', saltRounds)
    const ticketHash = bcrypt.hashSync('ticket123', saltRounds)
    const counterHash = bcrypt.hashSync('counter123', saltRounds)

    // Admin
    db.run(`
      INSERT INTO users (username, name, email, password_hash, role, counter_id, is_active, created_at)
      VALUES ('admin', 'System Administrator', 'admin@example.com', '${adminHash}', 'admin', NULL, 1, datetime('now'))
    `)

    // Ticket Machine
    db.run(`
      INSERT INTO users (username, name, email, password_hash, role, counter_id, is_active, created_at)
      VALUES ('ticket01', 'Ticket Kiosk 01', 'kiosk01@example.com', '${ticketHash}', 'ticket', NULL, 1, datetime('now'))
    `)

    // 8 Counter Staff Accounts
    for (let i = 1; i <= 8; i++) {
      const uname = `account0${i}`
      db.run(`
        INSERT INTO users (username, name, email, password_hash, role, counter_id, is_active, created_at)
        VALUES ('${uname}', 'Staff Member ${i}', '${uname}@example.com', '${counterHash}', 'counter', ${i}, 1, datetime('now'))
      `)
    }
  }
}
