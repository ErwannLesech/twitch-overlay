// API Live Client Data exposee localement par le client League pendant une
// partie jouee, spectee ou un replay - pas de cle, pas d'auth, toujours locale.
const SPECTATOR_LCU_URL = "https://127.0.0.1:2999/liveclientdata/allgamedata";
const SPECTATOR_POLL_INTERVAL_MS = 2000;

module.exports = { SPECTATOR_LCU_URL, SPECTATOR_POLL_INTERVAL_MS };
