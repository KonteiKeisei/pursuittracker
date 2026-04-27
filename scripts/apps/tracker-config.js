import { MODULE_ID, STAGES_MIN, STAGES_MAX, PATHS } from "../constants.js";
import { TrackerStore } from "../data/tracker-store.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only editor for a single tracker. Form-based; relies on Foundry's
 * built-in formgroup styling. Uses the form-handler pattern from V13.
 */
export class TrackerConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["pursuittracker", "pursuittracker-config"],
    tag: "form",
    window: {
      title: "PURSUITTRACKER.Config.Title",
      contentClasses: ["standard-form"],
      icon: "fa-solid fa-bullseye-arrow"
    },
    position: { width: 460, height: "auto" },
    form: {
      handler: TrackerConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      pickBackground: TrackerConfig.#pickFile("background"),
      pickStatusIcon: TrackerConfig.#pickFile("statusIcon"),
      pickStageIcon: TrackerConfig.#pickStageIcon,
      delete: TrackerConfig.#onDelete
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/tracker-config.hbs`,
      root: true
    }
  };

  constructor(options = {}) {
    // Derive a stable per-tracker id so reopening the same tracker re-uses the window.
    if (options.trackerId && !options.id) options.id = `${MODULE_ID}-config-${options.trackerId}`;
    super(options);
    this.trackerId = options.trackerId;
  }

  get title() {
    const t = this.#tracker;
    const base = game.i18n.localize("PURSUITTRACKER.Config.Title");
    return t?.name ? `${base}: ${t.name}` : base;
  }

  get #tracker() {
    return TrackerStore.get(this.trackerId);
  }

  async _prepareContext() {
    const t = this.#tracker;
    if (!t) return { tracker: null };
    const stageOptions = Array.from({ length: t.stages }, (_, i) => ({
      index: i,
      label: i + 1,
      value: t.stageIcons?.[i] ?? "",
      defaultIcon: PATHS.stage(i + 1)
    }));
    const stageCounts = [];
    for (let n = STAGES_MIN; n <= STAGES_MAX; n++) stageCounts.push(n);
    return {
      tracker: t,
      stageCounts,
      stageOptions,
      stagesMin: STAGES_MIN,
      stagesMax: STAGES_MAX,
      currentStageOptions: Array.from({ length: t.stages }, (_, i) => ({
        value: i,
        label: i + 1
      }))
    };
  }

  /* ---------------------------- Form submission ---------------------------- */

  static async #onSubmit(_event, _form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const stages = Math.max(STAGES_MIN, Math.min(STAGES_MAX, Number(data.stages) || STAGES_MIN));
    const currentStage = Math.max(0, Math.min(stages - 1, Number(data.currentStage) || 0));

    // Collect per-stage icon overrides (sparse object → array).
    const stageIcons = [];
    if (data.stageIcons && typeof data.stageIcons === "object") {
      for (let i = 0; i < stages; i++) {
        stageIcons.push(data.stageIcons[i] ?? "");
      }
    }

    await TrackerStore.update(this.trackerId, {
      name: String(data.name ?? "").trim(),
      stages,
      currentStage,
      visibleToPlayers: !!data.visibleToPlayers,
      playerEditable: !!data.playerEditable,
      background: String(data.background ?? "").trim() || PATHS.bg,
      statusIcon: String(data.statusIcon ?? "").trim() || PATHS.status,
      useCustomStageIcons: !!data.useCustomStageIcons,
      stageIcons
    });
    ui.notifications.info(game.i18n.localize("PURSUITTRACKER.Notifications.Saved"));
  }

  /* ---------------------------- File pickers ---------------------------- */

  /** Factory that returns a static action handler for a top-level field name. */
  static #pickFile(field) {
    return async function (_event, target) {
      const input = target.closest(".form-fields")?.querySelector(`[name="${field}"]`)
        ?? this.element.querySelector(`[name="${field}"]`);
      if (!input) return;
      const fp = new foundry.applications.apps.FilePicker.implementation({
        type: "image",
        current: input.value,
        callback: (path) => {
          input.value = path;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      fp.render({ force: true });
    };
  }

  static async #pickStageIcon(_event, target) {
    const idx = Number(target.dataset.stage);
    if (!Number.isFinite(idx)) return;
    const input = this.element.querySelector(`[name="stageIcons.${idx}"]`);
    if (!input) return;
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: input.value,
      callback: (path) => {
        input.value = path;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    fp.render({ force: true });
  }

  static async #onDelete() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "PURSUITTRACKER.Config.ConfirmDelete" },
      content: `<p>${game.i18n.localize("PURSUITTRACKER.Config.ConfirmDeleteHint")}</p>`,
      modal: true
    });
    if (!ok) return;
    await TrackerStore.delete(this.trackerId);
    ui.notifications.info(game.i18n.localize("PURSUITTRACKER.Notifications.Deleted"));
    this.close();
  }
}
