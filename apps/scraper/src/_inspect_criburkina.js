const axios = require('axios')
const cheerio = require('cheerio')

;(async () => {
  const resp = await axios.get('https://www.criburkina.com', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    timeout: 15000
  })
  const $ = cheerio.load(resp.data)

  console.log('=== TITLE ===')
  console.log($('title').text().trim())

  console.log('\n=== UNIQUE CLASSES ===')
  const classSet = new Set()
  $('[class]').each((i, el) => {
    const raw = $(el).attr('class') || ''
    raw.split(/\s+/).filter(Boolean).forEach(c => classSet.add(c))
  })
  console.log([...classSet].sort().join(', '))

  console.log('\n=== LINKS WITH OFFRE/EMPLOI/JOB ===')
  $('a').each((i, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text().trim().replace(/\s+/g, ' ')
    if ((href.includes('offre') || href.includes('emploi') || href.includes('job') || href.includes('recrutement')) && text) {
      console.log(`  ${text.slice(0, 60)} -> ${href}`)
    }
  })

  console.log('\n=== ELEMENTS WITH JOB-RELATED TEXT (tag.class -> text) ===')
  let count = 0
  $('*').each((i, el) => {
    if (count >= 80) return false
    const tag = el.tagName
    const classes = $(el).attr('class') || ''
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    const lower = text.toLowerCase()
    if (text.length > 10 && text.length < 200 && classes.length > 2 &&
        (lower.includes('offre') || lower.includes('emploi') || lower.includes('poste') ||
         lower.includes('recrutement') || lower.includes('candidature'))) {
      console.log(`  ${tag}.${classes.replace(/\s+/g, '.')} -> ${text.slice(0, 100)}`)
      count++
    }
  })

  console.log('\n=== RAW HTML (first 3000 chars) ===')
  console.log(resp.data.slice(0, 3000))
})().catch(e => console.error('ERROR:', e.message))
