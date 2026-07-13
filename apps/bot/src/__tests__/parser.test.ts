import { parseCommand } from '../parser';

describe('parseCommand', () => {
  describe('OFFRES', () => {
    it('lowercase → OFFRES', () => expect(parseCommand('offres')).toEqual({ command: 'OFFRES' }));
    it('avec espaces → OFFRES', () => expect(parseCommand('  offres  ')).toEqual({ command: 'OFFRES' }));
  });

  describe('VOIR', () => {
    it('seul → VOIR sans args', () => expect(parseCommand('voir')).toEqual({ command: 'VOIR' }));
    it('voir 3 → VOIR [3]', () => expect(parseCommand('Voir 3')).toEqual({ command: 'VOIR', args: ['3'] }));
    it('voir 1 (limite basse) → VOIR [1]', () => expect(parseCommand('voir 1')).toEqual({ command: 'VOIR', args: ['1'] }));
    it('voir 10 (limite haute) → VOIR [10]', () => expect(parseCommand('voir 10')).toEqual({ command: 'VOIR', args: ['10'] }));
    it('voir 0 → UNKNOWN (hors plage)', () => expect(parseCommand('voir 0')).toEqual({ command: 'UNKNOWN' }));
    it('voir 11 → UNKNOWN (hors plage)', () => expect(parseCommand('Voir 11')).toEqual({ command: 'UNKNOWN' }));
  });

  describe('STOP', () => {
    it('stop → STOP', () => expect(parseCommand('stop')).toEqual({ command: 'STOP' }));
    it('STOP → STOP', () => expect(parseCommand('STOP')).toEqual({ command: 'STOP' }));
  });

  describe('AIDE et salutations', () => {
    it('aide → AIDE', () => expect(parseCommand('aide')).toEqual({ command: 'AIDE' }));
    it('help → AIDE', () => expect(parseCommand('help')).toEqual({ command: 'AIDE' }));
    it('menu → AIDE', () => expect(parseCommand('menu')).toEqual({ command: 'AIDE' }));
    it('bonjour → AIDE', () => expect(parseCommand('bonjour')).toEqual({ command: 'AIDE' }));
    it('bonsoir → AIDE', () => expect(parseCommand('bonsoir')).toEqual({ command: 'AIDE' }));
    it('salut → AIDE', () => expect(parseCommand('salut')).toEqual({ command: 'AIDE' }));
    it('hi → AIDE', () => expect(parseCommand('hi')).toEqual({ command: 'AIDE' }));
    it('svp → AIDE', () => expect(parseCommand('svp')).toEqual({ command: 'AIDE' }));
    it('stp → AIDE', () => expect(parseCommand('stp')).toEqual({ command: 'AIDE' }));
  });

  describe('PREMIUM', () => {
    it('premium → PREMIUM', () => expect(parseCommand('premium')).toEqual({ command: 'PREMIUM' }));
    it('abonnement → PREMIUM', () => expect(parseCommand('abonnement')).toEqual({ command: 'PREMIUM' }));
    it('s-abonner (tiret → espace) → PREMIUM', () => expect(parseCommand('s-abonner')).toEqual({ command: 'PREMIUM' }));
    it('s_abonner (underscore → espace) → PREMIUM', () => expect(parseCommand('s_abonner')).toEqual({ command: 'PREMIUM' }));
  });

  describe('ESSAI', () => {
    it('essai → ESSAI', () => expect(parseCommand('essai')).toEqual({ command: 'ESSAI' }));
    it('essai premium → ESSAI', () => expect(parseCommand('essai premium')).toEqual({ command: 'ESSAI' }));
  });

  describe('PARRAINER', () => {
    it('parrainer → PARRAINER', () => expect(parseCommand('parrainer')).toEqual({ command: 'PARRAINER' }));
    it('parrainage → PARRAINER', () => expect(parseCommand('parrainage')).toEqual({ command: 'PARRAINER' }));
  });

  describe('MODIFIER', () => {
    it('modifier → MODIFIER', () => expect(parseCommand('modifier')).toEqual({ command: 'MODIFIER' }));
    it('changer → MODIFIER', () => expect(parseCommand('changer')).toEqual({ command: 'MODIFIER' }));
    it('profil → MODIFIER', () => expect(parseCommand('profil')).toEqual({ command: 'MODIFIER' }));
  });

  describe('PAUSE / REPRENDRE', () => {
    it('pause → PAUSE', () => expect(parseCommand('pause')).toEqual({ command: 'PAUSE' }));
    it('reprendre → PAUSE [REPRENDRE]', () =>
      expect(parseCommand('reprendre')).toEqual({ command: 'PAUSE', args: ['REPRENDRE'] }));
  });

  describe('REVOIR', () => {
    it('revoir → REVOIR', () => expect(parseCommand('revoir')).toEqual({ command: 'REVOIR' }));
  });

  describe('STATS', () => {
    it('stats → STATS', () => expect(parseCommand('stats')).toEqual({ command: 'STATS' }));
    it('statistiques → STATS', () => expect(parseCommand('statistiques')).toEqual({ command: 'STATS' }));
  });

  describe('ALERTE', () => {
    it('alerte comptable → ALERTE [COMPTABLE]', () =>
      expect(parseCommand('alerte comptable')).toEqual({ command: 'ALERTE', args: ['COMPTABLE'] }));
    it('alerte seul → ALERTE []', () =>
      expect(parseCommand('alerte')).toEqual({ command: 'ALERTE', args: [] }));
    it('alerte finance rh → ALERTE [FINANCE, RH]', () =>
      expect(parseCommand('alerte finance rh')).toEqual({ command: 'ALERTE', args: ['FINANCE', 'RH'] }));
    it('ALERTE (uppercase) → ALERTE []', () =>
      expect(parseCommand('ALERTE')).toEqual({ command: 'ALERTE', args: [] }));
  });

  describe('UNKNOWN', () => {
    it('texte aléatoire → UNKNOWN', () => expect(parseCommand('bla bla')).toEqual({ command: 'UNKNOWN' }));
    it('string vide → UNKNOWN', () => expect(parseCommand('')).toEqual({ command: 'UNKNOWN' }));
    it('chiffres seuls → UNKNOWN', () => expect(parseCommand('42')).toEqual({ command: 'UNKNOWN' }));
  });
});
