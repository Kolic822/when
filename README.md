# When

*When are we all free?* — a tiny app for finding a time that works for a whole group:
band rehearsals, drinks, trips, anything.

The organiser creates a link and picks the days that are in the running (any days from a
calendar), how long the meetup should be, and the earliest / latest time of day. Everyone
who opens the link enters their name and drags out the times they're free on a bar chart
(days on the x axis, hours on the y axis). Changes show up for everyone instantly, and the
app lists every window where all of you are free for at least the requested length.

## Stack

- Angular 22 (standalone, signals, zoneless, Signal Forms) + Angular Material
- PWA (service worker + manifest) so it installs on phones and tablets
- A small Node server (`server/`) with Express + `ws` for real-time sync. Events are kept
  in memory and persisted to `server/data/events.json`.

## Run it

```bash
npm install
npm run dev        # API + WebSocket server on :3000 and Angular dev server on :4200
```

Open http://localhost:4200. To test from a phone on the same Wi-Fi, use `npm run start:lan`
(with `npm run server` in a second terminal) and open `http://<your-ip>:4200`.

Production-style run (server serves the built app, all on one port):

```bash
npm run serve:prod   # builds, then serves everything on http://localhost:3000
```

Set `API_PORT` to change the server port.

## How it works

- `src/app/core/availability.ts` — merges each person's slots and intersects them per day,
  keeping windows at least as long as the meetup. People who haven't answered yet don't
  block the result; they're listed as pending.
- `src/app/core/event-session.ts` — the WebSocket session; holds the shared event as a
  signal and pushes slot changes with optimistic updates and auto-reconnect.
- `src/app/components/week-chart` — the overview: one bar per day, one lane per person,
  gold stripes where everyone is free.
- `src/app/components/day-editor` — one day; drag to add a free period, tap to remove,
  "Free all day" for the whole range.
- Identity is per browser and per event (`localStorage`), so nobody needs an account. The
  organiser's browser holds a creator token that allows changing days, length and hours.

## Scripts

| script            | what it does                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | server + web dev server together                    |
| `npm start`       | Angular dev server only (proxies `/api`, `/ws`)     |
| `npm run server`  | Node server only                                    |
| `npm run build`   | production build to `dist/when/browser`             |
| `npm run serve:prod` | build, then serve it from the Node server        |
| `npm test`        | unit tests (vitest)                                 |

## Hosting on a VM (Oracle Cloud free tier, or any Ubuntu box)

1. Create an Ubuntu VM and allow TCP 80 and 443 in its security list / firewall.
2. Pick a hostname that points at the VM. Free options: a DuckDNS name, or `<ip>.sslip.io`
   (no sign-up; e.g. `203.0.113.7.sslip.io`).
3. On the VM, once: `sudo bash setup-server.sh <hostname>` (copy `deploy/setup-server.sh` there
   first). It installs Node 22, Caddy (automatic HTTPS), a `when` systemd service, and opens the ports.
4. From this Mac, every time you want to ship a new version: `./deploy/deploy.sh ubuntu@<ip>`.

Data lives in `/var/lib/when/events.json` on the VM.
