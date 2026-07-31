import { BaseScraper } from '../lib/scraper-base'
import { LefasoScraper } from './bf/jobboard/lefaso'
import { ReliefWebScraper } from './bf/jobboard/reliefweb'
import { AnpeBfScraper } from './bf/jobboard/anpe-bf'
import { EmploiBurkinaScraper } from './bf/jobboard/emploiburkina'
import { CriBurkinaScraper } from './bf/jobboard/criburkina'
import { EmploiLefasoScraper } from './bf/jobboard/emploi-lefaso'
import { BfEmploiScraper } from './bf/jobboard/bfemploi'
import { IciPeScraper } from './bf/jobboard/icipe'
import { ProfessionnallinkScraper } from './bf/jobboard/professionnallink'
import { AfriqueEmploisScraper } from './bf/jobboard/afriqueemplois'
import { GoAfricaOnlineScraper } from './bf/jobboard/goafricaonline'
import { LinkedInScraper } from './bf/jobboard/linkedin'
import { SidwayaScraper } from './bf/jobboard/sidwaya'
import { Faso7Scraper } from './bf/jobboard/faso7'

const sources = new Map<string, BaseScraper>([
  ['lefaso', new LefasoScraper()],
  ['reliefweb', new ReliefWebScraper()],
  ['anpe-bf', new AnpeBfScraper()],
  ['emploiburkina', new EmploiBurkinaScraper()],
  ['criburkina', new CriBurkinaScraper()],
  ['emploi-lefaso', new EmploiLefasoScraper()],
  ['bfemploi', new BfEmploiScraper()],
  ['icipe', new IciPeScraper()],
  ['professionnallink', new ProfessionnallinkScraper()],
  ['afriqueemplois', new AfriqueEmploisScraper()],
  ['goafricaonline', new GoAfricaOnlineScraper()],
  ['linkedin', new LinkedInScraper()],
  ['sidwaya', new SidwayaScraper()],
  ['faso7', new Faso7Scraper()],
])

export default sources
