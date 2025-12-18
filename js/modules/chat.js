// ---------------------------------------------------------
// CHAT MODULE – lokale Präsenz & Nachrichten im Terminal
// ---------------------------------------------------------

const CHAT_PRESENCE_KEY = "darknet-chat-presence";
const CHAT_MAILBOX_KEY = "darknet-chat-mailbox";
const CHAT_PRESENCE_TTL_MS = 90 * 1000; // 90s gelten als "online"
const CHAT_HEARTBEAT_MS = 20 * 1000;
const CHAT_INBOX_POLL_MS = 10 * 1000;
const CHAT_MAX_MESSAGES = 50;

let CHAT_LAST_USER = getUserName();
let CHAT_HEARTBEAT_TIMER = null;
let CHAT_INBOX_TIMER = null;
let CHAT_LAST_UNREAD = 0;

function chatNow() {
  return Date.now();
}

function chatReadStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {
    printLines(["Chat konnte lokalen Speicher nicht lesen: " + e.message, ""], "error");
  }
  return {};
}

function chatWriteStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    printLines(["Chat konnte lokalen Speicher nicht schreiben: " + e.message, ""], "error");
  }
}

function chatCleanupPresence(map, now = chatNow()) {
  const cleaned = {};
  Object.entries(map || {}).forEach(([name, info]) => {
    const lastSeen = Number(info?.lastSeen || 0);
    if (Number.isFinite(lastSeen) && now - lastSeen <= CHAT_PRESENCE_TTL_MS) {
      cleaned[name] = { lastSeen };
    }
  });
  return cleaned;
}

function chatUpdatePresence() {
  const now = chatNow();
  const presence = chatCleanupPresence(chatReadStorage(CHAT_PRESENCE_KEY), now);
  const current = getUserName();

  if (CHAT_LAST_USER && CHAT_LAST_USER !== current) {
    delete presence[CHAT_LAST_USER];
  }

  presence[current] = { lastSeen: now };
  chatWriteStorage(CHAT_PRESENCE_KEY, presence);
  CHAT_LAST_USER = current;
  return presence;
}

function chatFormatAgo(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 15) return "gerade eben";
  if (sec < 60) return `vor ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `vor ${min}m`;
  const hr = Math.round(min / 60);
  return `vor ${hr}h`;
}

function chatPrintOnline() {
  const now = chatNow();
  const presence = chatUpdatePresence();
  const names = Object.keys(presence).sort((a, b) => a.localeCompare(b));

  if (!names.length) {
    printLines(["Niemand ist gerade online.", ""], "dim");
    return;
  }

  const lines = [
    "Aktive Nutzer im Darknetz-Chat:",
    "-------------------------------"
  ];

  names.forEach(name => {
    const last = presence[name]?.lastSeen || now;
    const label = name === getUserName() ? `${name} (du)` : name;
    lines.push(`- ${label} · ${chatFormatAgo(now - last)}`);
  });

  lines.push("");
  printLines(lines);
}

function chatReadMailbox() {
  const data = chatReadStorage(CHAT_MAILBOX_KEY);
  if (!data || typeof data !== "object") return {};
  return data;
}

function chatSaveMailbox(data) {
  chatWriteStorage(CHAT_MAILBOX_KEY, data);
}

function chatSendMessage(target, message) {
  const recipient = (target || "").trim();
  if (!recipient) {
    printLines(["Bitte einen Empfänger angeben. Beispiel: chat send mika Hey!", ""], "error");
    return;
  }

  const text = (message || "").trim();
  if (!text) {
    printLines(["Bitte einen Nachrichtentext angeben.", ""], "error");
    return;
  }

  const sender = getUserName();
  const mailbox = chatReadMailbox();
  const list = Array.isArray(mailbox[recipient]) ? mailbox[recipient] : [];
  list.push({
    from: sender,
    text,
    ts: chatNow(),
    read: false
  });

  if (list.length > CHAT_MAX_MESSAGES) {
    mailbox[recipient] = list.slice(-CHAT_MAX_MESSAGES);
  } else {
    mailbox[recipient] = list;
  }

  chatSaveMailbox(mailbox);

  const suffix = recipient === sender ? " (an dich selbst)" : "";
  printLines([`Nachricht an ${recipient}${suffix} gesendet.`, ""], "success");
}

function chatRenderMessages(messages, { header = "Nachrichten" } = {}) {
  const lines = [header + ":", "-".repeat(header.length + 1)];
  messages.forEach(msg => {
    const date = new Date(msg.ts || Date.now());
    const time = date.toLocaleTimeString();
    lines.push(`[${time}] ${msg.from || "unbekannt"}: ${msg.text}`);
  });
  lines.push("");
  printLines(lines);
}

function chatReadInbox({ includeRead = false } = {}) {
  const user = getUserName();
  const mailbox = chatReadMailbox();
  const inbox = Array.isArray(mailbox[user]) ? mailbox[user] : [];
  const messages = includeRead ? inbox : inbox.filter(m => !m.read);

  if (!messages.length) {
    printLines(["Keine (neuen) Nachrichten in deinem Posteingang.", ""], "dim");
    return;
  }

  chatRenderMessages(messages, { header: "Posteingang" });

  mailbox[user] = inbox.map(msg => ({ ...msg, read: true }));
  chatSaveMailbox(mailbox);
  CHAT_LAST_UNREAD = 0;
}

function chatUnreadCount() {
  const user = getUserName();
  const mailbox = chatReadMailbox();
  const inbox = Array.isArray(mailbox[user]) ? mailbox[user] : [];
  return inbox.filter(msg => !msg.read).length;
}

function chatAnnounceUnread(force = false) {
  const unread = chatUnreadCount();
  if (unread === 0) {
    CHAT_LAST_UNREAD = 0;
    return;
  }

  if (!force && unread === CHAT_LAST_UNREAD) return;
  CHAT_LAST_UNREAD = unread;

  const plural = unread === 1 ? "Nachricht" : "Nachrichten";
  printLines([`📨 Du hast ${unread} ungelesene ${plural}. Tippe 'chat inbox' zum Anzeigen.`, ""], "success");
}

function chatHandleStorage(evt) {
  if (evt && evt.key === CHAT_MAILBOX_KEY) {
    chatAnnounceUnread(true);
  }
}

function chatStartPresence() {
  chatUpdatePresence();
  if (CHAT_HEARTBEAT_TIMER) clearInterval(CHAT_HEARTBEAT_TIMER);
  CHAT_HEARTBEAT_TIMER = setInterval(chatUpdatePresence, CHAT_HEARTBEAT_MS);
}

function chatStartInboxWatcher() {
  chatAnnounceUnread(true);
  if (CHAT_INBOX_TIMER) clearInterval(CHAT_INBOX_TIMER);
  CHAT_INBOX_TIMER = setInterval(chatAnnounceUnread, CHAT_INBOX_POLL_MS);

  window.addEventListener("storage", chatHandleStorage);
}

function chatHelp() {
  printLines([
    "Chat Befehle:",
    "  chat online            - Zeigt aktive Nutzer mit letzter Aktivität",
    "  chat send <user> <msg> - Sendet eine Nachricht",
    "  chat inbox [all]       - Zeigt ungelesene (oder alle) Nachrichten",
    "  chat help              - Diese Hilfe",
    ""
  ]);
}

function handleChatCommand(args = []) {
  const sub = (args[0] || "").toLowerCase();

  if (!sub || sub === "help") {
    chatHelp();
    return;
  }

  if (sub === "online" || sub === "list") {
    chatPrintOnline();
    return;
  }

  if (sub === "send") {
    const target = args[1];
    const message = args.slice(2).join(" ");
    chatSendMessage(target, message);
    return;
  }

  if (sub === "inbox" || sub === "read") {
    const includeRead = (args[1] || "").toLowerCase() === "all";
    chatReadInbox({ includeRead });
    return;
  }

  chatHelp();
}

if (typeof registerCommand === "function") {
  registerCommand("chat", handleChatCommand);
}

window.addEventListener("load", () => {
  chatStartPresence();
  chatStartInboxWatcher();
});
