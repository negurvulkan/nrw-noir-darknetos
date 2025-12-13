// Simple combat handler for adventure.
// Refactored to work with unified 'Actor' entities.
import { loadAscii } from './loader.js';
import { advLog, renderStatus } from './ui.js';
import { runEvents } from './events.js';

const MIN_PLAYER_DAMAGE = 1;
const MIN_OPPONENT_DAMAGE = 0;
const DEFAULT_FLEE_DIFFICULTY = 0.45;

function normalizeIdLocal(str = '') {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function inventoryIds(state) {
  return (state.inventory || [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
    .filter(Boolean);
}

function findInventoryMatch(state, query) {
  const normalizedQuery = normalizeIdLocal(query);
  if (!normalizedQuery) return null;
  const ids = inventoryIds(state);
  const exact = ids.find((id) => normalizeIdLocal(id) === normalizedQuery);
  if (exact) return exact;
  return ids.find((id) => normalizeIdLocal(id).includes(normalizedQuery)) || null;
}

function getQuantity(state, id) {
  const normalized = normalizeIdLocal(id);
  const entry = (state.inventory || []).find((inv) => normalizeIdLocal(inv?.id || inv) === normalized);
  if (!entry) return 0;
  return typeof entry === 'string' ? 1 : (entry.qty || 0);
}

function formatItemLabel(item, qty = 1) {
  const name = item?.name || item?.id || 'Item';
  const unit = item?.unit ? ` ${item.unit}` : '';
  return item?.stackable || qty > 1 ? `${name} x${qty}${unit}` : name;
}

function getActorHooks(actor) {
  const hooks = actor.hooks && typeof actor.hooks === 'object' ? actor.hooks : {};
  // Fallback: Events direkt auf der Actor-Root (Legacy-Support oder Vereinfachung)
  return {
    on_attack: Array.isArray(hooks.on_attack)
      ? hooks.on_attack
      : (Array.isArray(actor.on_attack) ? actor.on_attack : []),
    on_hit: Array.isArray(hooks.on_hit) ? hooks.on_hit : [],
    on_miss: Array.isArray(hooks.on_miss) ? hooks.on_miss : [],
    on_defeat: Array.isArray(hooks.on_defeat)
      ? hooks.on_defeat
      : (Array.isArray(actor.on_defeat) ? actor.on_defeat : []),
  };
}

async function runActorHook(actor, key, state, ctx) {
  const hooks = getActorHooks(actor);
  const events = hooks[key];
  if (Array.isArray(events) && events.length) {
    await runEvents(events, state, ctx);
  }
}

function ensureCombatMeta(state) {
  if (!state.combat) {
    state.combat = { defending: false, enemyStartHp: null, weaponDefense: 0 };
  }
  if (state.combat.defending === undefined) {
    state.combat.defending = false;
  }
  if (state.combat.weaponDefense === undefined) {
    state.combat.weaponDefense = 0;
  }
  return state.combat;
}

function endCombat(state) {
  state.inCombat = false;
  state.activeOpponent = null;
  state.combat = { defending: false, enemyStartHp: null, weaponDefense: 0 };
}

function describeOpponent(actor, combatMeta) {
  // Fallback, falls stats fehlen
  const stats = actor.stats || { hp: 10, attack: 1, defense: 0 };
  const startHp = combatMeta?.enemyStartHp ?? stats.hp;
  const hp = Math.max(stats.hp, 0);
  return `${actor.name || actor.id} (${hp}/${startHp} HP, ⚔ ${stats.attack} 🛡 ${stats.defense})`;
}

export async function startCombat(actorId, state, ctx) {
  // Lädt nun einen Actor statt explizit "Enemy"
  const actor = await ctx.loadActor(actorId);
  
  state.inCombat = true;
  // Wir kopieren den Actor in den aktiven Combat-State, um HP-Änderungen nur temporär/lokal zu halten
  // oder um sicherzustellen, dass wir nicht direkt im Cache schreiben, bis gespeichert wird.
  state.activeOpponent = JSON.parse(JSON.stringify(actor));
  
  // Sicherstellen, dass Stats existieren
  if (!state.activeOpponent.stats) {
      state.activeOpponent.stats = { hp: 10, attack: 1, defense: 0 };
  }

  // Pre-calculate Hooks access
  state.activeOpponent.hooks = getActorHooks(state.activeOpponent);

  if (!state.stats.maxHp) {
    state.stats.maxHp = state.stats.hp;
  }
  
  const combatMeta = ensureCombatMeta(state);
  combatMeta.enemyStartHp = state.activeOpponent.stats.hp;
  combatMeta.defending = false;

  if (actor.ascii) {
    await loadAscii(actor.ascii);
  }
  
  advLog([
    `Ein Kampf beginnt!`,
    `${actor.name || 'Der Gegner'} greift an!`,
    `Beschreibung: ${actor.description || 'Ein feindseliges Wesen.'}`,
    describeOpponent(state.activeOpponent, combatMeta),
    'Verfügbare Aktionen: attack, defend, flee, use <item>'
  ]);
  
  renderStatus(state);
  ctx.saveState();
}

export async function handleCombatAction(action, state, ctx) {
  if (!state.inCombat || !state.activeOpponent) {
    return false;
  }
  
  const opponent = state.activeOpponent;
  const combatMeta = ensureCombatMeta(state);
  let opponentTurnRequired = true;

  switch (action.verb) {
    case 'attack':
      await playerAttack(opponent, state, ctx, combatMeta);
      break;
    case 'defend':
      combatMeta.defending = true;
      advLog(['Du gehst in Verteidigungshaltung und bereitest dich vor.']);
      break;
    case 'flee':
      opponentTurnRequired = false;
      if (await attemptFlee(opponent, state, ctx)) {
        renderStatus(state);
        ctx.saveState();
        return true;
      }
      break;
    case 'use':
      await handleCombatItemUse(action, state, ctx);
      break;
    default:
      advLog(['Du bist im Kampf! Befehle: attack, defend, flee, use <item>.']);
      return true;
  }

  // Check if combat ended during player turn (e.g. by an event or item)
  if (!state.inCombat || !state.activeOpponent) {
    renderStatus(state);
    ctx.saveState();
    return true;
  }

  // Check Victory
  if (opponent.stats.hp <= 0) {
    await handleVictory(opponent, state, ctx);
    return true;
  }

  // Opponent Turn
  if (opponentTurnRequired) {
    await opponentAttack(opponent, state, ctx, combatMeta);
  }

  // Check if combat ended during opponent turn
  if (!state.inCombat || !state.activeOpponent) {
    renderStatus(state);
    ctx.saveState();
    return true;
  }

  // Check Defeat
  if (state.stats.hp <= 0) {
    advLog(['Du wurdest besiegt.']);
    // Hier könnte man Game Over Logik einfügen oder Reset
    endCombat(state);
  }

  renderStatus(state);
  ctx.saveState();
  return true;
}

async function playerAttack(opponent, state, ctx, combatMeta, attackOverride = null, sourceLabel = null) {
  await runActorHook(opponent, 'on_attack', state, ctx);

  const attackValue = attackOverride ?? state.stats.attack ?? MIN_PLAYER_DAMAGE;
  const rawDamage = attackValue - (opponent.stats.defense || 0);
  const hit = rawDamage > 0;
  const playerDamage = hit ? Math.max(MIN_PLAYER_DAMAGE, rawDamage) : 0;
  const name = opponent.name || 'der Gegner';

  if (!hit) {
    advLog([`Du greifst ${name} an, verfehlst jedoch oder dein Schlag prallt ab.`]);
    await runActorHook(opponent, 'on_miss', state, ctx);
    combatMeta.defending = false;
    return;
  }

  opponent.stats.hp -= playerDamage;
  const attackLabel = sourceLabel ? `Mit ${sourceLabel} triffst du` : 'Du triffst';
  advLog([
    `${attackLabel} ${name} für ${playerDamage} Schaden. (${Math.max(opponent.stats.hp, 0)} HP übrig)`
  ]);
  await runActorHook(opponent, 'on_hit', state, ctx);

  if (opponent.stats.hp <= 0) {
    await handleVictory(opponent, state, ctx);
    return;
  }

  combatMeta.defending = false;
}

async function opponentAttack(opponent, state, ctx, combatMeta) {
  const stats = opponent.stats || { attack: 1 };
  const name = opponent.name || 'Der Gegner';
  
  const baseDamage = Math.max(
    MIN_OPPONENT_DAMAGE,
    (stats.attack || 1) - ((state.stats.defense || 0) + (combatMeta.weaponDefense || 0))
  );
  
  const actualDamage = combatMeta.defending ? Math.max(0, Math.floor(baseDamage / 2)) : baseDamage;
  state.stats.hp -= actualDamage;

  const defenseNote = combatMeta.defending ? ' (abgewehrt)' : '';
  advLog([
    `${name} greift an und verursacht ${actualDamage} Schaden${defenseNote}. (${Math.max(state.stats.hp, 0)} HP übrig)`
  ]);

  combatMeta.defending = false;
  combatMeta.weaponDefense = 0;
}

async function handleVictory(opponent, state, ctx) {
  const name = opponent.name || 'Der Gegner';
  advLog([`${name} wurde besiegt!`]);
  
  const drops = opponent.drops || [];
  for (const drop of drops) {
    if (!drop) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const item = await ctx.loadItem(drop);
      const itemId = item.id || drop;
      const added = ctx?.addToInventory ? await ctx.addToInventory(itemId, 1) : 0;
      if (added > 0) {
        const total = ctx?.getInvQty ? ctx.getInvQty(itemId) : getQuantity(state, itemId);
        advLog([`Du erhältst ${formatItemLabel(item, total)}.`]);
      }
    } catch (err) {
      advLog([`Beute konnte nicht geladen werden (${drop}).`]);
    }
  }

  await runActorHook(opponent, 'on_defeat', state, ctx);

  // Wenn der Actor besiegt ist, setzen wir seine HP im Global State auch auf 0,
  // damit er nicht sofort respawnt oder wieder sichtbar ist (siehe actorVisible in core.js)
  if (state.actors && state.actors[opponent.id]) {
      state.actors[opponent.id].hp = 0;
      state.actors[opponent.id].hostile = false; // Kampf vorbei
  }

  endCombat(state);
  renderStatus(state);
  ctx.saveState();
}

async function attemptFlee(opponent, state, ctx) {
  const difficulty = opponent.behavior?.fleeDifficulty ?? DEFAULT_FLEE_DIFFICULTY;
  const successChance = Math.max(0.05, Math.min(0.95, 0.8 - difficulty));
  const escaped = Math.random() < successChance;

  if (escaped) {
    advLog([`Du entkommst ${opponent.name || 'dem Gegner'} und ziehst dich zurück.`]);
    endCombat(state);
    renderStatus(state);
    ctx.saveState();
    return true;
  }

  advLog(['Die Flucht scheitert – der Gegner greift erneut an!']);
  await opponentAttack(opponent, state, ctx, ensureCombatMeta(state));
  return false;
}

async function handleCombatItemUse(action, state, ctx) {
  if (!action.object) {
    advLog(['Welches Item möchtest du im Kampf nutzen?']);
    return;
  }
  const match = findInventoryMatch(state, action.object);
  const qty = match ? (ctx?.getInvQty ? ctx.getInvQty(match) : getQuantity(state, match)) : 0;
  if (!match || qty <= 0) {
    advLog(['Du besitzt dieses Item nicht.']);
    return;
  }

  if (!ctx.loadItem) {
    advLog(['Items können gerade nicht verwendet werden.']);
    return;
  }
  const item = await ctx.loadItem(match);
  
  // Prüfen ob Waffe
  const weapon = item.weapon || item.combat_weapon || item.combatWeapon;
  const weaponAttack = Number.isFinite(weapon?.attack) ? weapon.attack : null;
  const weaponDefense = Number.isFinite(weapon?.defense) ? weapon.defense : null;
  const weaponConsume = weapon?.consume === true;
  const hasWeaponStats = (weaponAttack ?? 0) !== 0 || (weaponDefense ?? 0) !== 0;
  
  // Prüfen ob Effekt (Heilung etc.)
  const effect = item.combat_effects || item.combatEffects;
  
  if (!effect && !hasWeaponStats) {
    advLog(['Dieses Item hat keinen Effekt im Kampf.']);
    return;
  }

  const opponent = state.activeOpponent;
  const combatMeta = ensureCombatMeta(state);

  // 1. Als Waffe nutzen
  if (hasWeaponStats) {
    const attackValue = Number.isFinite(weaponAttack) && weaponAttack !== 0
      ? weaponAttack
      : state.stats.attack;
      
    await playerAttack(opponent, state, ctx, combatMeta, attackValue, item.name || item.id);
    
    if (weaponDefense) {
      combatMeta.weaponDefense = weaponDefense;
      advLog([`Du setzt ${item.name || item.id} defensiv ein und erhöhst deine Verteidigung um ${weaponDefense}.`]);
    }
  }

  // 2. Buffs / Heilung
  if (typeof effect?.heal === 'number') {
    const maxHp = state.stats.maxHp || state.stats.hp;
    state.stats.hp = Math.min(maxHp, state.stats.hp + effect.heal);
    advLog([`Du nutzt ${item.name} und regenerierst ${effect.heal} HP.`]);
  }
  if (effect?.buff?.defense) {
    state.stats.defense += effect.buff.defense;
    advLog([`Deine Verteidigung steigt um ${effect.buff.defense}.`]);
  }
  if (effect?.buff?.attack) {
    state.stats.attack += effect.buff.attack;
    advLog([`Dein Angriffswert steigt um ${effect.buff.attack}.`]);
  }

  // Konsumieren
  const consume = effect ? effect.consume !== false : weaponConsume;
  if (consume) {
    const removed = ctx?.removeFromInventory ? ctx.removeFromInventory(item.id, 1) : 0;
    if (!removed) {
      advLog(['Du besitzt dieses Item nicht mehr.']);
      return;
    }
  }

  ctx.saveState();
}