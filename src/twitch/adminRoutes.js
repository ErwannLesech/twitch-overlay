const express = require("express");
const { getConfig, state, saveState, resetState, checkGoalReached } = require("../store");
const { broadcast, broadcastState } = require("../ws");

const router = express.Router();

router.get("/state", (req, res) => {
  res.json({ ...state, twitchUsername: getConfig()?.twitchUsername });
});

router.post("/admin/goal", (req, res) => {
  const { subGoal } = req.body;
  if (typeof subGoal === "number" && subGoal > 0) {
    state.subGoal             = subGoal;
    state.goalReachedNotified = false;
    saveState();
    broadcastState();
  }
  res.json(state);
});

router.post("/admin/goal-message", (req, res) => {
  const { goalMessage } = req.body;
  if (typeof goalMessage === "string") {
    state.goalMessage = goalMessage.trim();
    saveState();
    broadcastState();
  }
  res.json(state);
});

router.post("/admin/alerts-toggle", (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled === "boolean") {
    state.alertsEnabled = enabled;
    saveState();
    broadcastState();
  }
  res.json(state);
});

router.post("/admin/alert-messages", (req, res) => {
  const { followMessage, subMessage } = req.body;
  if (typeof followMessage === "string") state.followMessage = followMessage.trim();
  if (typeof subMessage    === "string") state.subMessage    = subMessage.trim();
  saveState();
  broadcastState();
  res.json(state);
});

router.post("/admin/test/:event", (req, res) => {
  const { event } = req.params;
  if (event === "follow") {
    state.followers += 1;
    if (state.alertsEnabled) broadcast({ type: "follow", username: "TestViewer" + Math.floor(Math.random() * 999), message: state.followMessage });
  } else if (event === "sub") {
    state.subs += 1;
    if (state.alertsEnabled) broadcast({ type: "sub", username: "TestSub" + Math.floor(Math.random() * 999), tier: "1000", message: state.subMessage });
  } else if (event === "reset") {
    resetState();
  }
  if (checkGoalReached()) broadcast({ type: "goalReached" });
  saveState();
  broadcastState();
  res.json(state);
});

module.exports = router;
