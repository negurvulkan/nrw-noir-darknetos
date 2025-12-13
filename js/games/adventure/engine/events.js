// Event system for the adventure module.
// Each event mutates the state or triggers UI updates.

import { loadAscii } from './loader.js';
import { advLog } from './ui.js';

function normalizeQty(qty) {
  const val = Number(qty);
  return Number.isFinite(val) && val > 0 ? val : 1;
}

function resolveActorId(event) {
  return event.actorId || event.enemy || event.npc || event.id;
}

function resolveTargetRoom(event, state) {
  return event.room || event.to || state.location;
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
    case 'trigger_fight':
      await ctx.startCombat(resolveActorId(event));
      break;
    case 'spawn_item': {
      const qty = normalizeQty(event.qty);
      if (ctx?.spawnItem) {
        ctx.spawnItem(event.room || state.location, event.id, qty);
      } else {
        state.roomSpawns = state.roomSpawns || {};
        const roomId = event.room || state.location;
        state.roomSpawns[roomId] = state.roomSpawns[roomId] || { items: [], actors: [] };
        state.roomSpawns[roomId].items.push({ id: event.id, qty });
      }
      ctx?.saveState?.();
      break;
    }
    case 'spawn_actor':
    case 'spawn_enemy':
    case 'spawn_npc': {
      const actorId = resolveActorId(event);
      const roomId = resolveTargetRoom(event, state);
      const qty = normalizeQty(event.qty);
      if (ctx?.spawnActor) {
        await ctx.spawnActor(roomId, actorId, qty);
      } else if (ctx?.spawnEnemy) {
        await ctx.spawnEnemy(roomId, actorId, qty);
      } else if (ctx?.spawnNpc) {
        await ctx.spawnNpc(roomId, actorId);
      } else {
        state.actors = state.actors || {};
        state.actorFlags = state.actorFlags || {};
        state.npcs = state.actors;
        state.npcFlags = state.actorFlags;
        state.actors[actorId] = { room: roomId, flags: {}, counters: {} };
        state.actorFlags[actorId] = state.actors[actorId].flags;
      }
      ctx?.saveState?.();
      break;
    }
    case 'move_actor':
    case 'npc_move': {
      const actorId = resolveActorId(event);
      const destination = resolveTargetRoom(event, state);
      if (ctx?.moveActor) {
        ctx.moveActor(actorId, destination);
      } else if (ctx?.moveNpc) {
        ctx.moveNpc(actorId, destination);
      }
      ctx?.saveState?.();
      break;
    }
    case 'npc_move_if_present': {
      const actorId = resolveActorId(event);
      const inRoom = ctx?.actorIsInRoom
        ? ctx.actorIsInRoom(actorId, event.from)
        : ctx?.npcIsInRoom?.(actorId, event.from) || false;
      if (inRoom) {
        if (ctx?.moveActor) {
          ctx.moveActor(actorId, resolveTargetRoom(event, state));
        } else if (ctx?.moveNpc) {
          ctx.moveNpc(actorId, resolveTargetRoom(event, state));
        }
        ctx?.saveState?.();
      }
      break;
    }
    case 'start_dialog':
      if (ctx.startDialog) {
        await ctx.startDialog(resolveActorId(event), event.node);
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
