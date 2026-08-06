import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { prisma } from '../../lib/prisma'
import { adminAuth, requireRole, type AdminRole } from '../../middleware/adminAuth'

const ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'EDITOR']

function toPublic(admin: {
  id: string
  email: string
  name: string
  role: string
  active: boolean
  lastLoginAt: Date | null
  createdAt: Date
}) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    active: admin.active,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
  }
}

export async function adminUserRoutes(fastify: FastifyInstance) {
  const guard = [adminAuth, requireRole('SUPER_ADMIN')]

  // GET /admin/admin-users
  fastify.get('/admin/admin-users', { preHandler: guard }, async (_request, reply) => {
    const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } })
    return reply.send(admins.map(toPublic))
  })

  // POST /admin/admin-users
  fastify.post('/admin/admin-users', { preHandler: guard }, async (request, reply) => {
    const body = request.body as {
      email?: string
      name?: string
      password?: string
      role?: string
    }

    if (!body.email || !body.name || !body.password || !body.role) {
      return reply.status(400).send({ error: 'email, name, password et role requis' })
    }
    if (!ROLES.includes(body.role as AdminRole)) {
      return reply.status(400).send({ error: 'role invalide' })
    }
    if (body.password.length < 8) {
      return reply.status(400).send({ error: 'Le mot de passe doit faire au moins 8 caractères' })
    }

    const email = body.email.toLowerCase().trim()
    const existing = await prisma.adminUser.findUnique({ where: { email } })
    if (existing) {
      return reply.status(409).send({ error: 'Cet email est déjà utilisé' })
    }

    const passwordHash = await bcrypt.hash(body.password, 10)
    const admin = await prisma.adminUser.create({
      data: { email, name: body.name, passwordHash, role: body.role as AdminRole },
    })

    return reply.status(201).send(toPublic(admin))
  })

  // PATCH /admin/admin-users/:id
  fastify.patch('/admin/admin-users/:id', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      name?: string
      role?: string
      active?: boolean
      password?: string
    }

    const target = await prisma.adminUser.findUnique({ where: { id } })
    if (!target) {
      return reply.status(404).send({ error: 'Compte introuvable' })
    }

    if (body.role && !ROLES.includes(body.role as AdminRole)) {
      return reply.status(400).send({ error: 'role invalide' })
    }

    const demotingOrDeactivating =
      (body.role && body.role !== 'SUPER_ADMIN' && target.role === 'SUPER_ADMIN') ||
      (body.active === false && target.active)

    if (demotingOrDeactivating && target.role === 'SUPER_ADMIN') {
      const activeSuperAdmins = await prisma.adminUser.count({
        where: { role: 'SUPER_ADMIN', active: true },
      })
      if (activeSuperAdmins <= 1) {
        return reply
          .status(400)
          .send({ error: 'Impossible de retirer le dernier compte SUPER_ADMIN actif' })
      }
    }

    if (id === request.admin!.sub && (body.active === false || (body.role && body.role !== 'SUPER_ADMIN'))) {
      return reply.status(400).send({ error: 'Vous ne pouvez pas modifier votre propre rôle/statut' })
    }

    const data: Record<string, unknown> = {}
    if (body.name) data.name = body.name
    if (body.role) data.role = body.role
    if (typeof body.active === 'boolean') data.active = body.active
    if (body.password) {
      if (body.password.length < 8) {
        return reply.status(400).send({ error: 'Le mot de passe doit faire au moins 8 caractères' })
      }
      data.passwordHash = await bcrypt.hash(body.password, 10)
    }

    const updated = await prisma.adminUser.update({ where: { id }, data })
    return reply.send(toPublic(updated))
  })
}
