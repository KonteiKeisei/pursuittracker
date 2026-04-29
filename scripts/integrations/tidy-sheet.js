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
      const trackers = TrackerStore.visibleFor(game.user).map(enrichTracker);
      // Namespaced under `pursuittracker` so we don't collide with whatever
      // the sheet itself put on `context`.
      context.pursuittracker = {
        label: resolvePanelLabel(),
        trackers,
        hasTrackers: trackers.length > 0,
        isGM: game.user.isGM,
        i18n: {
          empty: game.i18n.localize("PURSUITTRACKER.Panel.NoTrackers"),
          adv: game.i18n.localize("PURSUITTRACKER.Tracker.AdvanceStage"),
          ret: game.i18n.localize("PURSUITTRACKER.Tracker.RetreatStage")
        }
      };
      return context;
    },
    onRender: ({ tabContentsElement }) => {
      if (!tabContentsElement) return;
      bindTrackerInteractions(tabContentsElement, { vertical: false });
    }
  });

  // Same tab definition serves both layouts.
  api.registerCharacterTab(tab, { autoHeight: false });
  api.registerNpcTab(tab, { autoHeight: false });
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
