const express = require("express");
const { PORT } = require("../paths");
const { getConfig, setConfig, state, saveState, loadTokens, saveTokens } = require("../store");
const { connectEventSub } = require("./eventsub");

const router = express.Router();

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------
router.get("/config", (req, res) => {
  res.json({ configured: !!getConfig(), authenticated: !!loadTokens() });
});

router.post("/setup", async (req, res) => {
  const { clientId, clientSecret, twitchUsername, subGoal } = req.body;

  if (!clientId || !clientSecret || !twitchUsername) {
    return res.status(400).json({ error: "Veuillez renseigner tous les champs obligatoires." });
  }

  try {
    const tokenRes  = await fetch("https://id.twitch.tv/oauth2/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({ error: "Client ID ou Client Secret invalide. Verifiez les valeurs copiees depuis dev.twitch.tv." });
    }

    const userRes  = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(twitchUsername.trim().toLowerCase())}`,
      { headers: { "Client-Id": clientId, Authorization: `Bearer ${tokenData.access_token}` } },
    );
    const userData = await userRes.json();
    const user     = userData.data?.[0];

    if (!user) {
      return res.status(404).json({ error: `Pseudo Twitch "${twitchUsername}" introuvable. Verifiez l'orthographe.` });
    }

    setConfig({ clientId, clientSecret, broadcasterId: user.id, twitchUsername: user.login });

    if (subGoal) {
      state.subGoal             = Number(subGoal);
      state.goalReachedNotified = false;
      saveState();
    }

    res.json({ ok: true, displayName: user.display_name });
  } catch (e) {
    console.error("Erreur lors de la configuration :", e.message);
    res.status(500).json({ error: "Impossible de contacter Twitch. Verifiez la connexion Internet et reessayez." });
  }
});

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------
router.get("/auth", (req, res) => {
  const config = getConfig();
  if (!config) return res.redirect("/setup.html");
  const redirectUri = `http://localhost:${PORT}/auth/callback`;
  const scopes      = ["moderator:read:followers", "channel:read:subscriptions"].join(" ");
  res.redirect(
    `https://id.twitch.tv/oauth2/authorize?client_id=${config.clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=${encodeURIComponent(scopes)}`,
  );
});

router.get("/auth/callback", async (req, res) => {
  const config = getConfig();
  const { code } = req.query;
  if (!code) return res.status(400).send("Code manquant");

  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type:    "authorization_code",
      redirect_uri:  `http://localhost:${PORT}/auth/callback`,
    }),
  });
  const tokens = await r.json();

  if (!tokens.access_token) {
    console.error("Echec de l'authentification :", tokens);
    return res.status(500).send("Echec de l'authentification. Verifiez le Client ID et le Secret dans /setup.html, puis reessayez.");
  }

  saveTokens(tokens);
  res.redirect("/admin?connected=1");
  connectEventSub();
});

module.exports = router;
