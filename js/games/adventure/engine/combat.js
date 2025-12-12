// Simple combat handler for adventure.
import { loadAscii } from './loader.js';
import { advLog, renderStatus } from './ui.js';
import { runEvents } from './events.js';

const MIN_PLAYER_DAMAGE = 1;
const MIN_ENEMY_DAMAGE = 0;
const DEFAULT_FLEE_DIFFICULTY = 0.45;

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
  const attackValue = attackOverride ?? state.stats.attack ?? MIN_PLAYER_DAMAGE;
  const playerDamage = Math.max(
    MIN_PLAYER_DAMAGE,
    attackValue - (enemy.stats.defense || 0)
  );
  enemy.stats.hp -= playerDamage;
  const attackLabel = sourceLabel ? `Mit ${sourceLabel} triffst du` : 'Du triffst';
  advLog([
    `${attackLabel} ${enemy.name} für ${playerDamage} Schaden. (${Math.max(enemy.stats.hp, 0)} HP übrig)`
  ]);

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

  if (Array.isArray(enemy.on_attack) && enemy.on_attack.length) {
    await runEvents(enemy.on_attack, state, ctx);
  }

  combatMeta.defending = false;
  combatMeta.weaponDefense = 0;
}

async function handleVictory(enemy, state, ctx) {
  advLog([`${enemy.name} wurde besiegt!`]);
  const drops = enemy.drops || [];
  for (const drop of drops) {
    if (!drop) continue;
    if (!ctx.loadItem) {
      if (!state.inventory.includes(drop)) {
        state.inventory.push(drop);
        advLog([`Du erhältst ${drop}.`]);
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const item = await ctx.loadItem(drop);
      const itemId = item.id || drop;
      if (!state.inventory.includes(itemId)) {
        state.inventory.push(itemId);
        advLog([`Du erhältst ${item.name || itemId}.`]);
      }
    } catch (err) {
      advLog([`Beute konnte nicht geladen werden (${drop}).`]);
    }
  }

  if (Array.isArray(enemy.on_defeat) && enemy.on_defeat.length) {
    await runEvents(enemy.on_defeat, state, ctx);
  }

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
  const normalizedRequest = (action.object || '').toLowerCase();
  const match = (state.inventory || []).find((id) => id.toLowerCase() === normalizedRequest);
  if (!match) {
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
    const idx = state.inventory.indexOf(item.id);
    if (idx !== -1) {
      state.inventory.splice(idx, 1);
    }
  }

  ctx.saveState();
}
