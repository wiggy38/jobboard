import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '../../.env') })

import crypto from 'crypto'

const secret = process.env.ADMIN_JWT_SECRET ?? 'change_me_in_production'
const now = Math.floor(Date.now() / 1000)

const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
const payload = Buffer.from(
  JSON.stringify({ role: 'admin', iat: now, exp: now + 86400 * 30 }),
).toString('base64url')
const signature = crypto
  .createHmac('sha256', secret)
  .update(`${header}.${payload}`)
  .digest('base64url')

const token = `${header}.${payload}.${signature}`

console.log('\nAdmin JWT token (valid 30 days):\n')
console.log(token)
console.log('\nTest avec curl:')
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:2999/admin/submissions\n`)
