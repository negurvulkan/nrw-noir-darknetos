// Event system for the adventure module.
// Each event mutates the state or triggers UI updates.

import { loadAscii } from './loader.js';
import { advLog } from './ui.js';

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
    case 'add_item':
      if (!state.inventory.includes(event.id)) {
        state.inventory.push(event.id);
        advLog([`${event.id} erhalten.`]);
      }
      ctx.saveState();
      break;
    case 'remove_item': {
      const idx = state.inventory.indexOf(event.id);
      if (idx !== -1) {
        state.inventory.splice(idx, 1);
        advLog([`${event.id} entfernt.`]);
      }
      ctx.saveState();
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
