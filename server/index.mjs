import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, upsertCardCache } from './db.mjs';
import {
  searchScryfallCards,
  getCardPrintings,
  batchResolveScryfallCards,
  refreshCollectionPrices,
  syncCardKingdomPricelist,
  hydrateCardRow,
  importProgressState,
  cleanCardNameForLookup
} from './pricing.mjs';
import {
  analyzeAndValidateDeck,
  computeInventoryDeckAllocations,
  getCardUnitPrice,
  isRelentlessCard,
  parseImportPayload
} from './deck_utils.mjs';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  isEmailProviderConfigured
} from './mailer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
if (isProd) {
  process.env.NODE_ENV = 'production';
}

// Prevent transient network/socket errors from ever crashing the background server process
process.on('uncaughtException', err => {
  console.error('[AetherVault] Uncaught Exception (server kept alive):', err?.message || err);
});
process.on('unhandledRejection', reason => {
  console.error('[AetherVault] Unhandled Rejection (server kept alive):', reason);
});

// In-memory generation cache per user so parallel GET /api/dashboard, /api/inventory, and /api/decks calls
// share computed allocations instead of re-querying and re-parsing 4,500+ rows multiple times
let dataCacheVersion = 1;
const cachedInventoryByUser = new Map();
const cachedDecksByUser = new Map();
const sseClients = new Set();

function broadcastVaultUpdate(reason = 'update') {
  const payload = JSON.stringify({
    version: dataCacheVersion,
    reason,
    timestamp: Date.now()
  });
  const msg = `event: vault_update\ndata: ${payload}\n\n`;
  for (const clientRes of sseClients) {
    try {
      clientRes.write(msg);
    } catch {
      sseClients.delete(clientRes);
    }
  }
}

function invalidateDataCache(reason = 'update', broadcast = true) {
  dataCacheVersion++;
  cachedInventoryByUser.clear();
  cachedDecksByUser.clear();
  if (broadcast) {
    broadcastVaultUpdate(reason);
  }
}

setInterval(() => {
  for (const clientRes of sseClients) {
    try {
      clientRes.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      sseClients.delete(clientRes);
    }
  }
}, 20000).unref();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, storedSalt, legacyPin = '') {
  const raw = String(password || '');
  if (storedHash && storedSalt) {
    try {
      const derived = crypto.scryptSync(raw, storedSalt, 64);
      const expected = Buffer.from(storedHash, 'hex');
      return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  if (legacyPin && String(legacyPin).trim().length > 0) {
    return raw.trim() === String(legacyPin).trim();
  }
  return false;
}

function hashSessionToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function isValidEmail(email) {
  const clean = String(email || '').trim();
  return clean.length >= 5 && clean.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

function generateSixDigitCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function maskEmailAddress(email) {
  const clean = String(email || '').trim();
  const parts = clean.split('@');
  if (parts.length !== 2) return clean;
  const local = parts[0];
  const maskedLocal =
    local.length <= 2
      ? `${local[0] || '*'}*`
      : `${local.slice(0, 2)}${'*'.repeat(Math.min(5, local.length - 2))}`;
  return `${maskedLocal}@${parts[1]}`;
}

function createSession(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(tokenHash, userId, expiresAt);
  return rawToken;
}

// Smart, non-intrusive Brute-Force Login & Registration Rate Limiting
const loginAttemptsMap = new Map();
const registerAttemptsMap = new Map();

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function checkLoginRateLimit(ip, username) {
  const key = `${ip}:${String(username || '').toLowerCase()}`;
  const entry = loginAttemptsMap.get(key);
  if (!entry) return { allowed: true };
  const now = Date.now();
  if (entry.lockedUntil && now < entry.lockedUntil) {
    const secsLeft = Math.ceil((entry.lockedUntil - now) / 1000);
    return {
      allowed: false,
      message: `Too many failed sign-in attempts. Please wait ${secsLeft} seconds before trying again.`
    };
  }
  if (now - entry.firstAttemptAt > 10 * 60 * 1000) {
    loginAttemptsMap.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedLogin(ip, username) {
  const key = `${ip}:${String(username || '').toLowerCase()}`;
  const now = Date.now();
  const entry = loginAttemptsMap.get(key) || { count: 0, firstAttemptAt: now, lockedUntil: 0 };
  if (now - entry.firstAttemptAt > 10 * 60 * 1000) {
    entry.count = 0;
    entry.firstAttemptAt = now;
  }
  entry.count += 1;
  // Lock for 5 minutes after 8 failed password guesses (generous for real typos, stops automated dictionary attacks)
  if (entry.count >= 8) {
    entry.lockedUntil = now + 5 * 60 * 1000;
  }
  loginAttemptsMap.set(key, entry);
}

function clearLoginAttempts(ip, username) {
  const key = `${ip}:${String(username || '').toLowerCase()}`;
  loginAttemptsMap.delete(key);
}

function checkRegisterRateLimit(ip) {
  const now = Date.now();
  const list = (registerAttemptsMap.get(ip) || []).filter(ts => now - ts < 60 * 60 * 1000);
  if (list.length >= 10) {
    return false;
  }
  list.push(now);
  registerAttemptsMap.set(ip, list);
  return true;
}

function verifySameOrigin(req) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = req.headers['origin'];
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const targetHost = String(req.headers['x-forwarded-host'] || req.headers['host'] || '').toLowerCase();
    if (!targetHost) return true;
    return originHost === targetHost;
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader = '') {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function extractCandidateSessionTokens(req) {
  const candidates = [];
  const headerToken = req.headers['x-auth-token'];
  if (headerToken && typeof headerToken === 'string' && headerToken.trim()) {
    candidates.push(headerToken.trim());
  }
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer && !candidates.includes(bearer)) {
      candidates.push(bearer);
    }
  }
  const cookies = parseCookies(req.headers['cookie'] || '');
  if (cookies.aethervault_session && !candidates.includes(cookies.aethervault_session)) {
    candidates.push(cookies.aethervault_session);
  }
  return candidates;
}

function extractSessionToken(req) {
  const list = extractCandidateSessionTokens(req);
  return list[0] || null;
}

function isPublicHostRequest(req) {
  if (isProd || process.env.PUBLIC_MULTI_TENANT === 'true') return true;
  const host = String(req.headers['x-forwarded-host'] || req.headers['host'] || '').toLowerCase().split(':')[0];
  if (!host) return false;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.endsWith('.local')
  ) {
    return false;
  }
  return true;
}

function resolveRequestAuth(req, url) {
  const isPublic = isPublicHostRequest(req);
  const candidateTokens = extractCandidateSessionTokens(req);
  const hasExplicitHeaderToken = Boolean(
    (req.headers['x-auth-token'] && String(req.headers['x-auth-token']).trim()) ||
      (req.headers['authorization'] && String(req.headers['authorization']).trim())
  );
  const rawHeaderUserId = Number(req.headers['x-user-id'] || url.searchParams.get('userId') || 0);
  const explicitRequestedId = Number.isFinite(rawHeaderUserId) && rawHeaderUserId >= 1 ? rawHeaderUserId : null;

  for (const token of candidateTokens) {
    const tokenHash = hashSessionToken(token);
    const sess = db
      .prepare(
        `SELECT s.token, s.user_id, u.id, u.name, u.avatar_color, u.password_hash, u.pin_code
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE (s.token = ? OR s.token = ?) AND s.expires_at > datetime('now')`
      )
      .get(tokenHash, token);
    if (sess) {
      const sessUserId = Number(sess.user_id);
      // On local non-public servers only, if the user explicitly switched to a different local passwordless profile ID,
      // do not let the old HttpOnly cookie override the local profile switch
      const isStaleCookieForDifferentProfile =
        !isPublic && !hasExplicitHeaderToken && explicitRequestedId !== null && explicitRequestedId !== sessUserId;

      if (!isStaleCookieForDifferentProfile) {
        if (sess.token === token && sess.token !== tokenHash) {
          try {
            db.prepare(`UPDATE user_sessions SET token = ? WHERE token = ?`).run(tokenHash, token);
          } catch {
            // ignore
          }
        }
        return {
          authenticated: true,
          userId: sessUserId,
          token,
          tokenHash,
          isPublic
        };
      }
    }
  }

  // On local PC / Home Wi-Fi (non-production), allow passwordless convenience ONLY for local profiles that have not set a password/PIN
  if (!isPublic) {
    const rawId = req.headers['x-user-id'] || url.searchParams.get('userId') || 1;
    const requestedId = Number(rawId);
    const targetId = Number.isFinite(requestedId) && requestedId >= 1 ? requestedId : 1;
    const localUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
    if (localUser) {
      const hasPassword = Boolean(
        (localUser.password_hash && String(localUser.password_hash).length > 0) ||
          (localUser.pin_code && String(localUser.pin_code).trim().length > 0)
      );
      if (!hasPassword) {
        return {
          authenticated: true,
          userId: Number(localUser.id),
          token: null,
          isPublic: false
        };
      }
    }
  }

  return {
    authenticated: false,
    userId: null,
    token: null,
    isPublic
  };
}

function getOwnedDeck(deckId, userId) {
  return db
    .prepare(`SELECT * FROM decks WHERE id = ? AND COALESCE(user_id, 1) = ?`)
    .get(Number(deckId), Number(userId));
}

function getLanNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const lanIps = [];
  for (const [ifaceName, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        lanIps.push({ ip: addr.address, iface: ifaceName });
      }
    }
  }
  // Prioritize standard home Wi-Fi / LAN ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  lanIps.sort((a, b) => {
    const score = ip => (ip.startsWith('192.168.') ? 3 : ip.startsWith('10.') ? 2 : 1);
    return score(b.ip) - score(a.ip);
  });
  const ips = lanIps.map(x => x.ip);
  const lanUrls = ips.map(ip => `http://${ip}:${PORT}`);
  return {
    port: PORT,
    hostname: os.hostname(),
    localUrl: `http://localhost:${PORT}`,
    lanIps: ips,
    lanUrls,
    primaryLanUrl: lanUrls[0] || `http://localhost:${PORT}`
  };
}

function getAllUsersWithStats(onlyUserId = null) {
  const users = onlyUserId
    ? db.prepare(`SELECT id, name, email, COALESCE(email_verified, 0) as email_verified, avatar_color, pin_code, password_hash, created_at FROM users WHERE id = ?`).all(Number(onlyUserId))
    : db.prepare(`SELECT id, name, email, COALESCE(email_verified, 0) as email_verified, avatar_color, pin_code, password_hash, created_at FROM users ORDER BY id ASC`).all();
  const invStats = db.prepare(`SELECT COALESCE(user_id, 1) as uid, COALESCE(SUM(quantity), 0) as totalCards, COUNT(*) as uniqueEntries FROM inventory GROUP BY COALESCE(user_id, 1)`).all();
  const deckStats = db.prepare(`SELECT COALESCE(user_id, 1) as uid, COUNT(*) as totalDecks FROM decks GROUP BY COALESCE(user_id, 1)`).all();
  const invMap = new Map(invStats.map(r => [Number(r.uid), r]));
  const deckMap = new Map(deckStats.map(r => [Number(r.uid), Number(r.totalDecks || 0)]));

  return users.map(u => {
    const uid = Number(u.id);
    const st = invMap.get(uid);
    const hasPassword = Boolean(
      (u.password_hash && String(u.password_hash).length > 0) ||
        (u.pin_code && String(u.pin_code).trim().length > 0)
    );
    return {
      id: uid,
      name: u.name,
      email: u.email || '',
      email_verified: Boolean(u.email_verified),
      avatar_color: u.avatar_color || 'amber',
      has_pin: hasPassword,
      has_password: hasPassword,
      totalCards: Number(st?.totalCards || 0),
      uniqueEntries: Number(st?.uniqueEntries || 0),
      totalDecks: deckMap.get(uid) || 0,
      created_at: u.created_at
    };
  });
}

function getSingleUserWithStats(userId) {
  const list = getAllUsersWithStats(userId);
  return list[0] || null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 15 * 1024 * 1024) {
        reject(new Error('Payload too large (max 15 MB)'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function getSecurityHeaders(isPublic = false) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: https://*.scryfall.io https://*.scryfall.com https://api.qrserver.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.scryfall.com; frame-ancestors 'self';"
  };
  if (isPublic) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.__reqMethod && res.__reqMethod !== 'GET' && status >= 200 && status < 300) {
    invalidateDataCache(res.__reqPath || 'mutation', true);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...getSecurityHeaders(isProd),
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function getAllActiveDeckUsages(userId = 1) {
  return db.prepare(`
    SELECT
      dc.deck_id,
      d.name as deck_name,
      d.format as deck_format,
      dc.scryfall_id,
      dc.name,
      dc.quantity,
      dc.board,
      dc.finish,
      COALESCE(dc.force_buy, 0) as force_buy
    FROM deck_cards dc
    JOIN decks d ON dc.deck_id = d.id
    WHERE COALESCE(d.user_id, 1) = ? AND dc.board IN ('commander', 'mainboard', 'sideboard')
    ORDER BY dc.deck_id ASC, dc.id ASC
  `).all(userId);
}

function getAllInventoryEnriched(userId = 1) {
  const cached = cachedInventoryByUser.get(userId);
  if (cached && cached.version === dataCacheVersion) {
    return cached.items;
  }

  const rows = db.prepare(`
    SELECT
      i.id, i.scryfall_id, i.name,
      COALESCE(NULLIF(i.set_code, ''), c.set_code, '') as set_code,
      COALESCE(NULLIF(i.collector_number, ''), c.collector_number, '') as collector_number,
      i.quantity, COALESCE(i.finish, 'nonfoil') as finish, COALESCE(i.condition, 'NM') as condition, COALESCE(i.language, 'EN') as language, COALESCE(i.location, 'Main Binder') as location,
      i.purchase_price, COALESCE(i.notes, '') as notes, i.created_at, i.updated_at,
      c.oracle_id, COALESCE(c.set_name, '') as set_name, COALESCE(c.mana_cost, '') as mana_cost, COALESCE(c.cmc, 0) as cmc, COALESCE(c.type_line, '') as type_line,
      COALESCE(c.oracle_text, '') as oracle_text, c.colors, c.color_identity, COALESCE(c.rarity, 'common') as rarity,
      c.image_normal, c.image_small, c.image_art_crop,
      c.tcg_usd, c.tcg_usd_foil, c.tcg_usd_etched,
      c.tcgplayer_id, c.tcgplayer_url, c.cardkingdom_url,
      c.ck_retail_nonfoil, c.ck_retail_foil,
      c.ck_buylist_nonfoil, c.ck_buylist_foil,
      c.ck_qty_nonfoil, c.ck_qty_foil,
      c.legalities, c.produced_mana, c.power, c.toughness, c.keywords
    FROM inventory i
    LEFT JOIN cards_cache c ON i.scryfall_id = c.scryfall_id
    WHERE COALESCE(i.user_id, 1) = ?
    ORDER BY i.updated_at DESC, i.id DESC
  `).all(userId);

  const items = rows.map(r => {
    const card = hydrateCardRow(r);
    const unit = getCardUnitPrice(card, card.finish);
    return {
      ...card,
      unit_tcg: unit.tcg,
      unit_ck_retail: unit.ckRetail,
      unit_ck_buylist: unit.ckBuylist,
      total_tcg: Math.round(unit.tcg * card.quantity * 100) / 100,
      total_ck_retail: Math.round(unit.ckRetail * card.quantity * 100) / 100,
      total_ck_buylist: Math.round(unit.ckBuylist * card.quantity * 100) / 100
    };
  });

  const activeDeckUsages = getAllActiveDeckUsages(userId);
  const allocated = computeInventoryDeckAllocations(items, activeDeckUsages);
  cachedInventoryByUser.set(userId, { version: dataCacheVersion, items: allocated });
  return allocated;
}

function getDeckCardsEnriched(deckId) {
  const rows = db.prepare(`
    SELECT
      dc.id, dc.deck_id, dc.scryfall_id, dc.name, dc.quantity,
      dc.board, dc.finish, dc.custom_category, COALESCE(dc.force_buy, 0) as force_buy,
      c.oracle_id, c.set_code, c.set_name, c.collector_number,
      c.mana_cost, c.cmc, c.type_line, c.oracle_text,
      c.colors, c.color_identity, c.rarity,
      c.image_normal, c.image_small, c.image_art_crop,
      c.tcg_usd, c.tcg_usd_foil, c.tcg_usd_etched,
      c.tcgplayer_id, c.tcgplayer_url, c.cardkingdom_url,
      c.ck_retail_nonfoil, c.ck_retail_foil,
      c.ck_buylist_nonfoil, c.ck_buylist_foil,
      c.ck_qty_nonfoil, c.ck_qty_foil,
      c.legalities, c.produced_mana, c.power, c.toughness, c.keywords
    FROM deck_cards dc
    LEFT JOIN cards_cache c ON dc.scryfall_id = c.scryfall_id
    WHERE dc.deck_id = ?
    ORDER BY
      CASE dc.board
        WHEN 'commander' THEN 0
        WHEN 'mainboard' THEN 1
        WHEN 'sideboard' THEN 2
        ELSE 3
      END,
      c.cmc ASC,
      dc.name ASC
  `).all(deckId);

  return rows.map(r => {
    const card = hydrateCardRow(r);
    const unit = getCardUnitPrice(card, card.finish);
    return {
      ...card,
      unit_tcg: unit.tcg,
      unit_ck_retail: unit.ckRetail,
      unit_ck_buylist: unit.ckBuylist
    };
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || 'GET';
  res.__reqMethod = method;
  res.__reqPath = pathname;

  if (method !== 'GET') {
    invalidateDataCache(pathname, false);
  }

  try {
    // Real-time Server-Sent Events (SSE) stream for instant live updates across tabs & users
    if (pathname === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...getSecurityHeaders(isProd)
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ version: dataCacheVersion, timestamp: Date.now() })}\n\n`);
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // Healthcheck endpoint for Cloud / Docker / Load Balancers (aether-vault.com & aether-vault.net)
    if (pathname === '/api/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'AetherVault',
        dataVersion: dataCacheVersion,
        timestamp: new Date().toISOString()
      });
    }

    // CSRF Same-Origin Protection for mutating requests
    if (!verifySameOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-origin request blocked for your security.' });
    }

    const auth = resolveRequestAuth(req, url);
    const clientIp = getClientIp(req);

    // 0. Authentication & Personal Account Isolation Endpoints (/api/auth/*)
    if (pathname === '/api/auth/me' && method === 'GET') {
      if (!auth.authenticated || !auth.userId) {
        return sendJson(res, 200, {
          authenticated: false,
          user: null,
          isPublic: auth.isPublic
        });
      }
      const activeToken = auth.token || createSession(auth.userId);
      if (auth.tokenHash || auth.token) {
        const nextExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        try {
          db.prepare(`UPDATE user_sessions SET expires_at = ? WHERE token = ? OR token = ?`).run(
            nextExpiry,
            auth.tokenHash || hashSessionToken(activeToken),
            activeToken
          );
        } catch {
          // ignore
        }
      }
      const userObj = getSingleUserWithStats(auth.userId);
      const sessionCount =
        db
          .prepare(`SELECT COUNT(*) as cnt FROM user_sessions WHERE user_id = ? AND expires_at > datetime('now')`)
          .get(auth.userId)?.cnt || 1;
      const cookieHeader = `aethervault_session=${encodeURIComponent(activeToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${auth.isPublic ? '; Secure' : ''}`;
      return sendJson(
        res,
        200,
        {
          authenticated: true,
          token: activeToken,
          user: userObj,
          activeSessions: Number(sessionCount),
          isPublic: auth.isPublic
        },
        { 'Set-Cookie': cookieHeader }
      );
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      if (!checkRegisterRateLimit(clientIp)) {
        return sendJson(res, 429, { error: 'Too many new accounts created from this IP recently. Please try again later.' });
      }
      const body = await readJsonBody(req);
      const cleanName = String(body.username || body.name || '').trim();
      const rawPassword = String(body.password || body.pin_code || '');
      const avatarColor = String(body.avatar_color || 'amber').trim() || 'amber';
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);

      if (cleanName.length < 2 || cleanName.length > 40) {
        return sendJson(res, 400, { error: 'Username must be between 2 and 40 characters.' });
      }
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { error: 'A valid email address is required for email verification and password recovery.' });
      }
      if (rawPassword.length < 4) {
        return sendJson(res, 400, { error: 'Password must be at least 4 characters long to protect your vault.' });
      }

      const existing = db.prepare(`SELECT id FROM users WHERE LOWER(name) = LOWER(?)`).get(cleanName);
      if (existing) {
        return sendJson(res, 400, { error: 'That username is already registered. Please sign in or pick another username.' });
      }

      const existingEmail = db.prepare(`SELECT id FROM users WHERE email != '' AND LOWER(email) = LOWER(?)`).get(email);
      if (existingEmail) {
        return sendJson(res, 400, { error: 'That email address is already registered to an account. Please sign in or use Password Recovery.' });
      }

      const { hash, salt } = hashPassword(rawPassword);
      const verifyCode = generateSixDigitCode();
      const verifyCodeHash = hashSessionToken(verifyCode);
      const verifyExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const ins = db
        .prepare(
          `INSERT INTO users (name, email, email_verified, verification_code_hash, verification_code_expires_at, avatar_color, password_hash, password_salt, pin_code)
           VALUES (?, ?, 0, ?, ?, ?, ?, ?, '')`
        )
        .run(cleanName, email, verifyCodeHash, verifyExpiresAt, avatarColor, hash, salt);
      const newUserId = Number(ins.lastInsertRowid);
      const token = createSession(newUserId);
      const userObj = getSingleUserWithStats(newUserId);

      let mailResult = { delivered: false, provider: 'console-preview' };
      try {
        mailResult = await sendVerificationEmail(email, cleanName, verifyCode);
      } catch (mailErr) {
        console.error('[AetherVault] Verification email error:', mailErr?.message || mailErr);
      }

      const cookieHeader = `aethervault_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${auth.isPublic ? '; Secure' : ''}`;

      return sendJson(
        res,
        201,
        {
          authenticated: true,
          token,
          user: userObj,
          isPublic: auth.isPublic,
          verificationSent: true,
          emailDelivered: mailResult.delivered
        },
        { 'Set-Cookie': cookieHeader }
      );
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody(req);
      const cleanName = String(body.username || body.name || '').trim();
      const rawPassword = String(body.password || body.pin_code || '');

      if (!cleanName) {
        return sendJson(res, 400, { error: 'Please enter your username or email address.' });
      }

      const rateStatus = checkLoginRateLimit(clientIp, cleanName);
      if (!rateStatus.allowed) {
        return sendJson(res, 429, { error: rateStatus.message });
      }

      let userRow = db
        .prepare(`SELECT * FROM users WHERE LOWER(name) = LOWER(?) OR (email != '' AND LOWER(email) = LOWER(?))`)
        .get(cleanName, cleanName);
      if (!userRow) {
        const lowerInput = cleanName.toLowerCase();
        if (lowerInput === 'josh' || lowerInput === "josh's vault") {
          userRow = db.prepare(`SELECT * FROM users WHERE id = 1 AND LOWER(name) LIKE 'josh%'`).get();
        } else if (lowerInput === 'my love') {
          userRow = db.prepare(`SELECT * FROM users WHERE id = 2 AND LOWER(name) LIKE 'my love%'`).get();
        }
      }
      if (!userRow) {
        recordFailedLogin(clientIp, cleanName);
        return sendJson(res, 401, { error: 'Invalid username/email or password.' });
      }

      const hasPassword = Boolean(
        (userRow.password_hash && String(userRow.password_hash).length > 0) ||
          (userRow.pin_code && String(userRow.pin_code).trim().length > 0)
      );

      if (hasPassword) {
        const valid = verifyPassword(rawPassword, userRow.password_hash, userRow.password_salt, userRow.pin_code);
        if (!valid) {
          recordFailedLogin(clientIp, cleanName);
          return sendJson(res, 401, { error: 'Invalid username or password.' });
        }
        // Automatically upgrade legacy pin_code to salted scrypt password_hash
        if (!userRow.password_hash && userRow.pin_code) {
          const { hash, salt } = hashPassword(rawPassword);
          db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, pin_code = '' WHERE id = ?`).run(
            hash,
            salt,
            userRow.id
          );
        }
      } else {
        // Legacy local profile without a password yet: if user entered a password (>= 4 chars), lock the account with it now
        if (auth.isPublic && rawPassword.length < 4) {
          return sendJson(res, 400, { error: 'Please enter a password (at least 4 characters) to secure your account.' });
        }
        if (rawPassword.length >= 4) {
          const { hash, salt } = hashPassword(rawPassword);
          db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, pin_code = '' WHERE id = ?`).run(
            hash,
            salt,
            userRow.id
          );
        }
      }

      clearLoginAttempts(clientIp, cleanName);
      const token = createSession(Number(userRow.id));
      const userObj = getSingleUserWithStats(Number(userRow.id));
      const cookieHeader = `aethervault_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${auth.isPublic ? '; Secure' : ''}`;

      return sendJson(
        res,
        200,
        {
          authenticated: true,
          token,
          user: userObj,
          isPublic: auth.isPublic
        },
        { 'Set-Cookie': cookieHeader }
      );
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = extractSessionToken(req);
      if (token) {
        const tokenHash = hashSessionToken(token);
        db.prepare(`DELETE FROM user_sessions WHERE token = ? OR token = ?`).run(tokenHash, token);
      }
      const clearCookie = `aethervault_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    }

    if (pathname === '/api/auth/revoke-other-sessions' && method === 'POST') {
      if (!auth.authenticated || !auth.userId) {
        return sendJson(res, 401, { error: 'Please sign in first.', requireAuth: true });
      }
      const currentHash = auth.tokenHash || (auth.token ? hashSessionToken(auth.token) : '');
      const resDel = db
        .prepare(`DELETE FROM user_sessions WHERE user_id = ? AND token != ? AND token != ?`)
        .run(auth.userId, currentHash, auth.token || '');
      return sendJson(res, 200, {
        ok: true,
        revokedCount: Number(resDel.changes || 0),
        message: 'Signed out of all other devices.'
      });
    }

    if (pathname === '/api/auth/password' && method === 'POST') {
      if (!auth.authenticated || !auth.userId) {
        return sendJson(res, 401, { error: 'Please sign in first.', requireAuth: true });
      }
      const body = await readJsonBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 4) {
        return sendJson(res, 400, { error: 'New password must be at least 4 characters long.' });
      }

      const userRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(auth.userId);
      if (!userRow) {
        return sendJson(res, 404, { error: 'Account not found.' });
      }

      const hasPassword = Boolean(
        (userRow.password_hash && String(userRow.password_hash).length > 0) ||
          (userRow.pin_code && String(userRow.pin_code).trim().length > 0)
      );
      if (hasPassword) {
        const valid = verifyPassword(currentPassword, userRow.password_hash, userRow.password_salt, userRow.pin_code);
        if (!valid) {
          return sendJson(res, 401, { error: 'Current password is incorrect.' });
        }
      }

      const { hash, salt } = hashPassword(newPassword);
      db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, pin_code = '' WHERE id = ?`).run(
        hash,
        salt,
        auth.userId
      );

      // Revoke all other session tokens for this user
      if (auth.token) {
        const currentHash = auth.tokenHash || hashSessionToken(auth.token);
        db.prepare(`DELETE FROM user_sessions WHERE user_id = ? AND token != ? AND token != ?`).run(
          auth.userId,
          currentHash,
          auth.token
        );
      }
      return sendJson(res, 200, {
        ok: true,
        user: getSingleUserWithStats(auth.userId),
        message: 'Your vault password has been updated.'
      });
    }

    // 0-email. Email Verification & Password Recovery Endpoints
    if (pathname === '/api/auth/send-verification' && method === 'POST') {
      if (!auth.authenticated || !auth.userId) {
        return sendJson(res, 401, { error: 'Please sign in first.', requireAuth: true });
      }
      const body = await readJsonBody(req);
      const userRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(auth.userId);
      if (!userRow) return sendJson(res, 404, { error: 'Account not found.' });

      const targetEmail = String(body.email !== undefined ? body.email : userRow.email || '')
        .trim()
        .toLowerCase();
      if (!isValidEmail(targetEmail)) {
        return sendJson(res, 400, { error: 'Please enter a valid email address.' });
      }

      const conflict = db
        .prepare(`SELECT id FROM users WHERE email != '' AND LOWER(email) = LOWER(?) AND id != ?`)
        .get(targetEmail, auth.userId);
      if (conflict) {
        return sendJson(res, 400, { error: 'That email address is already linked to another account.' });
      }

      const verifyCode = generateSixDigitCode();
      const verifyCodeHash = hashSessionToken(verifyCode);
      const verifyExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.prepare(
        `UPDATE users
         SET email = ?, email_verified = 0, verification_code_hash = ?, verification_code_expires_at = ?
         WHERE id = ?`
      ).run(targetEmail, verifyCodeHash, verifyExpiresAt, auth.userId);

      let mailResult = { delivered: false, provider: 'unconfigured' };
      let mailErrorDetail = '';
      try {
        mailResult = await sendVerificationEmail(targetEmail, userRow.name, verifyCode);
      } catch (mailErr) {
        mailErrorDetail = mailErr?.message || String(mailErr);
        console.error('[AetherVault] Verification email error:', mailErrorDetail);
      }

      if (!mailResult.delivered) {
        return sendJson(res, 503, {
          error: isEmailProviderConfigured()
            ? `Email provider error: ${mailErrorDetail || 'Could not send email. Note: Render blocks Gmail SMTP port 465—use BREVO_API_KEY or RESEND_API_KEY over HTTPS instead.'}`
            : 'Outbound email delivery is not configured yet on the server. Add BREVO_API_KEY or RESEND_API_KEY in your Render Environment Variables.'
        });
      }

      return sendJson(res, 200, {
        ok: true,
        email: targetEmail,
        user: getSingleUserWithStats(auth.userId),
        emailDelivered: true,
        message: `Sent a 6-digit verification code to ${targetEmail}. Please check your email inbox.`
      });
    }

    if (pathname === '/api/auth/verify-email' && method === 'POST') {
      if (!auth.authenticated || !auth.userId) {
        return sendJson(res, 401, { error: 'Please sign in first.', requireAuth: true });
      }
      const body = await readJsonBody(req);
      const rawCode = String(body.code || '').trim();
      if (!/^\d{6}$/.test(rawCode)) {
        return sendJson(res, 400, { error: 'Please enter the 6-digit verification code.' });
      }

      const userRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(auth.userId);
      if (!userRow || !userRow.email) {
        return sendJson(res, 400, { error: 'Please save an email address on your account first.' });
      }

      if (!userRow.verification_code_hash || !userRow.verification_code_expires_at) {
        return sendJson(res, 400, { error: 'No active verification code found. Click "Send Verification Code" to get a new one.' });
      }

      if (new Date(userRow.verification_code_expires_at) < new Date()) {
        return sendJson(res, 400, { error: 'Verification code has expired. Click "Send Verification Code" to get a fresh one.' });
      }

      if (hashSessionToken(rawCode) !== userRow.verification_code_hash) {
        return sendJson(res, 400, { error: 'Invalid 6-digit verification code.' });
      }

      db.prepare(
        `UPDATE users
         SET email_verified = 1, verification_code_hash = '', verification_code_expires_at = ''
         WHERE id = ?`
      ).run(auth.userId);

      const updatedUser = getSingleUserWithStats(auth.userId);
      const visibleUsers = auth.isPublic ? [updatedUser] : getAllUsersWithStats();
      return sendJson(res, 200, {
        ok: true,
        user: updatedUser,
        users: visibleUsers,
        message: 'Email verified! Password recovery is now active on your account.'
      });
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      const body = await readJsonBody(req);
      const identifier = String(body.identifier || body.email || body.username || '').trim();
      if (!identifier) {
        return sendJson(res, 400, { error: 'Please enter your email address or username.' });
      }

      const rateStatus = checkLoginRateLimit(clientIp, `forgot:${identifier}`);
      if (!rateStatus.allowed) {
        return sendJson(res, 429, { error: rateStatus.message });
      }

      let userRow = db
        .prepare(`SELECT * FROM users WHERE (email != '' AND LOWER(email) = LOWER(?)) OR LOWER(name) = LOWER(?)`)
        .get(identifier, identifier);
      if (!userRow) {
        const lowerInput = identifier.toLowerCase();
        if (lowerInput === 'josh' || lowerInput === "josh's vault") {
          userRow = db.prepare(`SELECT * FROM users WHERE id = 1 AND LOWER(name) LIKE 'josh%'`).get();
        } else if (lowerInput === 'my love') {
          userRow = db.prepare(`SELECT * FROM users WHERE id = 2 AND LOWER(name) LIKE 'my love%'`).get();
        }
      }

      if (!userRow) {
        recordFailedLogin(clientIp, `forgot:${identifier}`);
        return sendJson(res, 404, { error: 'No account found with that email address or username.' });
      }

      if (!userRow.email || !isValidEmail(userRow.email)) {
        return sendJson(res, 400, {
          error: `The account "${userRow.name}" does not have a recovery email address saved yet. Please sign in with your username to add one.`
        });
      }

      const resetCode = generateSixDigitCode();
      const resetCodeHash = hashSessionToken(resetCode);
      const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.prepare(
        `UPDATE users SET reset_code_hash = ?, reset_code_expires_at = ? WHERE id = ?`
      ).run(resetCodeHash, resetExpiresAt, userRow.id);

      let mailResult = { delivered: false, provider: 'unconfigured' };
      let mailErrorDetail = '';
      try {
        mailResult = await sendPasswordResetEmail(userRow.email, userRow.name, resetCode);
      } catch (mailErr) {
        mailErrorDetail = mailErr?.message || String(mailErr);
        console.error('[AetherVault] Password reset email error:', mailErrorDetail);
      }

      const masked = maskEmailAddress(userRow.email);
      if (!mailResult.delivered) {
        return sendJson(res, 503, {
          error: isEmailProviderConfigured()
            ? `Email provider error: ${mailErrorDetail || 'Could not send email. Note: Render blocks Gmail SMTP port 465—use BREVO_API_KEY or RESEND_API_KEY over HTTPS instead.'}`
            : 'Outbound email delivery is not configured yet on the server. Add BREVO_API_KEY or RESEND_API_KEY in your Render Environment Variables.'
        });
      }
      return sendJson(res, 200, {
        ok: true,
        maskedEmail: masked,
        emailDelivered: true,
        message: `Sent a 6-digit password recovery code to ${masked}. Please check your email inbox.`
      });
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const body = await readJsonBody(req);
      const identifier = String(body.identifier || body.email || body.username || '').trim();
      const rawCode = String(body.code || '').trim();
      const newPassword = String(body.newPassword || '');

      if (!identifier) {
        return sendJson(res, 400, { error: 'Please enter your email address or username.' });
      }
      if (!/^\d{6}$/.test(rawCode)) {
        return sendJson(res, 400, { error: 'Please enter the 6-digit recovery code.' });
      }
      if (newPassword.length < 4) {
        return sendJson(res, 400, { error: 'New password must be at least 4 characters long.' });
      }

      const rateStatus = checkLoginRateLimit(clientIp, `reset:${identifier}`);
      if (!rateStatus.allowed) {
        return sendJson(res, 429, { error: rateStatus.message });
      }

      let userRow = db
        .prepare(`SELECT * FROM users WHERE (email != '' AND LOWER(email) = LOWER(?)) OR LOWER(name) = LOWER(?)`)
        .get(identifier, identifier);
      if (!userRow) {
        const lowerInput = identifier.toLowerCase();
        if (lowerInput === 'josh' || lowerInput === "josh's vault") {
          userRow = db.prepare(`SELECT * FROM users WHERE id = 1 AND LOWER(name) LIKE 'josh%'`).get();
        } else if (lowerInput === 'my love') {
          userRow = db.prepare(`SELECT * FROM users WHERE id = 2 AND LOWER(name) LIKE 'my love%'`).get();
        }
      }

      if (!userRow || !userRow.reset_code_hash || !userRow.reset_code_expires_at) {
        recordFailedLogin(clientIp, `reset:${identifier}`);
        return sendJson(res, 400, { error: 'Invalid or expired recovery code. Please request a new code.' });
      }

      if (new Date(userRow.reset_code_expires_at) < new Date()) {
        return sendJson(res, 400, { error: 'Recovery code has expired (valid for 15 minutes). Please request a new code.' });
      }

      if (hashSessionToken(rawCode) !== userRow.reset_code_hash) {
        recordFailedLogin(clientIp, `reset:${identifier}`);
        return sendJson(res, 400, { error: 'Incorrect 6-digit recovery code.' });
      }

      clearLoginAttempts(clientIp, `reset:${identifier}`);
      clearLoginAttempts(clientIp, identifier);

      const { hash, salt } = hashPassword(newPassword);
      db.prepare(
        `UPDATE users
         SET password_hash = ?, password_salt = ?, pin_code = '', email_verified = 1, reset_code_hash = '', reset_code_expires_at = ''
         WHERE id = ?`
      ).run(hash, salt, userRow.id);

      // Revoke all old sessions and issue a fresh session
      db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userRow.id);
      const token = createSession(Number(userRow.id));
      const userObj = getSingleUserWithStats(Number(userRow.id));
      const cookieHeader = `aethervault_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${auth.isPublic ? '; Secure' : ''}`;

      return sendJson(
        res,
        200,
        {
          ok: true,
          authenticated: true,
          token,
          user: userObj,
          isPublic: auth.isPublic,
          message: 'Password reset! You are now signed in.'
        },
        { 'Set-Cookie': cookieHeader }
      );
    }

    // 0a. Local LAN Network & Desktop Endpoints (disabled on public multi-tenant hosts)
    if (pathname === '/api/network-info' && method === 'GET') {
      if (auth.isPublic) {
        return sendJson(res, 200, {
          port: PORT,
          hostname: 'aether-vault.com',
          localUrl: 'https://aether-vault.com',
          lanIps: [],
          lanUrls: ['https://aether-vault.com', 'https://aether-vault.net'],
          primaryLanUrl: 'https://aether-vault.com'
        });
      }
      return sendJson(res, 200, getLanNetworkInfo());
    }

    if (pathname === '/api/network-info/allow-firewall' && method === 'POST') {
      if (auth.isPublic) {
        return sendJson(res, 403, { error: 'Not available on public web server.' });
      }
      const { exec } = await import('node:child_process');
      await new Promise(resolve => {
        exec(
          `netsh advfirewall firewall add rule name="AetherVault MTG Port ${PORT}" dir=in action=allow protocol=TCP localport=${PORT}`,
          () => resolve()
        );
      });
      return sendJson(res, 200, {
        ok: true,
        message: `Added Windows Firewall allow rule for TCP port ${PORT} (if running with permissions).`
      });
    }

    if ((pathname === '/api/standalone/create-shortcut' || pathname === '/api/standalone/open-folder') && method === 'POST') {
      if (auth.isPublic) {
        return sendJson(res, 403, { error: 'Desktop shortcuts are only available when running locally on Windows.' });
      }
      if (pathname === '/api/standalone/create-shortcut') {
        const rootDir = path.resolve(__dirname, '..');
        const batPath = path.join(rootDir, 'Start-AetherVault.bat');
        const { execFile } = await import('node:child_process');
        await new Promise((resolve, reject) => {
          const psScript = `
            $WshShell = New-Object -ComObject WScript.Shell
            $Desktop = [Environment]::GetFolderPath('Desktop')
            $Shortcut = $WshShell.CreateShortcut((Join-Path $Desktop 'AetherVault MTG Deckbuilder.lnk'))
            $Shortcut.TargetPath = '${batPath.replace(/'/g, "''")}'
            $Shortcut.WorkingDirectory = '${rootDir.replace(/'/g, "''")}'
            $Shortcut.Description = 'Launch AetherVault MTG Inventory & Deck Builder locally'
            $Shortcut.IconLocation = 'shell32.dll,43'
            $Shortcut.Save()
          `;
          execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], err => {
            if (err) reject(err);
            else resolve();
          });
        });
        return sendJson(res, 200, {
          ok: true,
          message: 'Created "AetherVault MTG Deckbuilder" shortcut on your Windows Desktop!'
        });
      }
      const rootDir = path.resolve(__dirname, '..');
      const { exec } = await import('node:child_process');
      if (process.platform === 'win32') {
        exec(`explorer.exe "${rootDir}"`);
      }
      return sendJson(res, 200, { ok: true, folder: rootDir });
    }

    const isGuestReadOnlyRoute =
      method === 'GET' &&
      (pathname === '/api/community/explore' ||
        /^\/api\/community\/(users|decks)\/\d+$/.test(pathname) ||
        pathname === '/api/scryfall/search' ||
        pathname === '/api/scryfall/printings');

    // All personal vault & mutating routes require an authenticated user session
    if (!isGuestReadOnlyRoute && (!auth.authenticated || !auth.userId)) {
      return sendJson(res, 401, {
        error: 'Authentication required. Please sign in to access your personal AetherVault.',
        requireAuth: true
      });
    }

    const userId = auth.authenticated && auth.userId ? auth.userId : 0;

    // 0b-0. Personal Vault Full JSON Backup & Restore (GET /api/vault/backup & POST /api/vault/restore)
    if (pathname === '/api/vault/backup' && method === 'GET') {
      const userObj = getSingleUserWithStats(userId);
      const inventoryRows = db
        .prepare(
          `SELECT scryfall_id, name, set_code, collector_number, quantity, finish, condition, language, location, purchase_price, notes, created_at
           FROM inventory WHERE COALESCE(user_id, 1) = ? ORDER BY id ASC`
        )
        .all(userId);
      const folderRows = db
        .prepare(`SELECT name FROM deck_folders WHERE COALESCE(user_id, 1) = ? ORDER BY name ASC`)
        .all(userId);
      const deckRows = db
        .prepare(`SELECT * FROM decks WHERE COALESCE(user_id, 1) = ? ORDER BY id ASC`)
        .all(userId);
      const decksWithCards = deckRows.map(d => {
        const cards = db
          .prepare(
            `SELECT scryfall_id, name, quantity, board, finish, custom_category, COALESCE(force_buy, 0) as force_buy
             FROM deck_cards WHERE deck_id = ? ORDER BY id ASC`
          )
          .all(d.id);
        return {
          name: d.name,
          format: d.format,
          folder: d.folder || 'Uncategorized',
          description: d.description || '',
          commander_scryfall_id: d.commander_scryfall_id || null,
          partner_scryfall_id: d.partner_scryfall_id || null,
          cover_image: d.cover_image || null,
          color_identity: safeParse(d.color_identity, []),
          tags: safeParse(d.tags, []),
          cards
        };
      });

      return sendJson(res, 200, {
        version: 'aethervault-backup-v1',
        exportedAt: new Date().toISOString(),
        accountName: userObj?.name || 'Vault',
        inventory: inventoryRows,
        folders: folderRows.map(r => r.name),
        decks: decksWithCards
      });
    }

    if (pathname === '/api/vault/restore' && method === 'POST') {
      const body = await readJsonBody(req);
      const backup = body.backup || body;
      const replaceExisting = Boolean(body.replaceExisting);

      if (!backup || (!Array.isArray(backup.inventory) && !Array.isArray(backup.decks))) {
        return sendJson(res, 400, { error: 'Invalid AetherVault backup file format.' });
      }

      let restoredCards = 0;
      let restoredDecks = 0;

      db.exec('BEGIN TRANSACTION');
      try {
        if (replaceExisting) {
          const userDecks = db.prepare(`SELECT id FROM decks WHERE COALESCE(user_id, 1) = ?`).all(userId);
          for (const d of userDecks) {
            db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(d.id);
          }
          db.prepare(`DELETE FROM decks WHERE COALESCE(user_id, 1) = ?`).run(userId);
          db.prepare(`DELETE FROM deck_folders WHERE COALESCE(user_id, 1) = ?`).run(userId);
          db.prepare(`DELETE FROM inventory WHERE COALESCE(user_id, 1) = ?`).run(userId);
        }

        if (Array.isArray(backup.folders)) {
          const insFolder = db.prepare(`INSERT OR IGNORE INTO deck_folders (user_id, name) VALUES (?, ?)`);
          for (const f of backup.folders) {
            const cleanF = String(f || '').trim();
            if (cleanF && cleanF !== 'Uncategorized') {
              insFolder.run(userId, cleanF);
            }
          }
        }

        if (Array.isArray(backup.inventory)) {
          const insInv = db.prepare(`
            INSERT INTO inventory (user_id, scryfall_id, name, set_code, collector_number, quantity, finish, condition, language, location, purchase_price, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of backup.inventory) {
            if (!item || !item.scryfall_id || !item.name) continue;
            const qty = Math.max(1, Number(item.quantity || 1));
            insInv.run(
              userId,
              String(item.scryfall_id),
              String(item.name),
              String(item.set_code || ''),
              String(item.collector_number || ''),
              qty,
              String(item.finish || 'nonfoil'),
              String(item.condition || 'NM'),
              String(item.language || 'EN'),
              String(item.location || 'Main Binder'),
              item.purchase_price !== null && item.purchase_price !== undefined ? Number(item.purchase_price) : null,
              String(item.notes || '')
            );
            restoredCards += qty;
          }
        }

        if (Array.isArray(backup.decks)) {
          const insDeck = db.prepare(`
            INSERT INTO decks (user_id, name, format, folder, description, commander_scryfall_id, partner_scryfall_id, cover_image, color_identity, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const insDeckCard = db.prepare(`
            INSERT OR REPLACE INTO deck_cards (deck_id, scryfall_id, name, quantity, board, finish, custom_category, force_buy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const d of backup.decks) {
            if (!d || !d.name) continue;
            const folderName = String(d.folder || 'Uncategorized').trim() || 'Uncategorized';
            if (folderName !== 'Uncategorized') {
              db.prepare(`INSERT OR IGNORE INTO deck_folders (user_id, name) VALUES (?, ?)`).run(userId, folderName);
            }
            const resD = insDeck.run(
              userId,
              String(d.name),
              String(d.format || 'commander'),
              folderName,
              String(d.description || ''),
              d.commander_scryfall_id || null,
              d.partner_scryfall_id || null,
              d.cover_image || null,
              JSON.stringify(Array.isArray(d.color_identity) ? d.color_identity : []),
              JSON.stringify(Array.isArray(d.tags) ? d.tags : [])
            );
            const newDeckId = Number(resD.lastInsertRowid);
            restoredDecks++;
            if (Array.isArray(d.cards)) {
              for (const c of d.cards) {
                if (!c || !c.scryfall_id || !c.name) continue;
                insDeckCard.run(
                  newDeckId,
                  String(c.scryfall_id),
                  String(c.name),
                  Math.max(1, Number(c.quantity || 1)),
                  String(c.board || 'mainboard'),
                  String(c.finish || 'nonfoil'),
                  String(c.custom_category || ''),
                  c.force_buy ? 1 : 0
                );
              }
            }
          }
        }

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return sendJson(res, 200, {
        ok: true,
        restoredCards,
        restoredDecks,
        message: `Restored ${restoredCards.toLocaleString()} cards and ${restoredDecks} decks to your vault!`
      });
    }

    // 0b. Multi-User Profile Endpoints: GET & POST /api/users, PATCH & DELETE /api/users/:id
    if (pathname === '/api/users' && method === 'GET') {
      // On public domains (aether-vault.com / aether-vault.net), only return the authenticated user's own profile!
      const visibleUsers = auth.isPublic ? getAllUsersWithStats(userId) : getAllUsersWithStats();
      return sendJson(res, 200, { users: visibleUsers });
    }

    if (pathname === '/api/users' && method === 'POST') {
      const body = await readJsonBody(req);
      const cleanName = String(body.name || body.username || '').trim();
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
      const avatarColor = String(body.avatar_color || 'sky').trim() || 'sky';
      const rawPassword = String(body.password || body.pin_code || '').trim();
      if (!cleanName || cleanName.length < 2) {
        return sendJson(res, 400, { error: 'Username must be at least 2 characters.' });
      }
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { error: 'A valid email address is required for verification and password recovery.' });
      }
      if (rawPassword.length < 4) {
        return sendJson(res, 400, { error: 'A password of at least 4 characters is required.' });
      }
      const existing = db.prepare(`SELECT id FROM users WHERE LOWER(name) = LOWER(?)`).get(cleanName);
      if (existing) {
        return sendJson(res, 400, { error: 'An account with that username already exists.' });
      }
      const existingEmail = db.prepare(`SELECT id FROM users WHERE email != '' AND LOWER(email) = LOWER(?)`).get(email);
      if (existingEmail) {
        return sendJson(res, 400, { error: 'That email address is already registered to another account.' });
      }
      const { hash, salt } = hashPassword(rawPassword);
      const verifyCode = generateSixDigitCode();
      const verifyCodeHash = hashSessionToken(verifyCode);
      const verifyExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const ins = db
        .prepare(
          `INSERT INTO users (name, email, email_verified, verification_code_hash, verification_code_expires_at, avatar_color, password_hash, password_salt, pin_code)
           VALUES (?, ?, 0, ?, ?, ?, ?, ?, '')`
        )
        .run(cleanName, email, verifyCodeHash, verifyExpiresAt, avatarColor, hash, salt);
      const newId = Number(ins.lastInsertRowid);
      const token = createSession(newId);

      let mailResult = { delivered: false, provider: 'console-preview' };
      try {
        mailResult = await sendVerificationEmail(email, cleanName, verifyCode);
      } catch {
        // ignore mail error
      }

      const created = getSingleUserWithStats(newId);
      const visibleUsers = auth.isPublic ? [created] : getAllUsersWithStats();
      return sendJson(res, 201, {
        user: created,
        token,
        users: visibleUsers,
        verificationSent: true,
        emailDelivered: mailResult.delivered
      });
    }

    const userItemMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (userItemMatch) {
      const targetUserId = Number(userItemMatch[1]);
      // Strict ownership check: a user can only modify or delete their OWN account!
      if (targetUserId !== userId) {
        return sendJson(res, 403, { error: 'You can only modify your own AetherVault account.' });
      }
      const existingUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetUserId);
      if (!existingUser) {
        return sendJson(res, 404, { error: 'User profile not found.' });
      }

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const nextName = body.name !== undefined ? String(body.name).trim() || existingUser.name : existingUser.name;
        if (nextName.length < 2 || nextName.length > 40) {
          return sendJson(res, 400, { error: 'Username must be between 2 and 40 characters.' });
        }
        if (nextName.toLowerCase() !== existingUser.name.toLowerCase()) {
          const conflict = db.prepare(`SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id != ?`).get(nextName, targetUserId);
          if (conflict) {
            return sendJson(res, 400, { error: 'That username is already taken.' });
          }
        }

        let nextEmail = existingUser.email || '';
        let emailChanged = false;
        if (body.email !== undefined) {
          const cleanEmail = String(body.email || '').trim().toLowerCase().slice(0, 120);
          if (cleanEmail && !isValidEmail(cleanEmail)) {
            return sendJson(res, 400, { error: 'Please enter a valid email address.' });
          }
          if (cleanEmail && cleanEmail !== (existingUser.email || '').toLowerCase()) {
            const emailConflict = db
              .prepare(`SELECT id FROM users WHERE email != '' AND LOWER(email) = LOWER(?) AND id != ?`)
              .get(cleanEmail, targetUserId);
            if (emailConflict) {
              return sendJson(res, 400, { error: 'That email address is already linked to another account.' });
            }
            emailChanged = true;
          }
          nextEmail = cleanEmail;
        }

        const nextColor = body.avatar_color ?? existingUser.avatar_color;
        let verificationSent = false;
        let emailDelivered = false;

        if (emailChanged && nextEmail) {
          const verifyCode = generateSixDigitCode();
          const verifyCodeHash = hashSessionToken(verifyCode);
          const verifyExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          db.prepare(
            `UPDATE users
             SET name = ?, email = ?, email_verified = 0, verification_code_hash = ?, verification_code_expires_at = ?, avatar_color = ?
             WHERE id = ?`
          ).run(nextName, nextEmail, verifyCodeHash, verifyExpiresAt, nextColor, targetUserId);

          verificationSent = true;
          try {
            const mailRes = await sendVerificationEmail(nextEmail, nextName, verifyCode);
            emailDelivered = mailRes.delivered;
          } catch {
            emailDelivered = false;
          }
        } else {
          db.prepare(`UPDATE users SET name = ?, email = ?, avatar_color = ? WHERE id = ?`).run(
            nextName,
            nextEmail,
            nextColor,
            targetUserId
          );
        }

        const updatedUser = getSingleUserWithStats(targetUserId);
        const visibleUsers = auth.isPublic ? [updatedUser] : getAllUsersWithStats();
        return sendJson(res, 200, {
          user: updatedUser,
          users: visibleUsers,
          verificationSent,
          emailDelivered
        });
      }

      if (method === 'DELETE') {
        if (!auth.isPublic && targetUserId === 1) {
          return sendJson(res, 400, { error: 'Cannot delete the Primary Owner profile (#1) on local desktop.' });
        }
        const userDecks = db.prepare(`SELECT id FROM decks WHERE COALESCE(user_id, 1) = ?`).all(targetUserId);
        db.exec('BEGIN TRANSACTION');
        try {
          for (const d of userDecks) {
            db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(d.id);
          }
          db.prepare(`DELETE FROM decks WHERE COALESCE(user_id, 1) = ?`).run(targetUserId);
          db.prepare(`DELETE FROM deck_folders WHERE COALESCE(user_id, 1) = ?`).run(targetUserId);
          db.prepare(`DELETE FROM inventory WHERE COALESCE(user_id, 1) = ?`).run(targetUserId);
          db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(targetUserId);
          db.prepare(`DELETE FROM users WHERE id = ?`).run(targetUserId);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        return sendJson(res, 200, { ok: true, users: auth.isPublic ? [] : getAllUsersWithStats() });
      }
    }

    // 0c. Community, Following, Public Profile Explorer & 1-Click Clone Deck Endpoints (Deployment Alpha 1.2)
    if (pathname === '/api/community/explore' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const onlyFollowing = url.searchParams.get('onlyFollowing') === 'true';
      const colorFilter = (url.searchParams.get('color') || '').trim().toUpperCase();

      const followingRows = db
        .prepare(`SELECT following_id FROM user_follows WHERE follower_id = ?`)
        .all(userId);
      const followingSet = new Set(followingRows.map(r => Number(r.following_id)));

      const followerCounts = db
        .prepare(`SELECT following_id as uid, COUNT(*) as cnt FROM user_follows GROUP BY following_id`)
        .all();
      const followingCounts = db
        .prepare(`SELECT follower_id as uid, COUNT(*) as cnt FROM user_follows GROUP BY follower_id`)
        .all();
      const followerMap = new Map(followerCounts.map(r => [Number(r.uid), Number(r.cnt)]));
      const followingCountMap = new Map(followingCounts.map(r => [Number(r.uid), Number(r.cnt)]));

      // Build public player directory (never exposing email or password hashes)
      const allUsers = getAllUsersWithStats();
      const players = allUsers
        .map(u => ({
          id: u.id,
          name: u.name,
          avatar_color: u.avatar_color,
          totalCards: u.totalCards,
          uniqueEntries: u.uniqueEntries,
          totalDecks: u.totalDecks,
          followerCount: followerMap.get(u.id) || 0,
          followingCount: followingCountMap.get(u.id) || 0,
          isFollowing: followingSet.has(u.id),
          isSelf: u.id === userId,
          created_at: u.created_at
        }))
        .filter(p => {
          if (!q) return true;
          return p.name.toLowerCase().includes(q);
        });

      const userMap = new Map(allUsers.map(u => [u.id, u]));

      // Viewer's own inventory map (by card name) to show "You own X% of this deck!" on any community deck
      const viewerInvRows = db
        .prepare(`SELECT LOWER(name) as lname, SUM(quantity) as qty FROM inventory WHERE COALESCE(user_id, 1) = ? GROUP BY LOWER(name)`)
        .all(userId);
      const viewerOwnedByName = new Map();
      for (const r of viewerInvRows) {
        viewerOwnedByName.set(r.lname, Number(r.qty || 0));
        if (r.lname.includes('//')) {
          const front = r.lname.split('//')[0].trim();
          viewerOwnedByName.set(front, (viewerOwnedByName.get(front) || 0) + Number(r.qty || 0));
        }
      }

      const rawDecks = db
        .prepare(`SELECT * FROM decks ORDER BY updated_at DESC, id DESC`)
        .all();

      const communityDecks = [];
      for (const d of rawDecks) {
        const authorId = Number(d.user_id || 1);
        const author = userMap.get(authorId) || { id: authorId, name: `Player #${authorId}`, avatar_color: 'amber' };
        const isFollowingAuthor = followingSet.has(authorId);

        if (onlyFollowing && !isFollowingAuthor) continue;

        const cards = getDeckCardsEnriched(d.id);
        const activeCards = cards.filter(c => c.board === 'commander' || c.board === 'mainboard' || c.board === 'sideboard');
        const commanderCards = cards.filter(c => c.board === 'commander');
        const commanderNames = commanderCards.map(c => c.name).join(' // ');

        let totalCards = 0;
        let totalTcg = 0;
        let totalCkRetail = 0;
        let viewerOwnedCount = 0;
        const deckColorSet = new Set(safeParse(d.color_identity, []));

        for (const c of activeCards) {
          const qty = Number(c.quantity || 1);
          totalCards += qty;
          totalTcg += (c.unit_tcg || 0) * qty;
          totalCkRetail += (c.unit_ck_retail || 0) * qty;
          if (c.board === 'commander' && Array.isArray(c.color_identity)) {
            for (const col of c.color_identity) deckColorSet.add(col);
          }
          const lowerName = (c.name || '').toLowerCase();
          const frontName = lowerName.includes('//') ? lowerName.split('//')[0].trim() : lowerName;
          const ownedInViewer = viewerOwnedByName.get(lowerName) ?? viewerOwnedByName.get(frontName) ?? 0;
          viewerOwnedCount += Math.min(qty, ownedInViewer);
        }

        const colorIdentity = Array.from(deckColorSet);
        const tags = safeParse(d.tags, []);

        if (colorFilter && colorFilter !== 'ALL') {
          if (colorFilter === 'C') {
            if (colorIdentity.length > 0) continue;
          } else if (!colorIdentity.includes(colorFilter)) {
            continue;
          }
        }

        if (q) {
          const matchName = (d.name || '').toLowerCase().includes(q);
          const matchAuthor = (author.name || '').toLowerCase().includes(q);
          const matchCmd = commanderNames.toLowerCase().includes(q);
          const matchTag = tags.some(t => String(t).toLowerCase().includes(q));
          const matchFormat = (d.format || '').toLowerCase().includes(q);
          if (!matchName && !matchAuthor && !matchCmd && !matchTag && !matchFormat) {
            continue;
          }
        }

        const viewerOwnedPct = totalCards > 0 ? Math.round((viewerOwnedCount / totalCards) * 100) : 0;

        communityDecks.push({
          id: d.id,
          name: d.name,
          format: d.format,
          folder: d.folder || 'Uncategorized',
          description: d.description || '',
          cover_image: d.cover_image || commanderCards[0]?.image_art_crop || commanderCards[0]?.image_normal || activeCards[0]?.image_art_crop || null,
          commander_name: commanderNames || null,
          color_identity: colorIdentity,
          tags,
          cloned_from_deck_id: d.cloned_from_deck_id || null,
          cloned_from_user_name: d.cloned_from_user_name || '',
          author_id: authorId,
          author_name: author.name,
          author_avatar_color: author.avatar_color || 'amber',
          is_following_author: isFollowingAuthor,
          is_own_deck: authorId === userId,
          total_cards: totalCards,
          total_tcg: Math.round(totalTcg * 100) / 100,
          total_ck_retail: Math.round(totalCkRetail * 100) / 100,
          viewer_owned_cards: viewerOwnedCount,
          viewer_owned_pct: viewerOwnedPct,
          updated_at: d.updated_at
        });
      }

      return sendJson(res, 200, {
        decks: communityDecks,
        players,
        followingIds: Array.from(followingSet),
        dataVersion: dataCacheVersion
      });
    }

    const followMatch = pathname.match(/^\/api\/community\/follow\/(\d+)$/);
    if (followMatch && (method === 'POST' || method === 'DELETE')) {
      const targetUserId = Number(followMatch[1]);
      if (targetUserId === userId) {
        return sendJson(res, 400, { error: 'You cannot follow your own account.' });
      }
      const targetExists = db.prepare(`SELECT id FROM users WHERE id = ?`).get(targetUserId);
      if (!targetExists) {
        return sendJson(res, 404, { error: 'Player not found.' });
      }

      if (method === 'POST') {
        db.prepare(`INSERT OR IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)`).run(userId, targetUserId);
      } else {
        db.prepare(`DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?`).run(userId, targetUserId);
      }

      const followerCount =
        db.prepare(`SELECT COUNT(*) as cnt FROM user_follows WHERE following_id = ?`).get(targetUserId)?.cnt || 0;
      return sendJson(res, 200, {
        ok: true,
        targetUserId,
        isFollowing: method === 'POST',
        followerCount: Number(followerCount)
      });
    }

    const communityUserMatch = pathname.match(/^\/api\/community\/users\/(\d+)$/);
    if (communityUserMatch && method === 'GET') {
      const targetUserId = Number(communityUserMatch[1]);
      const targetUser = getSingleUserWithStats(targetUserId);
      if (!targetUser) {
        return sendJson(res, 404, { error: 'Player not found.' });
      }

      const isFollowing = Boolean(
        db.prepare(`SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?`).get(userId, targetUserId)
      );
      const followerCount =
        db.prepare(`SELECT COUNT(*) as cnt FROM user_follows WHERE following_id = ?`).get(targetUserId)?.cnt || 0;
      const followingCount =
        db.prepare(`SELECT COUNT(*) as cnt FROM user_follows WHERE follower_id = ?`).get(targetUserId)?.cnt || 0;

      // Read-only enriched inventory of target user
      const targetInventory = getAllInventoryEnriched(targetUserId);
      let totalTcg = 0;
      let totalCkRetail = 0;
      for (const item of targetInventory) {
        totalTcg += item.total_tcg || 0;
        totalCkRetail += item.total_ck_retail || 0;
      }

      // Viewer's own inventory names for comparison
      const viewerInvRows = db
        .prepare(`SELECT LOWER(name) as lname, SUM(quantity) as qty FROM inventory WHERE COALESCE(user_id, 1) = ? GROUP BY LOWER(name)`)
        .all(userId);
      const viewerOwnedByName = new Map();
      for (const r of viewerInvRows) {
        viewerOwnedByName.set(r.lname, Number(r.qty || 0));
        if (r.lname.includes('//')) {
          const front = r.lname.split('//')[0].trim();
          viewerOwnedByName.set(front, (viewerOwnedByName.get(front) || 0) + Number(r.qty || 0));
        }
      }

      // Target user's decks
      const rawDecks = db
        .prepare(`SELECT * FROM decks WHERE COALESCE(user_id, 1) = ? ORDER BY updated_at DESC, id DESC`)
        .all(targetUserId);
      const targetDecks = rawDecks.map(d => {
        const cards = getDeckCardsEnriched(d.id);
        const activeCards = cards.filter(c => c.board === 'commander' || c.board === 'mainboard' || c.board === 'sideboard');
        const commanderCards = cards.filter(c => c.board === 'commander');
        let totalCards = 0;
        let deckTcg = 0;
        let deckCk = 0;
        let viewerOwnedCount = 0;
        const deckColorSet = new Set(safeParse(d.color_identity, []));

        for (const c of activeCards) {
          const qty = Number(c.quantity || 1);
          totalCards += qty;
          deckTcg += (c.unit_tcg || 0) * qty;
          deckCk += (c.unit_ck_retail || 0) * qty;
          if (c.board === 'commander' && Array.isArray(c.color_identity)) {
            for (const col of c.color_identity) deckColorSet.add(col);
          }
          const lowerName = (c.name || '').toLowerCase();
          const frontName = lowerName.includes('//') ? lowerName.split('//')[0].trim() : lowerName;
          const ownedInViewer = viewerOwnedByName.get(lowerName) ?? viewerOwnedByName.get(frontName) ?? 0;
          viewerOwnedCount += Math.min(qty, ownedInViewer);
        }

        return {
          id: d.id,
          name: d.name,
          format: d.format,
          folder: d.folder || 'Uncategorized',
          description: d.description || '',
          cover_image: d.cover_image || commanderCards[0]?.image_art_crop || commanderCards[0]?.image_normal || activeCards[0]?.image_art_crop || null,
          commander_name: commanderCards.map(c => c.name).join(' // ') || null,
          color_identity: Array.from(deckColorSet),
          tags: safeParse(d.tags, []),
          cloned_from_deck_id: d.cloned_from_deck_id || null,
          cloned_from_user_name: d.cloned_from_user_name || '',
          author_id: targetUserId,
          author_name: targetUser.name,
          author_avatar_color: targetUser.avatar_color,
          is_following_author: isFollowing,
          is_own_deck: targetUserId === userId,
          total_cards: totalCards,
          total_tcg: Math.round(deckTcg * 100) / 100,
          total_ck_retail: Math.round(deckCk * 100) / 100,
          viewer_owned_cards: viewerOwnedCount,
          viewer_owned_pct: totalCards > 0 ? Math.round((viewerOwnedCount / totalCards) * 100) : 0,
          updated_at: d.updated_at
        };
      });

      return sendJson(res, 200, {
        profile: {
          id: targetUser.id,
          name: targetUser.name,
          avatar_color: targetUser.avatar_color,
          totalCards: targetUser.totalCards,
          uniqueEntries: targetUser.uniqueEntries,
          totalDecks: targetUser.totalDecks,
          totalTcg: Math.round(totalTcg * 100) / 100,
          totalCkRetail: Math.round(totalCkRetail * 100) / 100,
          followerCount: Number(followerCount),
          followingCount: Number(followingCount),
          isFollowing,
          isSelf: targetUser.id === userId,
          created_at: targetUser.created_at
        },
        decks: targetDecks,
        inventory: targetInventory
      });
    }

    const communityDeckMatch = pathname.match(/^\/api\/community\/decks\/(\d+)$/);
    if (communityDeckMatch && method === 'GET') {
      const targetDeckId = Number(communityDeckMatch[1]);
      const deckRow = db.prepare(`SELECT * FROM decks WHERE id = ?`).get(targetDeckId);
      if (!deckRow) {
        return sendJson(res, 404, { error: 'Deck not found.' });
      }
      const authorId = Number(deckRow.user_id || 1);
      const author = getSingleUserWithStats(authorId) || { id: authorId, name: `Player #${authorId}`, avatar_color: 'amber' };
      const isFollowingAuthor = Boolean(
        db.prepare(`SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?`).get(userId, authorId)
      );

      const cards = getDeckCardsEnriched(targetDeckId);
      // Compare against the VIEWER'S own inventory so the viewer can see which cards of this deck they already own!
      const viewerInvRows = db
        .prepare(`SELECT scryfall_id, name, quantity, finish, location, notes FROM inventory WHERE COALESCE(user_id, 1) = ?`)
        .all(userId);
      const viewerUsages = getAllActiveDeckUsages(userId);
      const deckObj = {
        ...deckRow,
        color_identity: safeParse(deckRow.color_identity, []),
        tags: safeParse(deckRow.tags, [])
      };
      const analysis = analyzeAndValidateDeck(deckObj, cards, viewerInvRows, viewerUsages);

      return sendJson(res, 200, {
        deck: {
          ...deckObj,
          author_id: authorId,
          author_name: author.name,
          author_avatar_color: author.avatar_color || 'amber',
          is_following_author: isFollowingAuthor,
          is_own_deck: authorId === userId,
          color_identity:
            analysis.stats.commanderColorIdentity.length > 0
              ? analysis.stats.commanderColorIdentity
              : deckObj.color_identity
        },
        cards,
        analysis
      });
    }

    const cloneDeckMatch = pathname.match(/^\/api\/community\/decks\/(\d+)\/clone$/);
    if (cloneDeckMatch && method === 'POST') {
      const sourceDeckId = Number(cloneDeckMatch[1]);
      const sourceDeck = db.prepare(`SELECT * FROM decks WHERE id = ?`).get(sourceDeckId);
      if (!sourceDeck) {
        return sendJson(res, 404, { error: 'Source deck not found.' });
      }

      const body = await readJsonBody(req);
      const authorId = Number(sourceDeck.user_id || 1);
      const author = getSingleUserWithStats(authorId) || { name: `Player #${authorId}` };
      const customName = String(body.name || '').trim();
      const newDeckName = customName || `${sourceDeck.name} (${author.name} Copy)`;
      const targetFolder = String(body.folder || 'Community Copies').trim() || 'Community Copies';
      const newDesc = sourceDeck.description
        ? `${sourceDeck.description}\n(Copied from ${author.name}'s deck "${sourceDeck.name}")`
        : `Copied from ${author.name}'s deck "${sourceDeck.name}"`;

      // Prefer printings the logged-in user already owns in their own inventory
      const viewerInv = getAllInventoryEnriched(userId);
      const invByName = new Map();
      for (const inv of viewerInv) {
        const lower = (inv.name || '').toLowerCase();
        if (!invByName.has(lower)) invByName.set(lower, inv);
        if (lower.includes('//')) {
          const front = lower.split('//')[0].trim();
          if (!invByName.has(front)) invByName.set(front, inv);
        }
      }

      const sourceCards = db
        .prepare(`SELECT scryfall_id, name, quantity, board, finish, custom_category FROM deck_cards WHERE deck_id = ? ORDER BY id ASC`)
        .all(sourceDeckId);

      let newDeckId = null;
      db.exec('BEGIN TRANSACTION');
      try {
        if (targetFolder !== 'Uncategorized') {
          db.prepare(`INSERT OR IGNORE INTO deck_folders (user_id, name) VALUES (?, ?)`).run(userId, targetFolder);
        }

        const resDeck = db
          .prepare(
            `INSERT INTO decks (
               user_id, name, format, folder, description,
               commander_scryfall_id, partner_scryfall_id, cover_image,
               color_identity, tags, cloned_from_deck_id, cloned_from_user_name
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            userId,
            newDeckName,
            sourceDeck.format || 'commander',
            targetFolder,
            newDesc,
            sourceDeck.commander_scryfall_id || null,
            sourceDeck.partner_scryfall_id || null,
            sourceDeck.cover_image || null,
            sourceDeck.color_identity || '[]',
            sourceDeck.tags || '[]',
            sourceDeckId,
            author.name
          );
        newDeckId = Number(resDeck.lastInsertRowid);

        const insCard = db.prepare(
          `INSERT OR REPLACE INTO deck_cards (deck_id, scryfall_id, name, quantity, board, finish, custom_category, force_buy)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
        );

        for (const c of sourceCards) {
          const lower = (c.name || '').toLowerCase();
          const front = lower.includes('//') ? lower.split('//')[0].trim() : lower;
          const ownedMatch = invByName.get(lower) || invByName.get(front) || null;
          const chosenScryfallId =
            ownedMatch && ownedMatch.scryfall_id && !String(ownedMatch.scryfall_id).startsWith('csv-')
              ? ownedMatch.scryfall_id
              : c.scryfall_id;
          const chosenFinish = ownedMatch ? ownedMatch.finish || c.finish : c.finish || 'nonfoil';

          insCard.run(
            newDeckId,
            chosenScryfallId,
            c.name,
            c.quantity || 1,
            c.board || 'mainboard',
            chosenFinish,
            c.custom_category || ''
          );
        }

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return sendJson(res, 201, {
        ok: true,
        deckId: newDeckId,
        deckName: newDeckName,
        message: `Copied "${sourceDeck.name}" by ${author.name} into your personal Decks!`
      });
    }

    // 1. GET /api/dashboard
    if (pathname === '/api/dashboard' && method === 'GET') {
      const items = getAllInventoryEnriched(userId);
      let totalQty = 0;
      let totalTcg = 0;
      let totalCkRetail = 0;
      let totalCkBuylist = 0;
      let totalCostBasis = 0;

      const byLocation = {};
      const byRarity = { mythic: 0, rare: 0, uncommon: 0, common: 0 };
      const byColor = { W: 0, U: 0, B: 0, R: 0, G: 0, M: 0, C: 0 };

      for (const item of items) {
        totalQty += item.quantity;
        totalTcg += item.total_tcg;
        totalCkRetail += item.total_ck_retail;
        totalCkBuylist += item.total_ck_buylist;
        if (item.purchase_price) {
          totalCostBasis += Number(item.purchase_price) * item.quantity;
        }
        const loc = item.location || 'Main Binder';
        if (!byLocation[loc]) {
          byLocation[loc] = { location: loc, count: 0, valueTcg: 0, valueCkRetail: 0 };
        }
        byLocation[loc].count += item.quantity;
        byLocation[loc].valueTcg = Math.round((byLocation[loc].valueTcg + item.total_tcg) * 100) / 100;
        byLocation[loc].valueCkRetail = Math.round((byLocation[loc].valueCkRetail + item.total_ck_retail) * 100) / 100;

        const rar = (item.rarity || 'common').toLowerCase();
        if (byRarity[rar] !== undefined) byRarity[rar] += item.quantity;

        const cols = item.colors || [];
        if (cols.length === 0) byColor.C += item.quantity;
        else if (cols.length > 1) byColor.M += item.quantity;
        else if (byColor[cols[0]] !== undefined) byColor[cols[0]] += item.quantity;
      }

      const topCards = [...items]
        .sort((a, b) => b.unit_tcg - a.unit_tcg)
        .slice(0, 8);

      const recentCards = items.slice(0, 16);

      const syncRows = db.prepare(`SELECT key, value, updated_at FROM sync_meta`).all();
      const syncMeta = Object.fromEntries(syncRows.map(r => [r.key, { value: r.value, updated_at: r.updated_at }]));
      const ckCount = db.prepare(`SELECT COUNT(*) as cnt FROM ck_prices`).get()?.cnt || 0;

      return sendJson(res, 200, {
        summary: {
          totalCards: totalQty,
          uniqueEntries: items.length,
          totalTcg: Math.round(totalTcg * 100) / 100,
          totalCkRetail: Math.round(totalCkRetail * 100) / 100,
          totalCkBuylist: Math.round(totalCkBuylist * 100) / 100,
          totalCostBasis: Math.round(totalCostBasis * 100) / 100
        },
        topCards,
        recentCards,
        locations: Object.values(byLocation).sort((a, b) => b.valueTcg - a.valueTcg),
        byRarity,
        byColor,
        syncMeta: {
          ...syncMeta,
          ckIndexedCount: ckCount
        }
      });
    }

    // 2. GET /api/inventory
    if (pathname === '/api/inventory' && method === 'GET') {
      const items = getAllInventoryEnriched(userId);
      return sendJson(res, 200, { items });
    }

    // 3. POST /api/inventory
    if (pathname === '/api/inventory' && method === 'POST') {
      const body = await readJsonBody(req);
      const { card, quantity = 1, finish = 'nonfoil', condition = 'NM', language = 'EN', location = 'Main Binder', purchase_price = null, notes = '' } = body;

      if (!card || !card.scryfall_id || !card.name) {
        return sendJson(res, 400, { error: 'Valid card object with scryfall_id and name is required.' });
      }

      const existingCache = db.prepare(`SELECT scryfall_id FROM cards_cache WHERE scryfall_id = ?`).get(card.scryfall_id);
      if (!existingCache || card.type_line) {
        upsertCardCache(card);
      }

      // Check if an identical inventory row exists for this user (including matching notes so deck-reserved cards stay distinct)
      const cleanNotes = String(notes || '').trim();
      const existing = db.prepare(`
        SELECT id, quantity FROM inventory
        WHERE COALESCE(user_id, 1) = ? AND scryfall_id = ? AND finish = ? AND condition = ? AND language = ? AND location = ? AND COALESCE(notes, '') = ?
      `).get(userId, card.scryfall_id, finish, condition, language, location, cleanNotes);

      if (existing) {
        const newQty = existing.quantity + Number(quantity || 1);
        db.prepare(`UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newQty, existing.id);
      } else {
        db.prepare(`
          INSERT INTO inventory (user_id, scryfall_id, name, set_code, collector_number, quantity, finish, condition, language, location, purchase_price, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          card.scryfall_id,
          card.name,
          card.set_code || '',
          card.collector_number || '',
          Math.max(1, Number(quantity || 1)),
          finish,
          condition,
          language,
          location,
          purchase_price !== null && purchase_price !== '' ? Number(purchase_price) : null,
          cleanNotes
        );
      }

      return sendJson(res, 200, { items: getAllInventoryEnriched(userId) });
    }

    // 4. POST /api/inventory/bulk-delete
    if (pathname === '/api/inventory/bulk-delete' && method === 'POST') {
      const body = await readJsonBody(req);
      const { ids = [], location = null, clearAll = false } = body;

      if (clearAll) {
        db.prepare(`DELETE FROM inventory WHERE COALESCE(user_id, 1) = ?`).run(userId);
      } else if (location && location !== 'ALL') {
        db.prepare(`DELETE FROM inventory WHERE COALESCE(user_id, 1) = ? AND location = ?`).run(userId, location);
      } else if (Array.isArray(ids) && ids.length > 0) {
        const delStmt = db.prepare(`DELETE FROM inventory WHERE id = ? AND COALESCE(user_id, 1) = ?`);
        db.exec('BEGIN TRANSACTION');
        try {
          for (const rawId of ids) {
            delStmt.run(Number(rawId), userId);
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }

      return sendJson(res, 200, { items: getAllInventoryEnriched(userId) });
    }

    // 4b. PATCH & DELETE /api/inventory/:id
    const invMatch = pathname.match(/^\/api\/inventory\/(\d+)$/);
    if (invMatch) {
      const id = Number(invMatch[1]);
      if (method === 'DELETE') {
        db.prepare(`DELETE FROM inventory WHERE id = ? AND COALESCE(user_id, 1) = ?`).run(id, userId);
        return sendJson(res, 200, { items: getAllInventoryEnriched(userId) });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const existing = db.prepare(`SELECT * FROM inventory WHERE id = ? AND COALESCE(user_id, 1) = ?`).get(id, userId);
        if (!existing) return sendJson(res, 404, { error: 'Inventory item not found' });

        if (body.quantity !== undefined && Number(body.quantity) <= 0) {
          db.prepare(`DELETE FROM inventory WHERE id = ? AND COALESCE(user_id, 1) = ?`).run(id, userId);
          return sendJson(res, 200, { items: getAllInventoryEnriched(userId) });
        }

        if (body.newCard) {
          upsertCardCache(body.newCard);
        }

        const nextScryfallId = body.newCard?.scryfall_id ?? body.scryfall_id ?? existing.scryfall_id;
        const nextSetCode = body.newCard?.set_code ?? body.set_code ?? existing.set_code;
        const nextCollNum = body.newCard?.collector_number ?? body.collector_number ?? existing.collector_number;

        db.prepare(`
          UPDATE inventory
          SET
            scryfall_id = ?,
            set_code = ?,
            collector_number = ?,
            quantity = ?,
            finish = ?,
            condition = ?,
            language = ?,
            location = ?,
            purchase_price = ?,
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          nextScryfallId,
          nextSetCode,
          nextCollNum,
          body.quantity !== undefined ? Number(body.quantity) : existing.quantity,
          body.finish ?? existing.finish,
          body.condition ?? existing.condition,
          body.language ?? existing.language,
          body.location ?? existing.location,
          body.purchase_price !== undefined ? (body.purchase_price === null || body.purchase_price === '' ? null : Number(body.purchase_price)) : existing.purchase_price,
          body.notes !== undefined ? body.notes : existing.notes,
          id
        );

        return sendJson(res, 200, { items: getAllInventoryEnriched(userId) });
      }
    }

    // 5. GET /api/scryfall/search
    if (pathname === '/api/scryfall/search' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const page = Number(url.searchParams.get('page') || 1);
      const result = await searchScryfallCards(q, page);

      // Attach owned counts from this user's inventory
      const invCounts = db.prepare(`SELECT LOWER(name) as lname, SUM(quantity) as qty FROM inventory WHERE COALESCE(user_id, 1) = ? GROUP BY LOWER(name)`).all(userId);
      const ownedMap = new Map(invCounts.map(r => [r.lname, r.qty]));

      const enriched = result.data.map(c => ({
        ...c,
        owned_qty: ownedMap.get(c.name.toLowerCase()) || 0
      }));

      return sendJson(res, 200, { ...result, data: enriched });
    }

    // 6. GET /api/scryfall/printings
    if (pathname === '/api/scryfall/printings' && method === 'GET') {
      const name = url.searchParams.get('name') || '';
      if (!name) return sendJson(res, 400, { error: 'Card name is required' });
      const printings = await getCardPrintings(name);
      return sendJson(res, 200, { data: printings });
    }

    // 7. POST /api/prices/refresh
    if (pathname === '/api/prices/refresh' && method === 'POST') {
      const result = await refreshCollectionPrices(userId);
      return sendJson(res, 200, result);
    }

    // 8. POST /api/prices/sync-cardkingdom
    if (pathname === '/api/prices/sync-cardkingdom' && method === 'POST') {
      const result = await syncCardKingdomPricelist();
      return sendJson(res, 200, result);
    }

    // 9. GET & POST /api/decks
    if (pathname === '/api/decks' && method === 'GET') {
      const cachedDecks = cachedDecksByUser.get(userId);
      if (cachedDecks && cachedDecks.version === dataCacheVersion) {
        return sendJson(res, 200, cachedDecks.payload);
      }

      const decks = db.prepare(`SELECT * FROM decks WHERE COALESCE(user_id, 1) = ? ORDER BY updated_at DESC, id DESC`).all(userId);
      const folderRows = db.prepare(`SELECT name FROM deck_folders WHERE COALESCE(user_id, 1) = ? ORDER BY name COLLATE NOCASE ASC`).all(userId);
      const invRows = db.prepare(`SELECT scryfall_id, name, quantity, finish, location, notes FROM inventory WHERE COALESCE(user_id, 1) = ?`).all(userId);
      const allUsages = getAllActiveDeckUsages(userId);

      const folderSet = new Set(folderRows.map(r => r.name));
      for (const d of decks) {
        if (d.folder && d.folder.trim()) {
          folderSet.add(d.folder.trim());
        }
      }

      const enrichedDecks = decks.map(d => {
        const cards = getDeckCardsEnriched(d.id);
        const analysis = analyzeAndValidateDeck(
          {
            ...d,
            color_identity: safeParse(d.color_identity, []),
            tags: safeParse(d.tags, [])
          },
          cards,
          invRows,
          allUsages
        );
        return {
          ...d,
          folder: (d.folder || 'Uncategorized').trim() || 'Uncategorized',
          color_identity: analysis.stats.commanderColorIdentity.length > 0
            ? analysis.stats.commanderColorIdentity
            : safeParse(d.color_identity, []),
          tags: safeParse(d.tags, []),
          counts: analysis.counts,
          ownership: analysis.ownership,
          valuation: analysis.valuation,
          isValid: analysis.isValid,
          issueCount: analysis.issues.length
        };
      });

      const payload = {
        decks: enrichedDecks,
        folders: Array.from(folderSet).sort((a, b) => a.localeCompare(b))
      };
      cachedDecksByUser.set(userId, { version: dataCacheVersion, payload });
      return sendJson(res, 200, payload);
    }

    if (pathname === '/api/decks' && method === 'POST') {
      const body = await readJsonBody(req);
      const {
        name = 'New Deck',
        format = 'commander',
        folder = 'Uncategorized',
        description = '',
        commanderCard = null,
        tags = []
      } = body;

      const cleanFolder = (folder || 'Uncategorized').trim() || 'Uncategorized';
      if (cleanFolder !== 'Uncategorized') {
        db.prepare(`INSERT OR IGNORE INTO deck_folders (name, user_id) VALUES (?, ?)`).run(cleanFolder, userId);
      }

      let commanderId = null;
      let coverImage = null;
      let colorIdentity = [];

      if (commanderCard && commanderCard.scryfall_id) {
        upsertCardCache(commanderCard);
        commanderId = commanderCard.scryfall_id;
        coverImage = commanderCard.image_art_crop || commanderCard.image_normal || null;
        colorIdentity = commanderCard.color_identity || [];
      }

      const resInsert = db.prepare(`
        INSERT INTO decks (user_id, name, format, folder, description, commander_scryfall_id, cover_image, color_identity, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        name.trim() || 'Untitled Deck',
        format,
        cleanFolder,
        description,
        commanderId,
        coverImage,
        JSON.stringify(colorIdentity),
        JSON.stringify(tags)
      );

      const deckId = Number(resInsert.lastInsertRowid);
      if (commanderCard && commanderCard.scryfall_id) {
        db.prepare(`
          INSERT INTO deck_cards (deck_id, scryfall_id, name, quantity, board, finish)
          VALUES (?, ?, ?, 1, 'commander', ?)
        `).run(deckId, commanderCard.scryfall_id, commanderCard.name, commanderCard.finish || 'nonfoil');
      }

      return sendJson(res, 201, { deckId });
    }

    // 9a. POST & DELETE /api/decks/folders
    if (pathname === '/api/decks/folders') {
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const { name = '', oldName = '' } = body;
        const cleanName = (name || '').trim();
        if (!cleanName) return sendJson(res, 400, { error: 'Folder name required' });

        if (oldName && oldName.trim() && oldName.trim() !== cleanName) {
          db.prepare(`DELETE FROM deck_folders WHERE name = ? AND COALESCE(user_id, 1) = ?`).run(oldName.trim(), userId);
          db.prepare(`INSERT OR IGNORE INTO deck_folders (name, user_id) VALUES (?, ?)`).run(cleanName, userId);
          db.prepare(`UPDATE decks SET folder = ?, updated_at = CURRENT_TIMESTAMP WHERE folder = ? AND COALESCE(user_id, 1) = ?`).run(
            cleanName,
            oldName.trim(),
            userId
          );
        } else {
          db.prepare(`INSERT OR IGNORE INTO deck_folders (name, user_id) VALUES (?, ?)`).run(cleanName, userId);
        }
        return sendJson(res, 200, { ok: true, folder: cleanName });
      }

      if (method === 'DELETE') {
        const body = await readJsonBody(req);
        const { name = '', deleteDecksInside = false } = body;
        const cleanName = (name || '').trim();
        if (!cleanName) return sendJson(res, 400, { error: 'Folder name required' });

        db.prepare(`DELETE FROM deck_folders WHERE name = ? AND COALESCE(user_id, 1) = ?`).run(cleanName, userId);
        if (deleteDecksInside) {
          const decksInFolder = db.prepare(`SELECT id FROM decks WHERE folder = ? AND COALESCE(user_id, 1) = ?`).all(cleanName, userId);
          for (const d of decksInFolder) {
            db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(d.id);
          }
          db.prepare(`DELETE FROM decks WHERE folder = ? AND COALESCE(user_id, 1) = ?`).run(cleanName, userId);
        } else {
          db.prepare(`UPDATE decks SET folder = 'Uncategorized', updated_at = CURRENT_TIMESTAMP WHERE folder = ? AND COALESCE(user_id, 1) = ?`).run(
            cleanName,
            userId
          );
        }
        return sendJson(res, 200, { ok: true });
      }
    }

    // 9b. POST /api/decks/bulk-move
    if (pathname === '/api/decks/bulk-move' && method === 'POST') {
      const body = await readJsonBody(req);
      const { ids = [], folder = 'Uncategorized' } = body;
      const cleanFolder = (folder || 'Uncategorized').trim() || 'Uncategorized';
      if (cleanFolder !== 'Uncategorized') {
        db.prepare(`INSERT OR IGNORE INTO deck_folders (name, user_id) VALUES (?, ?)`).run(cleanFolder, userId);
      }

      if (Array.isArray(ids) && ids.length > 0) {
        const stmt = db.prepare(`UPDATE decks SET folder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND COALESCE(user_id, 1) = ?`);
        db.exec('BEGIN TRANSACTION');
        try {
          for (const rawId of ids) {
            stmt.run(cleanFolder, Number(rawId), userId);
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }
      return sendJson(res, 200, { ok: true, folder: cleanFolder });
    }

    // 9c. POST /api/decks/bulk-delete
    if (pathname === '/api/decks/bulk-delete' && method === 'POST') {
      const body = await readJsonBody(req);
      const { ids = [], clearAll = false } = body;

      if (clearAll) {
        const userDecks = db.prepare(`SELECT id FROM decks WHERE COALESCE(user_id, 1) = ?`).all(userId);
        for (const d of userDecks) {
          db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(d.id);
        }
        db.prepare(`DELETE FROM decks WHERE COALESCE(user_id, 1) = ?`).run(userId);
      } else if (Array.isArray(ids) && ids.length > 0) {
        const delCardsStmt = db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`);
        const delDeckStmt = db.prepare(`DELETE FROM decks WHERE id = ? AND COALESCE(user_id, 1) = ?`);
        db.exec('BEGIN TRANSACTION');
        try {
          for (const rawId of ids) {
            const did = Number(rawId);
            if (!getOwnedDeck(did, userId)) continue;
            delCardsStmt.run(did);
            delDeckStmt.run(did, userId);
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }

      return sendJson(res, 200, { ok: true });
    }

    // 9d. POST /api/decks/mark-bought
    if (pathname === '/api/decks/mark-bought' && method === 'POST') {
      const body = await readJsonBody(req);
      const { deckId = null, items = [] } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { error: 'No items provided to mark bought.' });
      }
      if (deckId && !getOwnedDeck(deckId, userId)) {
        return sendJson(res, 404, { error: 'Deck not found in your vault.' });
      }

      const selectCacheById = db.prepare(`SELECT * FROM cards_cache WHERE scryfall_id = ?`);
      const selectCacheByName = db.prepare(`SELECT * FROM cards_cache WHERE LOWER(name) = LOWER(?) LIMIT 1`);
      const selectDeckCardById = db.prepare(`SELECT * FROM deck_cards WHERE id = ?`);
      const selectExistingInv = db.prepare(`
        SELECT id, quantity FROM inventory
        WHERE COALESCE(user_id, 1) = ? AND scryfall_id = ? AND finish = ? AND condition = ? AND language = ? AND location = ? AND COALESCE(notes, '') = ?
      `);
      const updateInvQty = db.prepare(`UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
      const insertInvRow = db.prepare(`
        INSERT INTO inventory (user_id, scryfall_id, name, set_code, collector_number, quantity, finish, condition, language, location, purchase_price, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'NM', 'EN', ?, NULL, ?)
      `);

      let acquiredCardsCount = 0;
      db.exec('BEGIN TRANSACTION');
      try {
        for (const rawItem of items) {
          const qty = Math.max(1, Number(rawItem.quantity ?? rawItem.missing_qty ?? 1));
          const targetDeckId = rawItem.deck_id ?? deckId ?? null;
          const finish = rawItem.finish || 'nonfoil';
          const location = rawItem.location || 'Commander Box';
          const notes = targetDeckId ? `Deck #${targetDeckId}` : String(rawItem.notes || '').trim();

          let scryfallId = rawItem.scryfall_id || null;
          let cardName = rawItem.name || '';
          let setCode = rawItem.set_code || '';
          let collectorNumber = rawItem.collector_number || '';

          if (rawItem.deck_card_id) {
            const dcRow = selectDeckCardById.get(Number(rawItem.deck_card_id));
            if (dcRow) {
              scryfallId = scryfallId || dcRow.scryfall_id;
              cardName = cardName || dcRow.name;
            }
          }

          let cached = scryfallId ? selectCacheById.get(scryfallId) : null;
          if (!cached && cardName) {
            cached = selectCacheByName.get(cardName);
          }

          if (cached) {
            scryfallId = scryfallId || cached.scryfall_id;
            cardName = cardName || cached.name;
            setCode = setCode || cached.set_code || '';
            collectorNumber = collectorNumber || cached.collector_number || '';
          } else if (scryfallId && cardName) {
            upsertCardCache({
              scryfall_id: scryfallId,
              name: cardName,
              set_code: setCode,
              collector_number: collectorNumber
            });
          }

          if (!scryfallId || !cardName) continue;

          const existing = selectExistingInv.get(userId, scryfallId, finish, 'NM', 'EN', location, notes);
          if (existing) {
            updateInvQty.run(existing.quantity + qty, existing.id);
          } else {
            insertInvRow.run(userId, scryfallId, cardName, setCode, collectorNumber, qty, finish, location, notes);
          }
          if (rawItem.deck_card_id) {
            db.prepare(`UPDATE deck_cards SET force_buy = 0 WHERE id = ?`).run(Number(rawItem.deck_card_id));
          } else if (targetDeckId && cardName) {
            db.prepare(`UPDATE deck_cards SET force_buy = 0 WHERE deck_id = ? AND LOWER(name) = LOWER(?)`).run(
              Number(targetDeckId),
              cardName
            );
          }
          acquiredCardsCount += qty;
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      let deckDetail = null;
      if (deckId) {
        const numDeckId = Number(deckId);
        const deckRow = db.prepare(`SELECT * FROM decks WHERE id = ?`).get(numDeckId);
        if (deckRow) {
          const cards = getDeckCardsEnriched(numDeckId);
          const invRows = db.prepare(`SELECT scryfall_id, name, quantity, finish, location, notes FROM inventory WHERE COALESCE(user_id, 1) = ?`).all(userId);
          const allUsages = getAllActiveDeckUsages(userId);
          const deck = {
            ...deckRow,
            color_identity: safeParse(deckRow.color_identity, []),
            tags: safeParse(deckRow.tags, [])
          };
          const analysis = analyzeAndValidateDeck(deck, cards, invRows, allUsages);
          deckDetail = {
            deck: {
              ...deck,
              color_identity: analysis.stats.commanderColorIdentity.length > 0
                ? analysis.stats.commanderColorIdentity
                : deck.color_identity
            },
            cards,
            analysis
          };
        }
      }

      return sendJson(res, 200, {
        ok: true,
        acquiredCardsCount,
        deckDetail
      });
    }

    // 10. GET, PATCH, DELETE /api/decks/:id
    const deckMatch = pathname.match(/^\/api\/decks\/(\d+)$/);
    if (deckMatch) {
      const deckId = Number(deckMatch[1]);
      const deckRow = getOwnedDeck(deckId, userId);
      if (!deckRow) return sendJson(res, 404, { error: 'Deck not found in your vault.' });

      if (method === 'GET') {
        const cards = getDeckCardsEnriched(deckId);
        const invRows = db.prepare(`SELECT scryfall_id, name, quantity, finish, location, notes FROM inventory WHERE COALESCE(user_id, 1) = ?`).all(userId);
        const allUsages = getAllActiveDeckUsages(userId);
        const deck = {
          ...deckRow,
          color_identity: safeParse(deckRow.color_identity, []),
          tags: safeParse(deckRow.tags, [])
        };
        const analysis = analyzeAndValidateDeck(deck, cards, invRows, allUsages);
        return sendJson(res, 200, {
          deck: {
            ...deck,
            color_identity: analysis.stats.commanderColorIdentity.length > 0
              ? analysis.stats.commanderColorIdentity
              : deck.color_identity
          },
          cards,
          analysis
        });
      }

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const nextFolder = body.folder !== undefined
          ? ((body.folder || 'Uncategorized').trim() || 'Uncategorized')
          : (deckRow.folder || 'Uncategorized');
        if (nextFolder !== 'Uncategorized') {
          db.prepare(`INSERT OR IGNORE INTO deck_folders (name, user_id) VALUES (?, ?)`).run(nextFolder, userId);
        }
        db.prepare(`
          UPDATE decks
          SET
            name = ?,
            format = ?,
            folder = ?,
            description = ?,
            cover_image = ?,
            tags = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND COALESCE(user_id, 1) = ?
        `).run(
          body.name ?? deckRow.name,
          body.format ?? deckRow.format,
          nextFolder,
          body.description ?? deckRow.description,
          body.cover_image ?? deckRow.cover_image,
          body.tags ? JSON.stringify(body.tags) : deckRow.tags,
          deckId,
          userId
        );
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'DELETE') {
        db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(deckId);
        db.prepare(`DELETE FROM decks WHERE id = ? AND COALESCE(user_id, 1) = ?`).run(deckId, userId);
        return sendJson(res, 200, { ok: true });
      }
    }

    // 10b. POST /api/decks/:id/cards/bulk-delete
    const deckBulkDelMatch = pathname.match(/^\/api\/decks\/(\d+)\/cards\/bulk-delete$/);
    if (deckBulkDelMatch && method === 'POST') {
      const deckId = Number(deckBulkDelMatch[1]);
      if (!getOwnedDeck(deckId, userId)) {
        return sendJson(res, 404, { error: 'Deck not found in your vault.' });
      }
      const body = await readJsonBody(req);
      const { ids = [], clearAll = false } = body;

      if (clearAll) {
        db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(deckId);
      } else if (Array.isArray(ids) && ids.length > 0) {
        const delStmt = db.prepare(`DELETE FROM deck_cards WHERE id = ? AND deck_id = ?`);
        db.exec('BEGIN TRANSACTION');
        try {
          for (const rawId of ids) {
            delStmt.run(Number(rawId), deckId);
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }
      db.prepare(`UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(deckId);
      return sendJson(res, 200, { ok: true });
    }

    // 11. POST /api/decks/:id/cards
    const deckCardsMatch = pathname.match(/^\/api\/decks\/(\d+)\/cards$/);
    if (deckCardsMatch && method === 'POST') {
      const deckId = Number(deckCardsMatch[1]);
      const deckRow = getOwnedDeck(deckId, userId);
      if (!deckRow) {
        return sendJson(res, 404, { error: 'Deck not found in your vault.' });
      }
      const body = await readJsonBody(req);
      const { card, quantity = 1, board = 'mainboard', finish = 'nonfoil', force_buy = false } = body;

      if (!card || !card.scryfall_id || !card.name) {
        return sendJson(res, 400, { error: 'Card with scryfall_id and name required' });
      }

      const existingCache = db.prepare(`SELECT scryfall_id FROM cards_cache WHERE scryfall_id = ?`).get(card.scryfall_id);
      if (!existingCache || card.type_line) {
        upsertCardCache(card);
      }

      const forceBuyVal = force_buy ? 1 : 0;
      const isCommanderDeck = (deckRow?.format || 'commander').toLowerCase() === 'commander';
      const isRelentless = isRelentlessCard(card.name, card.oracle_text || '');

      let existing = db.prepare(`
        SELECT id, quantity, board, COALESCE(force_buy, 0) as force_buy FROM deck_cards
        WHERE deck_id = ? AND scryfall_id = ? AND board = ?
      `).get(deckId, card.scryfall_id, board);

      if (!existing && isCommanderDeck && !isRelentless) {
        existing = db.prepare(`
          SELECT id, quantity, board, COALESCE(force_buy, 0) as force_buy FROM deck_cards
          WHERE deck_id = ? AND LOWER(name) = LOWER(?) AND board = ?
        `).get(deckId, card.name, board);
      }

      // If setting as Commander (or adding a singleton card in a Commander deck that already exists in another zone like Mainboard/Creatures or Commander),
      // MOVE the existing row instead of duplicating it across Creatures and Commander!
      if (!existing && (board === 'commander' || (isCommanderDeck && !isRelentless))) {
        existing = db.prepare(`
          SELECT id, quantity, board, COALESCE(force_buy, 0) as force_buy FROM deck_cards
          WHERE deck_id = ? AND (scryfall_id = ? OR LOWER(name) = LOWER(?))
          ORDER BY CASE WHEN board = 'commander' THEN 0 ELSE 1 END ASC
          LIMIT 1
        `).get(deckId, card.scryfall_id, card.name);
      }

      if (existing) {
        const targetBoardForRow =
          board === 'commander'
            ? 'commander'
            : existing.board === 'commander' && isCommanderDeck
              ? 'commander'
              : board;

        // Remove any other stray duplicate rows of this card name across other boards if moving to Commander
        if (targetBoardForRow === 'commander') {
          db.prepare(`
            DELETE FROM deck_cards
            WHERE deck_id = ? AND (scryfall_id = ? OR LOWER(name) = LOWER(?)) AND id != ?
          `).run(deckId, card.scryfall_id, card.name, existing.id);
        }

        const isMovingToCommander = targetBoardForRow === 'commander';
        const nextQty = isMovingToCommander
          ? 1
          : isCommanderDeck && !isRelentless && forceBuyVal === 1 && existing.force_buy === 0 && Number(quantity || 1) === 1
            ? Math.max(1, existing.quantity)
            : isCommanderDeck && !isRelentless && existing.board === 'commander'
              ? 1
              : existing.quantity + Number(quantity || 1);

        db.prepare(`
          UPDATE deck_cards SET scryfall_id = ?, quantity = ?, board = ?, finish = ?, force_buy = ? WHERE id = ?
        `).run(
          card.scryfall_id,
          nextQty,
          targetBoardForRow,
          finish,
          forceBuyVal ? 1 : existing.force_buy,
          existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO deck_cards (deck_id, scryfall_id, name, quantity, board, finish, force_buy)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          deckId,
          card.scryfall_id,
          card.name,
          board === 'commander' ? 1 : Math.max(1, Number(quantity || 1)),
          board,
          finish,
          forceBuyVal
        );
      }

      // If added to commander board, update deck cover image & combined commander/background color identity
      if (board === 'commander') {
        const cover = card.image_art_crop || card.image_normal || null;
        const cmdRows = db.prepare(`
          SELECT c.color_identity
          FROM deck_cards dc
          LEFT JOIN cards_cache c ON c.scryfall_id = dc.scryfall_id
          WHERE dc.deck_id = ? AND dc.board = 'commander'
        `).all(deckId);
        const combinedColors = new Set(Array.isArray(card.color_identity) ? card.color_identity : []);
        for (const r of cmdRows) {
          for (const col of safeParse(r.color_identity, [])) {
            combinedColors.add(col);
          }
        }
        const isBackground = (card.type_line || '').toLowerCase().includes('background');
        db.prepare(`
          UPDATE decks
          SET
            commander_scryfall_id = COALESCE(CASE WHEN ? THEN commander_scryfall_id ELSE ? END, ?),
            cover_image = COALESCE(CASE WHEN ? THEN cover_image ELSE ? END, cover_image, ?),
            color_identity = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          isBackground ? 1 : 0,
          card.scryfall_id,
          card.scryfall_id,
          isBackground ? 1 : 0,
          cover,
          cover,
          JSON.stringify(Array.from(combinedColors)),
          deckId
        );
      } else {
        db.prepare(`UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(deckId);
      }

      const updatedDeckRow = db.prepare(`SELECT * FROM decks WHERE id = ?`).get(deckId);
      let deckDetail = null;
      if (updatedDeckRow) {
        const cards = getDeckCardsEnriched(deckId);
        const invRows = db.prepare(`SELECT scryfall_id, name, quantity, finish, location, notes FROM inventory WHERE COALESCE(user_id, 1) = ?`).all(userId);
        const allUsages = getAllActiveDeckUsages(userId);
        const deckObj = {
          ...updatedDeckRow,
          color_identity: safeParse(updatedDeckRow.color_identity, []),
          tags: safeParse(updatedDeckRow.tags, [])
        };
        const analysis = analyzeAndValidateDeck(deckObj, cards, invRows, allUsages);
        deckDetail = {
          deck: {
            ...deckObj,
            color_identity: analysis.stats.commanderColorIdentity.length > 0
              ? analysis.stats.commanderColorIdentity
              : deckObj.color_identity
          },
          cards,
          analysis
        };
      }

      return sendJson(res, 200, { ok: true, deckDetail });
    }

    // 12. PATCH & DELETE /api/decks/:id/cards/:cardRowId
    const deckCardItemMatch = pathname.match(/^\/api\/decks\/(\d+)\/cards\/(\d+)$/);
    if (deckCardItemMatch) {
      const deckId = Number(deckCardItemMatch[1]);
      const cardRowId = Number(deckCardItemMatch[2]);
      if (!getOwnedDeck(deckId, userId)) {
        return sendJson(res, 404, { error: 'Deck not found in your vault.' });
      }

      if (method === 'DELETE') {
        db.prepare(`DELETE FROM deck_cards WHERE id = ? AND deck_id = ?`).run(cardRowId, deckId);
        db.prepare(`UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(deckId);
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const row = db.prepare(`SELECT * FROM deck_cards WHERE id = ? AND deck_id = ?`).get(cardRowId, deckId);
        if (!row) return sendJson(res, 404, { error: 'Deck card not found' });

        if (body.quantity !== undefined && Number(body.quantity) <= 0) {
          db.prepare(`DELETE FROM deck_cards WHERE id = ?`).run(cardRowId);
          db.prepare(`UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(deckId);
          return sendJson(res, 200, { ok: true });
        }

        if (body.newCard) {
          upsertCardCache(body.newCard);
        }

        const nextBoard = body.board ?? row.board;
        const nextScryfall = body.newCard?.scryfall_id ?? body.scryfall_id ?? row.scryfall_id;
        const nextQty = body.quantity !== undefined ? Number(body.quantity) : row.quantity;
        const nextFinish = body.finish ?? row.finish;
        const nextForceBuy = body.force_buy !== undefined ? (body.force_buy ? 1 : 0) : (row.force_buy || 0);

        // Check if moving to a board that already has this scryfall_id or same card name (when moving to commander)
        const conflict = db.prepare(`
          SELECT id, quantity, COALESCE(force_buy, 0) as force_buy FROM deck_cards
          WHERE deck_id = ? AND (scryfall_id = ? OR LOWER(name) = LOWER(?)) AND board = ? AND id != ?
        `).get(deckId, nextScryfall, row.name, nextBoard, cardRowId);

        if (nextBoard === 'commander') {
          // Ensure any duplicate copy of this card in mainboard/creatures is removed when promoted to Commander
          db.prepare(`
            DELETE FROM deck_cards
            WHERE deck_id = ? AND (scryfall_id = ? OR LOWER(name) = LOWER(?)) AND id != ?
          `).run(deckId, nextScryfall, row.name, cardRowId);
          db.prepare(`
            UPDATE deck_cards
            SET scryfall_id = ?, quantity = 1, board = 'commander', finish = ?, force_buy = ?
            WHERE id = ?
          `).run(nextScryfall, nextFinish, nextForceBuy, cardRowId);
        } else if (conflict) {
          db.prepare(`UPDATE deck_cards SET quantity = ?, force_buy = ? WHERE id = ?`).run(
            conflict.quantity + nextQty,
            nextForceBuy || conflict.force_buy,
            conflict.id
          );
          db.prepare(`DELETE FROM deck_cards WHERE id = ?`).run(cardRowId);
        } else {
          db.prepare(`
            UPDATE deck_cards
            SET scryfall_id = ?, quantity = ?, board = ?, finish = ?, force_buy = ?
            WHERE id = ?
          `).run(nextScryfall, nextQty, nextBoard, nextFinish, nextForceBuy, cardRowId);
        }

        if (nextBoard === 'commander') {
          const cached = db.prepare(`SELECT image_art_crop, image_normal, color_identity, type_line FROM cards_cache WHERE scryfall_id = ?`).get(nextScryfall);
          const cmdRows = db.prepare(`
            SELECT c.color_identity
            FROM deck_cards dc
            LEFT JOIN cards_cache c ON c.scryfall_id = dc.scryfall_id
            WHERE dc.deck_id = ? AND dc.board = 'commander'
          `).all(deckId);
          const combinedColors = new Set();
          for (const r of cmdRows) {
            for (const col of safeParse(r.color_identity, [])) {
              combinedColors.add(col);
            }
          }
          if (cached) {
            const isBg = (cached.type_line || '').toLowerCase().includes('background');
            const cover = cached.image_art_crop || cached.image_normal || null;
            db.prepare(`
              UPDATE decks
              SET
                commander_scryfall_id = COALESCE(CASE WHEN ? THEN commander_scryfall_id ELSE ? END, ?),
                cover_image = COALESCE(CASE WHEN ? THEN cover_image ELSE ? END, cover_image, ?),
                color_identity = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              isBg ? 1 : 0,
              nextScryfall,
              nextScryfall,
              isBg ? 1 : 0,
              cover,
              cover,
              JSON.stringify(Array.from(combinedColors)),
              deckId
            );
          }
        } else {
          db.prepare(`UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(deckId);
        }

        const updatedDeckRow = db.prepare(`SELECT * FROM decks WHERE id = ?`).get(deckId);
        let deckDetail = null;
        if (updatedDeckRow) {
          const cards = getDeckCardsEnriched(deckId);
          const invRows = db.prepare(`SELECT scryfall_id, name, quantity, finish, location, notes FROM inventory WHERE COALESCE(user_id, 1) = ?`).all(userId);
          const allUsages = getAllActiveDeckUsages(userId);
          const deckObj = {
            ...updatedDeckRow,
            color_identity: safeParse(updatedDeckRow.color_identity, []),
            tags: safeParse(updatedDeckRow.tags, [])
          };
          const analysis = analyzeAndValidateDeck(deckObj, cards, invRows, allUsages);
          deckDetail = {
            deck: {
              ...deckObj,
              color_identity: analysis.stats.commanderColorIdentity.length > 0
                ? analysis.stats.commanderColorIdentity
                : deckObj.color_identity
            },
            cards,
            analysis
          };
        }

        return sendJson(res, 200, { ok: true, deckDetail });
      }
    }

    // 13a. GET /api/import/progress
    if (pathname === '/api/import/progress' && method === 'GET') {
      return sendJson(res, 200, importProgressState);
    }

    // 13b. POST /api/import
    if (pathname === '/api/import' && method === 'POST') {
      const body = await readJsonBody(req);
      const {
        text = '',
        target = 'inventory',
        location = 'Main Binder',
        deckId = null,
        newDeckName = '',
        newDeckFormat = 'commander',
        newDeckFolder = 'Uncategorized',
        commanderName = '',
        replaceExisting = false,
        preferInventoryPrinting = true
      } = body;

      const parsed = parseImportPayload(text, target === 'deck' ? 'decklist' : 'auto');
      if (parsed.length === 0) {
        return sendJson(res, 400, { error: 'No recognizable card lines found in input.' });
      }

      // If importing into a deck and a commanderName was specified, mark or insert that commander
      if (target === 'deck' && commanderName && commanderName.trim()) {
        const cmdClean = cleanCardNameForLookup(commanderName).toLowerCase();
        const cmdFront = cmdClean.split('//')[0].trim();
        let foundCmd = false;
        for (const item of parsed) {
          const itemClean = cleanCardNameForLookup(item.name).toLowerCase();
          const itemFront = itemClean.split('//')[0].trim();
          if (itemClean === cmdClean || (cmdFront && itemFront === cmdFront)) {
            item.board = 'commander';
            foundCmd = true;
            break;
          }
        }
        if (!foundCmd) {
          parsed.unshift({
            name: commanderName.trim(),
            raw_name: commanderName.trim(),
            quantity: 1,
            set_code: '',
            collector_number: '',
            finish: 'nonfoil',
            condition: 'NM',
            location: 'Main Binder',
            board: 'commander'
          });
        }
      }

      // When importing a decklist, automatically match against the user's Available Inventory first!
      // This pulls owned printings directly from the user's collection and skips unnecessary Scryfall calls.
      if (target === 'deck' && preferInventoryPrinting) {
        const currentInv = getAllInventoryEnriched(userId);
        // Sort so available_qty > 0 comes first, then highest available_qty
        const sortedInv = [...currentInv].sort((a, b) => (b.available_qty || 0) - (a.available_qty || 0));
        const invByName = new Map();
        const invByFront = new Map();

        for (const inv of sortedInv) {
          const n = (inv.name || '').toLowerCase();
          if (!invByName.has(n)) invByName.set(n, inv);
          if (n.includes('//')) {
            const front = n.split('//')[0].trim();
            if (!invByFront.has(front)) invByFront.set(front, inv);
          }
        }

        for (const item of parsed) {
          const cleanLookup = cleanCardNameForLookup(item.name).toLowerCase();
          const rawLower = (item.raw_name || item.name).toLowerCase();
          const frontLookup = cleanLookup.split('//')[0].trim();
          const invMatch =
            invByName.get(cleanLookup) ||
            invByName.get(rawLower) ||
            invByFront.get(cleanLookup) ||
            invByFront.get(frontLookup) ||
            null;

          if (invMatch && invMatch.scryfall_id && !String(invMatch.scryfall_id).startsWith('csv-')) {
            item.scryfall_id = invMatch.scryfall_id;
            item.set_code = invMatch.set_code || item.set_code;
            item.collector_number = invMatch.collector_number || item.collector_number;
            if (!item.finish || item.finish === 'nonfoil') {
              item.finish = invMatch.finish || 'nonfoil';
            }
          }
        }
      }

      importProgressState.active = true;
      importProgressState.phase = 'resolving_scryfall';
      importProgressState.totalRows = parsed.length;
      importProgressState.resolvedCards = 0;
      importProgressState.processedBatches = 0;
      importProgressState.totalBatches = 0;
      importProgressState.message = `Parsed ${parsed.length.toLocaleString()} rows. Matching inventory & resolving missing cards with Scryfall...`;

      try {
        await batchResolveScryfallCards(parsed);

        importProgressState.phase = 'writing_database';
        importProgressState.message = `Indexing and writing ${parsed.length.toLocaleString()} rows to SQLite...`;

        // Pre-load cards_cache into memory maps for O(1) lookup across 9,000+ rows
        const allCached = db.prepare(`SELECT * FROM cards_cache`).all();
        const byId = new Map();
        const bySetNum = new Map();
        const byName = new Map();
        const byFrontName = new Map();

        for (const c of allCached) {
          byId.set(c.scryfall_id.toLowerCase(), c);
          if (c.set_code && c.collector_number) {
            const setLower = c.set_code.toLowerCase();
            const numLower = String(c.collector_number).toLowerCase();
            bySetNum.set(`${setLower}:${numLower}`, c);
            const stripped = numLower.replace(/^0+(?=\d)/, '');
            bySetNum.set(`${setLower}:${stripped}`, c);
          }
          const lowerName = c.name.toLowerCase();
          if (!byName.has(lowerName)) {
            byName.set(lowerName, c);
          }
          if (lowerName.includes('//')) {
            const front = lowerName.split('//')[0].trim();
            if (!byFrontName.has(front)) {
              byFrontName.set(front, c);
            }
          }
        }

        let resolvedCount = 0;
        let scryfallMatchedCount = 0;
        let fallbackCreatedCount = 0;
        const unresolved = [];

        let targetDeckId = deckId ? Number(deckId) : null;
        if (target === 'deck' && targetDeckId) {
          if (!getOwnedDeck(targetDeckId, userId)) {
            return sendJson(res, 404, { error: 'Target deck not found in your vault.' });
          }
        }
        if (target === 'deck' && !targetDeckId) {
          const cleanFolder = (newDeckFolder || 'Uncategorized').trim() || 'Uncategorized';
          if (cleanFolder !== 'Uncategorized') {
            db.prepare(`INSERT OR IGNORE INTO deck_folders (name, user_id) VALUES (?, ?)`).run(cleanFolder, userId);
          }
          const resDeck = db.prepare(`
            INSERT INTO decks (user_id, name, format, folder, description)
            VALUES (?, ?, ?, ?, 'Pasted decklist — auto-matched against collection & Buy List')
          `).run(userId, newDeckName || 'Pasted Deck', newDeckFormat || 'commander', cleanFolder);
          targetDeckId = Number(resDeck.lastInsertRowid);
        }

        const selectInvExisting = db.prepare(`
          SELECT id, quantity FROM inventory
          WHERE COALESCE(user_id, 1) = ? AND scryfall_id = ? AND finish = ? AND condition = ? AND location = ?
        `);
        const updateInvQty = db.prepare(`
          UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `);
        const insertInvRow = db.prepare(`
          INSERT INTO inventory (user_id, scryfall_id, name, set_code, collector_number, quantity, finish, condition, language, location, purchase_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const selectDeckExisting = db.prepare(`
          SELECT id, quantity FROM deck_cards
          WHERE deck_id = ? AND scryfall_id = ? AND board = ?
        `);
        const updateDeckQty = db.prepare(`
          UPDATE deck_cards SET quantity = ? WHERE id = ?
        `);
        const insertDeckRow = db.prepare(`
          INSERT INTO deck_cards (deck_id, scryfall_id, name, quantity, board, finish)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        let firstArtCrop = null;

        db.exec('BEGIN TRANSACTION');
        try {
          if (replaceExisting) {
            if (target === 'inventory') {
              db.prepare(`DELETE FROM inventory WHERE COALESCE(user_id, 1) = ?`).run(userId);
            } else if (target === 'deck' && targetDeckId) {
              db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(targetDeckId);
            }
          }

          for (const item of parsed) {
            let cardRow = null;
            if (item.scryfall_id) {
              cardRow = byId.get(item.scryfall_id.toLowerCase()) || null;
            }
            if (!cardRow && item.set_code && item.collector_number) {
              const cleanSet = item.set_code.toLowerCase().replace(/[^a-z0-9]/g, '');
              const numLower = String(item.collector_number).toLowerCase();
              const stripped = numLower.replace(/^0+(?=\d)/, '');
              cardRow = bySetNum.get(`${cleanSet}:${numLower}`) || bySetNum.get(`${cleanSet}:${stripped}`) || null;
            }
            if (!cardRow) {
              const cleanLookup = cleanCardNameForLookup(item.name).toLowerCase();
              const rawLower = (item.raw_name || item.name).toLowerCase();
              cardRow =
                byName.get(cleanLookup) ||
                byName.get(rawLower) ||
                byFrontName.get(cleanLookup) ||
                byFrontName.get(rawLower.split('//')[0].trim()) ||
                null;
            }

            if (cardRow) {
              scryfallMatchedCount += item.quantity;
            } else {
              // Never drop any card from the user's CSV/decklist! Create a fallback card entry in cards_cache
              const safeSlug = `${item.set_code || 'csv'}-${item.collector_number || '0'}-${item.name}`
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .slice(0, 64);
              const fallbackId = item.scryfall_id || `csv-${safeSlug}`;
              const fallbackPrice = item.purchase_price ?? null;
              const fallbackCard = {
                scryfall_id: fallbackId,
                oracle_id: null,
                name: item.raw_name || item.name,
                set_code: item.set_code || 'unk',
                set_name: item.set_name || 'Imported Set',
                collector_number: item.collector_number || '',
                mana_cost: '',
                cmc: 0,
                type_line: 'Card',
                oracle_text: '',
                colors: '[]',
                color_identity: '[]',
                rarity: 'common',
                image_normal: null,
                image_small: null,
                image_art_crop: null,
                tcg_usd: fallbackPrice,
                tcg_usd_foil: item.finish !== 'nonfoil' ? fallbackPrice : null,
                tcg_usd_etched: null,
                tcgplayer_id: null,
                tcgplayer_url: `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(item.name)}`,
                cardkingdom_url: `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(item.name)}`,
                ck_retail_nonfoil: fallbackPrice,
                ck_retail_foil: item.finish !== 'nonfoil' ? fallbackPrice : null,
                ck_buylist_nonfoil: null,
                ck_buylist_foil: null,
                ck_qty_nonfoil: null,
                ck_qty_foil: null,
                legalities: '{}',
                produced_mana: '[]',
                power: null,
                toughness: null,
                keywords: '[]'
              };
              upsertCardCache(fallbackCard);
              cardRow = fallbackCard;
              byId.set(fallbackId.toLowerCase(), fallbackCard);
              byName.set(item.name.toLowerCase(), fallbackCard);
              fallbackCreatedCount += item.quantity;
            }

            resolvedCount += item.quantity;

            if (!firstArtCrop && (cardRow.image_art_crop || cardRow.image_normal)) {
              firstArtCrop = cardRow.image_art_crop || cardRow.image_normal;
            }

            if (target === 'inventory') {
              const targetLoc = item.location || location || 'Main Binder';
              const finish = item.finish || 'nonfoil';
              const cond = item.condition || 'NM';
              const lang = item.language || 'EN';

              const existing = selectInvExisting.get(userId, cardRow.scryfall_id, finish, cond, targetLoc);
              if (existing) {
                updateInvQty.run(existing.quantity + item.quantity, existing.id);
              } else {
                insertInvRow.run(
                  userId,
                  cardRow.scryfall_id,
                  cardRow.name,
                  cardRow.set_code || item.set_code || '',
                  cardRow.collector_number || item.collector_number || '',
                  item.quantity,
                  finish,
                  cond,
                  lang,
                  targetLoc,
                  item.purchase_price ?? null
                );
              }
            } else if (target === 'deck' && targetDeckId) {
              const board = item.board || 'mainboard';
              const existing = selectDeckExisting.get(targetDeckId, cardRow.scryfall_id, board);
              if (existing) {
                updateDeckQty.run(existing.quantity + item.quantity, existing.id);
              } else {
                insertDeckRow.run(
                  targetDeckId,
                  cardRow.scryfall_id,
                  cardRow.name,
                  item.quantity,
                  board,
                  item.finish || 'nonfoil'
                );
              }

              if (board === 'commander') {
                db.prepare(`
                  UPDATE decks
                  SET commander_scryfall_id = ?, cover_image = COALESCE(?, cover_image), color_identity = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `).run(cardRow.scryfall_id, cardRow.image_art_crop || cardRow.image_normal, cardRow.color_identity, targetDeckId);
              }
            }
          }

          if (target === 'deck' && targetDeckId && firstArtCrop) {
            db.prepare(`
              UPDATE decks
              SET cover_image = COALESCE(cover_image, ?), updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(firstArtCrop, targetDeckId);
          }

          db.exec('COMMIT');
        } catch (txErr) {
          db.exec('ROLLBACK');
          throw txErr;
        }

        let deckBreakdown = null;
        if (target === 'deck' && targetDeckId) {
          const deckRow = db.prepare(`SELECT * FROM decks WHERE id = ?`).get(targetDeckId);
          const cards = getDeckCardsEnriched(targetDeckId);
          const invRows = getAllInventoryEnriched(userId);
          const allUsages = getAllActiveDeckUsages(userId);
          const deckObj = {
            ...deckRow,
            color_identity: safeParse(deckRow.color_identity, []),
            tags: safeParse(deckRow.tags, [])
          };
          const analysis = analyzeAndValidateDeck(deckObj, cards, invRows, allUsages);
          deckBreakdown = {
            deckId: targetDeckId,
            deckName: deckRow.name,
            totalRequired: analysis.ownership.totalRequired,
            pulledFromInventoryCount: analysis.ownership.totalOwned,
            addedToBuyListCount: analysis.ownership.totalMissing,
            completionPct: analysis.ownership.completionPct,
            missingCostTcg: analysis.ownership.missingCostTcg,
            missingCostCkRetail: analysis.ownership.missingCostCkRetail,
            missingCards: analysis.ownership.missingCards
          };
        }

        importProgressState.active = false;
        importProgressState.phase = 'done';
        importProgressState.message = `Imported ${resolvedCount.toLocaleString()} cards (${parsed.length.toLocaleString()} rows)!`;

        return sendJson(res, 200, {
          ok: true,
          resolvedCount,
          parsedRowCount: parsed.length,
          scryfallMatchedCount,
          fallbackCreatedCount,
          unresolved,
          deckId: targetDeckId,
          deckBreakdown
        });
      } finally {
        importProgressState.active = false;
      }
    }

    return sendJson(res, 404, { error: `Unknown API route: ${method} ${pathname}` });
  } catch (err) {
    console.error('API Error:', err);
    return sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
}

function safeParse(str, fallback) {
  if (typeof str !== 'string') return str ?? fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

async function startServer() {
  const server = http.createServer();

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/*.sqlite', '**/*.sqlite-*']
        }
      },
      appType: 'spa'
    });

    server.on('request', async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        return handleApi(req, res, url);
      }
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end('Not found');
      });
    });
  } else {
    const distDir = path.resolve(__dirname, '..', 'dist');
    server.on('request', async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        return handleApi(req, res, url);
      }
      const safeRelative = path
        .normalize(decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname))
        .replace(/^(\.\.(\/|\\|$))+/, '')
        .replace(/^[/\\]+/, '');
      let filePath = path.resolve(distDir, safeRelative);
      if (!filePath.startsWith(distDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2'
      };
      const isHashedAsset = url.pathname.startsWith('/assets/');
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  }

  const shouldOpenBrowser =
    process.argv.includes('--open') ||
    process.env.AUTO_OPEN_BROWSER === '1' ||
    process.env.AUTO_OPEN_BROWSER === 'true';

  async function openBrowserUrl(targetUrl) {
    try {
      const { exec } = await import('node:child_process');
      if (process.platform === 'win32') {
        exec(`start "" "${targetUrl}"`);
      } else if (process.platform === 'darwin') {
        exec(`open "${targetUrl}"`);
      } else {
        exec(`xdg-open "${targetUrl}"`);
      }
    } catch {
      // Ignore browser launch errors
    }
  }

  server.on('error', async err => {
    if (err && err.code === 'EADDRINUSE') {
      console.log(`\n✨ AetherVault is already running at http://localhost:${PORT}\n`);
      if (shouldOpenBrowser) {
        await openBrowserUrl(`http://localhost:${PORT}`);
      }
      process.exit(0);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    const netInfo = getLanNetworkInfo();
    console.log(`\n✨ AetherVault MTG Inventory & Deck Builder running at:`);
    console.log(`   • Local PC:       http://localhost:${PORT}`);
    if (netInfo.lanUrls.length > 0) {
      for (const u of netInfo.lanUrls) {
        console.log(`   • Wi-Fi / Mobile: ${u}`);
      }
    }
    console.log('');
    if (shouldOpenBrowser) {
      openBrowserUrl(`http://localhost:${PORT}`);
    }
  });
}

startServer();
