// Simple combat handler for adventure.
import { loadAscii } from './loader.js';
import { advLog, renderStatus } from './ui.js';

export async function startCombat(enemyId, state, ctx) {
  const enemy = await ctx.loadEnemy(enemyId);
  state.inCombat = true;
  state.enemy = JSON.parse(JSON.stringify(enemy));

  if (enemy.ascii) {
    await loadAscii(enemy.ascii);
  }
  advLog([
    `Ein ${enemy.name} erscheint!`,
    `Beschreibung: ${enemy.description}`,
    `HP: ${enemy.stats.hp}`
  ]);
  renderStatus(state);
  ctx.saveState();
}

export async function handleCombatAction(action, state, ctx) {
  if (!state.inCombat || !state.enemy) {
    return false;
  }
  const enemy = state.enemy;

  if (action.verb !== 'attack') {
    advLog(['Du bist im Kampf! Nutze "attack" oder passende Befehle.']);
    return true;
  }

  const playerDamage = Math.max(1, (state.stats.attack || 1) - (enemy.stats.defense || 0));
  enemy.stats.hp -= playerDamage;
  advLog([`Du triffst ${enemy.name} für ${playerDamage} Schaden. (${Math.max(enemy.stats.hp, 0)} HP übrig)`]);

  if (enemy.stats.hp <= 0) {
    advLog([`${enemy.name} wurde besiegt!`]);
    state.inCombat = false;
    const drops = enemy.drops || [];
    drops.forEach((drop) => {
      if (!state.inventory.includes(drop)) {
        state.inventory.push(drop);
        advLog([`Du erhältst ${drop}.`]);
      }
    });
    state.enemy = null;
    renderStatus(state);
    ctx.saveState();
    return true;
  }

  const enemyDamage = Math.max(0, (enemy.stats.attack || 1) - (state.stats.defense || 0));
  state.stats.hp -= enemyDamage;
  advLog([`${enemy.name} greift an und verursacht ${enemyDamage} Schaden. (${Math.max(state.stats.hp, 0)} HP übrig)`]);

  if (state.stats.hp <= 0) {
    advLog(['Du wurdest besiegt. Der Kampf endet.']);
    state.inCombat = false;
    state.enemy = null;
  }

  renderStatus(state);
  ctx.saveState();
  return true;
}
