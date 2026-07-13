import { BaseScraper } from '../lib/scraper-base'
import { LefasoScraper } from './bf/jobboard/lefaso'
import { ReliefWebScraper } from './bf/jobboard/reliefweb'
import { AnpeBfScraper } from './bf/jobboard/anpe-bf'
import { EmploiBurkinaScraper } from './bf/jobboard/emploiburkina'
import { CriBurkinaScraper } from './bf/jobboard/criburkina'
import { EmploiLefasoScraper } from './bf/jobboard/emploi-lefaso'

const sources = new Map<string, BaseScraper>([
  ['lefaso', new LefasoScraper()],
  ['reliefweb', new ReliefWebScraper()],
  ['anpe-bf', new AnpeBfScraper()],
  ['emploiburkina', new EmploiBurkinaScraper()],
  ['criburkina', new CriBurkinaScraper()],
  ['emploi-lefaso', new EmploiLefasoScraper()],
])

export default sources
