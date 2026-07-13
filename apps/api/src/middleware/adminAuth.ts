import type { FastifyRequest, FastifyReply } from 'fastify'
import crypto from 'crypto'

export async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const token = auth.slice(7)

  // Accept ADMIN_SECRET directly (used by the web app session cookie)
  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret && token === adminSecret) {
    ;(request as any).admin = true
    return
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const [headerB64, payloadB64, signature] = parts
  const secret = process.env.ADMIN_JWT_SECRET ?? 'change_me_in_production'
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  if (expected !== signature) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  let payload: { role?: string; exp?: number }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  if (payload.role !== 'admin') {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return reply.status(401).send({ error: 'Token expired' })
  }

  ;(request as any).admin = true
}
