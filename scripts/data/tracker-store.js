import { MODULE_ID, SETTINGS } from "../constants.js";
import { normalizeTracker, createTracker, clampStage } from "./tracker-model.js";

/**
 * CRUD over the world-scoped trackers array.
 * Writes are GM-only; non-GMs route mutations through a socket so the GM client
 * persists them. Reads are a normalized snapshot.
 */
export class TrackerStore {
  static read() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.TRACKERS);
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeTracker);
  }

  static async write(trackers) {
    if (!game.user.isGM) return;
    await game.settings.set(MODULE_ID, SETTINGS.TRACKERS, trackers.map(normalizeTracker));
  }

  static get(id) {
    return this.read().find((t) => t.id === id) ?? null;
  }

  static async create(partial = {}) {
    const list = this.read();
    const t = createTracker(partial);
    list.push(t);
    await this.write(list);
    return t;
  }

  static async update(id, patch) {
    const list = this.read();
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const merged = { ...list[idx], ...patch };
    list[idx] = normalizeTracker(merged);
    await this.write(list);
    return list[idx];
  }

  static async delete(id) {
    const list = this.read().filter((t) => t.id !== id);
    await this.write(list);
  }

  static async setStage(id, newStage) {
    const t = this.get(id);
    if (!t) return null;
    return this.update(id, { currentStage: clampStage(newStage, t.stages) });
  }

  /**
   * Return only trackers a non-GM user should see.
   *
   * Strict checks: `user.isGM === true` AND `user.role >= 3` (Assistant GM
   * or Gamemaster) — Foundry's User#isGM is a getter, but we cross-check
   * the role number anyway in case anything has wrapped the user object in
   * a way that lies. The filter uses `=== true` so truthy strings or
   * numbers stored in the world setting can't sneak through.
   */
  static visibleFor(user) {
    if (!user) return [];
    const list = this.read();
    const ROLE_ASSISTANT = 3;
    const isGM = user.isGM === true && Number(user.role) >= ROLE_ASSISTANT;
    if (isGM) return list;
    return list.filter((t) => t?.visibleToPlayers === true);
  }
}
