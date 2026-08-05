/**
 * bing-grounding.ts
 *
 * Encapsule l'accès à "Grounding with Bing Search" (Azure AI Foundry Agent
 * Service) — remplace l'ancienne Bing Search API (Azure Cognitive Services),
 * retirée par Microsoft. Contrairement à l'ancienne API, il n'existe pas
 * d'appel REST direct clé+requête : un agent outillé avec une connexion Bing
 * doit être créé dans le projet Azure AI Foundry, puis interrogé via le
 * client "responses" compatible OpenAI. L'agent ne retourne pas de résultats
 * de recherche bruts (titre/snippet par URL) mais une réponse synthétisée
 * avec des citations d'URL (annotations "url_citation") pointant dans le
 * texte — d'où l'usage d'une fenêtre de texte autour de chaque citation en
 * guise de contexte/snippet.
 */

import { DefaultAzureCredential, ClientSecretCredential, type TokenCredential } from '@azure/identity'
import { AIProjectClient } from '@azure/ai-projects'
import { warn } from './logger'

export interface BingSearchResult {
  url: string
  context: string
}

const SOURCE_NAME = 'bing-grounding'
const AGENT_NAME = 'tumaa-bing-jobs-agent'
const CONTEXT_WINDOW = 300

function getCredential(): TokenCredential {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env
  if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) {
    return new ClientSecretCredential(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)
  }
  return new DefaultAzureCredential()
}

let project: AIProjectClient | null = null
let agentRef: { name: string; version: string } | null = null

function getProject(): AIProjectClient {
  const endpoint = process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT
  if (!endpoint) throw new Error('AZURE_AI_FOUNDRY_PROJECT_ENDPOINT manquant')
  if (!project) project = new AIProjectClient(endpoint, getCredential())
  return project
}

async function getAgent(): Promise<{ name: string; version: string }> {
  if (agentRef) return agentRef

  const connectionId = process.env.AZURE_BING_CONNECTION_ID
  if (!connectionId) throw new Error('AZURE_BING_CONNECTION_ID manquant')

  const agent = await getProject().agents.createVersion(AGENT_NAME, {
    kind: 'prompt',
    model: process.env.AZURE_AI_MODEL_DEPLOYMENT ?? 'gpt-4.1-mini',
    instructions:
      "Tu es un assistant qui recherche des offres d'emploi réelles et récentes via Bing. " +
      "Réponds par une liste concise des offres trouvées (intitulé du poste, organisation, ville) " +
      'et cite systématiquement leur URL directe pour chaque offre mentionnée.',
    tools: [
      {
        type: 'bing_grounding',
        bing_grounding: {
          search_configurations: [{ project_connection_id: connectionId }],
        },
      },
    ],
  })

  agentRef = { name: agent.name, version: agent.version }
  return agentRef
}

/**
 * Supprime la version d'agent créée pour ce run — à appeler une fois à la
 * fin d'un scrape complet (tous pays confondus) pour éviter d'accumuler des
 * versions d'agent inutilisées dans le projet Foundry (voir doc Microsoft,
 * section "Clean up resources").
 */
export async function closeBingAgent(): Promise<void> {
  if (!project || !agentRef) return
  const { name, version } = agentRef
  agentRef = null
  try {
    await project.agents.deleteVersion(name, version)
  } catch (err) {
    warn(SOURCE_NAME, `Failed to delete agent version: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function searchJobs(query: string): Promise<BingSearchResult[]> {
  if (!process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT || !process.env.AZURE_BING_CONNECTION_ID) {
    warn(SOURCE_NAME, 'AZURE_AI_FOUNDRY_PROJECT_ENDPOINT / AZURE_BING_CONNECTION_ID manquants, recherche ignorée')
    return []
  }

  try {
    const proj = getProject()
    const agent = await getAgent()
    const openai = proj.getOpenAIClient()

    const stream = await openai.responses.create(
      { input: query, stream: true },
      { body: { agent_reference: { name: agent.name, type: 'agent_reference' }, tool_choice: 'required' } }
    )

    let text = ''
    const citations: { url: string; start: number; end: number }[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const event of stream as AsyncIterable<any>) {
      if (event.type === 'response.output_text.delta') {
        text += event.delta
      } else if (event.type === 'response.output_item.done' && event.item?.type === 'message') {
        const content = event.item.content?.[event.item.content.length - 1]
        if (content?.type === 'output_text' && Array.isArray(content.annotations)) {
          for (const annotation of content.annotations) {
            if (annotation.type === 'url_citation' && annotation.url) {
              citations.push({ url: annotation.url, start: annotation.start_index ?? 0, end: annotation.end_index ?? 0 })
            }
          }
        }
      }
    }

    const seen = new Set<string>()
    const results: BingSearchResult[] = []
    for (const c of citations) {
      if (seen.has(c.url)) continue
      seen.add(c.url)
      const context = text
        .slice(Math.max(0, c.start - CONTEXT_WINDOW), c.end + CONTEXT_WINDOW)
        .replace(/\s+/g, ' ')
        .trim()
      results.push({ url: c.url, context: context || text.slice(0, CONTEXT_WINDOW) })
    }
    return results
  } catch (err) {
    warn(SOURCE_NAME, `Bing grounding search failed for "${query}": ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}
