import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!
const WEB_BASE_URL = process.env.WEB_BASE_URL!

export function generateOffreLink(userId: string, jobId: string): string {
  const token = jwt.sign({ userId, jobId }, JWT_SECRET, { expiresIn: '72h' })
  return `${WEB_BASE_URL}/offre/${jobId}?t=${token}`
}
