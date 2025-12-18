// ---------------------------------------------------------
// CHAT MODULE – Online-Presence mit Server-Fallback
// ---------------------------------------------------------

const CHAT_API_URL = "content-builder/api/chat.php";
const CHAT_API_TIMEOUT_MS = 8000;

const CHAT_PRESENCE_KEY = "darknet-chat-presence";
const CHAT_MAILBOX_KEY = "darknet-chat-mailbox";
const CHAT_PRESENCE_TTL_MS = 90 * 1000; // 90s gelten als "online"
const CHAT_HEARTBEAT_MS = 20 * 1000;
const CHAT_INBOX_POLL_MS = 10 * 1000;
const CHAT_MAX_MESSAGES = 50;

let CHAT_USE_LOCAL_FALLBACK = false;
let CHAT_API_NOTICE_SHOWN = false;

let CHAT_LAST_USER = getUserName();
let CHAT_HEARTBEAT_TIMER = null;
let CHAT_INBOX_TIMER = null;
let CHAT_LAST_UNREAD = 0;

function chatNow() {
  return Date.now();
}

// ---------------------------------------------------------
// Local Storage Helpers (Fallback)
// ---------------------------------------------------------
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

function localChatUpdatePresence() {
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

function chatReadMailbox() {
  const data = chatReadStorage(CHAT_MAILBOX_KEY);
  if (!data || typeof data !== "object") return {};
  return data;
}

function chatSaveMailbox(data) {
  chatWriteStorage(CHAT_MAILBOX_KEY, data);
}

function localChatSendMessage(recipient, sender, text) {
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
}

function localChatInbox(includeRead = false) {
  const user = getUserName();
  const mailbox = chatReadMailbox();
  const inbox = Array.isArray(mailbox[user]) ? mailbox[user] : [];
  const messages = includeRead ? inbox : inbox.filter(m => !m.read);

  if (!includeRead && messages.length) {
    mailbox[user] = inbox.map(msg => ({ ...msg, read: true }));
    chatSaveMailbox(mailbox);
  }

  return {
    messages,
    unread: includeRead ? inbox.filter(m => !m.read).length : 0
  };
}

function localChatUnreadCount() {
  const user = getUserName();
  const mailbox = chatReadMailbox();
  const inbox = Array.isArray(mailbox[user]) ? mailbox[user] : [];
  return inbox.filter(msg => !msg.read).length;
}

function chatOnlineListFromPresence(presence, now = chatNow()) {
  const names = Object.keys(presence || {});
  const list = names.map(name => ({
    name,
    lastSeen: presence[name]?.lastSeen || now
  }));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------
// API Helpers
// ---------------------------------------------------------
async function chatApiRequest(action, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_API_TIMEOUT_MS);
  try {
    const res = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function chatFallback(reason) {
  if (!CHAT_USE_LOCAL_FALLBACK) {
    CHAT_USE_LOCAL_FALLBACK = true;
    if (!CHAT_API_NOTICE_SHOWN) {
      printLines([
        "Online-Chat nicht erreichbar. Wechsel in lokalen Offline-Modus.",
        ""
      ], "dim");
      CHAT_API_NOTICE_SHOWN = true;
    }
  }
  if (reason?.message) {
    console.warn("Chat-API Fehler:", reason.message);
  }
}

async function chatHeartbeat({ includeOnline = false } = {}) {
  if (CHAT_USE_LOCAL_FALLBACK) {
    const presence = localChatUpdatePresence();
    const unread = localChatUnreadCount();
    CHAT_LAST_UNREAD = unread;
    return {
      online: includeOnline ? chatOnlineListFromPresence(presence) : [],
      unread
    };
  }

  try {
    const res = await chatApiRequest("heartbeat", {
      user: getUserName(),
      includeOnline
    });
    CHAT_LAST_UNREAD = typeof res.unread === "number" ? res.unread : 0;
    return {
      online: Array.isArray(res.online) ? res.online : [],
      unread: CHAT_LAST_UNREAD
    };
  } catch (e) {
    chatFallback(e);
    return chatHeartbeat({ includeOnline });
  }
}

// ---------------------------------------------------------
// Output Helpers
// ---------------------------------------------------------
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

async function chatPrintOnline() {
  const status = await chatHeartbeat({ includeOnline: true });
  const now = chatNow();
  const list = Array.isArray(status.online) ? status.online : [];

  if (!list.length) {
    printLines(["Niemand ist gerade online.", ""], "dim");
    return;
  }

  const lines = [
    "Aktive Nutzer im Darknetz-Chat:",
    "-------------------------------"
  ];

  list.forEach(entry => {
    const label = entry.name === getUserName() ? `${entry.name} (du)` : entry.name;
    lines.push(`- ${label} · ${chatFormatAgo(now - (entry.lastSeen || now))}`);
  });

  lines.push("");
  printLines(lines);
}

// ---------------------------------------------------------
// Messaging
// ---------------------------------------------------------
async function chatSendMessage(target, message) {
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

  if (!CHAT_USE_LOCAL_FALLBACK) {
    try {
      await chatApiRequest("send", { from: sender, to: recipient, text });
      printLines([`Nachricht an ${recipient} gesendet.`, ""], "success");
      return;
    } catch (e) {
      chatFallback(e);
    }
  }

  localChatSendMessage(recipient, sender, text);
  const suffix = recipient === sender ? " (an dich selbst)" : "";
  printLines([`Nachricht an ${recipient}${suffix} gesendet.`, ""], "success");
}

async function chatReadInbox({ includeRead = false } = {}) {
  if (!CHAT_USE_LOCAL_FALLBACK) {
    try {
      const res = await chatApiRequest("inbox", {
        user: getUserName(),
        includeRead,
        markRead: true
      });
      const messages = Array.isArray(res.messages) ? res.messages : [];
      if (!messages.length) {
        printLines(["Keine (neuen) Nachrichten in deinem Posteingang.", ""], "dim");
        CHAT_LAST_UNREAD = 0;
        return;
      }
      chatRenderMessages(messages, { header: "Posteingang" });
      CHAT_LAST_UNREAD = res.unread ?? 0;
      return;
    } catch (e) {
      chatFallback(e);
    }
  }

  const { messages, unread } = localChatInbox(includeRead);
  if (!messages.length) {
    printLines(["Keine (neuen) Nachrichten in deinem Posteingang.", ""], "dim");
    CHAT_LAST_UNREAD = 0;
    return;
  }

  chatRenderMessages(messages, { header: "Posteingang" });
  CHAT_LAST_UNREAD = unread;
}

// ---------------------------------------------------------
// Unread Announcements & Presence
// ---------------------------------------------------------
async function chatAnnounceUnread(force = false) {
  const status = await chatHeartbeat({ includeOnline: false });
  const unread = typeof status.unread === "number" ? status.unread : 0;

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
  if (!CHAT_USE_LOCAL_FALLBACK) return;
  if (evt && evt.key === CHAT_MAILBOX_KEY) {
    void chatAnnounceUnread(true);
  }
}

function chatStartPresence() {
  void chatHeartbeat();
  if (CHAT_HEARTBEAT_TIMER) clearInterval(CHAT_HEARTBEAT_TIMER);
  CHAT_HEARTBEAT_TIMER = setInterval(() => {
    void chatHeartbeat();
  }, CHAT_HEARTBEAT_MS);
}

function chatStartInboxWatcher() {
  void chatAnnounceUnread(true);
  if (CHAT_INBOX_TIMER) clearInterval(CHAT_INBOX_TIMER);
  CHAT_INBOX_TIMER = setInterval(() => {
    void chatAnnounceUnread();
  }, CHAT_INBOX_POLL_MS);

  window.addEventListener("storage", chatHandleStorage);
}

// ---------------------------------------------------------
// CLI Binding
// ---------------------------------------------------------
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

async function handleChatCommand(args = []) {
  const sub = (args[0] || "").toLowerCase();

  if (!sub || sub === "help") {
    chatHelp();
    return;
  }

  if (sub === "online" || sub === "list") {
    await chatPrintOnline();
    return;
  }

  if (sub === "send") {
    const target = args[1];
    const message = args.slice(2).join(" ");
    await chatSendMessage(target, message);
    return;
  }

  if (sub === "inbox" || sub === "read") {
    const includeRead = (args[1] || "").toLowerCase() === "all";
    await chatReadInbox({ includeRead });
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
