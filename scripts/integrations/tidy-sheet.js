/**
 * Tidy 5e Sheets integration. Adds a "Pursuits" tab to character and NPC
 * sheets that mirrors the floating panel — same trackers, same controls,
 * same permission model. The tab title uses whatever label the GM has
 * configured (the world setting), so renaming the tracker module to
 * "Chase" or "Quests" carries through to the sheet tab automatically.
 *
 * Tidy is detected via its `tidy5e-sheet.ready` hook; if the module isn't
 * installed or enabled, this integration is a no-op.
 */

import { MODULE_ID, SETTINGS } from "../constants.js";
import { TrackerStore } from "../data/tracker-store.js";
import {
  bindTrackerInteractions,
  enrichTracker,
  resolvePanelLabel
} from "../utils/tracker-shared.js";

const TAB_ID = `${MODULE_ID}-pursuits`;

export function registerTidyIntegration() {
  Hooks.once("tidy5e-sheet.ready", (api) => {
    try {
      registerTab(api);
    } catch (err) {
      console.error(`${MODULE_ID} | Tidy 5e tab registration failed:`, err);
    }
  });

  // When the tracker list or label changes, ask any open Tidy sheets to
  // re-render so the tab shows the new state. The Tidy lifecycle re-runs
  // our `getData` and `onRender` on the way through.
  Hooks.on(`${MODULE_ID}.dataChanged`, refreshOpenTidySheets);
}

function registerTab(api) {
  const TabClass = api?.models?.HandlebarsTab;
  if (typeof TabClass !== "function") {
    console.warn(`${MODULE_ID} | Tidy 5e API exposes no HandlebarsTab class — integration disabled.`);
    return;
  }

  const tab = new TabClass({
    tabId: TAB_ID,
    // Function form so Tidy resolves the label on every render — renaming
    // the tracker module live is reflected in the tab strip without a reload.
    title: () => resolvePanelLabel(),
    path: `modules/${MODULE_ID}/templates/tracker-tab.hbs`,
    iconClass: "fa-solid fa-bullseye-arrow",
    tabContentsClasses: ["pursuittracker", "pursuittracker-tab"],
    enabled: () => {
      // GMs always see the tab so they can manage trackers from the sheet.
      // Players see it only when at least one tracker is visible to them —
      // matches the visibility rule on the floating panel.
      if (game.user.isGM) return true;
      const restricted = game.settings.get(MODULE_ID, SETTINGS.RESTRICT_TO_GM);
      if (restricted) return false;
      return TrackerStore.visibleFor(game.user).length > 0;
    },
    getData: async (context) => {
      // Belt and suspenders on visibility: TrackerStore.visibleFor already
      // filters by `user.isGM` / `tracker.visibleToPlayers`, but we re-check
      // the same predicate here so a future regression in the store can't
      // leak GM-only trackers into a player's sheet.
      const isGM = !!game.user?.isGM;
      const restricted = !!game.settings.get(MODULE_ID, SETTINGS.RESTRICT_TO_GM);
      const raw = TrackerStore.visibleFor(game.user);
      const filtered = isGM
        ? raw
        : (restricted ? [] : raw.filter((t) => !!t.visibleToPlayers));
      const trackers = filtered.map(enrichTracker);

      // Namespaced under `pursuittracker` so we don't collide with whatever
      // the sheet itself put on `context`.
      context.pursuittracker = {
        label: resolvePanelLabel(),
        trackers,
        hasTrackers: trackers.length > 0,
        isGM,
        i18n: {
          empty: game.i18n.localize("PURSUITTRACKER.Panel.NoTrackers"),
          adv: game.i18n.localize("PURSUITTRACKER.Tracker.AdvanceStage"),
          ret: game.i18n.localize("PURSUITTRACKER.Tracker.RetreatStage"),
          vis: game.i18n.localize("PURSUITTRACKER.Tracker.ToggleVisibility"),
          edit: game.i18n.localize("PURSUITTRACKER.Tracker.Edit"),
          del: game.i18n.localize("PURSUITTRACKER.Tracker.Delete")
        }
      };
      return context;
    },
    onRender: ({ tabContentsElement }) => {
      if (!tabContentsElement) return;
      bindTrackerInteractions(tabContentsElement, { vertical: false });
      // Inline-style backstop. Tidy's Svelte component CSS keeps clamping
      // our numbered stage sizes via `[data-svelte-...]` selectors that
      // out-specificity our three-class rules, even with !important. Inline
      // styles with the `important` priority sit above any CSS short of
      // browser-default user-agent !important — the only thing that
      // reliably wins. Reads from the same CSS variables when available so
      // theme overrides via --pt-stage-size still flow through.
      forceStageSizing(tabContentsElement);
    }
  });

  // Same tab definition serves both layouts.
  api.registerCharacterTab(tab, { autoHeight: false });
  api.registerNpcTab(tab, { autoHeight: false });
}

/**
 * Force the stage dimensions inline. Tidy's Svelte component CSS
 * scopes its resets via attribute selectors that out-specificity any
 * three-class rule we can write, and inline styles with the `important`
 * priority are the only safe winning move.
 *
 * Sizes read from the live CSS custom properties (so a user theming the
 * panel via `--pt-stage-size` still propagates here) and fall back to the
 * panel defaults if the cascade can't resolve them.
 */
/**
 * Force the stage dimensions inline. Static values, no var() lookup
 * — the cascade was unreliable under Tidy's component CSS, and we'd
 * rather have a known-good size than a "correct" expression that resolves
 * to something microscopic. Update these constants together with the CSS
 * literals in the .pt-tab-root rules.
 */
const TAB_STAGE_SIZE_PX = 30;

function forceStageSizing(root) {
  const stageSize = `${TAB_STAGE_SIZE_PX}px`;
  const sliderHeight = `${TAB_STAGE_SIZE_PX + 16}px`;

  const setSize = (el, w, h) => {
    el.style.setProperty("width", w, "important");
    el.style.setProperty("height", h, "important");
    el.style.setProperty("max-width", "none", "important");
    el.style.setProperty("max-height", "none", "important");
  };
  // Tidy's component CSS gives every <button> a default
  //   padding: 0px 12px 0.5px
  // which inside a 30px stage button collapses the icon's content area
  // to ~6px. Override with !important inline so it can't survive.
  const stripButtonPadding = (el) => {
    el.style.setProperty("padding", "0", "important");
    el.style.setProperty("box-sizing", "border-box", "important");
    el.style.setProperty("min-width", "0", "important");
    el.style.setProperty("min-height", "0", "important");
  };
  for (const stage of root.querySelectorAll(".pt-stage")) {
    setSize(stage, stageSize, stageSize);
    const btn = stage.querySelector(".pt-stage-btn");
    if (!btn) continue;
    setSize(btn, "100%", "100%");
    stripButtonPadding(btn);
    btn.style.setProperty("display", "grid", "important");
    btn.style.setProperty("place-items", "center", "important");
    btn.style.setProperty("border", "2px solid var(--pt-accent, #d2b15a)", "important");
    btn.style.setProperty("border-radius", "50%", "important");
    btn.style.setProperty("background", "rgba(18, 18, 24, 0.96)", "important");
    btn.style.setProperty("color", "var(--pt-accent-strong, #f1c869)", "important");
    btn.style.setProperty("font-size", "12px", "important");
    btn.style.setProperty("font-weight", "600", "important");
    btn.style.setProperty("line-height", "1", "important");
    if (stage.classList.contains("is-passed")) {
      btn.style.setProperty("background", "rgba(210, 177, 90, 0.2)", "important");
    }
    if (stage.classList.contains("is-active")) {
      btn.style.setProperty("background", "var(--pt-accent, #d2b15a)", "important");
      btn.style.setProperty("color", "#171717", "important");
      btn.style.setProperty("box-shadow", "none", "important");
    }
  }
  for (const sl of root.querySelectorAll(".pt-slider")) {
    sl.style.setProperty("height", sliderHeight, "important");
    sl.style.setProperty("min-height", sliderHeight, "important");
  }
}

/**
 * Walk every open ApplicationV2 instance, find Tidy 5e actor sheets, and
 * call render on each one. Cheap — re-render on a Tidy sheet just re-runs
 * its lifecycle, no DB hit. Used to push our tracker / label changes into
 * any sheet that's currently open.
 */
function refreshOpenTidySheets() {
  const seen = new Set();
  const visit = (app) => {
    if (!app || seen.has(app)) return;
    seen.add(app);
    if (!app.rendered) return;
    // Tidy sheets always have an actor and a constructor name with "Tidy"
    // in it; that's enough to filter without depending on Tidy's exports.
    const ctor = app?.constructor?.name ?? "";
    if (!ctor.includes("Tidy")) return;
    if (!app.actor || !["character", "npc"].includes(app.actor.type)) return;
    try { app.render(false); } catch (err) {
      console.warn(`${MODULE_ID} | failed to refresh Tidy sheet:`, err);
    }
  };

  // V13 keeps a registry of all ApplicationV2 instances. Older builds and
  // legacy apps still live on `ui.windows`. Walk both.
  const v2 = foundry.applications?.instances;
  if (v2 instanceof Map) {
    for (const app of v2.values()) visit(app);
  }
  if (ui?.windows) {
    for (const id of Object.keys(ui.windows)) visit(ui.windows[id]);
  }
}
