const axios = require('axios')
const cheerio = require('cheerio')

;(async () => {
  const resp = await axios.get('https://www.criburkina.com/listeroffre', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    timeout: 15000
  })
  const $ = cheerio.load(resp.data)

  // Find parent containers of the offredetail links
  const firstLink = $('a[href*="offredetail"]').first()
  if (firstLink.length) {
    console.log('=== PARENT CHAIN OF FIRST OFFREDETAIL LINK ===')
    let el = firstLink
    for (let i = 0; i < 6; i++) {
      const tag = el[0] ? el[0].tagName : '?'
      const cls = el.attr('class') || ''
      const id = el.attr('id') || ''
      const text = el.text().replace(/\s+/g, ' ').trim().slice(0, 120)
      console.log(`  [${i}] <${tag} class="${cls}" id="${id}"> -> ${text}`)
      el = el.parent()
    }
  }

  // Find the dashboard-gravity-list or invoices section and dump its raw HTML
  console.log('\n=== dashboard-gravity-list HTML ===')
  console.log($('.dashboard-gravity-list').html()?.slice(0, 3000) || 'NOT FOUND')

  console.log('\n=== invoices HTML ===')
  console.log($('.invoices').html()?.slice(0, 3000) || 'NOT FOUND')

  // Look for table rows or list items containing offredetail links
  console.log('\n=== TR containing offredetail ===')
  $('tr').each((i, el) => {
    if ($(el).find('a[href*="offredetail"]').length) {
      console.log(`TR[${i}]:`, $(el).text().replace(/\s+/g, ' ').trim().slice(0, 150))
    }
  })

  console.log('\n=== LI containing offredetail ===')
  $('li').each((i, el) => {
    if ($(el).find('a[href*="offredetail"]').length) {
      console.log(`LI[${i}]:`, $(el).text().replace(/\s+/g, ' ').trim().slice(0, 150))
    }
  })

  console.log('\n=== div containing offredetail (deepest) ===')
  $('div').each((i, el) => {
    if ($(el).find('a[href*="offredetail"]').length === 1) {
      const tag = el.tagName
      const cls = $(el).attr('class') || ''
      const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 150)
      console.log(`  DIV.${cls.replace(/\s+/g, '.')} -> ${text}`)
    }
  })
})().catch(e => console.error('ERROR:', e.message))
