import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { get } from './db'

export const JWT_SECRET = process.env.JWT_SECRET || 'dbbque_super_secure_jwt_secret_key_2026'

export interface AuthUser {
  id: number
  username: string
  name: string
  email: string | null
  role: 'admin' | 'counter' | 'ticket' | 'user'
  counter_id: number | null
  counter_name?: string | null
  is_active: number
}

export interface AuthRequest extends Request {
  user?: AuthUser
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      counter_id: user.counter_id
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  let token: string | undefined

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1]
  } else if (req.cookies && req.cookies.dbbque_token) {
    token = req.cookies.dbbque_token
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    const user = get<AuthUser>(
      'SELECT id, username, name, email, role, counter_id, is_active FROM users WHERE id = ?',
      [decoded.id]
    )

    if (!user || user.is_active === 0) {
      return res.status(401).json({ error: 'User is deactivated or does not exist' })
    }

    if (user.counter_id) {
      const counter = get<{ name: string }>('SELECT name FROM counters WHERE id = ?', [user.counter_id])
      user.counter_name = counter?.name ?? null
    }

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: role '${req.user.role}' cannot perform this action` })
    }
    next()
  }
}
