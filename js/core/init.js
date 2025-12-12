// ---------------------------------------------------------
// INIT – Boot, MOTD, Welcome, Event-Listener
// ---------------------------------------------------------

function printWelcome() {
  printLines([
    `Willkommen im NRW Noir Darknetz, ${getUserName()}.`,
    "Tippe 'help' für eine Liste der verfügbaren Befehle.",
    ""
  ], "dim");
}

async function ensureLogin() {
  // Versuche gespeicherten User zu laden
  try {
    const saved = localStorage.getItem(USERNAME_KEY);
    if (saved) {
      USER_NAME = saved;
      updatePromptLabel();
      printLines([`Angemeldet als ${saved}.`, ""], "dim");
      printWelcome();
      return;
    }
  } catch (e) {
    // egal, dann eben ohne gespeicherten Namen
  }

  // Kein Benutzer vorhanden → Login-Mode aktivieren
  LOGIN_MODE = true;
  updatePromptLabel(); // zeigt "guest@..." bis ein Name gewählt wurde

  printLines([
    "=== NRW Noir Darknetz Login ===",
    "Kein Benutzername gefunden.",
    "Bitte wähle jetzt einen Benutzernamen und drücke Enter.",
    "Dieser Name wird lokal gespeichert und für Spiele, Scores & BBS genutzt.",
    ""
  ], "dim");
}

// ---------------------------------------------------------
// Seite geladen → Boot, MOTD, Login
// ---------------------------------------------------------
window.addEventListener("load", async () => {
  await loadFileIndex();

  const bannerLines = await loadBanner();
  if (bannerLines && bannerLines.length) {
    autoScaleBanner(bannerLines);
    printLines(bannerLines, "banner-small dim");

    if (watermarkEl) {
      watermarkEl.textContent = bannerLines.join("\n");
    }
  }

  await runBootSequence();

  const motd = await loadMotd();
  if (motd) {
    printLines([`MOTD: ${motd}`, ""], "dim");
  }

  // Login starten / gespeicherten User herstellen
  await ensureLogin();

  inputEl.focus();
});

// ---------------------------------------------------------
// Eingabe behandeln
// ---------------------------------------------------------
inputEl.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const value = inputEl.value;
    inputEl.value = "";
    await handleCommand(value);
    return;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    tabComplete();
    return;
  }
});

// Bei Klick im Output wieder den Fokus auf die Eingabe setzen
outputEl.addEventListener("click", () => inputEl.focus());
