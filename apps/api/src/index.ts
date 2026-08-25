import 'dotenv/config'
import Fastify from 'fastify'
import fjwt from '@fastify/jwt'
import fformbody from '@fastify/formbody'
import fcors from '@fastify/cors'
import { offreRoutes } from './offre.routes'
import { subscribeRoutes } from './subscribe.routes'
import { adminRoutes } from './admin.routes'
import { submissionRoutes } from './routes/admin/submissions'
import { scoutRoutes } from './routes/admin/scouts'
import { fraudRoutes } from './routes/admin/fraud'
import { userRoutes } from './routes/admin/users'
import { adminAuthRoutes } from './routes/admin/auth'
import { adminUserRoutes } from './routes/admin/admin-users'
import { settingsRoutes } from './routes/admin/settings'
import { referenceRoutes } from './routes/reference'
import path from 'path'

const app = Fastify({ logger: true })

const ALLOWED_ORIGINS = [
  'https://backoffice.tumaajob.com',
  'https://app.tumaajob.com',
  'https://www.tumaajob.com',
  'https://tumaajob.com',
  /^http:\/\/localhost:\d+$/,
]

app.register(fcors, {
  origin: ALLOWED_ORIGINS,
  credentials: true,
})
app.register(fjwt, {
  secret: process.env.TOKEN_SECRET ?? 'changeme',
})
app.register(fformbody)

app.get('/health', async () => ({ status: 'ok' }))

app.register(offreRoutes)
app.register(subscribeRoutes)
app.register(adminAuthRoutes)
app.register(adminUserRoutes)
app.register(adminRoutes)
app.register(submissionRoutes)
app.register(scoutRoutes)
app.register(fraudRoutes)
app.register(userRoutes)
app.register(settingsRoutes)
app.register(referenceRoutes)

const start = async () => {
  if (process.env.NODE_ENV === 'production') {
    const fastifyStatic = (await import('@fastify/static')).default
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../../web/dist'),
      prefix: '/',
    })
    app.setNotFoundHandler((req, reply) => {
      if (!req.url.startsWith('/api') && !req.url.startsWith('/admin')) {
        reply.sendFile('index.html')
      } else {
        reply.status(404).send({ error: 'Not found' })
      }
    })
  }

  try {
    await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
