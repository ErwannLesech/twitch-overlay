const fs = require("fs");
const { WebSocket } = require("ws");
const { PORT, TOKENS_FILE } = require("../paths");
const { openBrowser } = require("../browser");
const { getConfig, state, saveState, checkGoalReached, loadTokens, saveTokens } = require("../store");
const { broadcast, broadcastState } = require("../ws");

async function refreshAccessTokenIfNeeded(tokens) {
  const config = getConfig();
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     config.clientId,
      client_secret: config.clientSecret,
      grant_type:    "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });
  const fresh = await r.json();
  if (fresh.access_token) { saveTokens(fresh); return fresh; }
  console.error("Echec du rafraichissement du token Twitch :", fresh);
  return tokens;
}

async function subscribeTo(sessionId, type, version, accessToken) {
  const config    = getConfig();
  const condition = { broadcaster_user_id: config.broadcasterId };
  if (type === "channel.follow") condition.moderator_user_id = config.broadcasterId;

  const r = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method:  "POST",
    headers: {
      "Client-Id":    config.clientId,
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, version, condition, transport: { method: "websocket", session_id: sessionId } }),
  });
  const data = await r.json();
  if (!r.ok) console.error(`Echec de l'abonnement a ${type} :`, data);
  else       console.log(`Abonne a ${type}`);
  return r.status;
}

async function fetchInitialCounts(accessToken) {
  const config = getConfig();
  try {
    const followerRes  = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${config.broadcasterId}`,
      { headers: { "Client-Id": config.clientId, Authorization: `Bearer ${accessToken}` } },
    );
    const followerData = await followerRes.json();
    if (typeof followerData.total === "number") {
      state.followers = followerData.total;
    } else if (!followerRes.ok) {
      console.error("Impossible de recuperer le nombre de followers :", followerData);
    }

    const subRes  = await fetch(
      `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${config.broadcasterId}&first=1`,
      { headers: { "Client-Id": config.clientId, Authorization: `Bearer ${accessToken}` } },
    );
    const subData = await subRes.json();
    if (typeof subData.total === "number") {
      state.subs = subData.total;
    } else if (!subRes.ok) {
      console.error("Impossible de recuperer le nombre de subs :", subData);
    }

    if (checkGoalReached()) broadcast({ type: "goalReached" });
    saveState();
    broadcastState();
  } catch (e) {
    console.error("Impossible de recuperer les compteurs initiaux :", e.message);
  }
}

// Le token stocke n'est plus valide (revoque, expire, refresh_token perime...) :
// on force une nouvelle autorisation plutot que de boucler indefiniment sur des 401.
function requireReauth() {
  console.error("\n========================================");
  console.error("  Session Twitch expiree");
  console.error("========================================");
  console.error("Le token enregistre n'est plus valide aupres de Twitch.");
  console.error(`Reconfigurez l'application ici : http://localhost:${PORT}/setup.html\n`);
  fs.rmSync(TOKENS_FILE, { force: true });
  openBrowser(`http://localhost:${PORT}/setup.html`);
}

async function connectEventSub() {
  const config = getConfig();
  if (!config) return;

  let tokens = loadTokens();
  if (!tokens) {
    console.log(`Authentification requise. Accedez a http://localhost:${PORT}/auth`);
    return;
  }

  tokens = await refreshAccessTokenIfNeeded(tokens);
  const twitchWs = new WebSocket("wss://eventsub.wss.twitch.tv/ws");
  let invalidToken = false;

  twitchWs.on("message", async (raw) => {
    const msg  = JSON.parse(raw.toString());
    const type = msg.metadata?.message_type;

    if (type === "session_welcome") {
      const sessionId = msg.payload.session.id;
      console.log("Connecte a Twitch EventSub - abonnement aux evenements...");
      await fetchInitialCounts(tokens.access_token);
      const statuses = await Promise.all([
        subscribeTo(sessionId, "channel.follow",            "2", tokens.access_token),
        subscribeTo(sessionId, "channel.subscribe",         "1", tokens.access_token),
        subscribeTo(sessionId, "channel.subscription.gift", "1", tokens.access_token),
      ]);
      if (statuses.every((s) => s === 401)) {
        invalidToken = true;
        twitchWs.close();
      }
    }

    if (type === "notification") {
      const subType = msg.payload.subscription.type;
      const event   = msg.payload.event;

      if (subType === "channel.follow") {
        state.followers += 1;
        if (state.alertsEnabled) broadcast({ type: "follow", username: event.user_name, message: state.followMessage });
      }
      if (subType === "channel.subscribe") {
        state.subs += 1;
        if (state.alertsEnabled) broadcast({ type: "sub", username: event.user_name, tier: event.tier, message: state.subMessage });
      }
      if (subType === "channel.subscription.gift") {
        state.subs += event.total || 1;
        if (state.alertsEnabled) broadcast({ type: "sub", username: event.user_name || "Anonyme", tier: event.tier, gift: true, message: state.subMessage });
      }

      if (checkGoalReached()) broadcast({ type: "goalReached" });
      saveState();
      broadcastState();
    }

    if (type === "session_reconnect") {
      const newUrl = msg.payload.session.reconnect_url;
      twitchWs.close();
      new WebSocket(newUrl).on("open", () => console.log("Reconnecte a EventSub"));
    }
  });

  twitchWs.on("close", () => {
    if (invalidToken) {
      requireReauth();
      return;
    }
    console.log("Connexion EventSub fermee. Nouvelle tentative dans 5 s...");
    setTimeout(connectEventSub, 5000);
  });

  twitchWs.on("error", (err) => console.error("Erreur EventSub :", err.message));
}

module.exports = { connectEventSub };
