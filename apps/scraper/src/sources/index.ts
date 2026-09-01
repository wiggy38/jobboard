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
import { JobigloScraper } from './bf/jobboard/jobiglo'
import { TalentsPlusAfriqueScraper } from './multi/talentsplusafrique'
import { OffresdemploisBjScraper } from './bj/jobboard/offresdemplois'
import { CareerjetBjScraper } from './bj/jobboard/careerjet'
import { GouvBjScraper } from './bj/jobboard/gouvbj'
import { AfriqueEmploisBjScraper } from './bj/jobboard/afriqueemplois'
import { EmploiBougeBeninScraper } from './bj/jobboard/emploibougebenin'
import { JobBeninScraper } from './bj/jobboard/jobbenin'
import { AnpeBjScraper } from './bj/jobboard/anpe-bj'
import { UnjobsScraper } from './bj/jobboard/unjobs'
import { NovojobScraper } from './bj/jobboard/novojob'
import { BjEmploiScraper } from './bj/jobboard/bjemploi'
import { AfricarrieresScraper } from './bj/jobboard/africarrieres'
import { WabajobScraper } from './bj/jobboard/wabajob'
import { FinexConsultingScraper } from './bj/jobboard/finexconsulting'
import { CoinafriqueScraper } from './bj/jobboard/coinafrique'
import { EmploiAuBeninScraper } from './bj/jobboard/emploiaubenin'

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
  ['jobiglo', new JobigloScraper()],
  ['talentsplusafrique', new TalentsPlusAfriqueScraper()],
  ['offresdemplois-bj', new OffresdemploisBjScraper()],
  ['careerjet-bj', new CareerjetBjScraper()],
  ['gouvbj', new GouvBjScraper()],
  ['afriqueemplois-bj', new AfriqueEmploisBjScraper()],
  ['emploibougebenin', new EmploiBougeBeninScraper()],
  ['jobbenin', new JobBeninScraper()],
  ['anpe-bj', new AnpeBjScraper()],
  ['unjobs', new UnjobsScraper()],
  ['novojob', new NovojobScraper()],
  ['bjemploi', new BjEmploiScraper()],
  ['africarrieres', new AfricarrieresScraper()],
  ['wabajob', new WabajobScraper()],
  ['finexconsulting', new FinexConsultingScraper()],
  ['coinafrique', new CoinafriqueScraper()],
  ['emploiaubenin', new EmploiAuBeninScraper()],
])

export default sources
