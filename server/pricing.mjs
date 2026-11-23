import { db, upsertCardCache } from './db.mjs';

const SCRYFALL_HEADERS = {
  'User-Agent': 'AetherVaultMTGDeckbuilder/1.0',
  'Accept': 'application/json'
};

// Global import progress state so the frontend can poll real-time progress during 9k+ card uploads
export const importProgressState = {
  active: false,
  phase: 'idle',
  processedBatches: 0,
  totalBatches: 0,
  resolvedCards: 0,
  totalRows: 0,
  message: ''
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a Scryfall endpoint with automatic retry on 429 (Rate Limit) or transient 5xx errors
 */
async function fetchScryfallWithRetry(url, options = {}, maxRetries = 4) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...SCRYFALL_HEADERS, ...(options.headers || {}) }
      });

      if (res.status === 429 || res.status >= 500) {
        attempt++;
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(4000, 600 * Math.pow(2, attempt));
        await sleep(waitMs);
        continue;
      }

      return res;
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      await sleep(500 * attempt);
    }
  }
  return null;
}

/**
 * Normalize a raw Scryfall card object into our cards_cache schema,
 * enriched with Card Kingdom prices from ck_prices if available.
 */
export function normalizeScryfallCard(raw) {
  const face0 = raw.card_faces && raw.card_faces.length > 0 ? raw.card_faces[0] : null;
  const imageUris = raw.image_uris || (face0 && face0.image_uris) || {};

  const tcgUsd = raw.prices?.usd ? parseFloat(raw.prices.usd) : null;
  const tcgUsdFoil = raw.prices?.usd_foil ? parseFloat(raw.prices.usd_foil) : null;
  const tcgUsdEtched = raw.prices?.usd_etched ? parseFloat(raw.prices.usd_etched) : null;

  // Check if we have exact Card Kingdom prices in ck_prices table
  const ckNonFoil = db.prepare(`SELECT price_retail, price_buy, qty_retail, ck_url FROM ck_prices WHERE scryfall_id = ? AND is_foil = 0`).get(raw.id);
  const ckFoil = db.prepare(`SELECT price_retail, price_buy, qty_retail, ck_url FROM ck_prices WHERE scryfall_id = ? AND is_foil = 1`).get(raw.id);

  // Check existing cached CK prices if not in ck_prices yet
  const existing = db.prepare(`SELECT ck_retail_nonfoil, ck_retail_foil, ck_buylist_nonfoil, ck_buylist_foil, ck_qty_nonfoil, ck_qty_foil, cardkingdom_url FROM cards_cache WHERE scryfall_id = ?`).get(raw.id);

  const ckRetailNonFoil = ckNonFoil?.price_retail ?? existing?.ck_retail_nonfoil ?? (tcgUsd ? roundPrice(Math.max(0.35, tcgUsd * 1.18)) : null);
  const ckRetailFoil = ckFoil?.price_retail ?? existing?.ck_retail_foil ?? (tcgUsdFoil ? roundPrice(Math.max(0.49, tcgUsdFoil * 1.20)) : null);
  const ckBuylistNonFoil = ckNonFoil?.price_buy ?? existing?.ck_buylist_nonfoil ?? (tcgUsd ? roundPrice(tcgUsd * 0.62) : null);
  const ckBuylistFoil = ckFoil?.price_buy ?? existing?.ck_buylist_foil ?? (tcgUsdFoil ? roundPrice(tcgUsdFoil * 0.60) : null);

  const ckUrl = ckNonFoil?.ck_url
    ? `https://www.cardkingdom.com/${ckNonFoil.ck_url.replace(/^\//, '')}`
    : (raw.purchase_uris?.cardkingdom || existing?.cardkingdom_url || `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(raw.name)}`);

  const tcgUrl = raw.purchase_uris?.tcgplayer
    || (raw.tcgplayer_id ? `https://www.tcgplayer.com/product/${raw.tcgplayer_id}` : `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(raw.name)}`);

  const manaCost = raw.mana_cost || (face0 ? face0.mana_cost : '') || '';
  const oracleText = raw.oracle_text || (raw.card_faces ? raw.card_faces.map(f => `${f.name}: ${f.oracle_text || ''}`).join('\n---\n') : '');
  const colors = raw.colors || (face0 && face0.colors) || [];

  return {
    scryfall_id: raw.id,
    oracle_id: raw.oracle_id || null,
    name: raw.name,
    set_code: raw.set || '',
    set_name: raw.set_name || '',
    collector_number: raw.collector_number || '',
    mana_cost: manaCost,
    cmc: typeof raw.cmc === 'number' ? raw.cmc : 0,
    type_line: raw.type_line || '',
    oracle_text: oracleText,
    colors,
    color_identity: raw.color_identity || [],
    rarity: raw.rarity || 'common',
    image_normal: imageUris.normal || imageUris.large || null,
    image_small: imageUris.small || imageUris.normal || null,
    image_art_crop: imageUris.art_crop || imageUris.normal || null,
    tcg_usd: tcgUsd,
    tcg_usd_foil: tcgUsdFoil,
    tcg_usd_etched: tcgUsdEtched,
    tcgplayer_id: raw.tcgplayer_id || null,
    tcgplayer_url: tcgUrl,
    cardkingdom_url: ckUrl,
    ck_retail_nonfoil: ckRetailNonFoil,
    ck_retail_foil: ckRetailFoil,
    ck_buylist_nonfoil: ckBuylistNonFoil,
    ck_buylist_foil: ckBuylistFoil,
    ck_qty_nonfoil: ckNonFoil?.qty_retail ?? existing?.ck_qty_nonfoil ?? null,
    ck_qty_foil: ckFoil?.qty_retail ?? existing?.ck_qty_foil ?? null,
    legalities: raw.legalities || {},
    produced_mana: raw.produced_mana || [],
    power: raw.power || (face0 && face0.power) || null,
    toughness: raw.toughness || (face0 && face0.toughness) || null,
    keywords: raw.keywords || []
  };
}

function roundPrice(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Search Scryfall API and also merge local cache results if offline or rate-limited
 */
export async function searchScryfallCards(query, page = 1) {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    const rows = db.prepare(`SELECT * FROM cards_cache ORDER BY COALESCE(tcg_usd, 0) DESC LIMIT 40`).all();
    return { data: rows.map(hydrateCardRow), total_cards: rows.length, has_more: false, source: 'local_cache' };
  }

  try {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(trimmed)}&page=${page}`;
    const res = await fetchScryfallWithRetry(url);
    if (res && res.ok) {
      const json = await res.json();
      const cards = (json.data || []).slice(0, 40).map(raw => {
        const normalized = normalizeScryfallCard(raw);
        upsertCardCache(normalized);
        return normalized;
      });
      return {
        data: cards,
        total_cards: json.total_cards || cards.length,
        has_more: Boolean(json.has_more),
        source: 'scryfall_live'
      };
    } else if (res && res.status === 404) {
      return { data: [], total_cards: 0, has_more: false, source: 'scryfall_live' };
    }
  } catch (err) {
    // Fallback to local SQLite search if offline
  }

  const like = `%${trimmed}%`;
  const rows = db.prepare(`
    SELECT * FROM cards_cache
    WHERE name LIKE ? OR type_line LIKE ? OR oracle_text LIKE ? OR set_code LIKE ?
    ORDER BY COALESCE(tcg_usd, 0) DESC
    LIMIT 40
  `).all(like, like, like, like);

  return {
    data: rows.map(hydrateCardRow),
    total_cards: rows.length,
    has_more: false,
    source: 'local_cache'
  };
}

/**
 * Fetch all printings of a card by name from Scryfall
 */
export async function getCardPrintings(cardName) {
  try {
    const q = `!"${cardName}" unique:prints`;
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=released`;
    const res = await fetchScryfallWithRetry(url);
    if (res && res.ok) {
      const json = await res.json();
      const cards = (json.data || []).slice(0, 60).map(raw => {
        const normalized = normalizeScryfallCard(raw);
        upsertCardCache(normalized);
        return normalized;
      });
      return cards;
    }
  } catch (err) {
    // Fallback to local cache
  }
  const rows = db.prepare(`SELECT * FROM cards_cache WHERE LOWER(name) = LOWER(?)`).all(cardName);
  return rows.map(hydrateCardRow);
}

/**
 * Clean a card name for Scryfall /cards/collection lookup
 */
export function cleanCardNameForLookup(rawName = '') {
  let s = String(rawName || '').trim();
  // Remove foil/promo markers like (Foil), *F*, [Promo]
  s = s.replace(/\s*\((?:foil|etched|non-foil|promo|extended|borderless|retro|showcase).*?\)/gi, '');
  s = s.replace(/\s*\*[fe]\*/gi, '');
  // If double-faced "Front // Back", Scryfall /cards/collection accepts either exact or front face,
  // but front face is much more forgiving if back face has typos
  if (s.includes('//')) {
    s = s.split('//')[0].trim();
  }
  return s.trim();
}

/**
 * High-volume batch resolver for 9,000+ card imports:
 * 1. Deduplicates identifiers
 * 2. Skips cards already present in local SQLite cards_cache (unless forceRefresh = true)
 * 3. Throttles & retries on HTTP 429 so Scryfall never drops batches
 * 4. Automatically retries any set+collector_number misses by card name!
 */
export async function batchResolveScryfallCards(rawItems, { forceRefresh = false } = {}) {
  const results = [];
  const chunkSize = 75;

  // Map deduplicated primary lookup keys -> identifier object & fallback name
  const uniqueIdentMap = new Map();
  const identToFallbackName = new Map();

  const stmtById = db.prepare(`SELECT scryfall_id FROM cards_cache WHERE scryfall_id = ?`);
  const stmtBySetNum = db.prepare(`SELECT scryfall_id FROM cards_cache WHERE LOWER(set_code) = LOWER(?) AND LOWER(collector_number) = LOWER(?)`);
  const stmtByName = db.prepare(`SELECT scryfall_id FROM cards_cache WHERE LOWER(name) = LOWER(?) OR LOWER(name) LIKE LOWER(?) LIMIT 1`);

  for (const item of rawItems) {
    // Support both raw Scryfall identifier objects ({ id }, { set, collector_number }, { name })
    // and parsed import items ({ scryfall_id, set_code, collector_number, name })
    const scryfallId = (item.scryfall_id || item.id || '').trim();
    const setCode = (item.set_code || item.set || '').trim().toLowerCase();
    const collNum = String(item.collector_number || '').trim();
    const rawName = (item.name || '').trim();
    const cleanName = cleanCardNameForLookup(rawName);

    if (!forceRefresh) {
      if (scryfallId && /^[0-9a-f-]{36}$/i.test(scryfallId)) {
        if (stmtById.get(scryfallId)) continue;
      } else if (setCode && collNum) {
        if (stmtBySetNum.get(setCode, collNum)) continue;
        // Also check stripped leading zeros
        const stripped = collNum.replace(/^0+/, '');
        if (stripped && stmtBySetNum.get(setCode, stripped)) continue;
      } else if (cleanName) {
        if (stmtByName.get(cleanName, `${cleanName} //%`)) continue;
      }
    }

    if (scryfallId && /^[0-9a-f-]{36}$/i.test(scryfallId)) {
      const key = `id:${scryfallId.toLowerCase()}`;
      if (!uniqueIdentMap.has(key)) {
        uniqueIdentMap.set(key, { id: scryfallId.toLowerCase() });
        if (cleanName) identToFallbackName.set(key, cleanName);
      }
    } else if (setCode && collNum) {
      const cleanSet = setCode.replace(/[^a-z0-9]/g, '');
      const strippedNum = collNum.replace(/^0+(?=\d)/, '');
      if (cleanSet && strippedNum) {
        const key = `set:${cleanSet}:${strippedNum.toLowerCase()}`;
        if (!uniqueIdentMap.has(key)) {
          uniqueIdentMap.set(key, { set: cleanSet, collector_number: strippedNum });
          if (cleanName) identToFallbackName.set(key, cleanName);
        }
      } else if (cleanName) {
        const key = `name:${cleanName.toLowerCase()}`;
        if (!uniqueIdentMap.has(key)) {
          uniqueIdentMap.set(key, { name: cleanName });
        }
      }
    } else if (cleanName) {
      const key = `name:${cleanName.toLowerCase()}`;
      if (!uniqueIdentMap.has(key)) {
        uniqueIdentMap.set(key, { name: cleanName });
      }
    }
  }

  const identifiers = Array.from(uniqueIdentMap.values());
  const totalBatches = Math.ceil(identifiers.length / chunkSize);

  importProgressState.phase = 'resolving_scryfall';
  importProgressState.totalBatches = totalBatches;
  importProgressState.processedBatches = 0;

  const fallbackNamesToRetry = new Set();

  for (let i = 0; i < identifiers.length; i += chunkSize) {
    const chunk = identifiers.slice(i, i + chunkSize);
    importProgressState.processedBatches = Math.floor(i / chunkSize) + 1;
    importProgressState.message = `Fetching Scryfall batch ${importProgressState.processedBatches} of ${totalBatches} (${results.length} unique cards cached)...`;

    try {
      const res = await fetchScryfallWithRetry('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk })
      });

      if (res && res.ok) {
        const json = await res.json();
        const foundList = json.data || [];

        db.exec('BEGIN TRANSACTION');
        try {
          for (const raw of foundList) {
            const normalized = normalizeScryfallCard(raw);
            upsertCardCache(normalized);
            results.push(normalized);
          }
          db.exec('COMMIT');
        } catch (txErr) {
          db.exec('ROLLBACK');
        }

        importProgressState.resolvedCards = results.length;

        // If any { set, collector_number } or { id } failed in this batch, queue its fallback card name!
        if (Array.isArray(json.not_found) && json.not_found.length > 0) {
          for (const nf of json.not_found) {
            if (nf.set && nf.collector_number) {
              const key = `set:${String(nf.set).toLowerCase()}:${String(nf.collector_number).toLowerCase()}`;
              const fbName = identToFallbackName.get(key);
              if (fbName) fallbackNamesToRetry.add(fbName);
            } else if (nf.id) {
              const key = `id:${String(nf.id).toLowerCase()}`;
              const fbName = identToFallbackName.get(key);
              if (fbName) fallbackNamesToRetry.add(fbName);
            }
          }
        }
      }
    } catch (err) {
      console.error('Batch resolve error:', err.message);
    }

    // Polite 75ms pacing between batches so Scryfall (~10 req/sec limit) never throttles us
    if (i + chunkSize < identifiers.length) {
      await sleep(75);
    }
  }

  // Retry any cards whose set+collector_number wasn't recognized by Scryfall using their card name
  const nameRetryList = Array.from(fallbackNamesToRetry)
    .filter(name => !stmtByName.get(name, `${name} //%`))
    .map(name => ({ name }));

  if (nameRetryList.length > 0) {
    const retryBatches = Math.ceil(nameRetryList.length / chunkSize);
    for (let i = 0; i < nameRetryList.length; i += chunkSize) {
      const chunk = nameRetryList.slice(i, i + chunkSize);
      importProgressState.message = `Retrying ${nameRetryList.length} alternate printings by card name (batch ${Math.floor(i / chunkSize) + 1}/${retryBatches})...`;

      try {
        const res = await fetchScryfallWithRetry('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        if (res && res.ok) {
          const json = await res.json();
          db.exec('BEGIN TRANSACTION');
          try {
            for (const raw of (json.data || [])) {
              const normalized = normalizeScryfallCard(raw);
              upsertCardCache(normalized);
              results.push(normalized);
            }
            db.exec('COMMIT');
          } catch {
            db.exec('ROLLBACK');
          }
        }
      } catch {
        // ignore
      }

      if (i + chunkSize < nameRetryList.length) {
        await sleep(75);
      }
    }
  }

  return results;
}

/**
 * Refresh TCGplayer & Card Kingdom prices for cards currently in Inventory and Decks
 */
export async function refreshCollectionPrices(userId = null) {
  const rows = userId
    ? db.prepare(`
        SELECT DISTINCT scryfall_id, name, set_code, collector_number FROM (
          SELECT scryfall_id, name, set_code, collector_number FROM inventory WHERE COALESCE(user_id, 1) = ?
          UNION
          SELECT dc.scryfall_id, dc.name, '' as set_code, '' as collector_number
          FROM deck_cards dc
          JOIN decks d ON dc.deck_id = d.id
          WHERE COALESCE(d.user_id, 1) = ?
        )
      `).all(userId, userId)
    : db.prepare(`
        SELECT DISTINCT scryfall_id, name, set_code, collector_number FROM (
          SELECT scryfall_id, name, set_code, collector_number FROM inventory
          UNION
          SELECT scryfall_id, name, '' as set_code, '' as collector_number FROM deck_cards
        )
      `).all();

  const updated = await batchResolveScryfallCards(rows, { forceRefresh: true });

  db.exec(`
    UPDATE cards_cache
    SET
      ck_retail_nonfoil = COALESCE((SELECT price_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 0), ck_retail_nonfoil),
      ck_buylist_nonfoil = COALESCE((SELECT price_buy FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 0), ck_buylist_nonfoil),
      ck_qty_nonfoil = COALESCE((SELECT qty_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 0), ck_qty_nonfoil),
      ck_retail_foil = COALESCE((SELECT price_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 1), ck_retail_foil),
      ck_buylist_foil = COALESCE((SELECT price_buy FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 1), ck_buylist_foil),
      ck_qty_foil = COALESCE((SELECT qty_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 1), ck_qty_foil),
      updated_at = CURRENT_TIMESTAMP
  `);

  db.prepare(`
    INSERT INTO sync_meta (key, value, updated_at)
    VALUES ('last_price_refresh', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(new Date().toISOString());

  return { updatedCount: updated.length, timestamp: new Date().toISOString() };
}

/**
 * Sync Card Kingdom API v2 Pricelist (https://api.cardkingdom.com/api/v2/pricelist)
 */
export async function syncCardKingdomPricelist() {
  const res = await fetch('https://api.cardkingdom.com/api/v2/pricelist', {
    headers: {
      'User-Agent': 'AetherVaultMTGDeckbuilder/1.0',
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Card Kingdom API returned status ${res.status}`);
  }

  const json = await res.json();
  const list = json.data || [];

  const upsertCk = db.prepare(`
    INSERT INTO ck_prices (scryfall_id, is_foil, ck_id, price_retail, price_buy, qty_retail, qty_buy, ck_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(scryfall_id, is_foil) DO UPDATE SET
      ck_id = excluded.ck_id,
      price_retail = excluded.price_retail,
      price_buy = excluded.price_buy,
      qty_retail = excluded.qty_retail,
      qty_buy = excluded.qty_buy,
      ck_url = excluded.ck_url,
      updated_at = CURRENT_TIMESTAMP
  `);

  let matchedCount = 0;
  db.exec('BEGIN TRANSACTION');
  try {
    for (const item of list) {
      if (!item.scryfall_id) continue;
      const isFoil = item.is_foil === 'true' || item.is_foil === true ? 1 : 0;
      const retail = item.price_retail ? parseFloat(item.price_retail) : null;
      const buy = item.price_buy ? parseFloat(item.price_buy) : null;
      upsertCk.run(
        item.scryfall_id,
        isFoil,
        item.id || null,
        retail,
        buy,
        item.qty_retail ?? 0,
        item.qty_buying ?? 0,
        item.url || null
      );
      matchedCount++;
    }

    db.exec(`
      UPDATE cards_cache
      SET
        ck_retail_nonfoil = COALESCE((SELECT price_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 0), ck_retail_nonfoil),
        ck_buylist_nonfoil = COALESCE((SELECT price_buy FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 0), ck_buylist_nonfoil),
        ck_qty_nonfoil = COALESCE((SELECT qty_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 0), ck_qty_nonfoil),
        ck_retail_foil = COALESCE((SELECT price_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 1), ck_retail_foil),
        ck_buylist_foil = COALESCE((SELECT price_buy FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 1), ck_buylist_foil),
        ck_qty_foil = COALESCE((SELECT qty_retail FROM ck_prices WHERE ck_prices.scryfall_id = cards_cache.scryfall_id AND ck_prices.is_foil = 1), ck_qty_foil),
        updated_at = CURRENT_TIMESTAMP
    `);

    db.prepare(`
      INSERT INTO sync_meta (key, value, updated_at)
      VALUES ('ck_pricelist_sync', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify({ count: matchedCount, timestamp: new Date().toISOString() }));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { syncedRecords: matchedCount, timestamp: new Date().toISOString() };
}

const parsedCardJsonCache = new Map();

export function hydrateCardRow(row) {
  if (!row) return null;
  const sId = row.scryfall_id;
  let parsed = sId ? parsedCardJsonCache.get(sId) : null;
  if (!parsed) {
    parsed = {
      colors: safeJsonParse(row.colors, []),
      color_identity: safeJsonParse(row.color_identity, []),
      produced_mana: safeJsonParse(row.produced_mana, []),
      keywords: safeJsonParse(row.keywords, [])
    };
    if (sId && typeof row.colors === 'string') {
      parsedCardJsonCache.set(sId, parsed);
    }
  }
  const { legalities: _unusedLegalities, ...rest } = row;
  return {
    ...rest,
    colors: parsed.colors,
    color_identity: parsed.color_identity,
    produced_mana: parsed.produced_mana,
    keywords: parsed.keywords
  };
}

function safeJsonParse(str, fallback) {
  if (typeof str !== 'string') return str ?? fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
