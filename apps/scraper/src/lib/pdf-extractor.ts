import axios from 'axios'
import { PDFParse } from 'pdf-parse'

/**
 * Télécharge un PDF et en extrait le texte brut. Utilisé par les scrapers
 * dont la source structure ses annonces en pièce jointe PDF plutôt qu'en
 * champs texte exploitables (ex: sica-api.anpe.bj/offresExternes).
 */
export async function extractTextFromPdfUrl(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 20_000,
    headers,
    // sica-api.anpe.bj renvoie un en-tête Content-Security-Policy dupliqué et
    // replié (obsolete line folding) que le parseur HTTP strict de Node
    // rejette (HPE_INVALID_HEADER_TOKEN) — curl et les navigateurs le tolèrent.
    insecureHTTPParser: true,
  } as never)

  const buffer = Buffer.from(response.data)
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}
