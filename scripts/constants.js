export const MODULE_ID = "pursuittracker";

export const SETTINGS = {
  TRACKERS: "trackers",
  RESTRICT_TO_GM: "restrictToGM",
  PANEL_POSITION: "panelPosition",
  PANEL_SCALE: "panelScale",
  AUTO_COLLAPSE: "autoCollapse",
  AUTO_COLLAPSE_DELAY: "autoCollapseDelay",
  DAILY_REMINDER: "dailyReminder",
  DEFAULT_BACKGROUND: "defaultBackground",
  DEFAULT_STATUS_ICON: "defaultStatusIcon",
  PANEL_COLLAPSED: "panelCollapsed",
  PANEL_FREE_X: "panelFreeX",
  PANEL_FREE_Y: "panelFreeY",
  PANEL_LOCKED: "panelLocked",
  PANEL_LABEL: "panelLabel"
};

export const POSITIONS = {
  TOP_LEFT: "top-left",
  TOP_CENTER: "top-center",
  TOP_RIGHT: "top-right",
  BOTTOM_LEFT: "bottom-left",
  BOTTOM_CENTER: "bottom-center",
  BOTTOM_RIGHT: "bottom-right",
  LEFT: "left",
  RIGHT: "right",
  FREE: "free"
};

export const REMINDER_SOURCE = {
  NONE: "none",
  CALENDARIA: "calendaria",
  REST_RECOVERY: "rest-recovery",
  AUTO: "auto"
};

export const STAGES_MIN = 3;
export const STAGES_MAX = 10;

export const SOCKET = `module.${MODULE_ID}`;

/** Cross-client message types sent over `game.socket`. */
export const SOCKET_MSG = {
  REFRESH: "refresh",
  /** Player → GM request to set a tracker's current stage. */
  REQUEST_SET_STAGE: "requestSetStage"
};

export const PATHS = {
  bg: `modules/${MODULE_ID}/assets/backgrounds/default.svg`,
  status: `modules/${MODULE_ID}/assets/icons/status/default.svg`,
  stage: (n) => `modules/${MODULE_ID}/assets/icons/stages/${n}.svg`
};
