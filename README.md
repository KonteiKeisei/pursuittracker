# Pursuit Tracker

## AI Generated Code
A system-agnostic, dockable progress tracker for Foundry VTT. Track multiple
"pursuits", chases, investigations, quests, countdowns, projects, each as a
slider over a configurable number of stages, with per-tracker player visibility
and a per-tracker "let players adjust this" toggle.

Built for Foundry V13 (compatible with V12) using ApplicationV2.

<img width="503" height="499" alt="image" src="https://github.com/user-attachments/assets/d976b73f-f43b-45ac-8863-6054d61b515c" />


---

## Features

- **Multiple trackers** in a single panel, each with its own name, background,
  stage icons, status marker, and slider.
- **3 to 10 stages** per tracker, equidistant. The status marker snaps to a
  stage when you click one or drag the dot.
- **Bundled SVG icons** numbered 1 through 10 for stages, plus a default
  status marker and panel background. Replace any icon per-tracker, or set
  module-wide defaults.
- **Nine panel positions**: top-left/center/right, bottom-left/center/right,
  left, right, and free-float. Free-float can be dragged anywhere, then
  locked in place.
- **Self-aware expansion**: the pull tab is the anchor, it stays put when
  the panel opens or closes, and the body grows away from the nearest screen
  edge so it never extends off-screen.
- **Auto-collapse** when idle, with a configurable delay. The pull tab
  remains visible at all times so the panel is always one click away.
- **Per-tracker player visibility**: trackers default to GM-only; flip a
  switch to share one with the players.
- **Per-tracker player adjust**: optionally let players advance, retreat, or
  drag the stage on a specific tracker without giving them edit access.
- **Real-time sync**: when the GM creates, edits, deletes, or changes the
  visibility of a tracker, every connected client updates immediately. No
  reload needed.
- **Customizable label**: rename "Pursuit Tracker" to "Chase", "Quests",
  "Goals", anything that fits your campaign.
- **Daily reminder** prompt for the GM, optionally driven by either
  [Calendaria](https://foundryvtt.com/packages/calendaria) (`dayChange`
  hook) or
  [Rest Recovery 5e](https://foundryvtt.com/packages/rest-recovery)
  (long rest with `newDay`). Auto-detects whichever is installed.
- **Respects Foundry chrome**: the panel anchors itself relative to the
  sidebar, hotbar, scene controls, and navigation, and re-anchors live when
  the sidebar collapses or the window resizes.
- **System-agnostic**: no system-specific dependencies. Works in D&D 5e,
  PF2e, Forbidden Lands, FATE, anything.

---

### Enable

In your world's **Manage Modules** screen, tick **Pursuit Tracker** and
save. The panel appears in the bottom-left of the canvas by default.

---

## Quick start

1. **Open the panel.** Click the **Pursuit Tracker** pull tab. It auto-collapses
   after one second of inactivity by default, hover the tab to bring it back.
2. **Create a pursuit** (GM only). Click the **+** button in the panel header.
   The tracker config dialog opens.
3. **Configure it.** Give it a name, choose a number of stages (3–10), pick
   icons if you want to override the defaults, and decide whether players see
   it (and whether they can adjust it).
4. **Advance / retreat.** Use the chevron buttons in the tracker row, click a
   specific stage on the slider, or drag the status dot.
5. **Tweak the panel.** Open module settings via the gear icon to change
   position, scale, label, auto-collapse delay, or daily reminder source.

---

## Settings

### World scope (GM-only)

| Setting | Description |
|---|---|
| **Restrict to GM only** | Hides the panel from every player, regardless of per-tracker visibility. |
| **Panel label** | Text shown on the pull tab and panel header. Leave empty to use the default ("Pursuit Tracker"). |
| **Daily reminder** | Source of the once-per-day prompt: off, auto-detect, Calendaria, or Rest Recovery 5e. |
| **Default tracker background** | Background image used for newly-created trackers. |
| **Default status (progress) icon** | The marker that snaps to stages on new trackers. |

### Client scope (each user controls their own)

| Setting | Description |
|---|---|
| **Panel position** | One of nine positions; "Free Float (drag to position)" is the draggable mode. |
| **Panel scale** | 50% to 200% of normal size. |
| **Auto-collapse when idle** | Whether the body of the panel fades away when not in use. |
| **Auto-collapse delay (seconds)** | How long to wait before collapsing. Defaults to 1 second. |

### Keybinds

| Action | Default |
|---|---|
| Toggle Pursuit Tracker panel | `Ctrl+P` |

Rebind in **Configure Controls**.

---

## Per-tracker options

Each tracker has its own configuration dialog (the pen-icon button on the
tracker row).

| Field | Effect |
|---|---|
| **Name** | Shown in the tracker header. |
| **Number of stages** | 3 to 10. The slider redraws with that many stops. |
| **Current stage** | Where the status marker sits right now. |
| **Visible to players** | Players see the tracker on their own panels. Without this, they can't see it at all. |
| **Players can adjust this tracker** | Players who can see the tracker can also advance, retreat, click a stage, or drag the dot. They can never change its name, icons, or visibility. |
| **Background image** | Per-tracker background (file picker). Leave blank to use the module-wide default. |
| **Status (progress) icon** | The marker that moves between stages. |
| **Use custom stage icons** | When on, replace the bundled numbered icons (1–10) with your own per-stage. |
| **Per-stage icon overrides** | Only used when the toggle above is on. |

---

## Player permissions

Pursuit Tracker uses a three-state permission model:

| Tracker state | GM | Player |
|---|---|---|
| Hidden | sees, can edit, can adjust | does not see |
| Visible | sees, can edit, can adjust | sees, read-only |
| Visible + Player-editable | sees, can edit, can adjust | sees, can advance / retreat / click stage / drag dot |

Player-initiated stage changes are routed through a socket: the player emits
a request, the GM client validates the permission against the current tracker
state, then performs the write. World-setting safety is preserved, there's
no path for a player to bypass the toggle.

---

## Module integrations

### Tidy 5e Sheets

If [Tidy 5e Sheets](https://foundryvtt.com/packages/tidy5e-sheet) is enabled,
Pursuit Tracker adds a new tab to every character and NPC sheet. The tab
title is the configured panel label (so renaming the module to "Chase" or
"Goals" carries through to the sheet tab without a reload). Players only see
the tab when at least one tracker is visible to them; GMs always see it.

Stage controls in the tab work the same as the floating panel — advance,
retreat, click a stage, drag the dot — and respect the same per-tracker
permissions. Tab content resizes with the sheet.

### Calendaria

If [Calendaria](https://github.com/Sayshal/Calendaria) is enabled, Pursuit
Tracker subscribes to its `calendaria.dayChange` hook. When a new in-game
day begins, the GM gets a prompt to review active pursuits.

### Rest Recovery 5e

If [Rest Recovery 5e](https://github.com/roth-michael/FoundryVTT-RestRecovery)
is enabled, Pursuit Tracker subscribes to its rest-completion hooks and
fires the daily reminder on long rests that flagged a new day.

### Daily reminder modes

Configurable in module settings. The default is **Auto-detect**, Calendaria
wins if present, then Rest Recovery, otherwise no reminder.

---

## API

Other modules can interact with Pursuit Tracker via:

```js
game.modules.get("pursuittracker").api
```

| Member | Description |
|---|---|
| `panel` | The `TrackerPanel` instance (after the `ready` hook). |
| `store` | The `TrackerStore` class, `read()`, `get(id)`, `create(...)`, `update(id, patch)`, `delete(id)`, `setStage(id, n)`. GM-only writes. |
| `open()` | Refresh and show the panel. |
| `toggle()` | Collapse or expand the panel. |
| `registerChromeSelector(selector)` | Tell Pursuit Tracker about a UI overlay your module renders (e.g. a custom HUD), so the panel won't anchor on top of it. Pass a CSS selector. Optional, only needed if your module's chrome lives outside Foundry's standard `#sidebar`/`#hotbar`/`#scene-controls`/`#navigation`/`#players`. |

### Hooks

Pursuit Tracker emits one custom hook:

| Hook | When |
|---|---|
| `pursuittracker.safeAreaChanged` | Fired when the chrome around the panel changes (sidebar collapse, hotbar render, etc.). Argument: `{ top, right, bottom, left }` in pixels. |

---

## Customization

### Replace the bundled icons

The numbered icons live at `assets/icons/stages/1.svg` through
`10.svg`. The default status marker is at `assets/icons/status/default.svg`,
and the default background at `assets/backgrounds/default.svg`. Replace
files in your world's `Data/modules/pursuittracker/assets/` directory, or
override per tracker / module-wide via the file pickers in settings.

### Theme the panel

The panel reads CSS custom properties from `.pursuittracker`. Drop a small
CSS file into your world to override:

```css
.pursuittracker {
  --pt-bg: rgba(20, 20, 24, 0.92);
  --pt-fg: #f5e9c8;
  --pt-accent: #d2b15a;
  --pt-accent-strong: #f1c869;
  --pt-tracker-w: 360px;
  --pt-stage-size: 28px;
  --pt-dot-size: 22px;
  --pt-z: 200;
}
```

---

## Compatibility

- **Foundry VTT** v12 minimum, **v13 verified**.
- **System-agnostic**: no game system dependencies.
- **Tested** alongside Carolingian UI; the panel detects sidebar collapse,
  hotbar / players / scene-controls / navigation widths, and re-anchors as
  the chrome changes. UI-overhaul modules with non-standard chrome can
  register their own selectors via `registerChromeSelector`.

---

## Reporting issues

Issues, feature requests, and PRs welcome at the GitHub repo. Please
include:

- Your Foundry version and game system.
- Other modules enabled.
- Steps to reproduce.
- Browser console output (`F12`).

---

## License

MIT. See [LICENSE](LICENSE).
