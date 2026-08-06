import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR'

export interface AdminJwtPayload {
  sub: string
  email: string
  role: AdminRole
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminJwtPayload
  }
}

export async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = await request.jwtVerify<AdminJwtPayload>()
    if (!payload.role || !payload.sub) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    request.admin = payload
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}

export function requireRole(...roles: AdminRole[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.admin || !roles.includes(request.admin.role)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}
