export type FinishType = 'nonfoil' | 'foil' | 'etched';
export type ConditionType = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
export type BoardType = 'commander' | 'mainboard' | 'sideboard' | 'considering';
export type FormatType = 'commander' | 'standard' | 'pioneer' | 'modern' | 'legacy' | 'pauper' | 'freeform';

export interface MtgCard {
  scryfall_id: string;
  oracle_id?: string | null;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  rarity: string;
  image_normal: string | null;
  image_small: string | null;
  image_art_crop: string | null;
  tcg_usd: number | null;
  tcg_usd_foil: number | null;
  tcg_usd_etched: number | null;
  tcgplayer_id?: number | null;
  tcgplayer_url: string | null;
  cardkingdom_url: string | null;
  ck_retail_nonfoil: number | null;
  ck_retail_foil: number | null;
  ck_buylist_nonfoil: number | null;
  ck_buylist_foil: number | null;
  ck_qty_nonfoil?: number | null;
  ck_qty_foil?: number | null;
  legalities: Record<string, string>;
  produced_mana: string[];
  power?: string | null;
  toughness?: string | null;
  keywords: string[];
  owned_qty?: number;
}

export interface DeckAllocationRef {
  deck_id: number;
  deck_name: string;
  quantity: number;
}

export interface InventoryItem extends MtgCard {
  id: number;
  quantity: number;
  available_qty?: number;
  in_decks_qty?: number;
  used_in_decks?: DeckAllocationRef[];
  finish: FinishType;
  condition: ConditionType;
  language: string;
  location: string;
  purchase_price: number | null;
  notes: string;
  unit_tcg: number;
  unit_ck_retail: number;
  unit_ck_buylist: number;
  total_tcg: number;
  total_ck_retail: number;
  total_ck_buylist: number;
  created_at: string;
  updated_at: string;
}

export interface DeckCardItem extends MtgCard {
  id: number;
  deck_id: number;
  quantity: number;
  board: BoardType;
  finish: FinishType;
  custom_category: string;
  unit_tcg: number;
  unit_ck_retail: number;
  unit_ck_buylist: number;
  owned_qty?: number;
  available_qty?: number;
  in_other_decks_qty?: number;
  other_decks?: DeckAllocationRef[];
  exact_printing_owned_qty?: number;
  missing_qty?: number;
  force_buy?: number;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  category: string;
  cardName?: string;
  message: string;
}

export interface MissingCardEntry {
  deck_card_id?: number;
  deck_id?: number;
  scryfall_id: string;
  name: string;
  set_code: string;
  collector_number: string;
  finish: FinishType;
  board: BoardType;
  missing_qty: number;
  force_buy?: number;
  owned_total_qty?: number;
  in_other_decks_qty?: number;
  other_decks?: DeckAllocationRef[];
  unit_tcg: number;
  unit_ck_retail: number;
  total_tcg: number;
  total_ck_retail: number;
  tcgplayer_url: string | null;
  cardkingdom_url: string | null;
  image_small: string | null;
}

export interface DeckAnalysis {
  isValid: boolean;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
  counts: {
    commander: number;
    mainboard: number;
    sideboard: number;
    considering: number;
    activeTotal: number;
    targetTotal: number;
  };
  ownership: {
    totalRequired: number;
    totalOwned: number;
    totalMissing: number;
    completionPct: number;
    canBuildRightNow: boolean;
    missingCostTcg: number;
    missingCostCkRetail: number;
    missingCards: MissingCardEntry[];
  };
  valuation: {
    tcg: number;
    ckRetail: number;
    ckBuylist: number;
  };
  stats: {
    avgCmc: number;
    manaCurve: Record<string, number>;
    colorPips: Record<string, number>;
    manaSources: Record<string, number>;
    typeBreakdown: Record<string, number>;
    commanderColorIdentity: string[];
  };
}

export interface DeckSummary {
  id: number;
  name: string;
  format: FormatType;
  folder: string;
  description: string;
  commander_scryfall_id: string | null;
  cover_image: string | null;
  color_identity: string[];
  tags: string[];
  counts: DeckAnalysis['counts'];
  ownership: DeckAnalysis['ownership'];
  valuation: DeckAnalysis['valuation'];
  isValid: boolean;
  issueCount: number;
  updated_at: string;
}

export interface DashboardData {
  summary: {
    totalCards: number;
    uniqueEntries: number;
    totalTcg: number;
    totalCkRetail: number;
    totalCkBuylist: number;
    totalCostBasis: number;
  };
  topCards: InventoryItem[];
  recentCards?: InventoryItem[];
  locations: Array<{
    location: string;
    count: number;
    valueTcg: number;
    valueCkRetail: number;
  }>;
  byRarity: Record<string, number>;
  byColor: Record<string, number>;
  syncMeta: Record<string, any>;
}

export interface UserProfile {
  id: number;
  name: string;
  email?: string;
  email_verified?: boolean;
  avatar_color: string;
  has_pin?: boolean;
  has_password?: boolean;
  totalCards: number;
  uniqueEntries: number;
  totalDecks: number;
  created_at?: string;
}

export interface NetworkInfo {
  port: number;
  hostname: string;
  localUrl: string;
  lanIps: string[];
  lanUrls: string[];
  primaryLanUrl: string;
}

export interface CommunityDeckSummary {
  id: number;
  name: string;
  format: string;
  folder: string;
  description: string;
  cover_image: string | null;
  commander_name: string | null;
  color_identity: string[];
  tags: string[];
  cloned_from_deck_id?: number | null;
  cloned_from_user_name?: string;
  author_id: number;
  author_name: string;
  author_avatar_color: string;
  is_following_author: boolean;
  is_own_deck: boolean;
  total_cards: number;
  total_tcg: number;
  total_ck_retail: number;
  viewer_owned_cards: number;
  viewer_owned_pct: number;
  updated_at: string;
}

export interface CommunityPlayerProfile {
  id: number;
  name: string;
  avatar_color: string;
  totalCards: number;
  uniqueEntries: number;
  totalDecks: number;
  totalTcg?: number;
  totalCkRetail?: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isSelf: boolean;
  created_at?: string;
}


