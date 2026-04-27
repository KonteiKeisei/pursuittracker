import { MODULE_ID, SETTINGS, REMINDER_SOURCE } from "../constants.js";
import { TrackerStore } from "../data/tracker-store.js";

/**
 * Daily reminder. The GM is the only client that fires the prompt — players
 * don't see it. We hook into whichever calendar/rest module the user
 * configured, defaulting to whichever is installed (Calendaria preferred).
 */
export function registerDailyReminder() {
  Hooks.once("ready", () => {
    if (!game.user.isGM) return;
    const choice = resolveSource();
    switch (choice) {
      case REMINDER_SOURCE.CALENDARIA:
        bindCalendaria();
        break;
      case REMINDER_SOURCE.REST_RECOVERY:
        bindRestRecovery();
        break;
      default:
        // none / no module installed → silent.
        break;
    }
  });
}

function resolveSource() {
  const setting = game.settings.get(MODULE_ID, SETTINGS.DAILY_REMINDER);
  if (setting === REMINDER_SOURCE.NONE) return REMINDER_SOURCE.NONE;
  const hasCalendaria = !!game.modules.get("calendaria")?.active;
  const hasRest = !!game.modules.get("rest-recovery")?.active;
  if (setting === REMINDER_SOURCE.CALENDARIA) return hasCalendaria ? setting : REMINDER_SOURCE.NONE;
  if (setting === REMINDER_SOURCE.REST_RECOVERY) return hasRest ? setting : REMINDER_SOURCE.NONE;
  // Auto: prefer Calendaria; fall back to Rest Recovery; else none.
  if (hasCalendaria) return REMINDER_SOURCE.CALENDARIA;
  if (hasRest) return REMINDER_SOURCE.REST_RECOVERY;
  return REMINDER_SOURCE.NONE;
}

function bindCalendaria() {
  // Hook signature: ({ previous, current, calendar }) => void
  Hooks.on("calendaria.dayChange", () => promptDailyReminder());
}

function bindRestRecovery() {
  // Rest Recovery 5e fires hooks on rest completion. We listen for any
  // long-rest completion that flagged the day as new. Hook name varies by
  // version; we listen on a couple of likely candidates and de-dupe.
  let lastFired = 0;
  const debounce = () => {
    const now = Date.now();
    if (now - lastFired < 2000) return false;
    lastFired = now;
    return true;
  };
  Hooks.on("restCompleted", (_actor, data) => {
    if (data?.longRest && data?.newDay && debounce()) promptDailyReminder();
  });
  Hooks.on("rest-recovery.restCompleted", (_actor, data) => {
    if (data?.longRest && data?.newDay && debounce()) promptDailyReminder();
  });
}

async function promptDailyReminder() {
  const trackers = TrackerStore.read();
  if (trackers.length === 0) return;
  const summary = trackers
    .map((t) => `<li><strong>${foundry.utils.escapeHTML(t.name || "—")}</strong>: ${t.currentStage + 1}/${t.stages}</li>`)
    .join("");
  await foundry.applications.api.DialogV2.wait({
    window: { title: "PURSUITTRACKER.Reminder.Title" },
    content: `
      <p>${game.i18n.localize("PURSUITTRACKER.Reminder.Body")}</p>
      <ul>${summary}</ul>
    `,
    buttons: [
      {
        action: "open",
        label: "PURSUITTRACKER.Reminder.Open",
        default: true,
        callback: () => {
          const panel = game.modules.get(MODULE_ID)?.api?.panel;
          panel?.refreshLayout();
          // Force-expand if collapsed.
          if (panel?.element?.dataset.collapsed === "true") panel.toggleCollapsed();
        }
      },
      { action: "dismiss", label: "PURSUITTRACKER.Reminder.Dismiss" }
    ]
  });
}
