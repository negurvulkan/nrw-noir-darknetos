// Simple combat handler for adventure.
import { loadAscii } from './loader.js';
import { advLog, renderStatus } from './ui.js';
import { runEvents } from './events.js';

const MIN_PLAYER_DAMAGE = 1;
const MIN_ENEMY_DAMAGE = 0;
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

function getEnemyHooks(enemy) {
  const hooks = enemy.hooks && typeof enemy.hooks === 'object' ? enemy.hooks : {};
  return {
    on_attack: Array.isArray(hooks.on_attack)
      ? hooks.on_attack
      : (Array.isArray(enemy.on_attack) ? enemy.on_attack : []),
    on_hit: Array.isArray(hooks.on_hit) ? hooks.on_hit : [],
    on_miss: Array.isArray(hooks.on_miss) ? hooks.on_miss : [],
    on_defeat: Array.isArray(hooks.on_defeat)
      ? hooks.on_defeat
      : (Array.isArray(enemy.on_defeat) ? enemy.on_defeat : []),
  };
}

async function runEnemyHook(enemy, key, state, ctx) {
  const hooks = getEnemyHooks(enemy);
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
  state.enemy = null;
  state.combat = { defending: false, enemyStartHp: null, weaponDefense: 0 };
}

function describeEnemy(enemy, combatMeta) {
  const startHp = combatMeta?.enemyStartHp ?? enemy.stats.hp;
  const hp = Math.max(enemy.stats.hp, 0);
  return `${enemy.name} (${hp}/${startHp} HP, ⚔ ${enemy.stats.attack} 🛡 ${enemy.stats.defense})`;
}

export async function startCombat(enemyId, state, ctx) {
  const enemy = await ctx.loadEnemy(enemyId);
  state.inCombat = true;
  state.enemy = JSON.parse(JSON.stringify(enemy));
  state.enemy.hooks = getEnemyHooks(state.enemy);
  if (!state.stats.maxHp) {
    state.stats.maxHp = state.stats.hp;
  }
  const combatMeta = ensureCombatMeta(state);
  combatMeta.enemyStartHp = enemy.stats?.hp ?? null;
  combatMeta.defending = false;

  if (enemy.ascii) {
    await loadAscii(enemy.ascii);
  }
  advLog([
    `Ein ${enemy.name} erscheint!`,
    `Beschreibung: ${enemy.description}`,
    describeEnemy(enemy, combatMeta),
    'Verfügbare Aktionen im Kampf: attack, defend, flee, use <item>'
  ]);
  renderStatus(state);
  ctx.saveState();
}

export async function handleCombatAction(action, state, ctx) {
  if (!state.inCombat || !state.enemy) {
    return false;
  }
  const enemy = state.enemy;
  const combatMeta = ensureCombatMeta(state);
  let enemyTurnRequired = true;

  switch (action.verb) {
    case 'attack':
      await playerAttack(enemy, state, ctx, combatMeta);
      break;
    case 'defend':
      combatMeta.defending = true;
      advLog(['Du gehst in Verteidigungshaltung und bereitest dich vor.']);
      break;
    case 'flee':
      enemyTurnRequired = false;
      if (await attemptFlee(enemy, state, ctx)) {
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

  if (!state.inCombat || !state.enemy) {
    renderStatus(state);
    ctx.saveState();
    return true;
  }

  if (enemy.stats.hp <= 0) {
    await handleVictory(enemy, state, ctx);
    return true;
  }

  if (enemyTurnRequired) {
    await enemyAttack(enemy, state, ctx, combatMeta);
  }

  if (!state.inCombat || !state.enemy) {
    renderStatus(state);
    ctx.saveState();
    return true;
  }

  if (state.stats.hp <= 0) {
    advLog(['Du wurdest besiegt. Der Kampf endet.']);
    endCombat(state);
  }

  renderStatus(state);
  ctx.saveState();
  return true;
}

async function playerAttack(enemy, state, ctx, combatMeta, attackOverride = null, sourceLabel = null) {
  await runEnemyHook(enemy, 'on_attack', state, ctx);

  const attackValue = attackOverride ?? state.stats.attack ?? MIN_PLAYER_DAMAGE;
  const rawDamage = attackValue - (enemy.stats.defense || 0);
  const hit = rawDamage > 0;
  const playerDamage = hit ? Math.max(MIN_PLAYER_DAMAGE, rawDamage) : 0;

  if (!hit) {
    advLog([`Du greifst ${enemy.name} an, verfehlst jedoch oder dein Schlag prallt ab.`]);
    await runEnemyHook(enemy, 'on_miss', state, ctx);
    combatMeta.defending = false;
    return;
  }

  enemy.stats.hp -= playerDamage;
  const attackLabel = sourceLabel ? `Mit ${sourceLabel} triffst du` : 'Du triffst';
  advLog([
    `${attackLabel} ${enemy.name} für ${playerDamage} Schaden. (${Math.max(enemy.stats.hp, 0)} HP übrig)`
  ]);
  await runEnemyHook(enemy, 'on_hit', state, ctx);

  if (enemy.stats.hp <= 0) {
    await handleVictory(enemy, state, ctx);
    return;
  }

  combatMeta.defending = false;
}

async function enemyAttack(enemy, state, ctx, combatMeta) {
  const baseDamage = Math.max(
    MIN_ENEMY_DAMAGE,
    (enemy.stats.attack || 1) - ((state.stats.defense || 0) + (combatMeta.weaponDefense || 0))
  );
  const enemyDamage = combatMeta.defending ? Math.max(0, Math.floor(baseDamage / 2)) : baseDamage;
  state.stats.hp -= enemyDamage;

  const defenseNote = combatMeta.defending ? ' (abgewehrt)' : '';
  advLog([
    `${enemy.name} greift an und verursacht ${enemyDamage} Schaden${defenseNote}. (${Math.max(state.stats.hp, 0)} HP übrig)`
  ]);

  combatMeta.defending = false;
  combatMeta.weaponDefense = 0;
}

async function handleVictory(enemy, state, ctx) {
  advLog([`${enemy.name} wurde besiegt!`]);
  const drops = enemy.drops || [];
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

  await runEnemyHook(enemy, 'on_defeat', state, ctx);

  endCombat(state);
  renderStatus(state);
  ctx.saveState();
}

async function attemptFlee(enemy, state, ctx) {
  const difficulty = enemy.behavior?.fleeDifficulty ?? DEFAULT_FLEE_DIFFICULTY;
  const successChance = Math.max(0.05, Math.min(0.95, 0.8 - difficulty));
  const escaped = Math.random() < successChance;

  if (escaped) {
    advLog([`Du entkommst ${enemy.name} und ziehst dich zurück.`]);
    endCombat(state);
    renderStatus(state);
    ctx.saveState();
    return true;
  }

  advLog(['Die Flucht scheitert – der Gegner greift erneut an!']);
  await enemyAttack(enemy, state, ctx, ensureCombatMeta(state));
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
  const weapon = item.weapon || item.combat_weapon || item.combatWeapon;
  const weaponAttack = Number.isFinite(weapon?.attack) ? weapon.attack : null;
  const weaponDefense = Number.isFinite(weapon?.defense) ? weapon.defense : null;
  const weaponConsume = weapon?.consume === true;
  const hasWeaponStats = (weaponAttack ?? 0) !== 0 || (weaponDefense ?? 0) !== 0;
  const effect = item.combat_effects || item.combatEffects;
  if (!effect && !hasWeaponStats) {
    advLog(['Dieses Item hat keinen Effekt im Kampf.']);
    return;
  }

  const enemy = state.enemy;
  const combatMeta = ensureCombatMeta(state);

  if (hasWeaponStats) {
    const attackValue = Number.isFinite(weaponAttack) && weaponAttack !== 0
      ? weaponAttack
      : state.stats.attack;
    await playerAttack(enemy, state, ctx, combatMeta, attackValue, item.name || item.id);
    if (weaponDefense) {
      combatMeta.weaponDefense = weaponDefense;
      advLog([`Du setzt ${item.name || item.id} defensiv ein und erhöhst deine Verteidigung um ${weaponDefense}.`]);
    }
  }

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
