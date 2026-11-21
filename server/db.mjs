import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_CARDS } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'mtg_vault.sqlite');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode for high concurrency & durability
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cards_cache (
    scryfall_id TEXT PRIMARY KEY,
    oracle_id TEXT,
    name TEXT NOT NULL,
    set_code TEXT,
    set_name TEXT,
    collector_number TEXT,
    mana_cost TEXT,
    cmc REAL DEFAULT 0,
    type_line TEXT,
    oracle_text TEXT,
    colors TEXT DEFAULT '[]',
    color_identity TEXT DEFAULT '[]',
    rarity TEXT,
    image_normal TEXT,
    image_small TEXT,
    image_art_crop TEXT,
    tcg_usd REAL,
    tcg_usd_foil REAL,
    tcg_usd_etched REAL,
    tcgplayer_id INTEGER,
    tcgplayer_url TEXT,
    cardkingdom_url TEXT,
    ck_retail_nonfoil REAL,
    ck_retail_foil REAL,
    ck_buylist_nonfoil REAL,
    ck_buylist_foil REAL,
    ck_qty_nonfoil INTEGER,
    ck_qty_foil INTEGER,
    legalities TEXT DEFAULT '{}',
    produced_mana TEXT DEFAULT '[]',
    power TEXT,
    toughness TEXT,
    keywords TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_cards_name ON cards_cache(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_cards_set ON cards_cache(set_code, collector_number);

  CREATE TABLE IF NOT EXISTS ck_prices (
    scryfall_id TEXT NOT NULL,
    is_foil INTEGER NOT NULL DEFAULT 0,
    ck_id INTEGER,
    price_retail REAL,
    price_buy REAL,
    qty_retail INTEGER,
    qty_buy INTEGER,
    ck_url TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scryfall_id, is_foil)
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scryfall_id TEXT NOT NULL,
    name TEXT NOT NULL,
    set_code TEXT,
    collector_number TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    finish TEXT NOT NULL DEFAULT 'nonfoil',
    condition TEXT NOT NULL DEFAULT 'NM',
    language TEXT NOT NULL DEFAULT 'EN',
    location TEXT NOT NULL DEFAULT 'Main Binder',
    purchase_price REAL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_inventory_scryfall ON inventory(scryfall_id);

  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'commander',
    folder TEXT NOT NULL DEFAULT 'Uncategorized',
    description TEXT DEFAULT '',
    commander_scryfall_id TEXT,
    partner_scryfall_id TEXT,
    cover_image TEXT,
    color_identity TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS deck_folders (
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS deck_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL,
    scryfall_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    board TEXT NOT NULL DEFAULT 'mainboard',
    finish TEXT NOT NULL DEFAULT 'nonfoil',
    custom_category TEXT DEFAULT '',
    force_buy INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
    UNIQUE(deck_id, scryfall_id, board)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    email TEXT DEFAULT '',
    avatar_color TEXT NOT NULL DEFAULT 'amber',
    pin_code TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    password_salt TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Ensure existing databases have the folder column on decks, force_buy on deck_cards, user_id on inventory/decks/deck_folders, and auth columns on users
try {
  db.exec(`ALTER TABLE decks ADD COLUMN folder TEXT NOT NULL DEFAULT 'Uncategorized';`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE deck_cards ADD COLUMN force_buy INTEGER NOT NULL DEFAULT 0;`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE inventory ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE decks ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE deck_folders ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT '';`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT '';`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT '';`);
} catch {
  // Column already exists
}
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);`);
} catch {
  // Indexes already exist
}

// Migrate legacy deck_folders table if its PRIMARY KEY was only (name) instead of (user_id, name)
try {
  const folderTableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'deck_folders'`).get()?.sql || '';
  if (folderTableSql && !folderTableSql.includes('PRIMARY KEY (user_id, name)')) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS deck_folders_v2 (
        user_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, name)
      );
      INSERT OR IGNORE INTO deck_folders_v2 (user_id, name, created_at)
      SELECT COALESCE(user_id, 1), name, COALESCE(created_at, CURRENT_TIMESTAMP) FROM deck_folders;
      DROP TABLE deck_folders;
      ALTER TABLE deck_folders_v2 RENAME TO deck_folders;
      COMMIT;
    `);
  }
} catch {
  try { db.exec('ROLLBACK'); } catch {}
}

// Ensure Primary Owner profile (user_id = 1) exists on local desktop environments
if (process.env.NODE_ENV !== 'production') {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, avatar_color, pin_code)
    VALUES (1, 'Main Vault (Owner)', 'amber', '')
  `).run();
}

export function upsertCardCache(card) {
  const stmt = db.prepare(`
    INSERT INTO cards_cache (
      scryfall_id, oracle_id, name, set_code, set_name, collector_number,
      mana_cost, cmc, type_line, oracle_text, colors, color_identity,
      rarity, image_normal, image_small, image_art_crop,
      tcg_usd, tcg_usd_foil, tcg_usd_etched, tcgplayer_id, tcgplayer_url,
      cardkingdom_url, ck_retail_nonfoil, ck_retail_foil, ck_buylist_nonfoil, ck_buylist_foil,
      ck_qty_nonfoil, ck_qty_foil, legalities, produced_mana, power, toughness, keywords, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    )
    ON CONFLICT(scryfall_id) DO UPDATE SET
      oracle_id = excluded.oracle_id,
      name = excluded.name,
      set_code = excluded.set_code,
      set_name = excluded.set_name,
      collector_number = excluded.collector_number,
      mana_cost = excluded.mana_cost,
      cmc = excluded.cmc,
      type_line = excluded.type_line,
      oracle_text = excluded.oracle_text,
      colors = excluded.colors,
      color_identity = excluded.color_identity,
      rarity = excluded.rarity,
      image_normal = COALESCE(excluded.image_normal, cards_cache.image_normal),
      image_small = COALESCE(excluded.image_small, cards_cache.image_small),
      image_art_crop = COALESCE(excluded.image_art_crop, cards_cache.image_art_crop),
      tcg_usd = COALESCE(excluded.tcg_usd, cards_cache.tcg_usd),
      tcg_usd_foil = COALESCE(excluded.tcg_usd_foil, cards_cache.tcg_usd_foil),
      tcg_usd_etched = COALESCE(excluded.tcg_usd_etched, cards_cache.tcg_usd_etched),
      tcgplayer_id = COALESCE(excluded.tcgplayer_id, cards_cache.tcgplayer_id),
      tcgplayer_url = COALESCE(excluded.tcgplayer_url, cards_cache.tcgplayer_url),
      cardkingdom_url = COALESCE(excluded.cardkingdom_url, cards_cache.cardkingdom_url),
      ck_retail_nonfoil = COALESCE(excluded.ck_retail_nonfoil, cards_cache.ck_retail_nonfoil),
      ck_retail_foil = COALESCE(excluded.ck_retail_foil, cards_cache.ck_retail_foil),
      ck_buylist_nonfoil = COALESCE(excluded.ck_buylist_nonfoil, cards_cache.ck_buylist_nonfoil),
      ck_buylist_foil = COALESCE(excluded.ck_buylist_foil, cards_cache.ck_buylist_foil),
      ck_qty_nonfoil = COALESCE(excluded.ck_qty_nonfoil, cards_cache.ck_qty_nonfoil),
      ck_qty_foil = COALESCE(excluded.ck_qty_foil, cards_cache.ck_qty_foil),
      legalities = excluded.legalities,
      produced_mana = excluded.produced_mana,
      power = excluded.power,
      toughness = excluded.toughness,
      keywords = excluded.keywords,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(
    card.scryfall_id,
    card.oracle_id ?? null,
    card.name,
    card.set_code ?? '',
    card.set_name ?? '',
    card.collector_number ?? '',
    card.mana_cost ?? '',
    card.cmc ?? 0,
    card.type_line ?? '',
    card.oracle_text ?? '',
    typeof card.colors === 'string' ? card.colors : JSON.stringify(card.colors ?? []),
    typeof card.color_identity === 'string' ? card.color_identity : JSON.stringify(card.color_identity ?? []),
    card.rarity ?? 'common',
    card.image_normal ?? null,
    card.image_small ?? null,
    card.image_art_crop ?? null,
    card.tcg_usd ?? null,
    card.tcg_usd_foil ?? null,
    card.tcg_usd_etched ?? null,
    card.tcgplayer_id ?? null,
    card.tcgplayer_url ?? null,
    card.cardkingdom_url ?? null,
    card.ck_retail_nonfoil ?? null,
    card.ck_retail_foil ?? null,
    card.ck_buylist_nonfoil ?? null,
    card.ck_buylist_foil ?? null,
    card.ck_qty_nonfoil ?? null,
    card.ck_qty_foil ?? null,
    typeof card.legalities === 'string' ? card.legalities : JSON.stringify(card.legalities ?? {}),
    typeof card.produced_mana === 'string' ? card.produced_mana : JSON.stringify(card.produced_mana ?? []),
    card.power ?? null,
    card.toughness ?? null,
    typeof card.keywords === 'string' ? card.keywords : JSON.stringify(card.keywords ?? [])
  );
}

// Seed initial data if database hasn't been initialized yet
const initRow = db.prepare(`SELECT value FROM sync_meta WHERE key = 'seeded_v1'`).get();
if (!initRow) {
  for (const c of SEED_CARDS) {
    upsertCardCache(c);
  }

  // Only seed sample starter inventory & deck for local desktop mode, not public multi-tenant production
  if (process.env.NODE_ENV !== 'production') {
    const insertInv = db.prepare(`
      INSERT INTO inventory (scryfall_id, name, set_code, collector_number, quantity, finish, condition, language, location, purchase_price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const starterInv = [
      ["49ec2c19-182f-46b4-828c-3b2a343b7b94", "Atraxa, Praetors' Voice", "2xm", "190", 1, "foil", "NM", "EN", "Commander Box", 22.00, "Pulled from Double Masters VIP"],
      ["4c02b851-3b7d-4e38-a890-a7d6c2c38f86", "Sol Ring", "cmm", "410", 4, "nonfoil", "NM", "EN", "Staples Binder", 1.25, "Commander staple"],
      ["f7b5b49b-7080-4051-a2b5-64b0050d2666", "Rhystic Study", "wot", "25", 1, "nonfoil", "NM", "EN", "Staples Binder", 35.00, "Enchanting Tales art"],
      ["b7a131f4-8e25-445e-965c-15e3c1e7fd43", "Smothering Tithe", "2x2", "31", 2, "nonfoil", "NM", "EN", "Staples Binder", 19.50, ""],
      ["f9b2e5e2-2928-4e6a-a731-180e8f17a343", "Arcane Signet", "cmm", "367", 6, "nonfoil", "NM", "EN", "Commander Box", 0.75, ""],
      ["96b6b599-41f8-4b75-9713-77a960303a4b", "Command Tower", "cmm", "415", 5, "nonfoil", "NM", "EN", "Commander Box", 0.25, ""],
      ["c9d03c22-4090-45f9-9439-b89f87c86117", "Swords to Plowshares", "cmr", "387", 3, "nonfoil", "NM", "EN", "Staples Binder", 1.00, ""],
      ["ff65e202-212e-4f88-a062-53e25f92c88e", "Counterspell", "mh2", "267", 4, "nonfoil", "NM", "EN", "Staples Binder", 1.20, ""],
      ["a1b2c3d4-1111-4222-8333-444455556666", "Birds of Paradise", "rvr", "133", 2, "foil", "NM", "EN", "Trade Binder", 8.00, ""],
      ["b2c3d4e5-2222-4333-8444-555566667777", "Cultivate", "cmm", "279", 3, "nonfoil", "LP", "EN", "Longbox A", 0.40, ""],
      ["d4e5f6a7-4444-4555-8666-777788889999", "Breeding Pool", "rvr", "275", 1, "nonfoil", "NM", "EN", "Lands Binder", 14.00, "Shockland"]
    ];

    for (const row of starterInv) {
      insertInv.run(...row);
    }

    const deckResult = db.prepare(`
      INSERT INTO decks (name, format, description, commander_scryfall_id, cover_image, color_identity, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "Atraxa's Phyrexian Ascendancy",
      "commander",
      "4-Color Witch-Maw proliferate & high-synergy control shell. Includes owned staples and tracks missing cards to acquire.",
      "49ec2c19-182f-46b4-828c-3b2a343b7b94",
      "https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg",
      JSON.stringify(["W", "U", "B", "G"]),
      JSON.stringify(["Proliferate", "Midrange", "High Power"])
    );

    const deckId = deckResult.lastInsertRowid;
    const insertDeckCard = db.prepare(`
      INSERT INTO deck_cards (deck_id, scryfall_id, name, quantity, board, finish)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const starterDeckCards = [
      [deckId, "49ec2c19-182f-46b4-828c-3b2a343b7b94", "Atraxa, Praetors' Voice", 1, "commander", "foil"],
      [deckId, "4c02b851-3b7d-4e38-a890-a7d6c2c38f86", "Sol Ring", 1, "mainboard", "nonfoil"],
      [deckId, "f9b2e5e2-2928-4e6a-a731-180e8f17a343", "Arcane Signet", 1, "mainboard", "nonfoil"],
      [deckId, "96b6b599-41f8-4b75-9713-77a960303a4b", "Command Tower", 1, "mainboard", "nonfoil"],
      [deckId, "f7b5b49b-7080-4051-a2b5-64b0050d2666", "Rhystic Study", 1, "mainboard", "nonfoil"],
      [deckId, "b7a131f4-8e25-445e-965c-15e3c1e7fd43", "Smothering Tithe", 1, "mainboard", "nonfoil"],
      [deckId, "c9d03c22-4090-45f9-9439-b89f87c86117", "Swords to Plowshares", 1, "mainboard", "nonfoil"],
      [deckId, "ff65e202-212e-4f88-a062-53e25f92c88e", "Counterspell", 1, "mainboard", "nonfoil"],
      [deckId, "a1b2c3d4-1111-4222-8333-444455556666", "Birds of Paradise", 1, "mainboard", "foil"],
      [deckId, "b2c3d4e5-2222-4333-8444-555566667777", "Cultivate", 1, "mainboard", "nonfoil"],
      [deckId, "d4e5f6a7-4444-4555-8666-777788889999", "Breeding Pool", 1, "mainboard", "nonfoil"],
      [deckId, "ff08e1c4-a814-4337-8c00-895de9ab10c6", "Cyclonic Rift", 1, "mainboard", "nonfoil"],
      [deckId, "0a2f158b-889b-42b0-95b2-06b215206a2b", "Demonic Tutor", 1, "mainboard", "nonfoil"],
      [deckId, "c3d4e5f6-3333-4444-8555-666677778888", "Teferi's Protection", 1, "mainboard", "nonfoil"]
    ];

    for (const dc of starterDeckCards) {
      insertDeckCard.run(...dc);
    }
  }

  db.prepare(`INSERT INTO sync_meta (key, value) VALUES ('seeded_v1', 'true')`).run();
}
