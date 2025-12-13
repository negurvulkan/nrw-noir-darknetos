// Event system for the adventure module.
// Each event mutates the state or triggers UI updates.

import { loadAscii } from './loader.js';
import { advLog } from './ui.js';

function normalizeQty(qty) {
  const val = Number(qty);
  return Number.isFinite(val) && val > 0 ? val : 1;
}

function formatItemLabel(item, qty = 1) {
  const name = item?.name || item?.id || 'Item';
  const unit = item?.unit ? ` ${item.unit}` : '';
  return item?.stackable || qty > 1 ? `${name} x${qty}${unit}` : name;
}

export async function runEvents(events = [], state, ctx) {
  for (const event of events) {
    if (ctx?.logDebugEvent) {
      ctx.logDebugEvent(event);
    }
    // eslint-disable-next-line no-await-in-loop
    await handleEvent(event, state, ctx);
  }
}

async function handleEvent(event, state, ctx) {
  switch (event.type) {
    case 'message':
      advLog([event.text]);
      break;
    case 'ascii':
      await loadAscii(event);
      break;
    case 'flag_set':
      state.flags[event.key] = event.value;
      ctx.saveState();
      break;
    case 'flag_if': {
      const matches = state.flags[event.key] === event.equals;
      const chain = matches ? event.then : event.else;
      if (Array.isArray(chain)) {
        await runEvents(chain, state, ctx);
      }
      break;
    }
    case 'counter_add': {
      const amount = Number.isFinite(event.amount) ? event.amount : 1;
      if (ctx?.addCounter) {
        ctx.addCounter(event.key, amount);
      } else {
        state.counters = state.counters || {};
        state.counters[event.key] = (state.counters[event.key] || 0) + amount;
      }
      ctx?.saveState?.();
      break;
    }
    case 'counter_set': {
      const value = Number.isFinite(event.value) ? event.value : 0;
      if (ctx?.setCounter) {
        ctx.setCounter(event.key, value);
      } else {
        state.counters = state.counters || {};
        state.counters[event.key] = value;
      }
      ctx?.saveState?.();
      break;
    }
    case 'counter_if': {
      const ops = {
        '==': (a, b) => a === b,
        '!=': (a, b) => a !== b,
        '<': (a, b) => a < b,
        '<=': (a, b) => a <= b,
        '>': (a, b) => a > b,
        '>=': (a, b) => a >= b
      };
      const op = event.op && ops[event.op] ? event.op : '==';
      const current = ctx?.getCounter ? ctx.getCounter(event.key) : (state.counters?.[event.key] || 0);
      const target = Number.isFinite(event.value) ? event.value : 0;
      const matches = ops[op](current, target);
      const chain = matches ? event.then : event.else;
      if (Array.isArray(chain)) {
        await runEvents(chain, state, ctx);
      }
      break;
    }
    case 'add_item': {
      const qty = normalizeQty(event.qty);
      const added = ctx?.addToInventory ? await ctx.addToInventory(event.id, qty) : 0;
      if (added > 0) {
        const item = ctx?.loadItem ? await ctx.loadItem(event.id) : { id: event.id };
        const total = ctx?.getInvQty ? ctx.getInvQty(event.id) : qty;
        advLog([`${formatItemLabel(item, total)} erhalten.`]);
      }
      ctx?.saveState?.();
      break;
    }
    case 'remove_item': {
      const qty = normalizeQty(event.qty);
      const removed = ctx?.removeFromInventory ? ctx.removeFromInventory(event.id, qty) : 0;
      if (removed > 0) {
        const item = ctx?.loadItem ? await ctx.loadItem(event.id) : { id: event.id };
        const remaining = ctx?.getInvQty ? ctx.getInvQty(event.id) : 0;
        const label = remaining > 0 ? formatItemLabel(item, remaining) : (item.name || item.id || event.id);
        advLog([`${label} entfernt.`]);
      }
      ctx?.saveState?.();
      break;
    }
    case 'unlock_exit': {
      const key = `${event.room}:${event.direction}`;
      state.lockedExits[key] = false;
      advLog([`Ausgang ${event.direction} ist nun offen.`]);
      ctx.saveState();
      break;
    }
    case 'lock_exit': {
      const key = `${event.room}:${event.direction}`;
      state.lockedExits[key] = true;
      advLog([`Ausgang ${event.direction} ist nun versperrt.`]);
      ctx.saveState();
      break;
    }
    case 'transition':
      state.location = event.to;
      ctx.saveState();
      await ctx.showCurrentRoom(true);
      break;
    
    // Unified Combat Trigger
    case 'trigger_fight': {
      const targetId = event.actor || event.enemy || event.id;
      if (targetId) {
        await ctx.startCombat(targetId);
      }
      break;
    }

    // Unified Spawn Items
    case 'spawn_item': {
      const qty = normalizeQty(event.qty);
      if (ctx?.spawnItem) {
        ctx.spawnItem(event.room || state.location, event.id, qty);
      } else {
        // Fallback Direct State Mutation (updated structure)
        state.roomSpawns = state.roomSpawns || {};
        const roomId = event.room || state.location;
        state.roomSpawns[roomId] = state.roomSpawns[roomId] || { items: [], actors: [] };
        state.roomSpawns[roomId].items.push({ id: event.id, qty });
      }
      ctx?.saveState?.();
      break;
    }

    // Unified Spawn Actors (replaces spawn_enemy and spawn_npc)
    case 'spawn_actor':
    case 'spawn_enemy': // Alias for backward compatibility
    case 'spawn_npc':   // Alias for backward compatibility
    {
      const actorId = event.id || event.actor || event.npc || event.enemy;
      if (ctx?.spawnActor) {
        ctx.spawnActor(event.room || state.location, actorId);
      } else {
        // Fallback Direct State Mutation
        state.actors = state.actors || {};
        const existing = state.actors[actorId] || { flags: {}, counters: {}, hostile: false };
        existing.room = event.room || state.location;
        state.actors[actorId] = existing;
      }
      ctx?.saveState?.();
      break;
    }

    // Unified Actor Movement
    case 'actor_move':
    case 'npc_move': // Alias
    {
      const actorId = event.id || event.actor || event.npc;
      if (ctx?.moveActor) {
        ctx.moveActor(actorId, event.to);
      }
      ctx?.saveState?.();
      break;
    }

    case 'actor_move_if_present':
    case 'npc_move_if_present': // Alias
    {
      const actorId = event.id || event.actor || event.npc;
      const inRoom = ctx?.actorIsInRoom ? ctx.actorIsInRoom(actorId, event.from) : false;
      if (inRoom && ctx?.moveActor) {
        ctx.moveActor(actorId, event.to);
        ctx?.saveState?.();
      }
      break;
    }

    case 'start_dialog':
      if (ctx.startDialog) {
        const actorId = event.actor || event.npc || event.id;
        await ctx.startDialog(actorId, event.node);
      } else {
        advLog(['Dialog kann nicht gestartet werden.']);
      }
      break;
    case 'end_dialog':
      if (ctx.endDialog) {
        ctx.endDialog();
      }
      break;
    case 'goto_dialog_node':
      if (ctx.gotoDialogNode) {
        await ctx.gotoDialogNode(event.node);
      }
      break;
    default:
      advLog([`Unbekanntes Event: ${event.type || 'unbenannt'}`]);
  }
}