# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/KonteiKeisei/pursuittracker/releases/tag/v1.0.0
