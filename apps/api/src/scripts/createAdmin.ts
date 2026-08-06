import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '../../.env') })

import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

async function main() {
  const email = arg('email')?.toLowerCase().trim()
  const password = arg('password')
  const name = arg('name')

  if (!email || !password || !name) {
    console.error('Usage: pnpm create:admin -- --email=... --password=... --name="..."')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Le mot de passe doit faire au moins 8 caractères')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, name, passwordHash, role: 'SUPER_ADMIN' },
    update: { name, passwordHash, role: 'SUPER_ADMIN', active: true },
  })

  console.log(`Compte SUPER_ADMIN prêt : ${admin.email} (id: ${admin.id})`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
