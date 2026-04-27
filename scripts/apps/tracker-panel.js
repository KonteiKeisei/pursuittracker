import { MODULE_ID, SETTINGS, POSITIONS, SOCKET, SOCKET_MSG } from "../constants.js";
import { TrackerStore } from "../data/tracker-store.js";
import { resolveStageIcon, canModifyTracker } from "../data/tracker-model.js";
import { TrackerConfig } from "./tracker-config.js";

/**
 * Apply a stage change in the right place: GMs write the world setting
 * directly; players emit a socket request and the GM client performs the
 * write after re-validating. Either way the world setting changes, the
 * onChange fires on every client, and every panel re-renders.
 */
async function requestStageChange(tracker, newStage) {
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

const GUTTER = 8;
/** Extra breathing room above the hotbar/players row. */
const BOTTOM_GUTTER = 20;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Compute how much of each viewport edge Foundry's chrome currently occupies.
 *
 * Returns `{ top, right, bottom, left }` in pixels — each value already
 * includes the per-edge gutter, so callers just consume it as the inset to
 * keep clear. Values are derived from the live DOM, so collapsing the
 * sidebar / opening the hotbar / etc. is reflected on the next call.
 */
function getChromeOffsets() {
  // Each entry is [edge, ids, dimension, gutter]. We walk it once instead of
  // hand-writing four separate blocks.
  const map = [
    ["top",    ["navigation"],                "offsetHeight", GUTTER],
    ["right",  ["sidebar"],                   "offsetWidth",  GUTTER],
    ["bottom", ["hotbar", "players"],         "offsetHeight", BOTTOM_GUTTER],
    ["left",   ["scene-controls", "controls"], "offsetWidth", GUTTER]
  ];
  const result = { top: 0, right: 0, bottom: 0, left: 0 };

  for (const [edge, ids, dim, gutter] of map) {
    let max = 0;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      // The sidebar collapses to a tiny rail; treat it as zero-width so docs
      // anchored on the right side hug the edge instead of leaving a gap.
      if (id === "sidebar" && el.classList.contains("collapsed")) continue;
      const v = el[dim] ?? 0;
      if (v > max) max = v;
    }
    result[edge] = max + gutter;
  }
  return result;
}

/** Module-local helper. Static-style action handlers can call this freely. */
function assertGM() {
  if (game.user.isGM) return true;
  ui.notifications.warn(game.i18n.localize("PURSUITTRACKER.Notifications.NoPermission"));
  return false;
}

/**
 * The dockable HUD-style panel that hosts every visible tracker.
 *
 * Built as a single ApplicationV2 + HandlebarsApplicationMixin instance owned
 * by the module — never multiple, never destroyed during a session — so its
 * lifecycle is: render once at `ready`, refresh on data/setting changes,
 * collapse/expand via CSS class.
 */
export class TrackerPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-panel`,
    classes: ["pursuittracker", "pursuittracker-panel"],
    tag: "section",
    // Auto-sized — content (the pull tab) drives the panel's intrinsic size.
    position: { width: "auto", height: "auto" },
    // V13 best practice: positioned: true lets the framework own `top` /
    // `left` / `width` / `height` inline styles. We write through
    // `setPosition({ left, top })`, never manually. That avoids conflicts
    // with `.application` defaults and any UI-overhaul wrappers that would
    // otherwise overwrite our positioning.
    window: {
      frame: false,
      positioned: true
    },
    actions: {
      create: TrackerPanel.#onCreate,
      edit: TrackerPanel.#onEdit,
      delete: TrackerPanel.#onDelete,
      toggleVisibility: TrackerPanel.#onToggleVisibility,
      advance: TrackerPanel.#onAdvance,
      retreat: TrackerPanel.#onRetreat,
      stage: TrackerPanel.#onStageClick,
      collapse: TrackerPanel.#onCollapseToggle,
      openSettings: TrackerPanel.#onOpenSettings,
      toggleLock: TrackerPanel.#onToggleLock
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/tracker-panel.hbs`,
      root: true
    }
  };

  /** Idle timer for auto-collapse. */
  #idleTimer = null;
  /** Active drag state, if any. */
  #drag = null;
  /** True once root-level listeners (hover, etc.) have been attached. */
  #rootBound = false;
  /** Live safe-area observer; created lazily on first render. */
  #safeArea = null;

  /* ---------------------------- Lifecycle ---------------------------- */

  async _prepareContext() {
    const trackers = TrackerStore.visibleFor(game.user).map((t) => this.#enrichTracker(t));
    const position = game.settings.get(MODULE_ID, SETTINGS.PANEL_POSITION);
    const scale = game.settings.get(MODULE_ID, SETTINGS.PANEL_SCALE);
    const autoCollapse = game.settings.get(MODULE_ID, SETTINGS.AUTO_COLLAPSE);
    const collapsed = game.settings.get(MODULE_ID, SETTINGS.PANEL_COLLAPSED);
    const isFree = position === POSITIONS.FREE;
    const locked = game.settings.get(MODULE_ID, SETTINGS.PANEL_LOCKED);
    return {
      isGM: game.user.isGM,
      trackers,
      hasTrackers: trackers.length > 0,
      position,
      isFree,
      locked,
      vertical: position === POSITIONS.LEFT || position === POSITIONS.RIGHT,
      scale,
      autoCollapse,
      collapsed,
      label: this.#resolveLabel(),
      i18n: {
        title: game.i18n.localize("PURSUITTRACKER.Panel.Title"),
        pull: game.i18n.localize("PURSUITTRACKER.Panel.PullTab"),
        empty: game.i18n.localize("PURSUITTRACKER.Panel.NoTrackers"),
        newTracker: game.i18n.localize("PURSUITTRACKER.Panel.NewTracker"),
        settings: game.i18n.localize("PURSUITTRACKER.Panel.OpenSettings"),
        edit: game.i18n.localize("PURSUITTRACKER.Tracker.Edit"),
        del: game.i18n.localize("PURSUITTRACKER.Tracker.Delete"),
        vis: game.i18n.localize("PURSUITTRACKER.Tracker.ToggleVisibility"),
        adv: game.i18n.localize("PURSUITTRACKER.Tracker.AdvanceStage"),
        ret: game.i18n.localize("PURSUITTRACKER.Tracker.RetreatStage"),
        lock: game.i18n.localize("PURSUITTRACKER.Panel.Lock"),
        unlock: game.i18n.localize("PURSUITTRACKER.Panel.Unlock"),
        dragHandle: game.i18n.localize("PURSUITTRACKER.Panel.DragHandle")
      }
    };
  }

  /**
   * Resolve the panel label. The world setting wins when set; otherwise we
   * fall back to the localized default. An empty/whitespace value also falls
   * back, so admins can clear the field to revert to the default.
   */
  #resolveLabel() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.PANEL_LABEL);
    if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    return game.i18n.localize("PURSUITTRACKER.Settings.PanelLabel.Default");
  }

  /** Compute the per-stage icons + dot percentage. */
  #enrichTracker(t) {
    const stages = Array.from({ length: t.stages }, (_, i) => ({
      index: i,
      icon: resolveStageIcon(t, i),
      active: i === t.currentStage,
      passed: i < t.currentStage
    }));
    const denom = Math.max(1, t.stages - 1);
    return {
      ...t,
      displayName: t.name?.trim() || game.i18n.localize("PURSUITTRACKER.Tracker.Untitled"),
      stagesArray: stages,
      denom,
      dotPercent: (t.currentStage / denom) * 100,
      currentStageDisplay: t.currentStage + 1,
      // Whether the current viewer can change this tracker's stage. The
      // template uses this to gate advance/retreat buttons and to disable
      // the stage buttons + drag dot when read-only.
      canModify: canModifyTracker(game.user, t)
    };
  }

  /* ---------------------------- Render hooks ---------------------------- */

  /** Window resize listener — bound once, removed on close. */
  #onWindowResize = null;

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    // Initial position lands the panel where the user's setting says.
    this.#applyDockPosition();
    // Re-anchor docked positions when the window resizes so they stay flush
    // against the (newly-sized) viewport edges.
    this.#onWindowResize = foundry.utils.debounce(() => this.#applyDockPosition(), 100);
    window.addEventListener("resize", this.#onWindowResize);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;

    // Dataset attrs drive body expand/align styling in CSS.
    root.dataset.position = context.position;
    root.dataset.collapsed = String(!!context.collapsed);
    root.dataset.locked = String(!!context.locked);
    root.style.setProperty("--pt-scale", context.scale);
    root.style.setProperty("--pt-collapse-delay", `${this.#collapseDelay}s`);

    // Compute and write the body overlay direction (data-expand / data-align)
    // here so it stays in sync with the current dock position even when the
    // dock corner changes.
    this.#updateBodyOrient(root, context.position);

    // Re-apply the dock position on every render (cheap setPosition call).
    // This handles the case where the user changes the position setting:
    // refreshLayout fires render(), and then the panel relocates.
    if (!options.isFirstRender) this.#applyDockPosition();

    this.#bindHover(root, context.autoCollapse);
    this.#bindDrag(root);
    this.#enableFreeFloatDrag();
    this.#kickIdleTimer(context.autoCollapse, context.collapsed);
  }

  async close(options) {
    if (this.#onWindowResize) {
      window.removeEventListener("resize", this.#onWindowResize);
      this.#onWindowResize = null;
    }
    this.#rootBound = false;
    return super.close(options);
  }

  /* ---------------------------- Positioning (V13-native) ---------------------------- */

  /**
   * Compute (left, top) for the chosen dock and hand it to setPosition.
   * setPosition is V13's canonical positioning API — it writes the inline
   * styles and the framework keeps them consistent across re-renders.
   */
  #applyDockPosition() {
    if (!this.element) return;
    const pos = game.settings.get(MODULE_ID, SETTINGS.PANEL_POSITION);
    const rect = this.element.getBoundingClientRect();
    // Panel rect can read as 0 on the first call before layout settles —
    // fall back to a tab-sized estimate so we don't compute nonsense.
    const w = rect.width || 100;
    const h = rect.height || 32;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const chrome = getChromeOffsets();

    if (pos === POSITIONS.FREE) {
      const x = Number(game.settings.get(MODULE_ID, SETTINGS.PANEL_FREE_X)) || 100;
      const y = Number(game.settings.get(MODULE_ID, SETTINGS.PANEL_FREE_Y)) || 100;
      const { x: cx, y: cy } = this.#clampFree(x, y, this.element);
      this.setPosition({ left: cx, top: cy });
      this.#updateBodyOrient(this.element, pos);
      return;
    }

    let left;
    let top;
    switch (pos) {
      case POSITIONS.TOP_LEFT:
        left = chrome.left;
        top = chrome.top;
        break;
      case POSITIONS.TOP_RIGHT:
        left = vw - chrome.right - w;
        top = chrome.top;
        break;
      case POSITIONS.TOP_CENTER:
        left = (chrome.left + (vw - chrome.right) - w) / 2;
        top = chrome.top;
        break;
      case POSITIONS.BOTTOM_LEFT:
        left = chrome.left;
        top = vh - chrome.bottom - h;
        break;
      case POSITIONS.BOTTOM_RIGHT:
        left = vw - chrome.right - w;
        top = vh - chrome.bottom - h;
        break;
      case POSITIONS.BOTTOM_CENTER:
        left = (chrome.left + (vw - chrome.right) - w) / 2;
        top = vh - chrome.bottom - h;
        break;
      case POSITIONS.LEFT:
        left = chrome.left;
        top = (chrome.top + (vh - chrome.bottom) - h) / 2;
        break;
      case POSITIONS.RIGHT:
        left = vw - chrome.right - w;
        top = (chrome.top + (vh - chrome.bottom) - h) / 2;
        break;
      default:
        left = vw - chrome.right - w;
        top = chrome.top;
    }

    this.setPosition({ left, top });
    this.#updateBodyOrient(this.element, pos);
  }

  /**
   * Pick the body overlay's expand/align attributes for the current dock
   * (or the live xy in free-float). The body grows INTO the screen, never
   * back toward the anchored edge.
   */
  #updateBodyOrient(root, pos) {
    let expand;
    let align;
    switch (pos) {
      case POSITIONS.TOP_LEFT:    expand = "right"; align = "start";  break;
      case POSITIONS.TOP_RIGHT:   expand = "left";  align = "start";  break;
      case POSITIONS.TOP_CENTER:  expand = "down";  align = "center"; break;
      case POSITIONS.BOTTOM_LEFT: expand = "right"; align = "end";    break;
      case POSITIONS.BOTTOM_RIGHT:expand = "left";  align = "end";    break;
      case POSITIONS.BOTTOM_CENTER:expand = "up";   align = "center"; break;
      case POSITIONS.LEFT:        expand = "right"; align = "center"; break;
      case POSITIONS.RIGHT:       expand = "left";  align = "center"; break;
      case POSITIONS.FREE: {
        const left = this.position?.left ?? 0;
        const top = this.position?.top ?? 0;
        const w = root.offsetWidth || 100;
        const h = root.offsetHeight || 32;
        const cx = left + w / 2;
        const cy = top + h / 2;
        expand = cx < window.innerWidth / 2 ? "right" : "left";
        if (cy < window.innerHeight / 3) align = "start";
        else if (cy > (2 * window.innerHeight) / 3) align = "end";
        else align = "center";
        break;
      }
      default: expand = "left"; align = "start";
    }
    root.dataset.expand = expand;
    root.dataset.align = align;
  }

  /* ---------------------------- Public API ---------------------------- */

  /**
   * Decide whether the panel should be visible at all, then render or close
   * accordingly. Non-GMs only see the panel when at least one tracker is
   * marked visibleToPlayers — so adding/removing a player-visible tracker on
   * the GM client lights up / hides the panel for every player in real time
   * (the world setting change fires updateSetting on every connected client,
   * which calls this method).
   */
  async refreshLayout() {
    const isGM = game.user.isGM;
    const restrict = game.settings.get(MODULE_ID, SETTINGS.RESTRICT_TO_GM);
    const visibleCount = TrackerStore.visibleFor(game.user).length;
    // GMs always see the panel (so they can manage trackers).
    // Players see it only when not restricted AND there's at least one
    // tracker marked visibleToPlayers — so the pull tab vanishes when no
    // tracker is visible to them, and reappears the instant the GM toggles
    // one on.
    const shouldShow = isGM || (!restrict && visibleCount > 0);

    if (!shouldShow) {
      if (this.rendered) await this.close({ animate: false });
      return;
    }
    if (!this.rendered) {
      await this.render({ force: true });
    } else {
      await this.render();
    }
  }

  toggleCollapsed() {
    const cur = game.settings.get(MODULE_ID, SETTINGS.PANEL_COLLAPSED);
    return this.#setCollapsed(!cur);
  }

  /* ---------------------------- Internals ---------------------------- */

  get #collapseDelay() {
    return game.settings.get(MODULE_ID, SETTINGS.AUTO_COLLAPSE_DELAY) ?? 6;
  }

  async #setCollapsed(collapsed) {
    await game.settings.set(MODULE_ID, SETTINGS.PANEL_COLLAPSED, collapsed);
    if (this.element) this.element.dataset.collapsed = String(collapsed);
  }

  #bindHover(root, autoCollapse) {
    // Root listeners only need to be bound once; per-render listeners (drag, etc.)
    // are reapplied after each re-render in #bindDrag.
    if (this.#rootBound) return;
    this.#rootBound = true;
    if (!autoCollapse) return;
    const expand = () => {
      if (root.dataset.collapsed === "true") this.#setCollapsed(false);
      this.#kickIdleTimer(true, false);
    };
    root.addEventListener("mouseenter", expand);
    root.addEventListener("mousemove", () => this.#kickIdleTimer(true, false));
    root.addEventListener("mouseleave", () => this.#kickIdleTimer(true, false));
  }

  #kickIdleTimer(autoCollapse, currentlyCollapsed) {
    if (this.#idleTimer) {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }
    if (!autoCollapse || currentlyCollapsed) return;
    this.#idleTimer = setTimeout(() => {
      // Don't collapse mid-drag.
      if (this.#drag) return;
      // Don't collapse if pointer is still inside.
      if (this.element?.matches(":hover")) {
        this.#kickIdleTimer(true, false);
        return;
      }
      this.#setCollapsed(true);
    }, this.#collapseDelay * 1000);
  }

  /* ---------------------------- Free float ---------------------------- */

  /**
   * Keep the panel reachable: at least a sliver remains on-screen so the
   * user can grab it again. The clamp deliberately ignores Foundry chrome —
   * free-float is the user's flexible escape hatch, so they can park it
   * anywhere, including over the sidebar/hotbar if they want.
   */
  #clampFree(x, y, root) {
    const w = root.offsetWidth || 100;
    const h = root.offsetHeight || 32;
    const reachable = 48;
    const minX = -(w - reachable);
    const minY = -(h - reachable);
    const maxX = window.innerWidth - reachable;
    const maxY = window.innerHeight - reachable;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  }

  /**
   * Plain pointer-event drag. We don't use Foundry's Draggable utility here
   * because we want fine control over what's allowed (lock check, mode
   * check, click-vs-drag distinction) and what happens on release (persist
   * to a client setting, recompute body orient). The output goes through
   * `setPosition` so the panel stays in sync with the framework.
   *
   * Bind-once-per-render: the header element is recreated on every render,
   * so a flag on the handle (cleared automatically when the element is
   * replaced) prevents double-binding within a single render and lets
   * future renders rebind cleanly on the fresh node.
   */
  #enableFreeFloatDrag() {
    const root = this.element;
    if (!root) return;
    const handle = root.querySelector(".pt-drag-handle");
    if (!handle || handle.dataset.ptDragBound === "true") return;
    handle.dataset.ptDragBound = "true";

    let session = null;

    const onDown = (ev) => {
      if (ev.button !== 0) return;
      if (game.settings.get(MODULE_ID, SETTINGS.PANEL_POSITION) !== POSITIONS.FREE) return;
      if (game.settings.get(MODULE_ID, SETTINGS.PANEL_LOCKED)) return;
      // Don't start a drag when the user is clicking a control inside the
      // header (lock toggle, anything with a data-action).
      if (ev.target.closest("button, [data-action]")) return;
      ev.preventDefault();

      const r = root.getBoundingClientRect();
      session = {
        offsetX: ev.clientX - r.left,
        offsetY: ev.clientY - r.top,
        moved: false,
        pointerId: ev.pointerId
      };
      handle.classList.add("pt-floating");
      // Capture so we keep getting events even if the cursor leaves the tab.
      try { handle.setPointerCapture(ev.pointerId); } catch (_) { /* no-op */ }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    };

    const onMove = (ev) => {
      if (!session) return;
      // Only count as a drag once movement crosses a small threshold —
      // avoids hijacking accidental clicks.
      if (!session.moved) {
        const dx = Math.abs(ev.clientX - (ev.clientX - 0)); // touched to keep variable
        if (Math.hypot(ev.movementX || 0, ev.movementY || 0) > 0) session.moved = true;
      }
      const next = this.#clampFree(
        ev.clientX - session.offsetX,
        ev.clientY - session.offsetY,
        root
      );
      this.setPosition({ left: next.x, top: next.y });
      this.#updateBodyOrient(root, POSITIONS.FREE);
    };

    const onUp = async (ev) => {
      if (!session) return;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      try { handle.releasePointerCapture(session.pointerId); } catch (_) { /* no-op */ }
      handle.classList.remove("pt-floating");
      const ended = session;
      session = null;
      if (!ended.moved) return;
      const left = this.position?.left;
      const top = this.position?.top;
      if (typeof left !== "number" || typeof top !== "number") return;
      await game.settings.set(MODULE_ID, SETTINGS.PANEL_FREE_X, left);
      await game.settings.set(MODULE_ID, SETTINGS.PANEL_FREE_Y, top);
    };

    handle.addEventListener("pointerdown", onDown);
  }

  /* ---------------------------- Drag-to-snap ---------------------------- */

  #bindDrag(root) {
    // Wire on every tracker row, but check permission at fire time so a
    // tracker that becomes player-editable mid-session immediately starts
    // accepting drags from the player without re-binding.
    root.querySelectorAll("[data-tracker-id]").forEach((trackerEl) => {
      const dot = trackerEl.querySelector(".pt-status-dot");
      const slider = trackerEl.querySelector(".pt-slider");
      if (!dot || !slider) return;
      dot.addEventListener("pointerdown", (ev) => this.#onDragStart(ev, trackerEl, slider, dot));
    });
  }

  #onDragStart(ev, trackerEl, slider, dot) {
    const id = trackerEl.dataset.trackerId;
    const tracker = TrackerStore.get(id);
    if (!canModifyTracker(game.user, tracker)) return;
    ev.preventDefault();
    const vertical = this.element?.dataset.position === POSITIONS.LEFT
      || this.element?.dataset.position === POSITIONS.RIGHT;
    const rect = slider.getBoundingClientRect();
    this.#drag = { id, tracker, slider, dot, vertical, rect };
    dot.setPointerCapture(ev.pointerId);
    dot.addEventListener("pointermove", this.#onDragMove);
    dot.addEventListener("pointerup", this.#onDragEnd);
    dot.addEventListener("pointercancel", this.#onDragEnd);
    trackerEl.classList.add("pt-dragging");
  }

  #onDragMove = (ev) => {
    if (!this.#drag) return;
    const { vertical, rect } = this.#drag;
    const ratio = vertical
      ? (ev.clientY - rect.top) / Math.max(1, rect.height)
      : (ev.clientX - rect.left) / Math.max(1, rect.width);
    const clamped = Math.max(0, Math.min(1, ratio));
    // Live-preview the dot position without committing.
    this.#drag.dot.style.setProperty("--pt-dot", `${clamped * 100}%`);
    this.#drag.previewRatio = clamped;
  };

  #onDragEnd = async (ev) => {
    const drag = this.#drag;
    if (!drag) return;
    this.#drag = null;
    drag.dot.releasePointerCapture?.(ev.pointerId);
    drag.dot.removeEventListener("pointermove", this.#onDragMove);
    drag.dot.removeEventListener("pointerup", this.#onDragEnd);
    drag.dot.removeEventListener("pointercancel", this.#onDragEnd);
    const trackerEl = drag.dot.closest("[data-tracker-id]");
    trackerEl?.classList.remove("pt-dragging");

    const ratio = drag.previewRatio ?? drag.tracker.currentStage / Math.max(1, drag.tracker.stages - 1);
    const snapped = Math.round(ratio * (drag.tracker.stages - 1));
    if (snapped !== drag.tracker.currentStage) {
      // Routes through the GM client when the dragger is a player.
      await requestStageChange(drag.tracker, snapped);
    } else {
      // No commit needed; restore exact dot position.
      this.render();
    }
  };

  /* ---------------------------- Action handlers ---------------------------- */

  static async #onCreate(_event, _target) {
    if (!assertGM()) return;
    const t = await TrackerStore.create({
      background: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_BACKGROUND),
      statusIcon: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_STATUS_ICON)
    });
    new TrackerConfig({ trackerId: t.id }).render({ force: true });
  }

  static async #onEdit(_event, target) {
    if (!assertGM()) return;
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    if (!id) return;
    new TrackerConfig({ trackerId: id }).render({ force: true });
  }

  static async #onDelete(_event, target) {
    if (!assertGM()) return;
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    if (!id) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "PURSUITTRACKER.Config.ConfirmDelete" },
      content: `<p>${game.i18n.localize("PURSUITTRACKER.Config.ConfirmDeleteHint")}</p>`,
      modal: true
    });
    if (!ok) return;
    await TrackerStore.delete(id);
    ui.notifications.info(game.i18n.localize("PURSUITTRACKER.Notifications.Deleted"));
  }

  static async #onToggleVisibility(_event, target) {
    if (!assertGM()) return;
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    const t = TrackerStore.get(id);
    if (!t) return;
    await TrackerStore.update(id, { visibleToPlayers: !t.visibleToPlayers });
  }

  static async #onAdvance(_event, target) {
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    const t = TrackerStore.get(id);
    if (!canModifyTracker(game.user, t)) return;
    await requestStageChange(t, t.currentStage + 1);
  }

  static async #onRetreat(_event, target) {
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    const t = TrackerStore.get(id);
    if (!canModifyTracker(game.user, t)) return;
    await requestStageChange(t, t.currentStage - 1);
  }

  static async #onStageClick(_event, target) {
    const id = target.closest("[data-tracker-id]")?.dataset.trackerId;
    const stage = Number(target.dataset.stage);
    if (!Number.isFinite(stage)) return;
    const t = TrackerStore.get(id);
    if (!canModifyTracker(game.user, t)) return;
    await requestStageChange(t, stage);
  }

  static #onCollapseToggle() {
    this.toggleCollapsed();
  }

  static async #onOpenSettings() {
    const app = new foundry.applications.settings.SettingsConfig();
    await app.render({ force: true });

    // Deep-link to our module's section. SettingsConfig uses a tab group
    // ("categories") keyed by module id; if the API isn't present (older
    // versions / system overrides), fall back to clicking the matching nav
    // entry, then to scrolling the heading into view.
    const navigate = () => {
      try {
        if (typeof app.changeTab === "function") {
          app.changeTab(MODULE_ID, "categories");
          return true;
        }
      } catch (_) { /* ignore — fall through */ }

      const root = app.element;
      if (!root) return false;
      const navEntry = root.querySelector(
        `[data-tab="${MODULE_ID}"], [data-category="${MODULE_ID}"], a[href="#${MODULE_ID}"]`
      );
      if (navEntry instanceof HTMLElement) {
        navEntry.click();
        return true;
      }
      // Last resort: find a heading whose text matches our module title.
      const title = game.modules.get(MODULE_ID)?.title;
      if (title) {
        for (const h of root.querySelectorAll("h2, h3, header, .form-header")) {
          if (h.textContent?.trim() === title) {
            h.scrollIntoView({ behavior: "smooth", block: "start" });
            h.classList.add("pt-settings-flash");
            setTimeout(() => h.classList.remove("pt-settings-flash"), 1600);
            return true;
          }
        }
      }
      return false;
    };

    // Defer until after the V2 render cycle — element may not be in DOM yet.
    requestAnimationFrame(() => {
      if (!navigate()) requestAnimationFrame(navigate);
    });
  }

  static async #onToggleLock() {
    const cur = game.settings.get(MODULE_ID, SETTINGS.PANEL_LOCKED);
    const next = !cur;
    // Update the visible state immediately so the user sees the icon flip
    // and the cursor change without waiting for a re-render. The setting
    // persists in the background — its onChange fires a full refresh later
    // for state correctness, but the UI is already in the right place.
    if (this.element) {
      this.element.dataset.locked = String(next);
      const iconEl = this.element.querySelector('[data-action="toggleLock"] i');
      if (iconEl) {
        iconEl.classList.toggle("fa-lock", next);
        iconEl.classList.toggle("fa-lock-open", !next);
      }
    }
    await game.settings.set(MODULE_ID, SETTINGS.PANEL_LOCKED, next);
  }
}
