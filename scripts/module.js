import { MODULE_ID, SETTINGS, SOCKET, SOCKET_MSG } from "./constants.js";
import { registerSettings, registerKeybindings } from "./settings.js";
import { TrackerPanel } from "./apps/tracker-panel.js";
import { TrackerStore } from "./data/tracker-store.js";
import { canModifyTracker } from "./data/tracker-model.js";
import { registerDailyReminder } from "./integrations/daily-reminder.js";
import { registerChromeSelector } from "./ui-safe-area.js";

/**
 * Entry point. Wired in three phases:
 *   - init   → register settings, keybindings, expose API
 *   - ready  → instantiate the panel and bind change listeners
 *   - update → re-render on world setting changes (cross-client sync)
 */
Hooks.once("init", () => {
  registerSettings();
  registerKeybindings();

  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    panel: null,
    store: TrackerStore,
    open: () => mod.api.panel?.refreshLayout(),
    toggle: () => mod.api.panel?.toggleCollapsed(),
    /**
     * Other modules can call this to add their own UI-overlay selectors so
     * the Pursuit Tracker panel won't overlap them.
     * Example: game.modules.get("pursuittracker").api.registerChromeSelector("#my-hud");
     */
    registerChromeSelector
  };
});

Hooks.once("ready", async () => {
  const mod = game.modules.get(MODULE_ID);
  const panel = new TrackerPanel();
  mod.api.panel = panel;

  // Initial render goes through refreshLayout so the visibility check (no
  // panel for non-GMs without visible trackers) applies on first load too —
  // not just on subsequent setting changes.
  await panel.refreshLayout();

  // Cross-client sync: any world setting flip refreshes the panel for all clients.
  Hooks.on("updateSetting", (setting) => {
    if (!setting?.key?.startsWith?.(`${MODULE_ID}.`)) return;
    panel.refreshLayout();
  });

  // Socket bridge.
  //   - REFRESH: any client can request a panel re-render on every other
  //     client (used as a hint for live previews — current code paths rely
  //     on the world-setting onChange instead, but the channel is open for
  //     future use).
  //   - REQUEST_SET_STAGE: a player wants to change a tracker's current
  //     stage. World settings are GM-write-only, so the player emits a
  //     request and only the GM client actually performs the write — after
  //     re-validating that the tracker exists and is player-editable.
  game.socket?.on(SOCKET, async (payload) => {
    if (!payload || typeof payload !== "object") return;
    switch (payload.type) {
      case SOCKET_MSG.REFRESH:
        panel.refreshLayout();
        return;
      case SOCKET_MSG.REQUEST_SET_STAGE: {
        if (!game.user.isGM) return; // only GMs apply the write
        const requester = game.users.get(payload.userId);
        const tracker = TrackerStore.get(payload.trackerId);
        // Validate against the live tracker state — never trust the wire.
        if (!canModifyTracker(requester, tracker)) return;
        await TrackerStore.setStage(tracker.id, payload.stage);
        return;
      }
    }
  });
});

registerDailyReminder();
