# Integration Stub Server

This is a minimal Express stub used during development to simulate Booking.com channel manager integration.

Quick start:

```bash
cd server
npm install
npm start
```

Server endpoints (dev only):

- `GET /api/integrations/channel-config` — get stored config
- `POST /api/integrations/channel-config` — save config JSON
- `POST /api/integrations/oauth/start` — returns a mock `redirectUrl` and `state`
- `POST /api/integrations/oauth/callback` — exchange `code`+`state` for a fake token
- `POST /api/integrations/import` — simulate reservation import
- `POST /api/integrations/webhook` — webhook receiver (simulator)

This server stores a single in-memory config — restart clears it. Use only for local development.
