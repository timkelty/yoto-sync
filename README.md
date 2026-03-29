# yoto-sync

Sync local directories or Plex playlists into Yoto Make-Your-Own cards.

`yoto-sync` scans a source playlist, uploads any new or changed audio to Yoto, and replaces the full card payload with the current ordered track list. It also supports optional automatic display icon assignment using icons from yotoicons.com uploaded into Yoto for offline use.

## Features

- Local directory syncs
- Plex playlist syncs
- Snapshot-based change detection
- Yoto upload dedup via SHA-256
- Optional Plex polling scheduler
- Optional automatic Yoto display icons
- Docker-friendly deployment
- Unraid template included

## Requirements

- A Yoto developer app client ID from `https://dashboard.yoto.dev/`
- A dotenvx private key for decrypting the committed `.env`
- Docker, or Node.js 20+ for local development

Optional for Plex syncing:

- Plex server URL
- Plex token
- A `sync-config.json` mapping file

## Environment

Runtime config is loaded from the encrypted `.env` file and optional environment overrides.

Required:

- `DOTENV_PRIVATE_KEY`
- `YOTO_CLIENT_ID`

Supported variables:

- `PORT` default `3000`
- `DATA_DIR` default `./data` in local runs, `/data` in Docker
- `LOG_LEVEL` one of `fatal`, `error`, `warn`, `info`, `debug`, `trace`
- `PLEX_URL`
- `PLEX_TOKEN`
- `SYNC_CONFIG_PATH`
- `POLL_INTERVAL_SECONDS` minimum `10`

## Local Development

Install dependencies:

```bash
npm ci
```

Run in dev mode:

```bash
DOTENV_PRIVATE_KEY=your_key npm run dev
```

Build and run:

```bash
npm run build
DOTENV_PRIVATE_KEY=your_key npm run start
```

## Docker

Build the image:

```bash
docker build -t yoto-sync .
```

Run it:

```bash
docker run \
  -p 3000:3000 \
  -e DOTENV_PRIVATE_KEY=your_key \
  -v $(pwd)/data:/data \
  -v /path/to/media:/media:ro \
  yoto-sync
```

Or use `docker-compose.yml`:

```bash
DOTENV_PRIVATE_KEY=your_key docker compose up -d
```

## First Startup

On first run, the app uses Yoto OAuth device code flow. Follow the logged verification URL and code to authorize the app. Tokens are persisted under `DATA_DIR`.

## API

Health check:

```bash
curl http://localhost:3000/health
```

Manual sync:

```bash
curl -X POST http://localhost:3000/sync \
  -H 'content-type: application/json' \
  -d '{
    "cardId": "YOUR_CARD_ID",
    "title": "My Playlist",
    "source": {
      "type": "local-directory",
      "path": "/media/My Playlist"
    }
  }'
```

Manual sync with icon override:

```bash
curl -X POST http://localhost:3000/sync \
  -H 'content-type: application/json' \
  -d '{
    "cardId": "YOUR_CARD_ID",
    "source": {
      "type": "local-directory",
      "path": "/media/Dinosaur Songs"
    },
    "icon": "dinosaur"
  }'
```

`icon` supports:

- `"dinosaur"` search yotoicons.com
- `"yotoicon:1234"` use a specific yotoicons.com icon id
- `"yoto:#mediaId"` use an already-uploaded Yoto icon directly
- `false` disable icons

If `icon` is omitted, `yoto-sync` derives a search term from the card title.

## Plex Scheduler

If `PLEX_URL`, `PLEX_TOKEN`, and `SYNC_CONFIG_PATH` are all set, `yoto-sync` starts a Plex polling scheduler and syncs changed playlists automatically.

Example `sync-config.json`:

```json
{
  "mappings": [
    {
      "name": "Dino Songs",
      "plexPlaylistId": 12345,
      "cardId": "YOUR_CARD_ID",
      "title": "Dinosaur Songs",
      "icon": "dinosaur"
    },
    {
      "name": "Bedtime",
      "plexPlaylistId": 67890,
      "cardId": "YOUR_OTHER_CARD_ID",
      "icon": false
    }
  ]
}
```

## Unraid

An Unraid template is included at:

`extras/unraid/yoto-sync.xml`

Template raw URL:

`https://raw.githubusercontent.com/timkelty/yoto-sync/main/extras/unraid/yoto-sync.xml`

The template is configured for:

- `ghcr.io/timkelty/yoto-sync:latest`
- `/data` appdata storage
- optional `/media` mount
- optional `/config` mount for `sync-config.json`
- required `DOTENV_PRIVATE_KEY`

The repo also includes a GitHub Actions workflow that publishes the Docker image to GHCR on pushes to `main`.

## Verification

```bash
npm run typecheck
npm run lint
npm run test:run
docker build .
```

## Notes

- Card updates are full replace operations
- The sync engine does not read card state before writing
- Audio uploads are deduplicated by SHA-256 where Yoto supports it
- Icon resolution is best-effort and non-fatal
