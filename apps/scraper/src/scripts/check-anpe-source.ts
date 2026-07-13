import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const updated = await prisma.source.updateMany({
    where: { name: 'anpe-bf' },
    data: { isActive: true, emptyRuns: 0, crawlErrors: 0 },
  })
  console.log(`Reactivated ${updated.count} source(s)`)
  const sources = await prisma.source.findMany({ where: { name: { contains: 'anpe' } } })
  console.log(JSON.stringify(sources, null, 2))
}
main().finally(() => prisma.$disconnect())
