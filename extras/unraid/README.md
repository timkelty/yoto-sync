# Unraid Template

This directory contains an Unraid Docker template for `yoto-sync`:

- `yoto-sync.xml`

## Use In Unraid

Add the XML to your Community Applications template repository, or import it manually from:

`https://raw.githubusercontent.com/timkelty/yoto-sync/main/extras/unraid/yoto-sync.xml`

## Required Unraid Inputs

- `DOTENV_PRIVATE_KEY`: required to decrypt the committed `.env` file at container startup
- `AppData` path: persisted `/data` volume for tokens, sync state, and icon cache

## Optional Unraid Inputs

- `Media Library`: mount your local media path read-only at `/media`
- `PLEX_URL` and `PLEX_TOKEN`: enable Plex playlist syncing
- `SYNC_CONFIG_PATH`: defaults to `/config/sync-config.json`
- `Sync Config Directory`: mount a host folder to `/config` if you want Plex polling with a persisted `sync-config.json`

## Notes

- The template defaults to `ghcr.io/timkelty/yoto-sync:latest`
- If the published image name changes, update the `Repository` field in `yoto-sync.xml`
- The container listens on port `3000` internally and exposes `/health` for a simple WebUI target
