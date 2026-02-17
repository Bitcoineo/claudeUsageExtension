# Claude Usage Tracker

A Chrome extension that tracks your Claude.ai usage limits in real time. See your current session, weekly, and per-model utilization at a glance with color-coded progress bars.

## Features

- **Automatic cookie reading** — no manual pasting. The extension reads cookies directly via `chrome.cookies` API with `host_permissions` for `claude.ai`.
- **Real-time usage bars** — Current Session (5-hour), Weekly All Models (7-day), Weekly Sonnet, and more. Null/unavailable tiers are hidden automatically.
- **Color-coded thresholds** — Green (<50%), Yellow (50-75%), Orange (75-90%), Red (>90%) on progress bars, card borders, and the toolbar badge.
- **Badge indicator** — The extension icon badge shows the utilization percentage of whichever card is in the first position.
- **Drag-and-drop reordering** — Drag cards to rearrange them. The order persists across sessions. The top card drives the badge value.
- **Auto-refresh** — Polls the usage API every 5 minutes via `chrome.alarms`. Shows "Updated Xs ago" in the popup header.
- **Dark theme** — Matches Claude's UI aesthetic (#2a2a2a background).

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the project folder
5. Sign in to [claude.ai](https://claude.ai) in any tab
6. Click the extension icon to see your usage

## How It Works

1. **background.js** (service worker) runs on a 5-minute alarm cycle
2. Reads all cookies from the `claude.ai` domain using `chrome.cookies.getAll()`
3. Extracts the organization ID from the `lastActiveOrg` cookie
4. Calls `https://claude.ai/api/organizations/{orgId}/usage` with the cookie header
5. Stores the response in `chrome.storage.local` and updates the badge
6. **popup.js** reads from storage on open and renders progress bars dynamically

## File Structure

```
├── manifest.json      # Manifest V3 — permissions, service worker, popup
├── background.js      # Cookie reading, API polling, badge updates
├── popup.html         # Popup markup
├── popup.css          # Dark theme styles, progress bars, drag states
├── popup.js           # Dynamic rendering, drag-and-drop, time calculations
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Permissions

| Permission | Why |
|---|---|
| `cookies` | Read `claude.ai` cookies to authenticate API requests |
| `alarms` | Poll the usage endpoint every 5 minutes |
| `storage` | Persist usage data and card order across sessions |
| `host_permissions: claude.ai` | Required for cookie access and API fetch |

## Built by

**Bitcoineo** — [X / Twitter](https://x.com/Bitcoineo) · [GitHub](https://github.com/Bitcoineo)
