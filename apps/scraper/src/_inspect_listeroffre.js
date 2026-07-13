const axios = require('axios')
const cheerio = require('cheerio')

;(async () => {
  const resp = await axios.get('https://www.criburkina.com/listeroffre', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    timeout: 15000
  })
  const $ = cheerio.load(resp.data)

  console.log('=== TITLE ===')
  console.log($('title').text().trim())
  console.log('Content length:', resp.data.length)

  console.log('\n=== UNIQUE CLASSES ===')
  const classSet = new Set()
  $('[class]').each((i, el) => {
    const raw = $(el).attr('class') || ''
    raw.split(/\s+/).filter(Boolean).forEach(c => classSet.add(c))
  })
  console.log([...classSet].sort().join(', '))

  console.log('\n=== brows-job-list count ===')
  console.log($('div.brows-job-list').length)
  console.log('=== item-click count ===')
  console.log($('div.item-click').length)

  console.log('\n=== LINKS WITH OFFREDETAIL ===')
  $('a[href*="offredetail"]').each((i, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text().trim().replace(/\s+/g, ' ')
    console.log(`  "${text}" -> ${href}`)
  })

  console.log('\n=== RAW HTML (2000-5000 chars) ===')
  console.log(resp.data.slice(2000, 5000))
})().catch(e => console.error('ERROR:', e.message))
