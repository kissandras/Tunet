# Tunet Dashboard

A modern React dashboard for Home Assistant with real-time entity control, energy monitoring, and multi-device profile sync.

![Main Dashboard](public/Main.png)

## Features

### 🎴 Cards

- **Universal Sensor Card**: One card to rule them all. Handles numeric sensors (with history graphs), binary sensors (doors, windows, motion), switches, input booleans, scripts, and scenes.
- **Specialized Control Cards**:
  - **Alarm** (BETA): Arm/disarm with mode selection, PIN-protected actions, and quick-action keypad.
  - **Light**: Brightness, color (RGB/temp), and toggle limits.
  - **Climate**: Thermostat modes, target temperature, and HVAC action feedback.
  - **Media**: Generic media players + dedicated **Android TV** remote with app launching.
    - Playlist browsing requires a **Music Assistant** `media_player`.
    - Sonos Favorites browsing requires a **Sonos** `media_player`.
  - **Cover**: Position sliders for blinds and toggle controls for garage doors.
  - **Vacuum**: State monitoring, start/pause/dock commands.
  - **Fan**: Speed percentage, oscillation, and direction controls.
- **Energy & Environment**:
  - **Nordpool**: Hourly electricity prices with beautiful trend graphs.
  - **Energy Cost**: Track daily and monthly energy expenditure.
  - **Weather**: Dynamic weather animations, current temperature, and forecasts.
  - **Car**: EV monitoring (battery, range, charging status).
- **Productivity & Organization**:
  - **Calendar**: Agenda view for upcoming events.
  - **Todo Lists**: Manage Home Assistant to-do items.
  - **Room Card**: Compact summary of a room's state (lights, temp, occupancy).
  - **Person**: Presence detection and location tracking.

### 🚀 Advanced Capabilities

- **Server-side Profiles + Deploy**: Save layout configurations per user, load on any device, and publish/deploy current settings to selected devices.
- **Validated Backend Auth**: Protected profile/settings API calls are verified against the authenticated Home Assistant user, not just browser-side state.
- **Conflict-safe Settings Sync**: Multi-device settings updates use revision-aware sync to prevent stale tabs from overwriting newer layouts.
- **Optional Data-at-Rest Encryption**: Encrypt server-stored profiles/settings with migration-safe compatibility modes.
- **Session-scoped OAuth Storage**: OAuth tokens are kept in browser session storage instead of long-lived local storage.
- **Dashboard Import/Export**: Portable JSON backup/restore directly from Profiles.
- **Live Updates**: Instant state reflection via Home Assistant WebSocket.
- **Drag-and-Drop Grid**: Fully customizable masonry layout.
- **Settings Lock**: PIN protection prevents accidental edits.
- **Theming**: Dark/Light modes with high-end glassmorphism and animated backgrounds.
- **Multi-language**: Native support for English, German, Norwegian (NB/NN), Swedish, and Simplified Chinese.

## Quick Start

### Home Assistant Add-on

1. Go to **Settings** -> **Add-ons** -> **Add-on Store** -> **Repositories** (three dots).
2. Add `https://github.com/oyvhov/tunet`.
3. Install **Tunet Dashboard**.
4. Configure and Start.

### Docker Compose (Recommended)

```bash
git clone https://github.com/oyvhov/tunet.git
cd tunet
docker compose up -d
```

Open `http://localhost:3002` and connect your Home Assistant instance.

### Local Development

```bash
git clone https://github.com/oyvhov/tunet.git
cd tunet
npm install
npm run dev:all
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3002/api`

## Updating

See [SETUP.md](SETUP.md) for detailed setup, configuration, and troubleshooting.
See [CARD_OPTIONS.md](CARD_OPTIONS.md) for card-by-card options and screenshots.
See [CSS_VARIABLES.md](src/docs/CSS_VARIABLES.md) for theme token naming and usage.

## Release 1.14.0 Highlights

- Hardened backend authorization for Profiles and Settings API routes.
- Improved multi-device settings sync conflict handling and recovery.
- Reduced OAuth token persistence by keeping browser OAuth tokens session-scoped.
- Fixed production lazy-loaded chunk failures caused by asset throttling.
- Stabilized modal, drag-and-drop, and onboarding E2E flows.

## Technologies

- React 18 + Vite 7
- Tailwind CSS 4
- Express + SQLite (profile storage)
- Home Assistant WebSocket API
- Lucide Icons + MDI

## 🗺️ Roadmap

See our [ROADMAP.md](ROADMAP.md) for planned features and future development.

## License

GNU General Public License v3.0 — See [LICENSE](LICENSE)

## Author

[oyvhov](https://github.com/oyvhov)
