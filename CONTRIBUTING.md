# 🤝 Contributing to Balkon

Welcome to the pirate ship. This repo is the **main Balkon Discord bot**: slash commands, interactive menus, MySQL logic, streamer registration and OBS relay.

Related projects live separately:

- `phenibut645/balkon` — main Discord bot and relay.
- `phenibut645/balkon-obs-agent` — desktop OBS Agent app for streamers.
- `phenibut645/balkon-website` — planned web dashboard.

Do not mix responsibilities between these repos unless the change is explicitly cross-project.

---

## 🧭 Before starting

1. Pull latest `main`.
2. Check open issues/discussions if the change is large.
3. Confirm which repository should be changed:
   - bot command/menu/database/relay logic → `balkon`;
   - desktop tray/autoupdate/OBS local client → `balkon-obs-agent`;
   - Discord OAuth dashboard/admin UI → `balkon-website`.

---

## ⚡ Local setup

```bash
npm install
```

Create local env files:

```powershell
Copy-Item .env.dev.example .env.dev
Copy-Item .env.prod.example .env.prod
```

Fill local Discord/MySQL values in `.env.dev`.

For a fresh dev database:

```bash
npm run db:init:dev
npm run db:migrate:dev
```

Run the bot:

```bash
npm run dev
```

Register development slash commands when needed:

```bash
npm run dev-deploy
```

---

## ✅ Required checks

Before committing code changes, run:

```bash
npm run build
```

If database schema changed, also run:

```bash
npm run db:migrate:dev
npm run db:migrate:dev
```

The second migration run should skip already applied migrations.

---

## 🗄️ Database changes

Every schema change must be represented in **two places**:

1. `sql/tables.sql` — baseline schema for fresh databases.
2. `sql/migrations/00X_description.sql` — incremental update for existing databases.

Rules:

- Never edit old migrations after they were applied to shared/prod DBs.
- Never reuse migration numbers.
- Prefer additive migrations.
- Destructive migrations must be reviewed manually.
- Do not drop production data silently.

Example:

```text
sql/migrations/003_create_streamer_obs_agents.sql
```

Then test:

```bash
npm run db:migrate:dev
npm run build
```

---

## 🎥 OBS / streamer changes

Normal production OBS control should go through:

```text
Discord command/menu
→ Balkon bot
→ OBS relay
→ Balkon OBS Agent
→ local OBS Studio
```

Do not add new normal-menu behavior that depends on direct server-side `OBS_WEBSOCKET_URL` unless it is explicitly marked as legacy/development-only.

For `/botmenu → OBS` changes:

- preserve selected streamer behavior;
- clear scene/source when streamer changes;
- avoid heavy relay calls on every render;
- keep clear user-facing errors for offline/no-agent cases.

If the relay protocol changes, update and release `balkon-obs-agent` too.

---

## 🧪 Manual test checklist

For bot/menu changes:

```text
[ ] npm run build passes
[ ] slash command deploy is updated if command shape changed
[ ] /botmenu opens
[ ] target screen renders
[ ] buttons/selects work
[ ] locale strings exist in all supported languages
```

For OBS changes:

```text
[ ] OBS Agent connects to relay
[ ] OBS Agent connects to OBS
[ ] /streamer agent_show shows online
[ ] /botmenu → OBS shows relay-agent mode
[ ] scenes refresh works
[ ] scene switching works
[ ] agent Recent Events shows incoming commands
```

---

## 🧾 Commit style

Use short conventional-ish commits:

```text
feat: add multi-streamer OBS menu
fix: keep relay connection alive with heartbeat
docs: update OBS Agent setup guide
chore: add database migration workflow
refactor: simplify menu session state
```

---

## 🔐 Secrets

Never commit:

- Discord bot tokens;
- database passwords;
- OBS agent tokens;
- `.env.dev` / `.env.prod` real values;
- private keys;
- production logs with secrets.

If a token leaks, rotate it immediately.

---

## 🏴‍☠️ Final rule

Ship working features. Keep the zxc aura. Do not farm technical debt like jungle creeps for 40 minutes.
