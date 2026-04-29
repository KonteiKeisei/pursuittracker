# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-04-29

### Fixed

- **Stage icons in the Tidy 5e tab were rendering at near-zero size.**
  Tidy's component CSS applies a default `padding: 0px 12px 0.5px` to
  every `<button>`, which collapsed the content area inside a 30 px
  stage button to ~6 px and squeezed the SVG icon. Padding,
  `box-sizing`, and `min/max-width` are now all set with `!important`
  in both the CSS rule and the JS inline-style backstop.
- Tab sizes are static (30 px stage / 28 px dot / 46 px slider). No
  more container queries or chained `var()` lookups — those were
  occasionally resolving to literal strings instead of pixel values
  under Tidy and shrinking the icons unpredictably.

### Added

- **GM controls in the Tidy tab.** Each tracker row now shows the
  eye / pen / trash buttons for GMs, matching the floating panel.
  Toggling visibility, opening the config dialog, or deleting a
  tracker now all work directly from a character sheet.
- **`api.diagnose()` debug method.** Call from the F12 console for a
  snapshot of the current user's role / isGM, the raw stored
  trackers, and what `visibleFor` returns for the local user. Useful
  for debugging "I'm a player but seeing GM-only trackers" reports.

### Changed

- **Hardened `TrackerStore.visibleFor`.** Requires both
  `user.isGM === true` AND `user.role >= 3` (Assistant or above), and
  the inner filter uses `=== true` for `visibleToPlayers` so a truthy
  non-boolean value in the world setting can't sneak through.
- Tab CSS rescoped from `.pursuittracker-tab` to `.pt-tab-root` (a
  class we own on our own template root). The previous scope depended
  on Tidy's `tabContentsClasses` being applied where we expected,
  which it sometimes wasn't.
- All theme CSS variables used by the tab now have literal pixel
  fallbacks inside every `var()` call so a broken cascade resolves to
  a real size, not `auto`.

## [1.1.0] - 2026-04-29

### Added

- **Tidy 5e Sheets integration**. When the
  [Tidy 5e Sheets](https://foundryvtt.com/packages/tidy5e-sheet) module is
  active, Pursuit Tracker registers a new tab on character and NPC sheets
  showing every tracker the viewing user is allowed to see. The tab title
  binds to the configured panel label (`() => resolvePanelLabel()`) so
  renaming the module to "Chase", "Goals", etc. carries through to the
  sheet tab without a reload.
- Tab content uses the same advance / retreat / click-stage / drag-the-dot
  controls as the floating panel. Permission gating is identical — players
  see read-only sliders unless the tracker has both `visibleToPlayers` and
  `playerEditable` set.
- Tab content is fully resize-aware: each tracker row spans the available
  width of the sheet's tab area, so adjusting the sheet's width / height
  reflows the trackers cleanly.
- Real-time sync into open Tidy sheets: when the GM mutates a tracker or
  changes the panel label, every open Tidy sheet re-renders so the tab
  picks up the change immediately. Non-Tidy sheets are untouched.
- New custom hook `pursuittracker.dataChanged` fired whenever the tracker
  list or panel label changes, for other modules that want to react.

### Changed

- `enrichTracker(t)`, `requestStageChange(tracker, stage)`, and
  `resolvePanelLabel()` extracted from the panel into
  `scripts/utils/tracker-shared.js` so the floating panel and the Tidy 5e
  tab consume a single source of truth.
- New shared `bindTrackerInteractions(rootElement, options)` helper wires
  click handlers and drag-to-snap on any tracker DOM, used by the Tidy
  tab. The floating panel still uses ApplicationV2 action delegation, so
  this is additive.

### Module manifest

- `tidy5e-sheet` added to `recommends`.

## [1.0.0] - 2026-04-27

Initial release.

### Added

- Multi-tracker pursuit panel built on ApplicationV2 + HandlebarsApplicationMixin.
- Per-tracker configuration: name, 3-10 stages, current stage, background image,
  status (progress) marker icon, and optional per-stage icon overrides.
- Bundled SVG stage icons numbered 1 through 10, plus a default status marker
  and panel background.
- Nine panel positions: top-left / top-center / top-right, bottom-left /
  bottom-center / bottom-right, left, right, and free-float.
- Free-float drag with lock toggle. Lock state and saved position are
  per-client.
- Self-aware body expansion — the pull tab acts as a fixed anchor and the
  body grows away from the nearest screen edge so it never extends off-screen.
- Auto-collapse with configurable idle delay (default 1 second). Pull tab
  remains visible at all times.
- Per-tracker "Visible to players" toggle (GM-controlled) and "Players can
  adjust this tracker" toggle for letting players advance, retreat, or drag
  the stage on a specific tracker without granting edit access.
- Customizable panel label (world setting). Defaults to "Pursuit Tracker".
- World-scope settings for default tracker background, default status icon,
  daily-reminder source, GM-only restriction, and label.
- Client-scope settings for panel position, scale (50-200%), auto-collapse,
  and auto-collapse delay.
- Daily reminder integration with [Calendaria](https://foundryvtt.com/packages/calendaria)
  (preferred, via `calendaria.dayChange`) and
  [Rest Recovery 5e](https://foundryvtt.com/packages/rest-recovery)
  (fallback, via long-rest `newDay`).
- Real-time cross-client sync — visibility flips and tracker mutations
  propagate to all connected players via the world-setting `onChange` hook.
- Player-initiated stage changes routed through a socket bridge with
  GM-side validation.
- Chrome-aware positioning that respects the sidebar (including its
  collapsed state), hotbar, players list, scene controls, and navigation.
  Re-anchors on window resize.
- Public API on `game.modules.get("pursuittracker").api` with `panel`,
  `store`, `open()`, `toggle()`, and `registerChromeSelector()` for other
  UI-overhaul modules to declare additional chrome regions.
- Custom hook `pursuittracker.safeAreaChanged` fired when chrome offsets
  change.
- Keybind for toggling the panel (default `Ctrl+P`, configurable).
- English localization.

[1.1.1]: https://github.com/KonteiKeisei/pursuittracker/releases/tag/v1.1.1
[1.1.0]: https://github.com/KonteiKeisei/pursuittracker/releases/tag/v1.1.0
[1.0.0]: https://github.com/KonteiKeisei/pursuittracker/releases/tag/v1.0.0
