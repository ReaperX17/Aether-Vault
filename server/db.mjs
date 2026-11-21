import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
    email_verified INTEGER NOT NULL DEFAULT 0,
    verification_code_hash TEXT DEFAULT '',
    verification_code_expires_at TEXT DEFAULT '',
    reset_code_hash TEXT DEFAULT '',
    reset_code_expires_at TEXT DEFAULT '',
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
  db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN verification_code_hash TEXT DEFAULT '';`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN verification_code_expires_at TEXT DEFAULT '';`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN reset_code_hash TEXT DEFAULT '';`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN reset_code_expires_at TEXT DEFAULT '';`);
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

// Seed initial data or upgrade owner snapshot if database hasn't loaded owner_snapshot_v3 yet
const snapshotSyncRow = db.prepare(`SELECT value FROM sync_meta WHERE key = 'owner_snapshot_v3'`).get();
const ownerInvCount = db.prepare(`SELECT COUNT(*) as cnt FROM inventory WHERE COALESCE(user_id, 1) = 1`).get()?.cnt || 0;

if (!snapshotSyncRow || ownerInvCount < 100) {
  for (const c of SEED_CARDS) {
    upsertCardCache(c);
  }

  const snapshotPath = path.join(__dirname, 'owner_vault_snapshot.json.gz');
  if (fs.existsSync(snapshotPath)) {
    try {
      const rawJson = zlib.gunzipSync(fs.readFileSync(snapshotPath)).toString('utf-8');
      const snap = JSON.parse(rawJson);

      db.exec('BEGIN TRANSACTION');
      try {
        if (Array.isArray(snap.users)) {
          const insUser = db.prepare(`
            INSERT OR REPLACE INTO users (id, name, email, email_verified, avatar_color, password_hash, password_salt, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          `);
          for (const u of snap.users) {
            insUser.run(
              u.id,
              u.name,
              u.email || '',
              u.email_verified ? 1 : 0,
              u.avatar_color || 'amber',
              u.password_hash || '',
              u.password_salt || '',
              u.created_at || null
            );
          }
        }

        if (Array.isArray(snap.cards_cache)) {
          for (const c of snap.cards_cache) {
            upsertCardCache(c);
          }
        }

        if (Array.isArray(snap.folders)) {
          const insFolder = db.prepare(`
            INSERT OR IGNORE INTO deck_folders (user_id, name, created_at)
            VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))
          `);
          for (const f of snap.folders) {
            insFolder.run(f.user_id || 1, f.name, f.created_at || null);
          }
        }

        if (ownerInvCount < 100 && Array.isArray(snap.inventory)) {
          const insInv = db.prepare(`
            INSERT OR REPLACE INTO inventory (id, user_id, scryfall_id, name, set_code, collector_number, quantity, finish, condition, language, location, purchase_price, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
          `);
          for (const item of snap.inventory) {
            insInv.run(
              item.id,
              item.user_id || 1,
              item.scryfall_id,
              item.name,
              item.set_code || '',
              item.collector_number || '',
              item.quantity || 1,
              item.finish || 'nonfoil',
              item.condition || 'NM',
              item.language || 'EN',
              item.location || 'Main Binder',
              item.purchase_price ?? null,
              item.notes || '',
              item.created_at || null,
              item.updated_at || null
            );
          }
        }

        if (ownerInvCount < 100 && Array.isArray(snap.decks)) {
          const insDeck = db.prepare(`
            INSERT OR REPLACE INTO decks (id, user_id, name, format, folder, description, commander_scryfall_id, partner_scryfall_id, cover_image, color_identity, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
          `);
          for (const d of snap.decks) {
            insDeck.run(
              d.id,
              d.user_id || 1,
              d.name,
              d.format || 'commander',
              d.folder || 'Uncategorized',
              d.description || '',
              d.commander_scryfall_id || null,
              d.partner_scryfall_id || null,
              d.cover_image || null,
              typeof d.color_identity === 'string' ? d.color_identity : JSON.stringify(d.color_identity || []),
              typeof d.tags === 'string' ? d.tags : JSON.stringify(d.tags || []),
              d.created_at || null,
              d.updated_at || null
            );
          }
        }

        if (ownerInvCount < 100 && Array.isArray(snap.deck_cards)) {
          const insDc = db.prepare(`
            INSERT OR REPLACE INTO deck_cards (id, deck_id, scryfall_id, name, quantity, board, finish, custom_category, force_buy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const dc of snap.deck_cards) {
            insDc.run(
              dc.id,
              dc.deck_id,
              dc.scryfall_id,
              dc.name,
              dc.quantity || 1,
              dc.board || 'mainboard',
              dc.finish || 'nonfoil',
              dc.custom_category || '',
              dc.force_buy ? 1 : 0
            );
          }
        }

        db.exec('COMMIT');
        console.log(`[AetherVault] Synced owner vault snapshot v3 (${snap.inventory?.length || 0} card entries, ${snap.decks?.length || 0} decks).`);
      } catch (txErr) {
        db.exec('ROLLBACK');
        throw txErr;
      }
    } catch (snapErr) {
      console.error('[AetherVault] Failed to load owner snapshot:', snapErr?.message || snapErr);
    }
  }

  db.prepare(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('seeded_v1', 'true')`).run();
  db.prepare(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('owner_snapshot_v3', 'true')`).run();
}

export function runDailyDatabaseBackup() {
  try {
    // Purge expired session tokens automatically
    db.prepare(`DELETE FROM user_sessions WHERE expires_at <= datetime('now')`).run();

    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    const targetFile = path.join(backupDir, `mtg_vault_${today}.sqlite`);
    if (!fs.existsSync(targetFile)) {
      const escapedTarget = targetFile.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escapedTarget}';`);
    }

    // Keep the 7 most recent daily backup files
    const files = fs
      .readdirSync(backupDir)
      .filter(f => f.startsWith('mtg_vault_') && f.endsWith('.sqlite'))
      .sort()
      .reverse();
    for (const oldFile of files.slice(7)) {
      try {
        fs.unlinkSync(path.join(backupDir, oldFile));
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.error('[AetherVault] Automatic backup warning:', err?.message || err);
  }
}

runDailyDatabaseBackup();
setInterval(runDailyDatabaseBackup, 24 * 60 * 60 * 1000).unref();
