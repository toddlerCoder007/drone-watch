# Drone Watch

A personal daily scan of drone news: military drones, counter-drone systems, drone policy, and civilian and commercial drones. It pulls stories from 15 sources, keeps 7 days in your browser, and marks what is new since your last visit.

Live site: https://toddlercoder007.github.io/drone-watch/

## How it works

- **Sources** are listed in [`feeds.config.ts`](feeds.config.ts). Five are called straight from the browser (GDELT, NYT World, UK Ministry of Defence, Wikipedia Current Events, Bluesky). The other ten block browser requests:
  - locally, `npm run dev` fetches them live through an allow-listed Vite dev-server proxy;
  - on GitHub Pages, a scheduled workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) snapshots them every 2 hours with [`scripts/fetch-feeds.ts`](scripts/fetch-feeds.ts).
- **Tagging**: with your own Claude API key (Settings), Claude Haiku 5.5 tags each story (military/civilian, conflict, topic), writes a one-line summary, and groups the same event from several outlets into one card. The key stays in your browser's localStorage. Without a key, keyword rules tag stories instead.
- **Storage**: everything lives in localStorage; Settings has a JSON export.

## Run locally

```
npm install
npm run dev     # http://localhost:5173
npm test
```
