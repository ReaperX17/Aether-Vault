import { DeckCardItem } from './types';

export interface GameChangerHit {
  name: string;
  category: string;
  reason: string;
  card?: DeckCardItem;
}

export interface InfiniteComboHit {
  id: string;
  names: string[];
  speed: 'early_2card' | 'late_or_3card';
  result: string;
  explanation: string;
  minTotalCmc: number;
}

export interface NearComboHit {
  id: string;
  ownedPiece: string;
  missingPiece: string;
  result: string;
}

export interface SaltyCardHit {
  name: string;
  saltScore: number; // 0.00 to 4.00 (EDHREC scale)
  reasons: string[];
  isGameChanger: boolean;
  isFastMana: boolean;
  isMld: boolean;
  card?: DeckCardItem;
}

export interface DeckBracketAndSaltReport {
  bracket: 1 | 2 | 3 | 4 | 5;
  bracketName: string;
  bracketSubtitle: string;
  bracketColor: 'emerald' | 'sky' | 'amber' | 'orange' | 'rose';
  bracketReasons: string[];
  howToLowerBracket: string[];
  gameChangers: GameChangerHit[];
  infiniteCombos: InfiniteComboHit[];
  nearCombos: NearComboHit[];
  fastManaCards: Array<{ name: string; note: string; card?: DeckCardItem }>;
  mldCards: Array<{ name: string; note: string; card?: DeckCardItem }>;
  extraTurnCards: Array<{ name: string; note: string; card?: DeckCardItem }>;
  tutorCards: Array<{ name: string; note: string; card?: DeckCardItem }>;
  freeInteractionCards: string[];
  salt: {
    totalSaltSum: number;
    avgCardSalt: number;
    saltIndex100: number; // 0 to 100 thermometer
    tierLabel: string;
    tierEmoji: string;
    tierDescription: string;
    tierColor: 'emerald' | 'sky' | 'amber' | 'orange' | 'rose';
    topSaltyCards: SaltyCardHit[];
  };
}

// Official Wizards of the Coast Commander Format Panel "Game Changers" Catalog
export const OFFICIAL_WOTC_GAME_CHANGERS: Record<
  string,
  { category: string; reason: string }
> = {
  // White
  'drannith magistrate': {
    category: 'Stax / Commander Lock',
    reason: 'Locks opponents out of casting their Commanders and any spells from outside their hand.'
  },
  'enlightened tutor': {
    category: '1-Mana Instant Tutor',
    reason: 'Finds any artifact or enchantment combo piece or lock piece for 1 mana at instant speed.'
  },
  humility: {
    category: 'Board Lock',
    reason: 'Blanks all creature text boxes and sets all creatures to 1/1, neutralizing creature decks.'
  },
  "serra's sanctum": {
    category: 'Explosive Fast Mana Land',
    reason: 'Produces massive bursts of white mana in enchantment-heavy shells.'
  },
  'smothering tithe': {
    category: 'Resource Engine',
    reason: 'Generates overwhelming Treasure mana advantage off every opponent draw.'
  },
  "teferi's protection": {
    category: 'Ultimate Protection',
    reason: 'Phases out your entire board and locks your life total until your next turn.'
  },
  'trouble in pairs': {
    category: 'Draw Engine',
    reason: 'Punishes opponents for double-spelling, drawing extra cards, or attacking with multiple creatures.'
  },

  // Blue
  'consecrated sphinx': {
    category: 'Draw Engine',
    reason: 'Draws 6+ extra cards per turn cycle if not answered immediately.'
  },
  'cyclonic rift': {
    category: 'One-Sided Board Wipe',
    reason: 'Instant-speed asymmetrical bounce of every nonland permanent opponents control.'
  },
  expropriate: {
    category: 'Extra Turns & Theft',
    reason: 'Usually grants an extra turn plus steals the best permanent from each opponent.'
  },
  'fierce guardianship': {
    category: 'Free Counterspell',
    reason: '0-mana protection/interaction whenever you control your Commander.'
  },
  'force of will': {
    category: 'Free Counterspell',
    reason: '0-mana unconditional hard counter that stops early wins or protects combos.'
  },
  'gifts ungiven': {
    category: '4-Card Instant Tutor',
    reason: 'Assembles deterministic graveyard/reanimation or combo piles at instant speed.'
  },
  intuition: {
    category: '3-Card Instant Tutor',
    reason: 'One-card win-condition assembler with Underworld Breach or recursion piles.'
  },
  'jin-gitaxias, core augur': {
    category: 'Hand Lock & Draw 7',
    reason: 'Draws you 7 cards while reducing every opponent’s maximum hand size to zero.'
  },
  'mystical tutor': {
    category: '1-Mana Instant Tutor',
    reason: 'Finds any instant or sorcery win condition, board wipe, or counterspell for 1 mana.'
  },
  'narset, parter of veils': {
    category: 'Draw Lock',
    reason: 'Shuts off all extra card draw for opponents and strips hands when paired with wheels.'
  },
  'rhystic study': {
    category: 'Premier Draw / Tax Engine',
    reason: 'Taxes every spell cast at the table or draws an avalanche of cards.'
  },
  'sway of the stars': {
    category: 'Total Game Reset',
    reason: 'Resets boards, graveyards, hands, and life totals to 7.'
  },
  "thassa's oracle": {
    category: 'Compact Win Condition',
    reason: '2-mana ETB win condition that ends the game immediately with Tainted Pact or Consultation.'
  },
  'urza, lord high artificer': {
    category: 'Mana Engine & Outlet',
    reason: 'Turns every artifact into a Mox Sapphire and provides an infinite mana outlet in the command zone.'
  },

  // Black
  'ad nauseam': {
    category: 'cEDH Draw Engine',
    reason: 'Draws 20–35 cards at instant speed in low-curve decks to win on the spot.'
  },
  "bolas's citadel": {
    category: 'Top-of-Library Engine',
    reason: 'Casts spells off the top of your library using life instead of mana.'
  },
  'braids, cabal minion': {
    category: 'Resource Denial / Stax',
    reason: 'Forces players to sacrifice lands, creatures, or artifacts every upkeep.'
  },
  'demonic tutor': {
    category: 'Unconditional Tutor',
    reason: 'Finds any card in your library straight to hand for 2 mana with no restrictions.'
  },
  'imperial seal': {
    category: '1-Mana Unconditional Tutor',
    reason: 'Finds any card in your library for 1 black mana.'
  },
  necropotence: {
    category: 'Explosive Draw Engine',
    reason: 'Refills your hand to 7+ cards every turn at the cost of 1 life per card.'
  },
  'opposition agent': {
    category: 'Tutor Theft & Lock',
    reason: 'Flash creature that hijacks opponents’ library searches and steals their tutored cards.'
  },
  'tergrid, god of fright': {
    category: 'Sacrifice & Discard Theft',
    reason: 'Puts every permanent opponents sacrifice or discard directly onto your battlefield.'
  },
  'tergrid, god of fright // tergrid\'s lantern': {
    category: 'Sacrifice & Discard Theft',
    reason: 'Puts every permanent opponents sacrifice or discard directly onto your battlefield.'
  },
  'vampiric tutor': {
    category: '1-Mana Instant Tutor',
    reason: 'Instant-speed unconditional tutor for any card in your deck for 1 black mana.'
  },

  // Red
  'deflecting swat': {
    category: 'Free Interaction',
    reason: '0-mana spell redirection whenever you control your Commander.'
  },
  gamble: {
    category: '1-Mana Red Tutor',
    reason: 'Searches for any card in your deck for 1 red mana, fueling graveyard & Breach lines.'
  },
  "jeska's will": {
    category: 'Ritual & Impulse Draw',
    reason: 'Generates 5–7+ red mana AND exiles the top 3 cards of your library to play.'
  },
  'underworld breach': {
    category: 'Graveyard Escape Engine',
    reason: 'Turns your graveyard into Yawgmoth’s Will and forms easy infinite loops with LED/Lotus Petal.'
  },

  // Green
  'crop rotation': {
    category: 'Instant Utility Land Tutor',
    reason: 'Finds Gaea’s Cradle, Ancient Tomb, Glacial Chasm, or Field of the Dead at instant speed for 1 mana.'
  },
  'food chain': {
    category: 'Infinite Creature Mana Engine',
    reason: 'Generates infinite creature mana with Squee, the Immortal, Misthollow Griffin, or Eternal Scourge.'
  },
  "gaea's cradle": {
    category: 'Explosive Fast Mana Land',
    reason: 'Taps for massive green mana equal to the number of creatures you control.'
  },
  'natural order': {
    category: 'Battlefield Creature Tutor',
    reason: 'Cheats Craterhoof Behemoth, Vorinclex, or Atraxa directly onto the battlefield on turn 3–4.'
  },
  'seedborn muse': {
    category: 'Untap Multiplier',
    reason: 'Untaps all your permanents on every single opponent’s untap step, multiplying your mana 4x.'
  },
  'survival of the fittest': {
    category: 'Repeatable Creature Tutor',
    reason: 'Repeatedly chains any creature in hand into any creature in library while filling the graveyard.'
  },
  'vorinclex, voice of Hunger': {
    category: 'Mana Doubler & Land Freeze',
    reason: 'Doubles your mana while preventing opponents’ lands from untapping for a full turn.'
  },
  'vorinclex, voice of hunger': {
    category: 'Mana Doubler & Land Freeze',
    reason: 'Doubles your mana while preventing opponents’ lands from untapping for a full turn.'
  },
  'worldly tutor': {
    category: '1-Mana Instant Creature Tutor',
    reason: 'Finds any combo or silver-bullet creature at instant speed for 1 green mana.'
  },

  // Multicolor
  'coalition victory': {
    category: 'Alternate Win Condition',
    reason: 'Wins the game on resolution if you control all basic land types and a 5-color Commander.'
  },
  'grand arbiter augustin iv': {
    category: 'Stax & Cost Tax',
    reason: 'Taxes every single spell your opponents cast by {1} while discounting your own spells.'
  },
  'kinnan, bonder prodigy': {
    category: 'Mana Multiplier & Infinite Outlet',
    reason: 'Doubles nonland mana production and goes infinite with Basalt Monolith.'
  },
  'notion thief': {
    category: 'Flash Draw Theft',
    reason: 'Steals every extra card opponents would draw and strips hands completely with wheels.'
  },
  'winota, joiner of forces': {
    category: 'Explosive Combat Cheat Engine',
    reason: 'Cheats multiple high-impact Human stax/hatebears onto the battlefield indestructible on attack.'
  },
  'yuriko, the tiger\'s shadow': {
    category: 'Command Tax Bypass & Table Drain',
    reason: 'Evades Commander tax indefinitely via Commander Ninjutsu while draining the entire table.'
  },

  // Colorless / Artifacts / Lands
  'ancient tomb': {
    category: 'Fast Mana Land',
    reason: 'Produces 2 colorless mana immediately on turn 1 with no tempo loss.'
  },
  'chrome mox': {
    category: '0-Mana Fast Mana Rock',
    reason: '0-mana colored mana acceleration on turn 1.'
  },
  'field of the dead': {
    category: ' Inevitable Token Land',
    reason: 'Produces an endless stream of 2/2 Zombies purely from normal land drops.'
  },
  'glacial chasm': {
    category: 'Damage Immunity Land',
    reason: 'Prevents all damage dealt to you, often looped indefinitely from the graveyard.'
  },
  'grim monolith': {
    category: 'Mana-Positive Fast Mana Rock',
    reason: '2-mana artifact that taps for {C}{C}{C} and goes infinite with Power Artifact / Rings.'
  },
  "lion's eye diamond": {
    category: '0-Mana Black Lotus Variant',
    reason: 'Sacrifices for 3 mana of any color, enabling deterministic Underworld Breach wins.'
  },
  'mana vault': {
    category: '1-Mana Fast Mana Ritual Rock',
    reason: '1-mana artifact that taps for {C}{C}{C}, jumping from turn 1 to 4–5 mana on turn 2.'
  },
  "mishra's workshop": {
    category: '3-Mana Land',
    reason: 'Taps for {C}{C}{C} on turn 1 for artifact spells.'
  },
  'mox diamond': {
    category: '0-Mana Fast Mana Rock',
    reason: '0-mana permanent 5-color mana rock.'
  },
  'panoptic mirror': {
    category: 'Infinite Turn Engine',
    reason: 'Imprints any extra turn spell to take infinite turns every upkeep.'
  },
  'the one ring': {
    category: 'Indestructible Protection & Draw Engine',
    reason: 'Grants protection from everything for a full turn cycle while drawing 3–6+ cards.'
  },
  'the tabernacle at pendrell vale': {
    category: 'Creature Tax Land',
    reason: '0-mana land that forces every creature on the board to pay {1} every upkeep or be destroyed.'
  },
  trinisphere: {
    category: 'Cost Lock Stax Piece',
    reason: 'Forces every spell cast at the table to cost at least 3 mana, shutting down cheap interaction.'
  }
};

// Fast Mana Catalog
const FAST_MANA_CATALOG: Record<string, string> = {
  'sol ring': '1-mana rock that produces {C}{C} (+1 net mana)',
  'mana vault': '1-mana rock that produces {C}{C}{C} (+2 net mana)',
  'grim monolith': '2-mana rock that produces {C}{C}{C} (+1 net mana)',
  'chrome mox': '0-mana rock that produces colored mana (+1 net mana)',
  'mox diamond': '0-mana rock that produces any color (+1 net mana)',
  'mox opal': '0-mana Metalcraft rock (+1 net mana)',
  'mox amber': '0-mana legendary rock (+1 net mana)',
  'lotus petal': '0-mana treasure/petal burst (+1 net mana)',
  "lion's eye diamond": '0-mana artifact that sacrifices for 3 mana (+3 net mana)',
  'ancient tomb': 'Land that taps for {C}{C} immediately',
  'city of traitors': 'Land that taps for {C}{C} immediately',
  "gaea's cradle": 'Land that taps for {G} per creature you control',
  "serra's sanctum": 'Land that taps for {W} per enchantment you control',
  "mishra's workshop": 'Land that taps for {C}{C}{C} for artifacts',
  'gemstone caverns': '0-mana Turn 0 land acceleration',
  'simian spirit guide': 'Free {R} mana from hand',
  'elvish spirit guide': 'Free {G} mana from hand',
  'dark ritual': '1-mana instant ritual for {B}{B}{B} (+2 net mana)',
  'cabal ritual': '2-mana ritual for {B}{B}{B} (or 5 {B} with Threshold)',
  'culling the weak': '1-mana ritual for {B}{B}{B}{B} (+3 net mana)',
  'rite of flame': '1-mana red ritual (+1 to +4 net mana)',
  'desperate ritual': '2-mana red ritual for {R}{R}{R}',
  'pyretic ritual': '2-mana red ritual for {R}{R}{R}',
  'seething song': '3-mana red ritual for {R}{R}{R}{R}{R} (+2 net mana)',
  "jeska's will": 'Explosive red ritual + 3-card impulse draw',
  'mana geyser': 'Explosive late-game red ritual based on tapped opponent lands',
  'carpet of flowers': '1-mana enchantment that generates free mana every turn off Islands',
  burgeoning: '1-mana enchantment that drops extra lands on opponents’ turns',
  exploration: '1-mana enchantment for 2 land drops per turn'
};

// Mass Land Denial (MLD) Catalog (Disallowed in Brackets 1, 2, and 3!)
const MLD_CATALOG: Record<string, string> = {
  armageddon: 'Destroys all lands',
  'ravages of war': 'Destroys all lands',
  catastrophe: 'Destroys all lands or all creatures',
  ruination: 'Destroys all nonbasic lands',
  'blood moon': 'Locks all nonbasic lands into basic Mountains',
  'magus of the moon': 'Locks all nonbasic lands into basic Mountains',
  'harbinger of the seas': 'Locks all nonbasic lands into basic Islands',
  'back to basics': 'Nonbasic lands do not untap',
  'winter orb': 'Players can only untap 1 land per turn',
  'static orb': 'Players can only untap 2 permanents per turn',
  stasis: 'Players skip their untap step entirely',
  'hokori, dust drinker': 'Players can only untap 1 land per turn',
  sunder: 'Returns all lands to their owners’ hands',
  obliterate: 'Uncounterable destruction of all lands, creatures, and artifacts',
  jokulhaups: 'Destroys all lands, creatures, and artifacts',
  'decree of annihilation': 'Exiles all lands, creatures, artifacts, graveyards, and hands',
  worldfire: 'Exiles all permanents, hands, and graveyards and sets life to 1',
  cataclysm: 'Forces every player to sacrifice all but 1 land, creature, artifact, and enchantment',
  'restore balance': 'Forces players to sacrifice lands and creatures down to the lowest count',
  'boom // bust': 'Destroys all lands with Bust',
  wildfire: 'Forces every player to sacrifice 4 lands',
  'destructive force': 'Forces every player to sacrifice 5 lands',
  'keldon firebombers': 'Forces every player to sacrifice all but 3 lands',
  contamination: 'Locks all lands to produce only {B}',
  'infernal darkness': 'Locks all lands to produce only {B}',
  'hall of gemstone': 'Locks all lands to produce only 1 chosen color each turn',
  'vorinclex, voice of hunger': 'Locks opponents’ lands from untapping during their next untap step',
  'rising waters': 'Lands do not untap during their controllers’ untap steps'
};

// Extra Turn Cards Catalog
const EXTRA_TURN_CATALOG: Record<string, string> = {
  expropriate: 'Extra turn + steals permanents from each opponent',
  'time warp': '5-mana extra turn spell',
  'temporal manipulation': '5-mana extra turn spell',
  'capture of jingzhou': '5-mana extra turn spell',
  'nexus of fate': 'Instant-speed shuffle-back extra turn spell (chains easily)',
  'temporal mastery': 'Miracle extra turn spell',
  'time stretch': 'Takes 2 extra turns at once',
  'walk the aeons': 'Buyback extra turn spell (chains infinite turns with land recursion)',
  'part the waterveil': 'Awaken extra turn spell',
  "alrund's epiphany": 'Extra turn + 2 Bird tokens',
  "karn's temporal sundering": 'Legendary extra turn + bounce',
  'temporal trespass': 'Delve extra turn spell',
  'notorious throng': 'Prowl extra turn + Faerie army',
  'beacon of tomorrows': 'Shuffle-back extra turn spell',
  'time sieve': 'Repeatable artifact sacrifice outlet for extra turns',
  'sage of hours': 'Repeatable +1/+1 counter outlet for extra turns',
  'medomai the ageless': 'Repeatable extra turns on combat damage',
  'lighthouse chronologist': 'Leveler that grants an extra turn after every opponent turn',
  'panoptic mirror': 'Imprints extra turn spells for infinite turns'
};

// Non-Land Tutors Catalog
const TUTOR_CATALOG: Record<string, string> = {
  'demonic tutor': '2-mana unconditional tutor',
  'vampiric tutor': '1-mana instant unconditional tutor',
  'imperial seal': '1-mana unconditional tutor',
  'diabolic intent': '2-mana unconditional sacrifice tutor',
  'grim tutor': '3-mana unconditional tutor',
  'cruel tutor': '3-mana unconditional tutor',
  'beseech the mirror': '4-mana Bargain tutor that casts the tutored spell for free',
  'demonic consultation': '1-mana instant forbidden tutor',
  'tainted pact': '2-mana instant forbidden tutor',
  entomb: '1-mana instant graveyard tutor',
  'buried alive': '3-creature graveyard tutor',
  'enlightened tutor': '1-mana instant artifact/enchantment tutor',
  'idyllic tutor': 'Enchantment tutor',
  'steelshaper\'s gift': '1-mana Equipment tutor',
  'open the armory': '2-mana Aura/Equipment tutor',
  'stoneforge mystic': '2-mana Equipment tutor + cheat into play',
  'mystical tutor': '1-mana instant spell tutor',
  'merchant scroll': '2-mana blue instant tutor',
  'personal tutor': '1-mana sorcery tutor',
  'solve the equation': 'Instant/sorcery tutor',
  fabricate: 'Artifact tutor',
  'whir of invention': 'Instant-speed Improvise artifact tutor to battlefield',
  'transmute artifact': 'Artifact sacrifice tutor directly to battlefield',
  intuition: '3-card instant tutor pile',
  'gifts ungiven': '4-card instant tutor pile',
  gamble: '1-mana unconditional red tutor',
  'imperial recruiter': 'Creature tutor (power <= 2)',
  'recruiter of the guard': 'Creature tutor (toughness <= 2)',
  'worldly tutor': '1-mana instant creature tutor',
  'sylvan tutor': '1-mana creature tutor',
  'finale of devastation': 'Creature tutor from library/graveyard + haste finisher',
  'chord of calling': 'Instant Convoke creature tutor to battlefield',
  "green sun's zenith": 'Green creature tutor to battlefield',
  'natural order': 'Green creature sacrifice tutor to battlefield',
  'eldritch evolution': 'Creature sacrifice tutor to battlefield',
  neoform: '2-mana creature sacrifice tutor to battlefield',
  'birthing pod': 'Repeatable creature sacrifice tutor chain',
  'survival of the fittest': 'Repeatable {G} discard creature tutor',
  'tooth and nail': 'Entwine 2-creature tutor straight to battlefield',
  'defense of the heart': '2-creature tutor straight to battlefield',
  'protean hulk': 'Death trigger tutors 6 MV of creatures to battlefield',
  "eladamri's call": '2-mana instant creature tutor',
  'bring to light': 'Converge tutor that casts the tutored card for free'
};

const FREE_INTERACTION_SET = new Set([
  'force of will',
  'force of negation',
  'fierce guardianship',
  'deflecting swat',
  'deadly rollick',
  'flawless maneuver',
  'obscuring haze',
  'pact of negation',
  'mental misstep',
  'mindbreak trap',
  'Subtlety',
  'subtlety',
  'endurance',
  'grief',
  'fury',
  'solitude',
  'flare of denial',
  'flare of fortitude',
  'flare of malice',
  'flare of duplication'
]);

// Famous Commander Infinite Combos Database (2-Card & 3-Card Infinite Loops)
const INFINITE_COMBOS_DB: Array<{
  id: string;
  pieces: string[];
  speed: 'early_2card' | 'late_or_3card';
  minTotalCmc: number;
  result: string;
  explanation: string;
}> = [
  {
    id: 'thoracle_consult',
    pieces: ["Thassa's Oracle", 'Demonic Consultation'],
    speed: 'early_2card',
    minTotalCmc: 3,
    result: '♾️ Instant Game Win',
    explanation: "Cast Thassa's Oracle, hold priority on its ETB trigger, and cast Demonic Consultation naming a card not in your deck to exile your library and win on the spot for {U}{U}{B}."
  },
  {
    id: 'thoracle_pact',
    pieces: ["Thassa's Oracle", 'Tainted Pact'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Instant Game Win',
    explanation: "Cast Thassa's Oracle and exile your library at instant speed with Tainted Pact before the Oracle ETB resolves."
  },
  {
    id: 'breach_led_freeze',
    pieces: ['Underworld Breach', "Lion's Eye Diamond", 'Brain Freeze'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Infinite Mana & Full Table Mill',
    explanation: 'Escape Lion’s Eye Diamond and Brain Freeze repeatedly to mill yourself for infinite storm and then mill out every opponent.'
  },
  {
    id: 'dramatic_scepter',
    pieces: ['Isochron Scepter', 'Dramatic Reversal'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Infinite Mana & Infinite Untaps',
    explanation: 'Imprint Dramatic Reversal on Isochron Scepter; with nonland permanents tapping for 3+ mana, untap all nonland permanents infinitely.'
  },
  {
    id: 'kinnan_basalt',
    pieces: ['Kinnan, Bonder Prodigy', 'Basalt Monolith'],
    speed: 'early_2card',
    minTotalCmc: 5,
    result: '♾️ Infinite Colorless Mana',
    explanation: 'Kinnan causes Basalt Monolith to tap for {C}{C}{C}{C} while untapping for {3}, netting infinite colorless mana on turn 2–3.'
  },
  {
    id: 'heliod_ballista',
    pieces: ['Heliod, Sun-Crowned', 'Walking Ballista'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Damage & Infinite Lifegain',
    explanation: 'Give Walking Ballista lifelink with Heliod; removing a +1/+1 counter to deal 1 damage gains 1 life, triggering Heliod to put the counter right back on.'
  },
  {
    id: 'exquisite_sanguine',
    pieces: ['Exquisite Blood', 'Sanguine Bond'],
    speed: 'late_or_3card',
    minTotalCmc: 10,
    result: '♾️ Infinite Life Drain Loop',
    explanation: 'Any life you gain or any life an opponent loses triggers an infinite drain loop until all opponents are at 0 life.'
  },
  {
    id: 'exquisite_vito',
    pieces: ['Exquisite Blood', 'Vito, Thorn of the Dusk Rose'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Life Drain Loop',
    explanation: 'Vito and Exquisite Blood trigger each other infinitely as soon as you gain 1 life or an opponent loses 1 life.'
  },
  {
    id: 'exquisite_marauding',
    pieces: ['Exquisite Blood', 'Marauding Blight-Priest'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Life Drain Loop',
    explanation: 'Marauding Blight-Priest and Exquisite Blood loop infinitely on any lifegain or opponent life loss.'
  },
  {
    id: 'exquisite_dina',
    pieces: ['Exquisite Blood', 'Dina, Soul Steeper'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Life Drain Loop',
    explanation: 'Dina and Exquisite Blood form a 2-card infinite life-drain loop.'
  },
  {
    id: 'exquisite_bloodthirsty',
    pieces: ['Exquisite Blood', 'Bloodthirsty Conqueror'],
    speed: 'late_or_3card',
    minTotalCmc: 10,
    result: '♾️ Infinite Life Drain Loop',
    explanation: 'Redundant Exquisite Blood / Sanguine Bond style infinite life-drain loop.'
  },
  {
    id: 'sanguine_bloodthirsty',
    pieces: ['Sanguine Bond', 'Bloodthirsty Conqueror'],
    speed: 'late_or_3card',
    minTotalCmc: 10,
    result: '♾️ Infinite Life Drain Loop',
    explanation: 'Bloodthirsty Conqueror and Sanguine Bond trigger each other infinitely on any lifegain or life loss.'
  },
  {
    id: 'vito_bloodthirsty',
    pieces: ['Vito, Thorn of the Dusk Rose', 'Bloodthirsty Conqueror'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Life Drain Loop',
    explanation: 'Vito and Bloodthirsty Conqueror trigger each other infinitely.'
  },
  {
    id: 'niv_parun_curiosity',
    pieces: ['Niv-Mizzet, Parun', 'Curiosity'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Card Draw & Damage',
    explanation: 'Enchant Niv-Mizzet with Curiosity; drawing a card deals 1 damage, which draws a card, repeating across your entire library.'
  },
  {
    id: 'niv_parun_ophidian',
    pieces: ['Niv-Mizzet, Parun', 'Ophidian Eye'],
    speed: 'early_2card',
    minTotalCmc: 9,
    result: '♾️ Infinite Card Draw & Damage',
    explanation: 'Flash in Ophidian Eye on Niv-Mizzet, Parun for an instant-speed draw + damage loop.'
  },
  {
    id: 'niv_parun_tandem',
    pieces: ['Niv-Mizzet, Parun', 'Tandem Lookout'],
    speed: 'early_2card',
    minTotalCmc: 9,
    result: '♾️ Infinite Card Draw & Damage',
    explanation: 'Soulbond Tandem Lookout with Niv-Mizzet, Parun for an infinite draw and ping loop.'
  },
  {
    id: 'niv_firemind_curiosity',
    pieces: ['Niv-Mizzet, the Firemind', 'Curiosity'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Card Draw & Damage',
    explanation: 'Tap Niv-Mizzet enchanted with Curiosity to draw your deck and deal damage equal to your library size.'
  },
  {
    id: 'niv_visionary_firemind',
    pieces: ['Niv-Mizzet, Visionary', 'Niv-Mizzet, Parun'],
    speed: 'late_or_3card',
    minTotalCmc: 12,
    result: '♾️ Infinite Card Draw & Damage',
    explanation: 'Both Niv-Mizzets trigger off each other’s noncombat damage and card draw infinitely.'
  },
  {
    id: 'godo_helm',
    pieces: ['Godo, Bandit Warlord', 'Helm of the Host'],
    speed: 'early_2card',
    minTotalCmc: 10,
    result: '♾️ Infinite Combat Phases',
    explanation: 'Godo tutors Helm of the Host directly onto the battlefield; equipping Helm creates a nonlegendary Godo every combat for infinite combat steps.'
  },
  {
    id: 'kiki_zealous',
    pieces: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'],
    speed: 'early_2card',
    minTotalCmc: 10,
    result: '♾️ Infinite Hasty Creature Tokens',
    explanation: 'Kiki-Jiki copies Zealous Conscripts, which untaps Kiki-Jiki on ETB to create infinite hasty 3/3 attackers.'
  },
  {
    id: 'kiki_pestermite',
    pieces: ['Kiki-Jiki, Mirror Breaker', 'Pestermite'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Hasty Faerie Tokens',
    explanation: 'Kiki-Jiki copies Pestermite to untap Kiki-Jiki indefinitely.'
  },
  {
    id: 'kiki_deceiver',
    pieces: ['Kiki-Jiki, Mirror Breaker', 'Deceiver Exarch'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Hasty Creature Tokens',
    explanation: 'Kiki-Jiki and Deceiver Exarch create infinite hasty attackers.'
  },
  {
    id: 'kiki_felidar',
    pieces: ['Kiki-Jiki, Mirror Breaker', 'Felidar Guardian'],
    speed: 'early_2card',
    minTotalCmc: 9,
    result: '♾️ Infinite Hasty Cat Beast Tokens',
    explanation: 'Kiki-Jiki copies Felidar Guardian, which blinks Kiki-Jiki untapped.'
  },
  {
    id: 'kiki_combat_celebrant',
    pieces: ['Kiki-Jiki, Mirror Breaker', 'Combat Celebrant'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Combat Phases',
    explanation: 'Kiki-Jiki copies Combat Celebrant, which exerts on attack to untap Kiki-Jiki and grant infinite combat steps.'
  },
  {
    id: 'twin_pestermite',
    pieces: ['Splinter Twin', 'Pestermite'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Hasty Faerie Tokens',
    explanation: 'Enchant Pestermite with Splinter Twin and tap it to make infinite copies that untap the original.'
  },
  {
    id: 'twin_deceiver',
    pieces: ['Splinter Twin', 'Deceiver Exarch'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Hasty Creature Tokens',
    explanation: 'Splinter Twin + Deceiver Exarch 2-card infinite token combo.'
  },
  {
    id: 'twin_zealous',
    pieces: ['Splinter Twin', 'Zealous Conscripts'],
    speed: 'early_2card',
    minTotalCmc: 9,
    result: '♾️ Infinite Hasty Creature Tokens',
    explanation: 'Splinter Twin + Zealous Conscripts 2-card infinite token combo.'
  },
  {
    id: 'dualcaster_twinflame',
    pieces: ['Dualcaster Mage', 'Twinflame'],
    speed: 'early_2card',
    minTotalCmc: 5,
    result: '♾️ Infinite Hasty 2/2 Wizards',
    explanation: 'Cast Twinflame and flash in Dualcaster Mage copying Twinflame repeatedly for infinite hasty attackers.'
  },
  {
    id: 'dualcaster_molten',
    pieces: ['Dualcaster Mage', 'Molten Duplication'],
    speed: 'early_2card',
    minTotalCmc: 5,
    result: '♾️ Infinite Hasty 2/2 Wizards',
    explanation: 'Cast Molten Duplication and respond with Dualcaster Mage for infinite hasty Dualcaster tokens.'
  },
  {
    id: 'dualcaster_heat_shimmer',
    pieces: ['Dualcaster Mage', 'Heat Shimmer'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Hasty 2/2 Wizards',
    explanation: 'Dualcaster Mage + Heat Shimmer 2-card infinite token combo.'
  },
  {
    id: 'witherbloom_smog',
    pieces: ['Witherbloom Apprentice', 'Chain of Smog'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Infinite Table Life Drain (Magecraft)',
    explanation: 'Cast Chain of Smog targeting yourself repeatedly (even with 0 cards in hand) to trigger Witherbloom Apprentice’s Magecraft drain infinitely.'
  },
  {
    id: 'professor_onyx_smog',
    pieces: ['Professor Onyx', 'Chain of Smog'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Table Life Drain (Magecraft)',
    explanation: 'Target yourself with Chain of Smog infinitely to drain every opponent to 0 with Professor Onyx.'
  },
  {
    id: 'basalt_rings',
    pieces: ['Basalt Monolith', 'Rings of Brighthearth'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Colorless Mana',
    explanation: 'Copy Basalt Monolith’s untap ability with Rings of Brighthearth for {2}, tapping it twice for {6} and netting infinite mana.'
  },
  {
    id: 'basalt_forsaken',
    pieces: ['Basalt Monolith', 'Forsaken Monument'],
    speed: 'early_2card',
    minTotalCmc: 8,
    result: '♾️ Infinite Colorless Mana',
    explanation: 'Forsaken Monument causes Basalt Monolith to tap for 4 colorless mana while untapping for 3.'
  },
  {
    id: 'grim_power',
    pieces: ['Grim Monolith', 'Power Artifact'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Infinite Colorless Mana',
    explanation: 'Power Artifact reduces Grim Monolith’s untap cost to {2} while it taps for {C}{C}{C}.'
  },
  {
    id: 'basalt_power',
    pieces: ['Basalt Monolith', 'Power Artifact'],
    speed: 'early_2card',
    minTotalCmc: 5,
    result: '♾️ Infinite Colorless Mana',
    explanation: 'Power Artifact reduces Basalt Monolith’s untap cost to {1} while it taps for {C}{C}{C}.'
  },
  {
    id: 'devoted_vizier',
    pieces: ['Devoted Druid', 'Vizier of Remedies'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Infinite Green Mana',
    explanation: 'Vizier of Remedies prevents Devoted Druid from placing -1/-1 counters on itself, letting it untap infinitely for {G}.'
  },
  {
    id: 'devoted_swift',
    pieces: ['Devoted Druid', 'Swift Reconfiguration'],
    speed: 'early_2card',
    minTotalCmc: 3,
    result: '♾️ Infinite Green Mana',
    explanation: 'Turning Devoted Druid into a non-creature Vehicle removes its toughness restriction, letting it untap infinitely for {G}.'
  },
  {
    id: 'food_chain_squee',
    pieces: ['Food Chain', 'Squee, the Immortal'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Creature Mana & Storm',
    explanation: 'Exile Squee to Food Chain for 4 mana and recast Squee from exile for 3 mana infinitely.'
  },
  {
    id: 'food_chain_griffin',
    pieces: ['Food Chain', 'Misthollow Griffin'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Creature Mana',
    explanation: 'Exile Misthollow Griffin to Food Chain for 5 mana and recast it from exile for 4 mana infinitely.'
  },
  {
    id: 'food_chain_scourge',
    pieces: ['Food Chain', 'Eternal Scourge'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Creature Mana',
    explanation: 'Exile Eternal Scourge to Food Chain for 4 mana and recast it from exile for 3 mana infinitely.'
  },
  {
    id: 'najeela_derevi',
    pieces: ['Najeela, the Blade-Blossom', 'Derevi, Empyrial Tactician'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Combat Phases',
    explanation: 'Unblocked Warriors trigger Derevi to untap your 5-color lands, paying {W}{U}{B}{R}{G} to activate Najeela infinitely.'
  },
  {
    id: 'malcolm_glint',
    pieces: ['Malcolm, Keen-Eyed Navigator', 'Glint-Horn Buccaneer'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Treasures & Table Damage',
    explanation: 'Activate Glint-Horn Buccaneer during combat to ping all 3 opponents, creating 3 Treasures via Malcolm to activate Glint-Horn again infinitely.'
  },
  {
    id: 'stella_cerulean',
    pieces: ['Stella Lee, Wild Card', 'Cerulean Wisps'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Draw Entire Library at Instant Speed',
    explanation: 'Tap Stella Lee to copy Cerulean Wisps targeting Stella Lee, untapping her and drawing a card infinitely.'
  },
  {
    id: 'stella_twisted',
    pieces: ['Stella Lee, Wild Card', 'Twisted Fealty'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Wicked Role Drain',
    explanation: 'Stella Lee copies Twisted Fealty infinitely, replacing the Wicked Role token on each resolution to drain the table to 0.'
  },
  {
    id: 'bolas_top_aetherflux',
    pieces: ["Bolas's Citadel", "Sensei's Divining Top", 'Aetherflux Reservoir'],
    speed: 'late_or_3card',
    minTotalCmc: 11,
    result: '♾️ Infinite Card Draw, Life & 50-Damage Laser',
    explanation: 'Tap Top to draw and put Top on top of your library, then cast Top for 1 life via Bolas’s Citadel while Aetherflux Reservoir gains exponentially more life.'
  },
  {
    id: 'mikaeus_triskelion',
    pieces: ['Mikaeus, the Unhallowed', 'Triskelion'],
    speed: 'late_or_3card',
    minTotalCmc: 12,
    result: '♾️ Infinite Damage',
    explanation: 'Triskelion pings opponents and then itself; Mikaeus’s Undying returns Triskelion with an extra +1/+1 counter infinitely.'
  },
  {
    id: 'mikaeus_ballista_sac',
    pieces: ['Mikaeus, the Unhallowed', 'Walking Ballista'],
    speed: 'late_or_3card',
    minTotalCmc: 6,
    result: '♾️ Infinite Ping Loop (with Sac Outlet)',
    explanation: 'With any sacrifice outlet, Walking Ballista returns via Mikaeus’s Undying with a +1/+1 counter to deal infinite damage.'
  },
  {
    id: 'time_sieve_thopter',
    pieces: ['Time Sieve', 'Thopter Assembly'],
    speed: 'late_or_3card',
    minTotalCmc: 8,
    result: '♾️ Infinite Extra Turns',
    explanation: 'Thopter Assembly creates 5 Thopters on upkeep, which you sacrifice to Time Sieve for infinite turns.'
  },
  {
    id: 'sword_thopter_urza',
    pieces: ['Thopter Foundry', 'Sword of the Meek', 'Urza, Lord High Artificer'],
    speed: 'late_or_3card',
    minTotalCmc: 8,
    result: '♾️ Infinite Thopters, Life & Mana',
    explanation: 'Sacrifice Sword of the Meek to Thopter Foundry to make a 1/1 Thopter, returning Sword and tapping it for {U} via Urza infinitely.'
  },
  {
    id: 'deadeye_peregrine',
    pieces: ['Deadeye Navigator', 'Peregrine Drake'],
    speed: 'late_or_3card',
    minTotalCmc: 11,
    result: '♾️ Infinite Mana & ETBs',
    explanation: 'Soulbond Deadeye Navigator with Peregrine Drake; blinking Drake for {1}{U} untaps 5 lands infinitely.'
  },
  {
    id: 'emiel_dockside',
    pieces: ['Emiel the Blessed', 'Peregrine Drake'],
    speed: 'late_or_3card',
    minTotalCmc: 9,
    result: '♾️ Infinite Mana',
    explanation: 'Blink Peregrine Drake with Emiel the Blessed for {3} while untapping 5 lands.'
  },
  {
    id: 'siona_shielded',
    pieces: ['Siona, Captain of the Pyleas', 'Shielded by Faith'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite 1/1 Soldier Tokens',
    explanation: 'Shielded by Faith moves onto each newly created Soldier token, triggering Siona infinitely.'
  },
  {
    id: 'scurry_ivy',
    pieces: ['Scurry Oak', 'Ivy Lane Denizen'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite 1/1 Squirrel Tokens & Infinite Power',
    explanation: 'Ivy Lane Denizen puts a +1/+1 counter on Scurry Oak whenever a green Squirrel enters, triggering Scurry Oak to make another Squirrel infinitely.'
  },
  {
    id: 'herd_baloth_ivy',
    pieces: ['Herd Baloth', 'Ivy Lane Denizen'],
    speed: 'early_2card',
    minTotalCmc: 9,
    result: '♾️ Infinite 4/4 Beast Tokens',
    explanation: 'Ivy Lane Denizen and Herd Baloth create infinite 4/4 Beasts and infinite +1/+1 counters.'
  },
  {
    id: 'basking_ivy',
    pieces: ['Basking Broodscale', 'Blade of the Bloodchief'],
    speed: 'early_2card',
    minTotalCmc: 3,
    result: '♾️ Infinite Colorless Mana & Infinite Power',
    explanation: 'Sacrificing an Eldrazi Spawn triggers Blade of the Bloodchief to put a +1/+1 counter on Basking Broodscale, which creates another Eldrazi Spawn infinitely.'
  },
  {
    id: 'broodscale_sadistic',
    pieces: ['Basking Broodscale', 'Sadistic Glee'],
    speed: 'early_2card',
    minTotalCmc: 3,
    result: '♾️ Infinite Colorless Mana & Infinite Power',
    explanation: 'Sadistic Glee puts a +1/+1 counter on Basking Broodscale whenever an Eldrazi Spawn is sacrificed for mana, creating another Spawn infinitely.'
  },
  {
    id: 'roalesk_rosie_scurry',
    pieces: ['Rosie Cotton of South Lane', 'Scurry Oak'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Infinite Squirrel Tokens',
    explanation: 'Rosie Cotton puts a +1/+1 counter on Scurry Oak whenever a token enters, creating infinite Squirrels.'
  },
  {
    id: 'rosie_basking',
    pieces: ['Rosie Cotton of South Lane', 'Basking Broodscale'],
    speed: 'early_2card',
    minTotalCmc: 5,
    result: '♾️ Infinite Eldrazi Spawn & Colorless Mana',
    explanation: 'Rosie Cotton and Basking Broodscale loop +1/+1 counters and Eldrazi Spawn tokens infinitely.'
  },
  {
    id: 'chatterfang_pitiless',
    pieces: ['Chatterfang, Squirrel General', 'Pitiless Plunderer'],
    speed: 'early_2card',
    minTotalCmc: 7,
    result: '♾️ Infinite Dies Triggers, Treasures & Board Wipe',
    explanation: 'Sacrificing Squirrels with Chatterfang triggers Pitiless Plunderer to make Treasures, which Chatterfang doubles into more Squirrels.'
  },
  {
    id: 'mindcrank_duskmantle',
    pieces: ['Mindcrank', 'Duskmantle Guildmage'],
    speed: 'early_2card',
    minTotalCmc: 4,
    result: '♾️ Infinite Mill & Life Loss',
    explanation: 'Activate Duskmantle Guildmage’s first ability; any card hitting an opponent’s graveyard or any life loss mills and drains them out completely.'
  },
  {
    id: 'mindcrank_bloodchief',
    pieces: ['Mindcrank', 'Bloodchief Ascension'],
    speed: 'early_2card',
    minTotalCmc: 3,
    result: '♾️ Infinite Mill & Life Drain',
    explanation: 'With an active Bloodchief Ascension, Mindcrank causes any life loss or milled card to drain and mill that opponent to 0.'
  },
  {
    id: 'bruvac_maddening',
    pieces: ['Bruvac the Grandiloquent', 'Maddening Cacophony'],
    speed: 'early_2card',
    minTotalCmc: 5,
    result: '♾️ Instant Full-Table Library Mill',
    explanation: 'Bruvac doubles Maddening Cacophony’s kicked "mill half their library" effect to mill 100% of every opponent’s library at once.'
  },
  {
    id: 'painter_grindstone',
    pieces: ["Painter's Servant", 'Grindstone'],
    speed: 'early_2card',
    minTotalCmc: 3,
    result: '♾️ Instant Entire-Library Mill',
    explanation: 'Painter’s Servant makes every card in all libraries share a color, causing Grindstone’s activation to mill an entire library in one go.'
  },
  {
    id: 'helm_rest_in_peace',
    pieces: ['Helm of Obedience', 'Rest in Peace'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Instant Entire-Library Exile',
    explanation: 'Rest in Peace replaces cards hitting the graveyard with exile, so Helm of Obedience never sees a card hit the graveyard and exiles the opponent’s whole library for X=1.'
  },
  {
    id: 'helm_dauthi',
    pieces: ['Helm of Obedience', 'Dauthi Voidwalker'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '♾️ Instant Entire-Library Exile',
    explanation: 'Dauthi Voidwalker exiles every card milled by Helm of Obedience with a void counter, exiling the target opponent’s entire deck for X=1.'
  },
  {
    id: 'knowledge_pool_drannith',
    pieces: ['Knowledge Pool', 'Drannith Magistrate'],
    speed: 'late_or_3card',
    minTotalCmc: 8,
    result: '🔒 Complete Opponent Spell Lock',
    explanation: 'Knowledge Pool exiles every spell cast from hand, and Drannith Magistrate prevents opponents from casting spells from Knowledge Pool.'
  },
  {
    id: 'knowledge_pool_lavinia',
    pieces: ['Knowledge Pool', 'Lavinia, Azorius Renegade'],
    speed: 'late_or_3card',
    minTotalCmc: 8,
    result: '🔒 Complete Opponent Spell Lock',
    explanation: 'Lavinia counters any spell cast for free from Knowledge Pool, locking opponents out of casting spells.'
  },
  {
    id: 'maralen_opposition',
    pieces: ['Maralen of the Mornsong', 'Opposition Agent'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '🔒 Complete Draw & Tutor Lock',
    explanation: 'Maralen skips players’ draw steps and forces them to search their libraries, which Opposition Agent hijacks every single turn.'
  },
  {
    id: 'narset_windfall',
    pieces: ['Narset, Parter of Veils', 'Windfall'],
    speed: 'early_2card',
    minTotalCmc: 6,
    result: '🔒 Strip All Opponents to 1 Card in Hand',
    explanation: 'Windfall forces every player to discard their hand, and Narset restricts every opponent to drawing only 1 card while you draw a full hand.'
  }
];

// EDHREC-Calibrated Community Salt Scores (0.00 to 3.60)
const CARD_SALT_SCORES: Record<string, { score: number; reason: string }> = {
  stasis: { score: 3.45, reason: 'Completely skips everyone’s untap step, grinding the game to a halt.' },
  'winter orb': { score: 3.38, reason: 'Restricts players to untapping only 1 land per turn.' },
  armageddon: { score: 3.31, reason: 'Destroys all lands, resetting everyone’s mana.' },
  'ravages of war': { score: 3.30, reason: 'Destroys all lands.' },
  'vorinclex, voice of hunger': { score: 3.24, reason: 'Freezes opponents’ lands for an entire turn cycle while doubling your mana.' },
  'tergrid, god of fright': { score: 3.21, reason: 'Steals every permanent opponents sacrifice or discard.' },
  'tergrid, god of fright // tergrid\'s lantern': { score: 3.21, reason: 'Steals every permanent opponents sacrifice or discard.' },
  expropriate: { score: 3.16, reason: 'Takes extra turns and steals everyone’s best permanents.' },
  'drannith magistrate': { score: 3.12, reason: 'Prevents opponents from playing their Commander.' },
  'jin-gitaxias, core augur': { score: 3.09, reason: 'Reduces opponents’ maximum hand size to 0.' },
  'static orb': { score: 3.07, reason: 'Limits all players to untapping only 2 permanents per turn.' },
  'grand arbiter augustin iv': { score: 3.05, reason: 'Taxes every spell your opponents cast.' },
  'the tabernacle at pendrell vale': { score: 3.04, reason: 'Taxes every creature on the board every upkeep.' },
  obliterate: { score: 3.02, reason: 'Uncounterable wipe of all lands, creatures, and artifacts.' },
  jokulhaups: { score: 3.00, reason: 'Wipes all lands, creatures, and artifacts.' },
  'decree of annihilation': { score: 3.02, reason: 'Exiles all lands, creatures, hands, and graveyards.' },
  sunder: { score: 2.99, reason: 'Bounces all lands back to players’ hands at instant speed.' },
  'sen triplets': { score: 2.98, reason: 'Locks an opponent on your turn and plays cards directly from their hand.' },
  'cyclonic rift': { score: 2.96, reason: 'Instant-speed one-sided bounce of every opponent’s board.' },
  'toxrill, the corrosive': { score: 2.95, reason: 'Puts slime counters on every opponent creature every end step, wiping boards continuously.' },
  'opposition agent': { score: 2.93, reason: 'Flashes in to hijack opponents’ ramp and tutor spells.' },
  'blood moon': { score: 2.91, reason: 'Shuts off all nonbasic lands for multicolor decks.' },
  'back to basics': { score: 2.89, reason: 'Prevents all nonbasic lands from untapping.' },
  'rhystic study': { score: 2.88, reason: 'Constantly asks "Do you pay the {1}?" on every spell cast.' },
  'narset, parter of veils': { score: 2.86, reason: 'Shuts off all extra card draw and strips hands with wheels.' },
  "thassa's oracle": { score: 2.85, reason: 'Ends games out of nowhere for 2 mana with library-exile effects.' },
  'smothering tithe': { score: 2.82, reason: 'Asks "Do you pay {2}?" on every draw and snowballs Treasures.' },
  humility: { score: 2.84, reason: 'Strips all abilities from all creatures and makes them 1/1s.' },
  'hokori, dust drinker': { score: 2.88, reason: 'Winter Orb on a legendary creature.' },
  contamination: { score: 2.86, reason: 'Locks all lands to produce only black mana.' },
  ruination: { score: 2.80, reason: 'Destroys all nonbasic lands.' },
  'the one ring': { score: 2.78, reason: 'Indestructible card advantage + full-turn protection.' },
  'fierce guardianship': { score: 2.72, reason: '0-mana free counterspell.' },
  'force of will': { score: 2.68, reason: '0-mana free counterspell.' },
  'mana drain': { score: 2.66, reason: 'Hard counterspell that also generates a huge mana burst next turn.' },
  'time stretch': { score: 2.75, reason: 'Forces the table to watch 2 extra turns in a row.' },
  'nexus of fate': { score: 2.74, reason: 'Instant-speed repeatable extra turn spell.' },
  'consecrated sphinx': { score: 2.71, reason: 'Draws 2 cards for every 1 card an opponent draws.' },
  'notion thief': { score: 2.73, reason: 'Flashes in to steal all opponent card draw.' },
  "teferi's protection": { score: 2.62, reason: 'Makes you untouchable for an entire turn cycle.' },
  farewell: { score: 2.64, reason: 'Exiles all artifacts, creatures, enchantments, AND graveyards with no recursion.' },
  'void winnower': { score: 2.79, reason: 'Prevents opponents from even casting or blocking with even-CMC cards.' },
  'jin-gitaxias, progress tyrant': { score: 2.76, reason: 'Automatically counters the first artifact/instant/sorcery opponents cast each turn.' },
  'elesh norn, grand cenobite': { score: 2.65, reason: 'Gives all opponent creatures -2/-2 continuously.' },
  'elesh norn, mother of machines': { score: 2.69, reason: 'Completely shuts off all ETB triggers for opponents while doubling yours.' },
  'sheoldred, the apocalypse': { score: 2.67, reason: 'Punishes opponents for 2 life on every single card they draw.' },
  'orcish bowmasters': { score: 2.63, reason: 'Punishes every extra card draw with pings and growing Army tokens.' },
  'demonic tutor': { score: 2.40, reason: 'High-consistency unconditional tutor.' },
  'vampiric tutor': { score: 2.48, reason: '1-mana instant-speed unconditional tutor.' },
  'imperial seal': { score: 2.44, reason: '1-mana unconditional tutor.' },
  "gaea's cradle": { score: 2.60, reason: 'Explosive reserved-list fast mana land.' },
  'ancient tomb': { score: 2.38, reason: 'Turn-1 2-mana acceleration.' },
  'mana vault': { score: 2.35, reason: 'Explosive 1-mana ritual rock.' },
  'chrome mox': { score: 2.32, reason: '0-mana cEDH fast mana.' },
  'mox diamond': { score: 2.36, reason: '0-mana cEDH fast mana.' },
  'seedborn muse': { score: 2.52, reason: 'Untaps your entire board on every player’s turn.' },
  'dauthi voidwalker': { score: 2.49, reason: 'Asymmetrical graveyard exile + free spell theft.' },
  'esper sentinel': { score: 2.25, reason: 'Turn-1 Rhystic buddy that taxes noncreature spells.' },
  'mystic remora': { score: 2.34, reason: '1-mana draw engine that taxes noncreature spells by {4}.' },
  'smokestack': { score: 2.83, reason: 'Forces players to sacrifice permanents every turn.' },
  'tangle wire': { score: 2.77, reason: 'Taps down players’ lands and permanents every upkeep.' },
  trinisphere: { score: 2.70, reason: 'Forces every spell to cost at least 3 mana.' },
  'dictate of erebos': { score: 2.46, reason: 'Forces opponents to sacrifice their board whenever your creatures die.' },
  'grave pact': { score: 2.45, reason: 'Forces opponents to sacrifice their board whenever your creatures die.' },
  'aura shards': { score: 2.54, reason: 'Destroys an artifact or enchantment every time a creature enters.' },
  'oko, thief of crowns': { score: 2.56, reason: 'Turns opponents’ Commanders into 3/3 Elks with no abilities.' },
  'imprisoned in the moon': { score: 2.30, reason: 'Locks an opponent’s Commander into a colorless land.' },
  'darksteel mutation': { score: 2.28, reason: 'Locks an opponent’s Commander into an indestructible 0/1 bug.' },
  'song of the dryads': { score: 2.31, reason: 'Locks an opponent’s Commander into a Forest.' },
  'animate dead': { score: 1.85, reason: '2-mana reanimation + combo piece.' },
  'sol ring': { score: 1.65, reason: 'Turn-1 fast mana staple.' }
};

export function getSingleCardBracketBadges(card: {
  name?: string;
  oracle_text?: string;
  type_line?: string;
}): {
  isGameChanger: boolean;
  gameChangerCategory?: string;
  isFastMana: boolean;
  isMld: boolean;
  isExtraTurn: boolean;
  isTutor: boolean;
  saltScore: number;
  saltReasons: string[];
} {
  const rawName = (card.name || '').trim();
  const lower = rawName.toLowerCase();
  const front = lower.includes('//') ? lower.split('//')[0].trim() : lower;
  const ot = (card.oracle_text || '').toLowerCase();

  const gc = OFFICIAL_WOTC_GAME_CHANGERS[lower] || OFFICIAL_WOTC_GAME_CHANGERS[front];
  const isFastMana = Boolean(FAST_MANA_CATALOG[lower] || FAST_MANA_CATALOG[front]);
  const isMld = Boolean(MLD_CATALOG[lower] || MLD_CATALOG[front]);
  const isExtraTurn =
    Boolean(EXTRA_TURN_CATALOG[lower] || EXTRA_TURN_CATALOG[front]) ||
    ot.includes('extra turn');
  const isTutor = Boolean(TUTOR_CATALOG[lower] || TUTOR_CATALOG[front]);

  // Compute card salt score (0.00 to 3.60)
  const knownSalt = CARD_SALT_SCORES[lower] || CARD_SALT_SCORES[front];
  let saltScore = knownSalt ? knownSalt.score : 0.35;
  const saltReasons: string[] = [];

  if (knownSalt) {
    saltReasons.push(knownSalt.reason);
  }
  if (gc) {
    saltScore = Math.max(saltScore, 2.35);
    if (!knownSalt) saltReasons.push(`Official WotC Game Changer (${gc.category})`);
  }
  if (isMld) {
    saltScore = Math.max(saltScore, 2.85);
    if (!knownSalt) saltReasons.push('Mass Land Denial / Mana Lock');
  }
  if (isExtraTurn) {
    saltScore = Math.max(saltScore, 2.30);
    if (!knownSalt) saltReasons.push('Takes extra turns');
  }

  // Oracle text salt heuristics for cards not in the explicit lookup
  if (!knownSalt) {
    if (ot.includes('destroy all lands') || ot.includes('lands don\'t untap')) {
      saltScore = Math.max(saltScore, 2.95);
      saltReasons.push('Mass land destruction or untap lock');
    }
    if (ot.includes('infect') || ot.includes('poison counter')) {
      saltScore = Math.max(saltScore, 1.95);
      saltReasons.push('Infect / Poison counters');
    }
    if (ot.includes('annihilator')) {
      saltScore = Math.max(saltScore, 2.25);
      saltReasons.push('Annihilator permanent sacrifice trigger');
    }
    if (ot.includes('opponents can\'t cast') || ot.includes('players can\'t')) {
      saltScore = Math.max(saltScore, 2.05);
      saltReasons.push('Stax / Rule-setting restriction');
    }
    if (ot.includes('spells your opponents cast cost')) {
      saltScore = Math.max(saltScore, 2.0);
      saltReasons.push('Taxes opponents’ spells');
    }
    if (ot.includes('gain control of target') || ot.includes('you may play') && ot.includes('opponent')) {
      saltScore = Math.max(saltScore, 1.80);
      saltReasons.push('Steals opponents’ permanents or spells');
    }
    if (ot.includes('counter target')) {
      saltScore = Math.max(saltScore, 1.35);
      if (saltReasons.length === 0) saltReasons.push('Countermagic interaction');
    }
    if (ot.includes('you win the game') || ot.includes('loses the game')) {
      saltScore = Math.max(saltScore, 1.90);
      saltReasons.push('Alternate instant win/loss condition');
    }
  }

  return {
    isGameChanger: Boolean(gc),
    gameChangerCategory: gc?.category,
    isFastMana,
    isMld,
    isExtraTurn,
    isTutor,
    saltScore: Number(saltScore.toFixed(2)),
    saltReasons
  };
}

export function evaluateDeckBracketAndSalt(
  deckCards: DeckCardItem[],
  avgCmc = 3.0
): DeckBracketAndSaltReport {
  // Consider active deck cards (Commander + Mainboard)
  const activeCards = deckCards.filter(
    c => c.board === 'commander' || c.board === 'mainboard'
  );

  // Build fast lookup by lowercase name (and front-face name for DFCs)
  const cardByName = new Map<string, DeckCardItem>();
  for (const c of activeCards) {
    const lower = (c.name || '').toLowerCase().trim();
    cardByName.set(lower, c);
    if (lower.includes('//')) {
      cardByName.set(lower.split('//')[0].trim(), c);
    }
  }

  const gameChangers: GameChangerHit[] = [];
  const fastManaCards: Array<{ name: string; note: string; card?: DeckCardItem }> = [];
  const mldCards: Array<{ name: string; note: string; card?: DeckCardItem }> = [];
  const extraTurnCards: Array<{ name: string; note: string; card?: DeckCardItem }> = [];
  const tutorCards: Array<{ name: string; note: string; card?: DeckCardItem }> = [];
  const freeInteractionCards: string[] = [];
  const allSaltyHits: SaltyCardHit[] = [];

  let totalSaltSum = 0;
  let totalCardQty = 0;

  for (const card of activeCards) {
    const lower = (card.name || '').toLowerCase().trim();
    const front = lower.includes('//') ? lower.split('//')[0].trim() : lower;
    const ot = (card.oracle_text || '').toLowerCase();
    const qty = Math.max(1, Number(card.quantity || 1));

    const gc = OFFICIAL_WOTC_GAME_CHANGERS[lower] || OFFICIAL_WOTC_GAME_CHANGERS[front];
    if (gc) {
      gameChangers.push({
        name: card.name,
        category: gc.category,
        reason: gc.reason,
        card
      });
    }

    const fm = FAST_MANA_CATALOG[lower] || FAST_MANA_CATALOG[front];
    if (fm) {
      fastManaCards.push({ name: card.name, note: fm, card });
    }

    const mld = MLD_CATALOG[lower] || MLD_CATALOG[front];
    if (mld || ot.includes('destroy all lands')) {
      mldCards.push({
        name: card.name,
        note: mld || 'Mass land destruction effect',
        card
      });
    }

    const et = EXTRA_TURN_CATALOG[lower] || EXTRA_TURN_CATALOG[front];
    if (et || ot.includes('extra turn')) {
      extraTurnCards.push({
        name: card.name,
        note: et || 'Grants an extra turn',
        card
      });
    }

    const tut = TUTOR_CATALOG[lower] || TUTOR_CATALOG[front];
    if (tut) {
      tutorCards.push({ name: card.name, note: tut, card });
    }

    if (FREE_INTERACTION_SET.has(lower) || FREE_INTERACTION_SET.has(front)) {
      freeInteractionCards.push(card.name);
    }

    const badgeInfo = getSingleCardBracketBadges(card);
    totalSaltSum += badgeInfo.saltScore * qty;
    totalCardQty += qty;

    if (badgeInfo.saltScore >= 1.35 || badgeInfo.isGameChanger || badgeInfo.isMld) {
      allSaltyHits.push({
        name: card.name,
        saltScore: badgeInfo.saltScore,
        reasons:
          badgeInfo.saltReasons.length > 0
            ? badgeInfo.saltReasons
            : ['High-impact staple / table threat'],
        isGameChanger: badgeInfo.isGameChanger,
        isFastMana: badgeInfo.isFastMana,
        isMld: badgeInfo.isMld,
        card
      });
    }
  }

  // Detect Active Infinite Combos & 1-Card-Away Near Combos
  const infiniteCombos: InfiniteComboHit[] = [];
  const nearCombos: NearComboHit[] = [];

  for (const combo of INFINITE_COMBOS_DB) {
    const presentPieces: string[] = [];
    const missingPieces: string[] = [];
    for (const p of combo.pieces) {
      const pLower = p.toLowerCase();
      if (cardByName.has(pLower)) {
        presentPieces.push(p);
      } else {
        missingPieces.push(p);
      }
    }

    if (missingPieces.length === 0) {
      infiniteCombos.push({
        id: combo.id,
        names: combo.pieces,
        speed: combo.speed,
        result: combo.result,
        explanation: combo.explanation,
        minTotalCmc: combo.minTotalCmc
      });
    } else if (combo.pieces.length === 2 && presentPieces.length === 1) {
      nearCombos.push({
        id: combo.id,
        ownedPiece: presentPieces[0],
        missingPiece: missingPieces[0],
        result: combo.result
      });
    }
  }

  const earlyTwoCardCombos = infiniteCombos.filter(c => c.speed === 'early_2card');
  const nonSolRingFastMana = fastManaCards.filter(
    f => f.name.toLowerCase() !== 'sol ring'
  );

  // Determine Official Wizards of the Coast Commander Bracket (1 to 5)
  let bracket: 1 | 2 | 3 | 4 | 5 = 1;
  const bracketReasons: string[] = [];
  const howToLowerBracket: string[] = [];

  // Check cEDH (Bracket 5) vs Optimized (Bracket 4) vs Upgraded (Bracket 3) vs Core (Bracket 2) vs Exhibition (Bracket 1)
  const isCedhProfile =
    (gameChangers.length >= 5 &&
      nonSolRingFastMana.length >= 4 &&
      tutorCards.length >= 4 &&
      earlyTwoCardCombos.length >= 1 &&
      (avgCmc > 0 ? avgCmc <= 2.45 : true)) ||
    (gameChangers.length >= 7 &&
      nonSolRingFastMana.length >= 5 &&
      freeInteractionCards.length >= 3);

  if (isCedhProfile) {
    bracket = 5;
    bracketReasons.push(
      `Tournament cEDH Profile: ${gameChangers.length} Official Game Changers, ${nonSolRingFastMana.length} fast-mana accelerators (beyond Sol Ring), ${tutorCards.length} non-land tutors, and ${earlyTwoCardCombos.length} compact 2-card infinite win condition(s).`
    );
    howToLowerBracket.push(
      'To drop from Bracket 5 (cEDH) to Bracket 3 (Upgraded): Cut down to at most 3 Game Changers, remove early 2-card infinite combos, and trim 0-mana fast mana rocks.'
    );
  } else if (
    gameChangers.length > 3 ||
    mldCards.length > 0 ||
    earlyTwoCardCombos.length > 0 ||
    extraTurnCards.length >= 3 ||
    nonSolRingFastMana.length >= 4
  ) {
    bracket = 4;
    if (gameChangers.length > 3) {
      bracketReasons.push(
        `Contains ${gameChangers.length} Official WotC Game Changers (${gameChangers.map(g => g.name).join(', ')}) — Bracket 3 allows a maximum of 3 Game Changers.`
      );
      howToLowerBracket.push(
        `Cut ${gameChangers.length - 3} Game Changer card(s) (down to 3 or fewer) to qualify for Bracket 3.`
      );
    }
    if (earlyTwoCardCombos.length > 0) {
      bracketReasons.push(
        `Contains ${earlyTwoCardCombos.length} early-game 2-card infinite combo(s): ${earlyTwoCardCombos.map(c => c.names.join(' + ')).join('; ')}. (Official WotC rules restrict early 2-card infinite combos to Bracket 4+).`
      );
      howToLowerBracket.push(
        `Remove 1 piece from ${earlyTwoCardCombos.map(c => c.names.join(' + ')).join(' / ')} to drop down to Bracket 3.`
      );
    }
    if (mldCards.length > 0) {
      bracketReasons.push(
        `Contains Mass Land Denial (${mldCards.map(m => m.name).join(', ')}) — Official WotC rules disallow Mass Land Denial in Brackets 1, 2, and 3.`
      );
      howToLowerBracket.push(
        `Remove Mass Land Denial (${mldCards.map(m => m.name).join(', ')}) to play in Bracket 2 or 3.`
      );
    }
    if (extraTurnCards.length >= 3) {
      bracketReasons.push(
        `Contains ${extraTurnCards.length} Extra Turn cards (${extraTurnCards.map(e => e.name).join(', ')}), enabling chaining extra turns (Bracket 4+).`
      );
      howToLowerBracket.push('Trim Extra Turn spells down to 0–1 to avoid chaining extra turns.');
    }
    if (nonSolRingFastMana.length >= 4 && bracketReasons.length === 0) {
      bracketReasons.push(
        `High density of Fast Mana (${fastManaCards.map(f => f.name).join(', ')}) pushes explosive early turns into Bracket 4.`
      );
    }
  } else if (
    gameChangers.length >= 1 ||
    infiniteCombos.length >= 1 ||
    nonSolRingFastMana.length >= 2 ||
    tutorCards.length >= 3 ||
    extraTurnCards.length === 2
  ) {
    bracket = 3;
    if (gameChangers.length >= 1) {
      bracketReasons.push(
        `Contains ${gameChangers.length} Official WotC Game Changer(s) (${gameChangers.map(g => g.name).join(', ')}) — Bracket 3 allows up to 3 Game Changers (0 allowed in Brackets 1 & 2).`
      );
      howToLowerBracket.push(
        `Remove ${gameChangers.map(g => g.name).join(', ')} if you want this deck to qualify for Bracket 2 (Core / Precon Level).`
      );
    }
    if (infiniteCombos.length >= 1) {
      bracketReasons.push(
        `Contains ${infiniteCombos.length} late-game / 3-card infinite combo(s) (${infiniteCombos.map(c => c.names.join(' + ')).join('; ')}).`
      );
      howToLowerBracket.push('Remove infinite combo loops to qualify for Bracket 2.');
    }
    if (nonSolRingFastMana.length >= 2) {
      bracketReasons.push(
        `Includes multiple Fast Mana accelerators (${fastManaCards.map(f => f.name).join(', ')}).`
      );
    }
    if (tutorCards.length >= 3) {
      bracketReasons.push(
        `Includes ${tutorCards.length} non-land Tutors (${tutorCards.map(t => t.name).join(', ')}) for upgraded consistency.`
      );
    }
  } else if (
    fastManaCards.length >= 1 ||
    tutorCards.length >= 1 ||
    extraTurnCards.length === 1 ||
    totalSaltSum >= 32
  ) {
    bracket = 2;
    bracketReasons.push(
      '0 Game Changers, 0 Mass Land Denial, and 0 2-Card Infinite Combos — matches Official WotC Bracket 2 (Core / Modern Precon Level).'
    );
    if (fastManaCards.length > 0) {
      bracketReasons.push(`Includes standard precon-level acceleration (${fastManaCards.map(f => f.name).join(', ')}).`);
    }
  } else {
    bracket = 1;
    bracketReasons.push(
      '0 Game Changers, 0 Infinite Combos, 0 Mass Land Denial, 0 Extra Turns, and 0 Fast Mana / Tutors — matches Official WotC Bracket 1 (Exhibition / Ultra-Casual Theme).'
    );
  }

  const BRACKET_META: Record<
    1 | 2 | 3 | 4 | 5,
    { name: string; subtitle: string; color: 'emerald' | 'sky' | 'amber' | 'orange' | 'rose' }
  > = {
    1: {
      name: 'Bracket 1 — Exhibition',
      subtitle: 'Ultra-Casual / Theme First • 0 Game Changers, No Infinite Combos, No MLD, No Extra Turns',
      color: 'emerald'
    },
    2: {
      name: 'Bracket 2 — Core',
      subtitle: 'Average Modern Precon Level • 0 Game Changers, No 2-Card Combos, No MLD, No Chaining Turns',
      color: 'sky'
    },
    3: {
      name: 'Bracket 3 — Upgraded',
      subtitle: 'Beyond Precon • Up to 3 Game Changers, No Early 2-Card Infinite Combos, No MLD',
      color: 'amber'
    },
    4: {
      name: 'Bracket 4 — Optimized',
      subtitle: 'High-Power Commander • No Restrictions on Game Changers, Fast Mana, Combos, or MLD',
      color: 'orange'
    },
    5: {
      name: 'Bracket 5 — cEDH',
      subtitle: 'Competitive Tournament Metagame • Maximum Fast Mana, Free Interaction & Turn 1–3 Combos',
      color: 'rose'
    }
  };

  // Compute Salt Score Thermometer & Tier
  allSaltyHits.sort((a, b) => b.saltScore - a.saltScore);
  const roundedTotalSalt = Number(totalSaltSum.toFixed(1));
  const avgCardSalt = totalCardQty > 0 ? Number((totalSaltSum / totalCardQty).toFixed(2)) : 0;

  // Add bonus salt for active infinite combos & MLD density on the 0-100 Salt Index
  const rawSaltIndex = Math.min(
    100,
    Math.round(
      totalSaltSum * 0.95 +
        earlyTwoCardCombos.length * 8 +
        mldCards.length * 9 +
        gameChangers.length * 3.5
    )
  );

  let tierLabel = 'Chill / Crowd Pleaser';
  let tierEmoji = '🧊';
  let tierDescription = 'Low-salt casual list — opponents rarely groan at your cards.';
  let tierColor: 'emerald' | 'sky' | 'amber' | 'orange' | 'rose' = 'emerald';

  if (rawSaltIndex >= 82) {
    tierLabel = 'Pure Sodium / Salt Mine';
    tierEmoji = '☠️';
    tierDescription = 'Maximum table hatred — packed with oppressive stax, fast combos, or format-warping staples.';
    tierColor = 'rose';
  } else if (rawSaltIndex >= 64) {
    tierLabel = 'Extra Salty / Archenemy';
    tierEmoji = '🌶️';
    tierDescription = 'High table-groan factor — expect to become the table’s #1 target once your engines resolve.';
    tierColor = 'orange';
  } else if (rawSaltIndex >= 45) {
    tierLabel = 'Seasoned / Table Groans';
    tierEmoji = '🧂';
    tierDescription = 'Moderate salt — includes a handful of heavy hitters or tax/denial pieces players watch out for.';
    tierColor = 'amber';
  } else if (rawSaltIndex >= 26) {
    tierLabel = 'Lightly Salted';
    tierEmoji = '🥨';
    tierDescription = 'Healthy interactive Commander deck with standard staples and fair threats.';
    tierColor = 'sky';
  }

  return {
    bracket,
    bracketName: BRACKET_META[bracket].name,
    bracketSubtitle: BRACKET_META[bracket].subtitle,
    bracketColor: BRACKET_META[bracket].color,
    bracketReasons,
    howToLowerBracket,
    gameChangers,
    infiniteCombos,
    nearCombos: nearCombos.slice(0, 8),
    fastManaCards,
    mldCards,
    extraTurnCards,
    tutorCards,
    freeInteractionCards,
    salt: {
      totalSaltSum: roundedTotalSalt,
      avgCardSalt,
      saltIndex100: rawSaltIndex,
      tierLabel,
      tierEmoji,
      tierDescription,
      tierColor,
      topSaltyCards: allSaltyHits.slice(0, 12)
    }
  };
}
