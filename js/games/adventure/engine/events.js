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
      await ctx.startCombat(event.enemy);
      break;
    case 'start_dialog':
      if (ctx.startDialog) {
        await ctx.startDialog(event.npc, event.node);
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
