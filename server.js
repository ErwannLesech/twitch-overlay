const path    = require("path");
const express = require("express");

const { BASE_DIR, PUBLIC_DIR, PORT } = require("./src/paths");

// Challenge LoL — optionnel : sans .env a cote de l'exe, les widgets Riot restent inactifs.
// Doit s'executer avant tout require des modules Riot (ils lisent process.env au chargement).
require("dotenv").config({ path: path.join(BASE_DIR, ".env") });

const { crashAndWait } = require("./src/crash");

const { getConfig, loadTokens } = require("./src/store");
const { initWebsocket } = require("./src/ws");
const { openBrowser } = require("./src/browser");

const twitchAuthRoutes  = require("./src/twitch/authRoutes");
const twitchAdminRoutes = require("./src/twitch/adminRoutes");
const { connectEventSub } = require("./src/twitch/eventsub");

const riotAdminRoutes = require("./src/riot/adminRoutes");
const { startRiotChallenge } = require("./src/riot/poll");

// ---------------------------------------------------------------------------
// Express application
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get("/", (req, res) => {
  if (!getConfig())  return res.redirect("/setup.html");
  if (!loadTokens()) return res.redirect("/setup.html");
  res.redirect("/admin");
});

app.get("/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));

app.use(twitchAuthRoutes);
app.use(twitchAdminRoutes);
app.use(riotAdminRoutes);

// ---------------------------------------------------------------------------
// HTTP server startup
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log("========================================");
  console.log("  Overlay Twitch - serveur demarre");
  console.log("  Ne fermez pas cette fenetre pendant votre stream.");
  console.log("========================================");
  console.log(`Admin              : http://localhost:${PORT}/admin`);
  console.log(`Overlay principal  : http://localhost:${PORT}/overlay.html`);
  console.log(`Overlay LoL        : http://localhost:${PORT}/overlay_lol.html`);
  console.log(`Overlay LoL LP     : http://localhost:${PORT}/overlay_challenge_lp.html`);

  if (!getConfig()) {
    openBrowser(`http://localhost:${PORT}/setup.html`);
  } else if (!loadTokens()) {
    openBrowser(`http://localhost:${PORT}/setup.html`);
  } else {
    openBrowser(`http://localhost:${PORT}/admin`);
    connectEventSub();
  }

  startRiotChallenge();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    crashAndWait(
      "Le port 3000 est deja utilise",
      "Une autre instance du programme est peut-etre deja en cours d'execution. " +
      "Verifiez la barre des taches, fermez l'instance existante, puis relancez. " +
      "Si le probleme persiste, redemarrez votre machine.",
    );
  } else {
    crashAndWait("Impossible de demarrer le serveur", err);
  }
});

initWebsocket(server);
