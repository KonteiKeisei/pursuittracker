import { STAGES_MIN, STAGES_MAX, PATHS } from "../constants.js";

/**
 * Plain shape used for a single tracker. Stored inside the world setting array.
 * Schema kept hand-rolled (rather than foundry.abstract.DataModel) so the
 * world setting stays a simple JSON array — easier to migrate, export, and diff.
 *
 * { id, name, stages, currentStage, visibleToPlayers,
 *   background, statusIcon, useCustomStageIcons, stageIcons[] }
 */

export function createTracker(overrides = {}) {
  const stages = clampStages(overrides.stages ?? 5);
  return {
    id: overrides.id ?? foundry.utils.randomID(),
    name: overrides.name ?? "",
    stages,
    currentStage: clampStage(overrides.currentStage ?? 0, stages),
    visibleToPlayers: !!overrides.visibleToPlayers,
    /**
     * When true, any player who can SEE this tracker is also allowed to
     * adjust its current stage (advance, retreat, click a stage, drag the
     * dot). Default off — most trackers are GM-driven. Implies
     * visibleToPlayers must also be on for the toggle to have any effect.
     */
    playerEditable: !!overrides.playerEditable,
    background: overrides.background ?? PATHS.bg,
    statusIcon: overrides.statusIcon ?? PATHS.status,
    useCustomStageIcons: !!overrides.useCustomStageIcons,
    stageIcons: Array.isArray(overrides.stageIcons)
      ? overrides.stageIcons.slice(0, STAGES_MAX)
      : []
  };
}

/**
 * True if `user` is allowed to change `tracker`'s current stage. GMs can
 * always modify; players need both visibleToPlayers and playerEditable.
 */
export function canModifyTracker(user, tracker) {
  if (!tracker) return false;
  if (user?.isGM) return true;
  return !!(tracker.visibleToPlayers && tracker.playerEditable);
}

export function normalizeTracker(raw) {
  if (!raw || typeof raw !== "object") return createTracker();
  const t = createTracker(raw);
  // Pad/truncate stageIcons to current stage count when custom icons are on.
  if (t.useCustomStageIcons) {
    while (t.stageIcons.length < t.stages) t.stageIcons.push("");
    t.stageIcons.length = t.stages;
  }
  return t;
}

export function clampStages(n) {
  const v = Number.isFinite(+n) ? Math.round(+n) : 5;
  return Math.max(STAGES_MIN, Math.min(STAGES_MAX, v));
}

export function clampStage(idx, stages) {
  const v = Number.isFinite(+idx) ? Math.round(+idx) : 0;
  return Math.max(0, Math.min(stages - 1, v));
}

/**
 * Resolve which icon to show at a given stage index — either the user's
 * custom override or the bundled numeric SVG (1.svg…10.svg).
 */
export function resolveStageIcon(tracker, index) {
  if (tracker.useCustomStageIcons) {
    const custom = tracker.stageIcons?.[index];
    if (custom) return custom;
  }
  return PATHS.stage(index + 1);
}
