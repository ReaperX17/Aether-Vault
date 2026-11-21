const BASIC_LANDS = new Set([
  'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest'
]);

export function isRelentlessCard(name = '', oracleText = '') {
  if (BASIC_LANDS.has(name.toLowerCase())) return true;
  if (oracleText.includes('A deck can have any number of cards named')) return true;
  if (oracleText.includes('A deck can have up to')) return true;
  return false;
}

export function getCardUnitPrice(card, finish = 'nonfoil') {
  const isFoil = finish === 'foil' || finish === 'etched';
  const tcg = finish === 'etched'
    ? (card.tcg_usd_etched ?? card.tcg_usd_foil ?? card.tcg_usd ?? 0)
    : isFoil
      ? (card.tcg_usd_foil ?? card.tcg_usd ?? 0)
      : (card.tcg_usd ?? card.tcg_usd_foil ?? 0);

  const ckRetail = isFoil
    ? (card.ck_retail_foil ?? card.ck_retail_nonfoil ?? 0)
    : (card.ck_retail_nonfoil ?? card.ck_retail_foil ?? 0);

  const ckBuylist = isFoil
    ? (card.ck_buylist_foil ?? card.ck_buylist_nonfoil ?? 0)
    : (card.ck_buylist_nonfoil ?? card.ck_buylist_foil ?? 0);

  return {
    tcg: Number(tcg || 0),
    ckRetail: Number(ckRetail || 0),
    ckBuylist: Number(ckBuylist || 0)
  };
}

export function computeInventoryDeckAllocations(inventoryItems, allActiveDeckCards) {
  // Initialize allocation fields and build O(1) lookup maps by scryfall_id and card name
  const byScryfall = new Map();
  const byName = new Map();

  function pushMapList(map, key, item) {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(item);
  }

  for (const inv of inventoryItems) {
    inv.in_decks_qty = 0;
    inv.available_qty = Number(inv.quantity || 0);
    inv.used_in_decks = [];
    const sId = (inv.scryfall_id || '').toLowerCase();
    const nLower = (inv.name || '').toLowerCase();
    const nFront = nLower.includes('//') ? nLower.split('//')[0].trim() : '';
    const notesStr = String(inv.notes || '');
    const deckTagMatch = notesStr.match(/Deck #(\d+)/);
    inv._lowerScryfall = sId;
    inv._lowerName = nLower;
    inv._reservedDeckId = deckTagMatch ? Number(deckTagMatch[1]) : null;

    pushMapList(byScryfall, sId, inv);
    pushMapList(byName, nLower, inv);
    if (nFront && nFront !== nLower) {
      pushMapList(byName, nFront, inv);
    }
  }

  // Group deck usages in deterministic order (oldest deck first by deck_id)
  const sortedUsages = [...allActiveDeckCards].sort((a, b) => a.deck_id - b.deck_id);

  function addDeckUsageToInv(inv, deckId, deckName, takeQty) {
    inv.available_qty = Math.max(0, inv.available_qty - takeQty);
    inv.in_decks_qty += takeQty;
    const existing = inv.used_in_decks.find(d => d.deck_id === deckId);
    if (existing) {
      existing.quantity += takeQty;
    } else {
      inv.used_in_decks.push({
        deck_id: deckId,
        deck_name: deckName,
        quantity: takeQty
      });
    }
  }

  for (const usage of sortedUsages) {
    if (Number(usage.force_buy || 0) > 0) continue;
    let needed = Number(usage.quantity || 0);
    if (needed <= 0) continue;

    const uDeckId = Number(usage.deck_id);
    const uScryfall = (usage.scryfall_id || '').toLowerCase();
    const uFinish = usage.finish || 'nonfoil';
    const uName = (usage.name || '').toLowerCase();
    const uFront = uName.includes('//') ? uName.split('//')[0].trim() : uName;

    const candidatesByName = byName.get(uName) || (uFront !== uName ? byName.get(uFront) : null) || [];
    const candidatesByScryfall = byScryfall.get(uScryfall) || [];

    // Pass 0: Inventory rows explicitly bought/reserved for this specific deck (notes = "Deck #X")
    for (const inv of candidatesByName) {
      if (needed <= 0) break;
      if (inv.available_qty <= 0) continue;
      const isForThisDeck =
        inv._reservedDeckId === uDeckId || (usage.deck_name && inv.location === usage.deck_name);
      if (!isForThisDeck) continue;
      const take = Math.min(needed, inv.available_qty);
      addDeckUsageToInv(inv, uDeckId, usage.deck_name, take);
      needed -= take;
    }
    if (needed <= 0) continue;

    // Pass 1: Exact scryfall_id + finish (unreserved general pool)
    for (const inv of candidatesByScryfall) {
      if (needed <= 0) break;
      if (inv.available_qty <= 0) continue;
      if (inv._reservedDeckId !== null && inv._reservedDeckId !== uDeckId) continue;
      if ((inv.finish || 'nonfoil') === uFinish) {
        const take = Math.min(needed, inv.available_qty);
        addDeckUsageToInv(inv, uDeckId, usage.deck_name, take);
        needed -= take;
      }
    }
    if (needed <= 0) continue;

    // Pass 2: Exact scryfall_id (any finish, unreserved general pool)
    for (const inv of candidatesByScryfall) {
      if (needed <= 0) break;
      if (inv.available_qty <= 0) continue;
      if (inv._reservedDeckId !== null && inv._reservedDeckId !== uDeckId) continue;
      const take = Math.min(needed, inv.available_qty);
      addDeckUsageToInv(inv, uDeckId, usage.deck_name, take);
      needed -= take;
    }
    if (needed <= 0) continue;

    // Pass 3: Same card name (any printing, unreserved general pool)
    for (const inv of candidatesByName) {
      if (needed <= 0) break;
      if (inv.available_qty <= 0) continue;
      if (inv._reservedDeckId !== null && inv._reservedDeckId !== uDeckId) continue;
      const take = Math.min(needed, inv.available_qty);
      addDeckUsageToInv(inv, uDeckId, usage.deck_name, take);
      needed -= take;
    }
  }

  for (const inv of inventoryItems) {
    delete inv._lowerScryfall;
    delete inv._lowerName;
    delete inv._reservedDeckId;
  }

  return inventoryItems;
}

export function analyzeAndValidateDeck(deck, deckCards, inventoryRows, allDeckUsages = []) {
  const format = (deck.format || 'commander').toLowerCase();
  const issues = [];
  const warnings = [];

  // Map total owned quantities by lowercase card name and by exact scryfall_id
  const ownedByName = new Map();
  const reservedForThisDeckByName = new Map();
  const reservedForOtherDecksByName = new Map();
  const reservedForPriorDecksByName = new Map();
  const ownedByScryfall = new Map();
  const thisDeckId = Number(deck.id);
  const thisDeckTag = `Deck #${thisDeckId}`;
  for (const item of inventoryRows) {
    const key = (item.name || '').toLowerCase();
    const front = key.split('//')[0].trim();
    const q = Number(item.quantity || 0);
    const notesStr = String(item.notes || '');
    const isReservedForThis = notesStr.includes(thisDeckTag) || (deck.name && item.location === deck.name);
    const otherMatch = !isReservedForThis ? notesStr.match(/Deck #(\d+)/) : null;
    const isReservedForOther = Boolean(otherMatch);
    const otherDeckId = otherMatch ? Number(otherMatch[1]) : null;

    ownedByName.set(key, (ownedByName.get(key) || 0) + q);
    if (front && front !== key) {
      ownedByName.set(front, (ownedByName.get(front) || 0) + q);
    }
    if (isReservedForThis) {
      reservedForThisDeckByName.set(key, (reservedForThisDeckByName.get(key) || 0) + q);
      if (front && front !== key) {
        reservedForThisDeckByName.set(front, (reservedForThisDeckByName.get(front) || 0) + q);
      }
    } else if (isReservedForOther) {
      reservedForOtherDecksByName.set(key, (reservedForOtherDecksByName.get(key) || 0) + q);
      if (front && front !== key) {
        reservedForOtherDecksByName.set(front, (reservedForOtherDecksByName.get(front) || 0) + q);
      }
      if (otherDeckId !== null && otherDeckId < thisDeckId) {
        reservedForPriorDecksByName.set(key, (reservedForPriorDecksByName.get(key) || 0) + q);
        if (front && front !== key) {
          reservedForPriorDecksByName.set(front, (reservedForPriorDecksByName.get(front) || 0) + q);
        }
      }
    }
    ownedByScryfall.set(item.scryfall_id, (ownedByScryfall.get(item.scryfall_id) || 0) + q);
  }

  // Track how many copies of each card name are used in OTHER decks,
  // and how many copies are consumed by PRIOR decks (deck_id < current deck.id)
  const usedInOtherDecksByName = new Map();
  const usedInPriorDecksByName = new Map();
  const otherDecksListByName = new Map();
  for (const u of allDeckUsages) {
    if (Number(u.deck_id) === Number(deck.id)) continue;
    const key = (u.name || '').toLowerCase();
    const front = key.split('//')[0].trim();
    const uq = Number(u.quantity || 0);
    const isForcedBuy = Number(u.force_buy || 0) > 0;
    if (!isForcedBuy) {
      usedInOtherDecksByName.set(key, (usedInOtherDecksByName.get(key) || 0) + uq);
      if (front && front !== key) {
        usedInOtherDecksByName.set(front, (usedInOtherDecksByName.get(front) || 0) + uq);
      }
      if (Number(u.deck_id) < Number(deck.id)) {
        usedInPriorDecksByName.set(key, (usedInPriorDecksByName.get(key) || 0) + uq);
        if (front && front !== key) {
          usedInPriorDecksByName.set(front, (usedInPriorDecksByName.get(front) || 0) + uq);
        }
      }
    }
    if (!otherDecksListByName.has(key)) {
      otherDecksListByName.set(key, []);
    }
    const list = otherDecksListByName.get(key);
    const ex = list.find(d => d.deck_id === u.deck_id);
    if (ex) ex.quantity += uq;
    else list.push({ deck_id: u.deck_id, deck_name: u.deck_name, quantity: uq });
  }

  // Separate boards
  const commanders = deckCards.filter(c => c.board === 'commander');
  const mainboard = deckCards.filter(c => c.board === 'mainboard');
  const sideboard = deckCards.filter(c => c.board === 'sideboard');
  const considering = deckCards.filter(c => c.board === 'considering');

  // Determine Commander color identity
  const commanderIdentitySet = new Set();
  if (commanders.length > 0) {
    for (const cmd of commanders) {
      for (const col of (cmd.color_identity || [])) {
        commanderIdentitySet.add(col);
      }
    }
  } else {
    for (const col of (deck.color_identity || [])) {
      commanderIdentitySet.add(col);
    }
  }

  const commanderCount = commanders.reduce((sum, c) => sum + c.quantity, 0);
  const mainboardCount = mainboard.reduce((sum, c) => sum + c.quantity, 0);
  const sideboardCount = sideboard.reduce((sum, c) => sum + c.quantity, 0);
  const activeTotalCards = format === 'commander' ? (commanderCount + mainboardCount) : mainboardCount;

  // Format card count rules
  if (format === 'commander') {
    if (commanderCount === 0) {
      issues.push({
        type: 'error',
        category: 'Commander Required',
        message: 'No Commander assigned. Set a Legendary Creature or valid Planeswalker as your Commander.'
      });
    } else if (commanderCount > 2) {
      issues.push({
        type: 'error',
        category: 'Commander Limit',
        message: `Deck has ${commanderCount} cards in the Commander zone (max 1, or 2 with Partner/Background).`
      });
    }
    if (activeTotalCards !== 100) {
      issues.push({
        type: activeTotalCards > 100 ? 'error' : 'warning',
        category: 'Deck Size (100 Cards)',
        message: `Commander decks require exactly 100 cards including Commander(s). Currently at ${activeTotalCards}/100 (${100 - activeTotalCards > 0 ? `${100 - activeTotalCards} slots remaining` : `${activeTotalCards - 100} over limit`}).`
      });
    }
  } else if (['standard', 'pioneer', 'modern', 'legacy', 'pauper'].includes(format)) {
    if (mainboardCount < 60) {
      issues.push({
        type: 'warning',
        category: 'Minimum 60 Cards',
        message: `${format.toUpperCase()} mainboard requires at least 60 cards (currently ${mainboardCount}/60).`
      });
    }
    if (sideboardCount > 15) {
      issues.push({
        type: 'error',
        category: 'Sideboard Limit',
        message: `Sideboard cannot exceed 15 cards (currently ${sideboardCount}/15).`
      });
    }
  }

  // Track copy counts, legality, color identity, and ownership
  const nameCounts = new Map();
  const nameCardRef = new Map();

  const manaCurve = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
  const colorPips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const manaSources = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const typeBreakdown = {
    Commander: 0,
    Creature: 0,
    Instant: 0,
    Sorcery: 0,
    Artifact: 0,
    Enchantment: 0,
    Planeswalker: 0,
    Land: 0,
    Other: 0
  };

  let nonLandCmcSum = 0;
  let nonLandCount = 0;

  let totalValueTcg = 0;
  let totalValueCkRetail = 0;
  let totalValueCkBuylist = 0;

  let totalRequiredCards = 0;
  let totalOwnedCards = 0;
  let missingCostTcg = 0;
  let missingCostCkRetail = 0;
  const missingCards = [];

  // Track remaining available pool per card name:
  // Copies explicitly bought/reserved for this deck + general pool remaining after prior decks
  const remainingAvailablePoolByName = new Map();
  for (const [k, totalOwned] of ownedByName.entries()) {
    const reservedThis = reservedForThisDeckByName.get(k) || 0;
    const reservedOther = reservedForOtherDecksByName.get(k) || 0;
    const reservedPrior = reservedForPriorDecksByName.get(k) || 0;
    const generalOwned = Math.max(0, totalOwned - reservedThis - reservedOther);
    const usedInPrior = Math.max(0, (usedInPriorDecksByName.get(k) || 0) - reservedPrior);
    remainingAvailablePoolByName.set(k, reservedThis + Math.max(0, generalOwned - usedInPrior));
  }

  const activeDeckCards = [...commanders, ...mainboard, ...sideboard];

  for (const dc of activeDeckCards) {
    const qty = Number(dc.quantity || 1);
    const lowerName = (dc.name || '').toLowerCase();
    const frontName = lowerName.split('//')[0].trim();
    nameCounts.set(lowerName, (nameCounts.get(lowerName) || 0) + qty);
    nameCardRef.set(lowerName, dc);

    // Pricing for this deck entry
    const unit = getCardUnitPrice(dc, dc.finish);
    totalValueTcg += unit.tcg * qty;
    totalValueCkRetail += unit.ckRetail * qty;
    totalValueCkBuylist += unit.ckBuylist * qty;

    // Ownership & Available calculation
    const lookupKey = remainingAvailablePoolByName.has(lowerName) ? lowerName : (frontName || lowerName);
    const totalOwnedInVault = ownedByName.get(lookupKey) || 0;
    const usedInOthers = usedInOtherDecksByName.get(lookupKey) || 0;
    const otherDecksForCard = otherDecksListByName.get(lowerName) || otherDecksListByName.get(frontName) || [];

    const isForcedBuy = Number(dc.force_buy || 0) > 0;
    const poolAvail = remainingAvailablePoolByName.get(lookupKey) || 0;
    const ownedUsed = isForcedBuy ? 0 : Math.min(qty, poolAvail);
    const missingQty = isForcedBuy ? qty : Math.max(0, qty - ownedUsed);
    if (!isForcedBuy) {
      const nextPool = Math.max(0, poolAvail - ownedUsed);
      remainingAvailablePoolByName.set(lookupKey, nextPool);
      if (frontName && frontName !== lookupKey && remainingAvailablePoolByName.has(frontName)) {
        remainingAvailablePoolByName.set(frontName, nextPool);
      }
    }

    totalRequiredCards += qty;
    totalOwnedCards += ownedUsed;
    dc.owned_qty = totalOwnedInVault;
    dc.available_qty = Math.max(0, totalOwnedInVault - usedInOthers - ownedUsed);
    dc.in_other_decks_qty = usedInOthers;
    dc.other_decks = otherDecksForCard;
    dc.exact_printing_owned_qty = ownedByScryfall.get(dc.scryfall_id) || 0;
    dc.missing_qty = missingQty;
    dc.force_buy = isForcedBuy ? 1 : 0;

    if (missingQty > 0) {
      missingCostTcg += unit.tcg * missingQty;
      missingCostCkRetail += unit.ckRetail * missingQty;
      missingCards.push({
        deck_card_id: dc.id,
        deck_id: deck.id,
        scryfall_id: dc.scryfall_id,
        name: dc.name,
        set_code: dc.set_code,
        collector_number: dc.collector_number,
        finish: dc.finish,
        board: dc.board,
        missing_qty: missingQty,
        force_buy: isForcedBuy ? 1 : 0,
        owned_total_qty: totalOwnedInVault,
        in_other_decks_qty: usedInOthers,
        other_decks: otherDecksForCard,
        unit_tcg: unit.tcg,
        unit_ck_retail: unit.ckRetail,
        total_tcg: round2(unit.tcg * missingQty),
        total_ck_retail: round2(unit.ckRetail * missingQty),
        tcgplayer_url: dc.tcgplayer_url,
        cardkingdom_url: dc.cardkingdom_url,
        image_small: dc.image_small
      });
    }

    // Format legality check
    if (format !== 'freeform' && dc.legalities && Object.keys(dc.legalities).length > 0) {
      const status = dc.legalities[format];
      if (status && status !== 'legal' && status !== 'restricted') {
        issues.push({
          type: 'error',
          category: 'Format Legality',
          cardName: dc.name,
          message: `${dc.name} is ${status === 'banned' ? 'BANNED' : 'not legal'} in ${format.toUpperCase()}.`
        });
      }
    }

    // Commander color identity check
    if (format === 'commander' && commanderIdentitySet.size > 0 && dc.board !== 'commander') {
      const cardCI = dc.color_identity || [];
      const illegalColors = cardCI.filter(c => !commanderIdentitySet.has(c));
      if (illegalColors.length > 0) {
        issues.push({
          type: 'error',
          category: 'Color Identity',
          cardName: dc.name,
          message: `${dc.name} has color identity [${cardCI.join('')}] outside your Commander's identity [${Array.from(commanderIdentitySet).join('')}].`
        });
      }
    }

    // Stats only for Commander + Mainboard
    if (dc.board === 'commander' || dc.board === 'mainboard') {
      const typeLine = (dc.type_line || '').toLowerCase();
      const isLand = typeLine.includes('land');

      if (dc.board === 'commander') {
        typeBreakdown.Commander += qty;
      } else if (isLand) {
        typeBreakdown.Land += qty;
      } else if (typeLine.includes('creature')) {
        typeBreakdown.Creature += qty;
      } else if (typeLine.includes('instant')) {
        typeBreakdown.Instant += qty;
      } else if (typeLine.includes('sorcery')) {
        typeBreakdown.Sorcery += qty;
      } else if (typeLine.includes('planeswalker')) {
        typeBreakdown.Planeswalker += qty;
      } else if (typeLine.includes('artifact')) {
        typeBreakdown.Artifact += qty;
      } else if (typeLine.includes('enchantment')) {
        typeBreakdown.Enchantment += qty;
      } else {
        typeBreakdown.Other += qty;
      }

      if (!isLand) {
        const cmc = Math.floor(Number(dc.cmc || 0));
        nonLandCmcSum += Number(dc.cmc || 0) * qty;
        nonLandCount += qty;
        if (cmc <= 0) manaCurve['0'] += qty;
        else if (cmc === 1) manaCurve['1'] += qty;
        else if (cmc === 2) manaCurve['2'] += qty;
        else if (cmc === 3) manaCurve['3'] += qty;
        else if (cmc === 4) manaCurve['4'] += qty;
        else if (cmc === 5) manaCurve['5'] += qty;
        else manaCurve['6+'] += qty;
      }

      // Count mana pips
      const manaCost = dc.mana_cost || '';
      for (const sym of ['W', 'U', 'B', 'R', 'G', 'C']) {
        const regex = new RegExp(`\\{[^}]*${sym}[^}]*\\}`, 'g');
        const matches = manaCost.match(regex);
        if (matches) {
          colorPips[sym] += matches.length * qty;
        }
      }

      // Count produced mana sources
      for (const prod of (dc.produced_mana || [])) {
        if (manaSources[prod] !== undefined) {
          manaSources[prod] += qty;
        }
      }
    }
  }

  // Copy limit check
  const maxCopies = format === 'commander' ? 1 : format === 'freeform' ? 999 : 4;
  for (const [lowerName, totalCount] of nameCounts.entries()) {
    const ref = nameCardRef.get(lowerName);
    if (totalCount > maxCopies && !isRelentlessCard(ref.name, ref.oracle_text)) {
      issues.push({
        type: 'error',
        category: format === 'commander' ? 'Singleton Rule' : '4-Copy Limit',
        cardName: ref.name,
        message: `${ref.name} has ${totalCount} copies in deck (max ${maxCopies} allowed in ${format.toUpperCase()}).`
      });
    }
  }

  // Annotate considering cards with ownership too
  for (const dc of considering) {
    const lowerName = dc.name.toLowerCase();
    dc.owned_qty = ownedByName.get(lowerName) || 0;
    dc.exact_printing_owned_qty = ownedByScryfall.get(dc.scryfall_id) || 0;
    dc.missing_qty = Math.max(0, dc.quantity - dc.owned_qty);
  }

  return {
    isValid: issues.filter(i => i.type === 'error').length === 0,
    issues,
    warnings,
    counts: {
      commander: commanderCount,
      mainboard: mainboardCount,
      sideboard: sideboardCount,
      considering: considering.reduce((s, c) => s + c.quantity, 0),
      activeTotal: activeTotalCards,
      targetTotal: format === 'commander' ? 100 : 60
    },
    ownership: {
      totalRequired: totalRequiredCards,
      totalOwned: totalOwnedCards,
      totalMissing: Math.max(0, totalRequiredCards - totalOwnedCards),
      completionPct: totalRequiredCards > 0 ? Math.round((totalOwnedCards / totalRequiredCards) * 100) : 100,
      canBuildRightNow: totalRequiredCards > 0 && totalOwnedCards >= totalRequiredCards,
      missingCostTcg: round2(missingCostTcg),
      missingCostCkRetail: round2(missingCostCkRetail),
      missingCards
    },
    valuation: {
      tcg: round2(totalValueTcg),
      ckRetail: round2(totalValueCkRetail),
      ckBuylist: round2(totalValueCkBuylist)
    },
    stats: {
      avgCmc: nonLandCount > 0 ? round2(nonLandCmcSum / nonLandCount) : 0,
      manaCurve,
      colorPips,
      manaSources,
      typeBreakdown,
      commanderColorIdentity: Array.from(commanderIdentitySet)
    }
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Parse either CSV (Moxfield, ManaBox, Archidekt, DragonShield, TCGplayer, Deckbox, Delver Lens) or Text decklists
 */
export function parseImportPayload(rawText, formatHint = 'auto') {
  const cleanedText = (rawText || '').replace(/^\uFEFF/, '');
  const rawLines = cleanedText.split(/\r?\n/).map(l => l.trim());
  const nonEmptyLines = rawLines.filter(Boolean);
  if (nonEmptyLines.length === 0) return [];

  // Detect CSV if first line has delimiters and common header keywords, or if multiple commas/tabs exist
  const firstLower = nonEmptyLines[0].toLowerCase();
  const hasDelimiter = nonEmptyLines[0].includes(',') || nonEmptyLines[0].includes('\t') || nonEmptyLines[0].includes(';');
  const hasHeaderWord =
    firstLower.includes('name') ||
    firstLower.includes('card') ||
    firstLower.includes('quantity') ||
    firstLower.includes('count') ||
    firstLower.includes('qty') ||
    firstLower.includes('edition') ||
    firstLower.includes('set') ||
    firstLower.includes('binder') ||
    firstLower.includes('folder');

  const isCsv = formatHint === 'csv' || (formatHint !== 'decklist' && hasDelimiter && hasHeaderWord);

  if (isCsv) {
    return parseCsvLines(nonEmptyLines);
  }
  return parseDecklistLines(rawLines);
}

function detectDelimiter(headerLine) {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  if (semiCount > commaCount && semiCount > tabCount) return ';';
  return ',';
}

function splitCsvRow(line, delimiter = ',') {
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function stripVariantSuffixes(cardName = '') {
  let s = String(cardName || '').trim();
  // Remove trailing parenthetical treatments added by TCGplayer/DragonShield/CardKingdom CSVs
  // e.g. "Sol Ring (Borderless)", "Atraxa (Showcase) (Foil)", "Counterspell - Retro Frame"
  s = s.replace(/\s*\((?:borderless|showcase|extended\s*art|retro\s*frame|full\s*art|foil|non-foil|etched|surge\s*foil|galaxy\s*foil|textured\s*foil|halo\s*foil|step-and-complete|serial\s*numbered|prerelease|promo|bundle|b&w|jp\s*alternate\s*art|\d+)\)/gi, '');
  s = s.replace(/\s*-\s*(?:borderless|showcase|extended\s*art|retro\s*frame|full\s*art|foil|etched)$/gi, '');
  return s.trim();
}

function parseCsvLines(lines) {
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = splitCsvRow(lines[0], delimiter);
  const headers = rawHeaders.map(h =>
    h
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_ #]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  // Prefer "simple name" (TCGplayer) or standard "name"/"card name"/"card"
  const idxSimpleName = headers.findIndex(h => h === 'simple name' || h === 'english name');
  const idxName = headers.findIndex(
    h => h === 'name' || h === 'card name' || h === 'cardname' || h === 'card' || h === 'product name'
  );
  const idxQty = headers.findIndex(
    h => h === 'quantity' || h === 'count' || h === 'qty' || h === 'total qty' || h === 'tradelist count'
  );
  const idxRegQty = headers.findIndex(h => h === 'reg qty' || h === 'regular qty' || h === 'normal');
  const idxFoilQty = headers.findIndex(h => h === 'foil qty' || h === 'foils');

  const idxSet = headers.findIndex(
    h => h === 'set code' || h === 'set_code' || h === 'edition code' || h === 'edition' || h === 'set' || h === 'expansion code' || h === 'code'
  );
  const idxSetName = headers.findIndex(
    h => h === 'set name' || h === 'set_name' || h === 'edition name' || h === 'expansion'
  );
  const idxNum = headers.findIndex(
    h => h === 'collector number' || h === 'collector_number' || h === 'card number' || h === 'number' || h === 'collector #' || h === 'coll #' || h === 'cn'
  );
  const idxFoil = headers.findIndex(
    h => h === 'foil' || h === 'finish' || h === 'printing' || h === 'is foil' || h === 'is_foil'
  );
  const idxCond = headers.findIndex(h => h === 'condition' || h === 'cond' || h === 'grade');
  const idxLang = headers.findIndex(h => h === 'language' || h === 'lang');
  const idxLoc = headers.findIndex(
    h => h === 'binder name' || h === 'folder name' || h === 'location' || h === 'folder' || h === 'binder' || h === 'category' || h === 'deck'
  );
  const idxScryfall = headers.findIndex(
    h => h === 'scryfall id' || h === 'scryfall_id' || h === 'scryfallid' || h === 'scryfall'
  );
  const idxPrice = headers.findIndex(
    h => h === 'purchase price' || h === 'purchase_price' || h === 'price bought' || h === 'my price' || h === 'price' || h === 'price each' || h === 'market price' || h === 'mid'
  );

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvRow(lines[i], delimiter);
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const rawCardName =
      (idxSimpleName >= 0 && row[idxSimpleName] ? row[idxSimpleName] : '') ||
      (idxName >= 0 ? row[idxName] : row[0]) ||
      '';
    const cleanName = stripVariantSuffixes(rawCardName);
    if (!cleanName) continue;

    const setCode = idxSet >= 0 ? (row[idxSet] || '').trim().toLowerCase() : '';
    const setName = idxSetName >= 0 ? (row[idxSetName] || '').trim() : '';
    const collectorNum = idxNum >= 0 ? (row[idxNum] || '').trim() : '';
    const condition = idxCond >= 0 && row[idxCond] ? normalizeCondition(row[idxCond]) : 'NM';
    const language = idxLang >= 0 && row[idxLang] ? row[idxLang].trim().slice(0, 4).toUpperCase() : 'EN';
    const location = idxLoc >= 0 && row[idxLoc] ? row[idxLoc].trim() : '';
    const scryfallId = idxScryfall >= 0 && row[idxScryfall] ? row[idxScryfall].trim() : null;
    const rawPriceStr = idxPrice >= 0 && row[idxPrice] ? row[idxPrice].replace(/[^0-9.]/g, '') : '';
    const purchasePrice = rawPriceStr ? parseFloat(rawPriceStr) : null;

    // Handle CSVs that have separate Regular Qty and Foil Qty columns
    if (idxRegQty >= 0 && idxFoilQty >= 0) {
      const regQ = parseInt(row[idxRegQty], 10) || 0;
      const foilQ = parseInt(row[idxFoilQty], 10) || 0;
      if (regQ > 0) {
        parsed.push({
          name: cleanName,
          raw_name: rawCardName.trim(),
          quantity: regQ,
          set_code: setCode,
          set_name: setName,
          collector_number: collectorNum,
          finish: 'nonfoil',
          condition,
          language,
          location,
          purchase_price: purchasePrice,
          scryfall_id: scryfallId,
          board: 'mainboard'
        });
      }
      if (foilQ > 0) {
        parsed.push({
          name: cleanName,
          raw_name: rawCardName.trim(),
          quantity: foilQ,
          set_code: setCode,
          set_name: setName,
          collector_number: collectorNum,
          finish: 'foil',
          condition,
          language,
          location,
          purchase_price: purchasePrice,
          scryfall_id: scryfallId,
          board: 'mainboard'
        });
      }
      continue;
    }

    const qtyRaw = idxQty >= 0 ? parseInt(String(row[idxQty] || '').replace(/[^0-9]/g, ''), 10) : 1;
    const qty = Number.isNaN(qtyRaw) || qtyRaw <= 0 ? 1 : qtyRaw;

    const rawFoil = idxFoil >= 0 ? (row[idxFoil] || '').toLowerCase().trim() : '';
    const finish = rawFoil.includes('etched')
      ? 'etched'
      : rawFoil === 'foil' ||
        rawFoil === 'true' ||
        rawFoil === '1' ||
        rawFoil === 'yes' ||
        rawFoil === 'f' ||
        rawFoil.includes('foil') && !rawFoil.includes('non') && !rawFoil.includes('normal')
        ? 'foil'
        : 'nonfoil';

    parsed.push({
      name: cleanName,
      raw_name: rawCardName.trim(),
      quantity: qty,
      set_code: setCode,
      set_name: setName,
      collector_number: collectorNum,
      finish,
      condition,
      language,
      location,
      purchase_price: purchasePrice,
      scryfall_id: scryfallId,
      board: 'mainboard'
    });
  }
  return parsed;
}

function normalizeCondition(raw = '') {
  const u = raw.toUpperCase().trim();
  if (u.startsWith('NM') || u.includes('NEAR MINT') || u.includes('MINT')) return 'NM';
  if (u.startsWith('LP') || u.includes('LIGHT') || u.includes('SLIGHT')) return 'LP';
  if (u.startsWith('MP') || u.includes('MODERATE')) return 'MP';
  if (u.startsWith('HP') || u.includes('HEAV')) return 'HP';
  if (u.startsWith('DMG') || u.includes('DAMAG')) return 'DMG';
  return 'NM';
}

function parseDecklistLines(lines) {
  let currentBoard = 'mainboard';
  let commanderCardsSeenInSection = 0;
  const parsed = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      // In Arena/Moxfield exports, a blank line right after the Commander section transitions to Mainboard
      if (currentBoard === 'commander' && commanderCardsSeenInSection > 0) {
        currentBoard = 'mainboard';
      }
      continue;
    }

    if (line.startsWith('//') || line.startsWith('#')) {
      const commentHeader = line.replace(/^(\/\/|#)\s*/, '').toLowerCase().replace(/:$/, '').trim();
      if (commentHeader === 'commander' || commentHeader === 'commanders') {
        currentBoard = 'commander';
        commanderCardsSeenInSection = 0;
      } else if (commentHeader === 'deck' || commentHeader === 'mainboard' || commentHeader === 'main') {
        currentBoard = 'mainboard';
      } else if (commentHeader === 'sideboard' || commentHeader === 'side') {
        currentBoard = 'sideboard';
      } else if (commentHeader === 'considering' || commentHeader === 'maybeboard') {
        currentBoard = 'considering';
      }
      continue;
    }

    const lower = line.toLowerCase().replace(/:$/, '').trim();
    if (lower === 'commander' || lower === 'commanders' || lower.startsWith('commander (')) {
      currentBoard = 'commander';
      commanderCardsSeenInSection = 0;
      continue;
    }
    if (
      lower === 'deck' ||
      lower === 'mainboard' ||
      lower === 'main' ||
      lower === 'creatures' ||
      lower === 'lands' ||
      lower === 'instants' ||
      lower === 'sorceries' ||
      lower === 'artifacts' ||
      lower === 'enchantments' ||
      lower === 'planeswalkers' ||
      lower === 'spells'
    ) {
      currentBoard = 'mainboard';
      continue;
    }
    if (lower === 'sideboard' || lower === 'side' || lower === 'companion') {
      currentBoard = 'sideboard';
      continue;
    }
    if (lower === 'considering' || lower === 'maybeboard') {
      currentBoard = 'considering';
      continue;
    }

    // Match e.g. "1x Atraxa, Praetors' Voice (2XM) 190 *F*" or "4 Counterspell [MH2]" or "1 Sol Ring"
    let working = line.replace(/^[-*•]\s*/, '').trim();
    let lineBoard = currentBoard;

    // Detect inline commander markers like *CMDR* or [Commander{top}]
    if (/\*cmdr\*|\[commander[^\]]*\]/i.test(working)) {
      lineBoard = 'commander';
      working = working.replace(/\*cmdr\*|\[commander[^\]]*\]/gi, '').trim();
    }

    // Strip Archidekt color tags like ^Have,#37d67a^
    working = working.replace(/\^[^^]*\^/g, '').trim();

    let finish = 'nonfoil';
    if (/\*f\*|\(foil\)|\*foil\*/i.test(working)) {
      finish = 'foil';
      working = working.replace(/\*f\*|\(foil\)|\*foil\*/gi, '').trim();
    } else if (/\*e\*|\(etched\)|\*etched\*/i.test(working)) {
      finish = 'etched';
      working = working.replace(/\*e\*|\(etched\)|\*etched\*/gi, '').trim();
    }

    // Strip trailing Archidekt/Moxfield category brackets if a (SET) code is already present, e.g. "1 Sol Ring (CMM) 969 [Ramp]"
    if (/\([a-z0-9]{2,6}\)/i.test(working)) {
      working = working.replace(/\s+\[[^\]]+\]$/g, '').trim();
    }

    const qtyMatch = working.match(/^(\d+)\s*x?\s+(.+)$/i);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    let rest = qtyMatch ? qtyMatch[2].trim() : working;

    // Extract optional (SET) CollectorNum or [SET]
    let setCode = '';
    let collectorNumber = '';

    const setNumMatch = rest.match(/^(.*?)\s+[\(\[]([a-z0-9]{2,6})[\)\]]\s*([a-z0-9\-★†a-z]*)?$/i);
    if (setNumMatch) {
      rest = setNumMatch[1].trim();
      setCode = (setNumMatch[2] || '').toLowerCase();
      collectorNumber = (setNumMatch[3] || '').trim();
    }

    rest = stripVariantSuffixes(rest);

    if (rest) {
      if (lineBoard === 'commander') {
        commanderCardsSeenInSection++;
      }
      parsed.push({
        name: rest,
        raw_name: rest,
        quantity: Math.max(1, quantity),
        set_code: setCode,
        collector_number: collectorNumber,
        finish,
        condition: 'NM',
        location: 'Main Binder',
        board: lineBoard
      });
    }
  }
  return parsed;
}
