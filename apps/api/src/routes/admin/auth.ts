import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { prisma } from '../../lib/prisma'
import { adminAuth } from '../../middleware/adminAuth'

export async function adminAuthRoutes(fastify: FastifyInstance) {
  // POST /admin/auth/login
  fastify.post('/admin/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string }
    if (!body.email || !body.password) {
      return reply.status(400).send({ error: 'email et password requis' })
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    })

    if (!admin || !admin.active) {
      return reply.status(401).send({ error: 'Identifiants invalides' })
    }

    const valid = await bcrypt.compare(body.password, admin.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Identifiants invalides' })
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    const token = fastify.jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      { expiresIn: '8h' },
    )

    return reply.send({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    })
  })

  // GET /admin/auth/me
  fastify.get('/admin/auth/me', { preHandler: adminAuth }, async (request, reply) => {
    const admin = await prisma.adminUser.findUnique({ where: { id: request.admin!.sub } })
    if (!admin || !admin.active) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    return reply.send({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    })
  })

  // POST /admin/auth/logout
  fastify.post('/admin/auth/logout', { preHandler: adminAuth }, async (_request, reply) => {
    return reply.send({ ok: true })
  })
}
