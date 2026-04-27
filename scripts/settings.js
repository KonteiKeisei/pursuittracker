import {
  MODULE_ID,
  SETTINGS,
  POSITIONS,
  REMINDER_SOURCE,
  PATHS
} from "./constants.js";

/**
 * Register all module settings. Called from the `init` hook.
 *
 * Re-render strategy: anything that affects layout/appearance triggers a
 * panel re-render via `onChange`. The store-backed `TRACKERS` setting is a
 * plain array and is observed by the panel through the `updateSetting` hook.
 */
export function registerSettings() {
  const reRenderPanel = () => {
    const panel = game.modules.get(MODULE_ID)?.api?.panel;
    panel?.refreshLayout?.();
  };

  game.settings.register(MODULE_ID, SETTINGS.TRACKERS, {
    name: "PURSUITTRACKER.Settings.Trackers.Name",
    hint: "PURSUITTRACKER.Settings.Trackers.Hint",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    // World-setting onChange fires on EVERY connected client when the GM
    // saves — that's how player clients learn about visibility flips on
    // existing trackers, new trackers being added, etc., in real time.
    // Relying on the generic `updateSetting` hook turned out to be unreliable
    // in V13 (it doesn't always fire on remote clients), so we register the
    // hook directly on the setting itself.
    onChange: () => {
      const panel = game.modules.get(MODULE_ID)?.api?.panel;
      panel?.refreshLayout();
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.PANEL_LABEL, {
    name: "PURSUITTRACKER.Settings.PanelLabel.Name",
    hint: "PURSUITTRACKER.Settings.PanelLabel.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: reRenderPanel
  });

  game.settings.register(MODULE_ID, SETTINGS.RESTRICT_TO_GM, {
    name: "PURSUITTRACKER.Settings.RestrictToGM.Name",
    hint: "PURSUITTRACKER.Settings.RestrictToGM.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      const panel = game.modules.get(MODULE_ID)?.api?.panel;
      if (!panel) return;
      // Players may need the panel removed entirely.
      panel.refreshLayout();
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.PANEL_POSITION, {
    name: "PURSUITTRACKER.Settings.PanelPosition.Name",
    hint: "PURSUITTRACKER.Settings.PanelPosition.Hint",
    scope: "client",
    config: true,
    type: String,
    default: POSITIONS.BOTTOM_LEFT,
    choices: {
      [POSITIONS.TOP_LEFT]: "PURSUITTRACKER.Settings.PanelPosition.TopLeft",
      [POSITIONS.TOP_CENTER]: "PURSUITTRACKER.Settings.PanelPosition.TopCenter",
      [POSITIONS.TOP_RIGHT]: "PURSUITTRACKER.Settings.PanelPosition.TopRight",
      [POSITIONS.BOTTOM_LEFT]: "PURSUITTRACKER.Settings.PanelPosition.BottomLeft",
      [POSITIONS.BOTTOM_CENTER]: "PURSUITTRACKER.Settings.PanelPosition.BottomCenter",
      [POSITIONS.BOTTOM_RIGHT]: "PURSUITTRACKER.Settings.PanelPosition.BottomRight",
      [POSITIONS.LEFT]: "PURSUITTRACKER.Settings.PanelPosition.Left",
      [POSITIONS.RIGHT]: "PURSUITTRACKER.Settings.PanelPosition.Right",
      [POSITIONS.FREE]: "PURSUITTRACKER.Settings.PanelPosition.Free"
    },
    onChange: reRenderPanel
  });

  game.settings.register(MODULE_ID, SETTINGS.PANEL_SCALE, {
    name: "PURSUITTRACKER.Settings.PanelScale.Name",
    hint: "PURSUITTRACKER.Settings.PanelScale.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 1.0,
    range: { min: 0.5, max: 2.0, step: 0.05 },
    onChange: reRenderPanel
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_COLLAPSE, {
    name: "PURSUITTRACKER.Settings.AutoCollapse.Name",
    hint: "PURSUITTRACKER.Settings.AutoCollapse.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: reRenderPanel
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_COLLAPSE_DELAY, {
    name: "PURSUITTRACKER.Settings.AutoCollapseDelay.Name",
    hint: "PURSUITTRACKER.Settings.AutoCollapseDelay.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 1,
    range: { min: 1, max: 60, step: 1 },
    onChange: reRenderPanel
  });

  game.settings.register(MODULE_ID, SETTINGS.DAILY_REMINDER, {
    name: "PURSUITTRACKER.Settings.DailyReminder.Name",
    hint: "PURSUITTRACKER.Settings.DailyReminder.Hint",
    scope: "world",
    config: true,
    type: String,
    default: REMINDER_SOURCE.AUTO,
    choices: {
      [REMINDER_SOURCE.NONE]: "PURSUITTRACKER.Settings.DailyReminder.None",
      [REMINDER_SOURCE.AUTO]: "PURSUITTRACKER.Settings.DailyReminder.Auto",
      [REMINDER_SOURCE.CALENDARIA]: "PURSUITTRACKER.Settings.DailyReminder.Calendaria",
      [REMINDER_SOURCE.REST_RECOVERY]: "PURSUITTRACKER.Settings.DailyReminder.RestRecovery"
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_BACKGROUND, {
    name: "PURSUITTRACKER.Settings.DefaultBackground.Name",
    hint: "PURSUITTRACKER.Settings.DefaultBackground.Hint",
    scope: "world",
    config: true,
    type: String,
    default: PATHS.bg,
    filePicker: "image"
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_STATUS_ICON, {
    name: "PURSUITTRACKER.Settings.DefaultStatusIcon.Name",
    hint: "PURSUITTRACKER.Settings.DefaultStatusIcon.Hint",
    scope: "world",
    config: true,
    type: String,
    default: PATHS.status,
    filePicker: "image"
  });

  // Persist collapse state per-client so it survives reloads.
  game.settings.register(MODULE_ID, SETTINGS.PANEL_COLLAPSED, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  // Free-float position state (per client, hidden from the settings UI —
  // managed via drag and the lock/unlock button on the panel).
  game.settings.register(MODULE_ID, SETTINGS.PANEL_FREE_X, {
    scope: "client",
    config: false,
    type: Number,
    default: 120
  });
  game.settings.register(MODULE_ID, SETTINGS.PANEL_FREE_Y, {
    scope: "client",
    config: false,
    type: Number,
    default: 120
  });
  game.settings.register(MODULE_ID, SETTINGS.PANEL_LOCKED, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: reRenderPanel
  });
}

export function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "togglePanel", {
    name: "PURSUITTRACKER.Keybinds.Toggle",
    editable: [{ key: "KeyP", modifiers: ["Control"] }],
    onDown: () => {
      const panel = game.modules.get(MODULE_ID)?.api?.panel;
      panel?.toggleCollapsed();
      return true;
    },
    restricted: false
  });
}
