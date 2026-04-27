/**
 * Compute the rectangle of viewport space NOT occupied by Foundry's chrome
 * (sidebar, scene controls, navigation, hotbar, players list, camera dock)
 * and expose it to the panel as four CSS variables:
 *
 *   --pt-safe-top     px from top
 *   --pt-safe-right   px from right
 *   --pt-safe-bottom  px from bottom
 *   --pt-safe-left    px from left
 *
 * The panel's CSS adds a small gutter and uses these values to anchor itself,
 * so it never overlaps Foundry's UI even when the user expands/collapses the
 * sidebar, opens the camera dock, or resizes the window.
 *
 * Updates are driven by a single ResizeObserver across all chrome elements,
 * plus a `resize` listener and a handful of Foundry render/collapse hooks for
 * cases the ResizeObserver alone misses (e.g. the sidebar fully detaching).
 */

/**
 * Built-in chrome selectors. Includes core Foundry UI plus a few popular
 * UI-overhaul / HUD modules. Other modules can extend this set at runtime
 * via `game.modules.get("pursuittracker").api.registerChromeSelector(...)`.
 */
const BUILTIN_CHROME_SELECTORS = [
  // --- Core Foundry ---
  // Top bands
  "#navigation",
  "#ui-top",
  // Left rails
  "#controls",
  "#ui-left",
  "#scene-controls",
  // Right sidebar
  "#sidebar",
  "#ui-right",
  // Bottom bands
  "#hotbar",
  "#players",
  "#ui-bottom",
  "#camera-views",
  ".camera-views",

  // --- Carolingian UI ---
  // (Carolingian re-uses Foundry IDs above for sidebar/players/hotbar, but
  //  also adds its own minibar at the top and a player-portraits stack.)
  "#crlngn-minibar",
  ".crlngn-minibar",
  "#players-list",
  ".crlngn-players",
  ".crlngn-character-portraits",
  ".crlngn-portraits",
  "#crlngn-bottom-tray",
  "#crlngn-top-tray",

  // --- Common HUD modules (best-effort) ---
  "#tokenactionhud",
  "#argon-combat-hud",
  ".argon-combat-hud",
  "#minimal-ui-control-bar"
];

/** Runtime-extensible selector list. */
const userSelectors = new Set();

/** Public: let other modules register additional chrome selectors. */
export function registerChromeSelector(selector) {
  if (typeof selector !== "string" || !selector.trim()) return;
  userSelectors.add(selector.trim());
}

const SIDE_HOOKS = [
  "renderSidebar",
  "renderSidebarTab",
  "collapseSidebar",
  "renderSceneNavigation",
  "renderSceneControls",
  "renderHotbar",
  "renderPlayers",
  "renderPlayerList",
  "renderCameraViews",
  "rtcSettingsChanged"
];

export class UISafeArea {
  /** The panel element receiving the CSS vars. */
  #target;
  #observer;
  #raf = 0;
  #onResize = () => this.scheduleRefresh();
  #hookIds = [];

  constructor(target) {
    this.#target = target;
  }

  start() {
    this.#observer = new ResizeObserver(() => this.scheduleRefresh());
    this.#observe();
    window.addEventListener("resize", this.#onResize);
    for (const hook of SIDE_HOOKS) {
      const id = Hooks.on(hook, () => {
        this.#observe();
        this.scheduleRefresh();
      });
      this.#hookIds.push([hook, id]);
    }
    // Initial paint after layout settles.
    requestAnimationFrame(() => this.refresh());
  }

  stop() {
    this.#observer?.disconnect();
    this.#observer = null;
    window.removeEventListener("resize", this.#onResize);
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
    if (this.#raf) cancelAnimationFrame(this.#raf);
  }

  /** Re-attach the observer to whichever chrome elements currently exist. */
  #observe() {
    if (!this.#observer) return;
    this.#observer.disconnect();
    for (const sel of UISafeArea.allSelectors()) {
      for (const el of document.querySelectorAll(sel)) {
        this.#observer.observe(el);
      }
    }
    if (document.body) this.#observer.observe(document.body);
  }

  static allSelectors() {
    return [...BUILTIN_CHROME_SELECTORS, ...userSelectors];
  }

  scheduleRefresh() {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      this.refresh();
    });
  }

  refresh() {
    if (!this.#target?.isConnected) return;
    const safe = UISafeArea.compute();
    const t = this.#target.style;
    t.setProperty("--pt-safe-top", `${safe.top}px`);
    t.setProperty("--pt-safe-right", `${safe.right}px`);
    t.setProperty("--pt-safe-bottom", `${safe.bottom}px`);
    t.setProperty("--pt-safe-left", `${safe.left}px`);
    // Notify subscribers so JS-driven positioning can also react.
    Hooks.callAll("pursuittracker.safeAreaChanged", safe);
  }

  /**
   * Walk the chrome elements once, returning the max extent each edge of the
   * viewport is occluded. Hidden / zero-size elements are skipped.
   */
  static compute() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = 0;
    let right = 0;
    let bottom = 0;
    let left = 0;

    for (const sel of UISafeArea.allSelectors()) {
      for (const el of document.querySelectorAll(sel)) {
        if (!UISafeArea.#isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        // Reject elements that span the entire viewport (overlay layers).
        const fullWidth = r.width >= vw - 1;
        const fullHeight = r.height >= vh - 1;
        if (fullWidth && fullHeight) continue;

        // Classify by which edge the element is anchored to. Tolerance is
        // generous because some module HUDs (Carolingian, Argon, etc.) inset
        // their UI a few pixels for shadow/border effects.
        const TOL = 32;
        const anchoredLeft = r.left <= TOL;
        const anchoredRight = r.right >= vw - TOL;
        const anchoredTop = r.top <= TOL;
        const anchoredBottom = r.bottom >= vh - TOL;

        if (!fullWidth && anchoredLeft && !anchoredRight) {
          left = Math.max(left, r.right);
        } else if (!fullWidth && anchoredRight && !anchoredLeft) {
          right = Math.max(right, vw - r.left);
        } else if (!fullHeight && anchoredTop && !anchoredBottom) {
          top = Math.max(top, r.bottom);
        } else if (!fullHeight && anchoredBottom && !anchoredTop) {
          bottom = Math.max(bottom, vh - r.top);
        }
      }
    }
    return { top, right, bottom, left };
  }

  static #isVisible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (parseFloat(cs.opacity) === 0) return false;
    // offsetParent === null catches `display:none` ancestors too.
    if (el.offsetParent === null && cs.position !== "fixed") return false;
    return true;
  }
}
