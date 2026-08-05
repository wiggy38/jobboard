const createVersionMock = jest.fn()
const deleteVersionMock = jest.fn()
const responsesCreateMock = jest.fn()

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
  ClientSecretCredential: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('@azure/ai-projects', () => ({
  AIProjectClient: jest.fn().mockImplementation(() => ({
    agents: {
      createVersion: createVersionMock,
      deleteVersion: deleteVersionMock,
    },
    getOpenAIClient: () => ({
      responses: { create: responsesCreateMock },
    }),
  })),
}))

// Async iterable stub mimicking the streaming response events used by
// openai.responses.create({ stream: true }, ...) — see bing-tools TS sample.
function fakeStream(events: unknown[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) yield event
    },
  }
}

describe('bing-grounding', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env = {
      ...ORIGINAL_ENV,
      AZURE_AI_FOUNDRY_PROJECT_ENDPOINT: 'https://example.ai.azure.com/api/projects/tumaa',
      AZURE_BING_CONNECTION_ID: 'conn-id',
    }
    createVersionMock.mockResolvedValue({ name: 'tumaa-bing-jobs-agent', version: '1' })
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('retourne [] sans appeler Azure si les variables d\'env sont manquantes', async () => {
    process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT = ''
    const { searchJobs } = await import('../src/lib/bing-grounding')
    const results = await searchJobs('offres emploi Bénin')
    expect(results).toEqual([])
    expect(responsesCreateMock).not.toHaveBeenCalled()
  })

  it('extrait les URLs citées et un contexte texte autour de chaque citation', async () => {
    responsesCreateMock.mockResolvedValue(
      fakeStream([
        { type: 'response.output_text.delta', delta: 'Voici une offre de Comptable chez ACME à Cotonou : ' },
        { type: 'response.output_text.delta', delta: 'https://example-bj-jobs.com/offre/1' },
        {
          type: 'response.output_item.done',
          item: {
            type: 'message',
            content: [
              {
                type: 'output_text',
                annotations: [
                  { type: 'url_citation', url: 'https://example-bj-jobs.com/offre/1', start_index: 50, end_index: 85 },
                ],
              },
            ],
          },
        },
      ])
    )

    const { searchJobs } = await import('../src/lib/bing-grounding')
    const results = await searchJobs("offres d'emploi Bénin")

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://example-bj-jobs.com/offre/1')
    expect(results[0].context).toContain('Comptable')
    expect(createVersionMock).toHaveBeenCalledTimes(1)
  })

  it('réutilise le même agent entre deux appels successifs de searchJobs', async () => {
    responsesCreateMock.mockResolvedValue(fakeStream([]))
    const { searchJobs } = await import('../src/lib/bing-grounding')

    await searchJobs('recrutement Cotonou')
    await searchJobs('recrutement Bamako')

    expect(createVersionMock).toHaveBeenCalledTimes(1)
  })

  it('dédoublonne les URLs citées plusieurs fois dans la même réponse', async () => {
    responsesCreateMock.mockResolvedValue(
      fakeStream([
        {
          type: 'response.output_item.done',
          item: {
            type: 'message',
            content: [
              {
                type: 'output_text',
                annotations: [
                  { type: 'url_citation', url: 'https://dup.example.com/1', start_index: 0, end_index: 10 },
                  { type: 'url_citation', url: 'https://dup.example.com/1', start_index: 20, end_index: 30 },
                ],
              },
            ],
          },
        },
      ])
    )

    const { searchJobs } = await import('../src/lib/bing-grounding')
    const results = await searchJobs('recrutement Lomé')
    expect(results).toHaveLength(1)
  })

  it('retourne [] si l\'appel Azure échoue, sans lever d\'exception', async () => {
    responsesCreateMock.mockRejectedValue(new Error('quota exceeded'))
    const { searchJobs } = await import('../src/lib/bing-grounding')
    const results = await searchJobs('recrutement Dakar')
    expect(results).toEqual([])
  })

  it('closeBingAgent supprime la version d\'agent créée puis un nouvel appel en recrée une', async () => {
    responsesCreateMock.mockResolvedValue(fakeStream([]))
    deleteVersionMock.mockResolvedValue(undefined)

    const { searchJobs, closeBingAgent } = await import('../src/lib/bing-grounding')
    await searchJobs('recrutement Abidjan')
    await closeBingAgent()

    expect(deleteVersionMock).toHaveBeenCalledWith('tumaa-bing-jobs-agent', '1')

    await searchJobs('recrutement Abidjan')
    expect(createVersionMock).toHaveBeenCalledTimes(2)
  })

  it('closeBingAgent ne fait rien si aucun agent n\'a été créé', async () => {
    const { closeBingAgent } = await import('../src/lib/bing-grounding')
    await expect(closeBingAgent()).resolves.toBeUndefined()
    expect(deleteVersionMock).not.toHaveBeenCalled()
  })
})
