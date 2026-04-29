/**
 * Helpers shared between the floating tracker panel and the Tidy 5e Sheets
 * tab integration. Both surfaces render the same tracker data, react to the
 * same permission checks, and route stage changes through the same path —
 * so the logic lives here and each surface just consumes it.
 */

import { MODULE_ID, SETTINGS, SOCKET, SOCKET_MSG } from "../constants.js";
import { TrackerStore } from "../data/tracker-store.js";
import { canModifyTracker, resolveStageIcon } from "../data/tracker-model.js";
import { TrackerConfig } from "../apps/tracker-config.js";

/**
 * Build the displayable shape of a tracker for templates: stage list with
 * resolved icons + active/passed flags, denominator for slider math, the
 * dot's percent position, the 1-based "current stage" display number, and
 * a `canModify` flag based on the live permission check.
 */
export function enrichTracker(tracker) {
  const stages = Array.from({ length: tracker.stages }, (_, i) => ({
    index: i,
    icon: resolveStageIcon(tracker, i),
    active: i === tracker.currentStage,
    passed: i < tracker.currentStage
  }));
  const denom = Math.max(1, tracker.stages - 1);
  return {
    ...tracker,
    displayName: tracker.name?.trim() || game.i18n.localize("PURSUITTRACKER.Tracker.Untitled"),
    stagesArray: stages,
    denom,
    dotPercent: (tracker.currentStage / denom) * 100,
    currentStageDisplay: tracker.currentStage + 1,
    canModify: canModifyTracker(game.user, tracker)
  };
}

/**
 * Persist a stage change. GMs write the world setting directly; players
 * emit a socket request and the GM client performs the write after
 * re-validating with `canModifyTracker`. Either way, the world setting's
 * onChange fires on every connected client and every consumer re-renders.
 */
export async function requestStageChange(tracker, newStage) {
  if (!tracker) return;
  if (game.user.isGM) {
    await TrackerStore.setStage(tracker.id, newStage);
    return;
  }
  game.socket?.emit(SOCKET, {
    type: SOCKET_MSG.REQUEST_SET_STAGE,
    userId: game.user.id,
    trackerId: tracker.id,
    stage: newStage
  });
}

/**
 * Resolve the panel/tab label. World setting wins when set; otherwise the
 * localized default ("Pursuit Tracker"). An empty/whitespace value falls
 * back, so admins can clear the field to revert.
 */
export function resolvePanelLabel() {
  const raw = game.settings.get(MODULE_ID, SETTINGS.PANEL_LABEL);
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return game.i18n.localize("PURSUITTRACKER.Settings.PanelLabel.Default");
}

/**
 * Wire click + drag interactions on every `[data-tracker-id]` element under
 * `root`. Handles advance / retreat / stage-click buttons and drag-to-snap
 * on the status dot. Re-checks the live `canModifyTracker` permission on
 * every interaction, so toggling the per-tracker flag mid-session takes
 * effect without re-binding.
 *
 * `options.vertical`: if true, the slider is laid out top-to-bottom and the
 * drag math uses Y instead of X. Defaults to false (horizontal).
 *
 * Returns a cleanup function that detaches every listener it attached.
 */
export function bindTrackerInteractions(root, options = {}) {
  if (!root) return () => {};
  const vertical = !!options.vertical;
  const cleanups = [];

  for (const trackerEl of root.querySelectorAll("[data-tracker-id]")) {
    cleanups.push(...wireTrackerRow(trackerEl, vertical));
  }
  return () => { for (const fn of cleanups) fn(); };
}

function wireTrackerRow(trackerEl, vertical) {
  const cleanups = [];
  const id = trackerEl.dataset.trackerId;

  // Stage-change actions — gated by the live canModifyTracker check.
  const onStageAction = (action, target) => async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const t = TrackerStore.get(id);
    if (!canModifyTracker(game.user, t)) return;
    if (action === "advance") {
      await requestStageChange(t, t.currentStage + 1);
    } else if (action === "retreat") {
      await requestStageChange(t, t.currentStage - 1);
    } else if (action === "stage") {
      const stage = Number(target?.dataset?.stage);
      if (Number.isFinite(stage)) await requestStageChange(t, stage);
    }
  };

  // GM-only management actions — visibility toggle, edit, delete. We
  // re-check `game.user.isGM` at fire time so a GM-removed account can't
  // accidentally hold an enabled handler.
  const onManageAction = (action) => async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!game.user?.isGM) return;
    const t = TrackerStore.get(id);
    if (!t) return;
    if (action === "toggleVisibility") {
      await TrackerStore.update(id, { visibleToPlayers: !t.visibleToPlayers });
    } else if (action === "edit") {
      new TrackerConfig({ trackerId: id }).render({ force: true });
    } else if (action === "delete") {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "PURSUITTRACKER.Config.ConfirmDelete" },
        content: `<p>${game.i18n.localize("PURSUITTRACKER.Config.ConfirmDeleteHint")}</p>`,
        modal: true
      });
      if (!ok) return;
      await TrackerStore.delete(id);
    }
  };

  const wire = (action, factory) => {
    for (const btn of trackerEl.querySelectorAll(`[data-action="${action}"]`)) {
      const h = factory(action, btn);
      btn.addEventListener("click", h);
      cleanups.push(() => btn.removeEventListener("click", h));
    }
  };

  wire("advance", onStageAction);
  wire("retreat", onStageAction);
  wire("stage", onStageAction);
  wire("toggleVisibility", onManageAction);
  wire("edit", onManageAction);
  wire("delete", onManageAction);

  // Drag-to-snap on the status dot.
  const dot = trackerEl.querySelector(".pt-status-dot");
  const slider = trackerEl.querySelector(".pt-slider");
  if (dot && slider) {
    cleanups.push(...wireDotDrag(dot, slider, trackerEl, vertical));
  }
  return cleanups;
}

function wireDotDrag(dot, slider, trackerEl, vertical) {
  let session = null;

  const onDown = (ev) => {
    if (ev.button !== 0) return;
    const id = trackerEl.dataset.trackerId;
    const tracker = TrackerStore.get(id);
    if (!canModifyTracker(game.user, tracker)) return;
    ev.preventDefault();
    ev.stopPropagation();

    const rect = slider.getBoundingClientRect();
    session = {
      tracker,
      rect,
      previewRatio: tracker.currentStage / Math.max(1, tracker.stages - 1)
    };
    try { dot.setPointerCapture(ev.pointerId); } catch (_) { /* no-op */ }
    trackerEl.classList.add("pt-dragging");
    dot.addEventListener("pointermove", onMove);
    dot.addEventListener("pointerup", onUp);
    dot.addEventListener("pointercancel", onUp);
  };

  const onMove = (ev) => {
    if (!session) return;
    const ratio = vertical
      ? (ev.clientY - session.rect.top) / Math.max(1, session.rect.height)
      : (ev.clientX - session.rect.left) / Math.max(1, session.rect.width);
    const clamped = Math.max(0, Math.min(1, ratio));
    dot.style.setProperty("--pt-dot", `${clamped * 100}%`);
    session.previewRatio = clamped;
  };

  const onUp = async (ev) => {
    if (!session) return;
    const ended = session;
    session = null;
    dot.removeEventListener("pointermove", onMove);
    dot.removeEventListener("pointerup", onUp);
    dot.removeEventListener("pointercancel", onUp);
    try { dot.releasePointerCapture(ev.pointerId); } catch (_) { /* no-op */ }
    trackerEl.classList.remove("pt-dragging");

    const snapped = Math.round(ended.previewRatio * (ended.tracker.stages - 1));
    if (snapped !== ended.tracker.currentStage) {
      await requestStageChange(ended.tracker, snapped);
    }
  };

  dot.addEventListener("pointerdown", onDown);
  return [() => dot.removeEventListener("pointerdown", onDown)];
}
