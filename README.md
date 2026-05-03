<div align="center">

# Balkon

### Discord bot, backend API and OBS relay for Discord server management and OBS Studio control

Balkon is a diploma project and production system built around Discord, a web dashboard, MySQL and OBS Studio.

</div>

---

## Navigation

- [What is Balkon?](#what-is-balkon)
- [Repository ecosystem](#repository-ecosystem)
- [Current feature set](#current-feature-set)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [Local development](#local-development)
- [Production deployment](#production-deployment)
- [Database workflow](#database-workflow)
- [OBS relay and OBS Agent](#obs-relay-and-obs-agent)
- [Website integration](#website-integration)
- [Development workflow](#development-workflow)
- [Manual test checklist](#manual-test-checklist)
- [Diploma documentation context](#diploma-documentation-context)

---

## What is Balkon?

Balkon is a TypeScript-based system for Discord server administration and OBS Studio management.

The system started as a Discord bot project and evolved into a multi-repository application:

- Discord bot for Discord gateway events, slash commands and community logic
- backend REST API for the web dashboard
- MySQL database with versioned migrations
- OBS relay for connected streamer agents
- Next.js website dashboard
- local Windows OBS Agent for streamers

The registered diploma topic is:

```text
Discordi bot ja veebirakenduse arendamine OBS Studio haldamiseks ja Discordiserverite administreerimiseks
```

In diploma terms, Balkon can be described as:

```text
Balkon on Discordi botist, veebirakendusest, backend API-st ja OBS Agentist koosnev süsteem, mille eesmärk on lihtsustada Discordi serveri haldamist ning võimaldada OBS Studio juhtimist veebipõhise kasutajaliidese kaudu.
```

---

## Repository Ecosystem

| Repository | Role | Status |
|---|---|---|
| `phenibut645/balkon` | Main backend, Discord bot, REST API, database migrations, business logic, OBS relay | active |
| `phenibut645/balkon-website` | Next.js web dashboard for users, streamers and admins | active |
| `phenibut645/balkon-obs-agent` | Local Windows desktop app that connects streamer OBS Studio to Balkon relay | active |

The repositories are separate. For local convenience, `balkon-website` and `balkon-obs-agent` may appear as nested folders in the development workspace, but each is its own Git repository.

---

## Current Feature Set

### Backend / API

- Discord OAuth2 authentication
- httpOnly session-based auth
- REST API under `/api`
- protected dashboard routes
- admin routes
- command queue for Discord/OBS-related actions
- MySQL service layer and migrations
- production migration workflow

### Discord Bot

- Discord.js based bot process
- slash commands
- interactive menu flows
- guild/member/channel/role persistence
- economy and item-related commands
- streamer-related commands
- OBS-related command integration through relay/agent model

### Economy and Community Modules

- user balances, including ODM
- item templates
- concrete inventory items
- original owner tracking
- item rarities and types
- player inventory
- player market
- bot shop
- crafting recipes and craft execution
- jobs/work system with cooldowns and rewards
- optional item rewards for jobs
- item localization RU/EN/ET

### Streamer and OBS Modules

- streamer registration/application flow
- admin approval/rejection of streamer applications
- streamer access and permissions
- soft-archive of streamers without deleting history
- Streamer Studio backend support
- OBS Agent pairing/status
- OBS relay WebSocket server
- OBS command forwarding
- OBS shop/services
- OBS action history

### Admin Modules

- admin stats
- guild/server tools
- item management
- jobs management
- streamer list and archive
- streamer applications
- economy/currency tools
- OBS-related administration

---

## Architecture

High-level runtime architecture:

```text
Discord user / dashboard user / admin
      ↓
Discord bot or Balkon Website
      ↓
Balkon backend API and service layer
      ↓
MySQL database / bot command queue / OBS relay
      ↓
Discord API and/or Balkon OBS Agent
      ↓
Discord server and/or local OBS Studio
```

The website does not talk directly to Discord or OBS Studio. It calls the backend API with a session cookie. The backend validates sessions, permissions and business rules.

The OBS Agent model exists because OBS Studio runs locally on the streamer's PC while the backend runs remotely. The backend/relay sends commands to the connected local agent, and the agent executes them against local OBS Studio through obs-websocket.

---

## Authentication

Discord OAuth2 Authorization Code Grant is implemented in the backend API.

Flow:

```text
website login button
      ↓
GET /api/auth/discord
      ↓
Discord OAuth2 authorization
      ↓
GET /api/auth/discord/callback
      ↓
backend creates session and sets httpOnly cookie
      ↓
website calls /api/me with credentials included
```

Important rules:

- OAuth2 client secret is stored only in backend environment variables.
- Website must not store Discord OAuth client secret.
- Website calls authenticated API routes with `credentials: include`.
- Development header auth is disabled by default and must never be used in production.
- In production, protected routes require a real session cookie.

Development-only headers, when explicitly enabled for local development:

```text
x-dev-discord-id: <discord_user_id>
x-dev-roles: bot_admin,bot_contributor,guild_founder
```

These are ignored in production.

---

## Local Development

### Install dependencies

```bash
npm install
```

### Environment files

PowerShell:

```powershell
Copy-Item .env.dev.example .env.dev
Copy-Item .env.prod.example .env.prod
```

Fill Discord, MySQL, session and other required credentials in the copied files.

### Build

```bash
npm run build
```

### Initialize fresh dev database

Use only for a fresh empty database:

```bash
npm run db:init:dev
```

### Apply dev migrations

```bash
npm run db:migrate:dev
```

Running migrations twice should skip already applied files.

### Run bot / API

Common scripts include:

```bash
npm run dev
npm run dev:api
npm run build
npm run start:api
```

Exact process choice depends on whether you need the Discord bot, the API, or both.

---

## Production Deployment

Typical production backend flow:

```bash
git pull
npm install
npm run build
npm run db:migrate:prod
npm run prod-deploy
pm2 restart all --update-env
pm2 logs
```

If code depends on a new schema, migrations must be run before restarting production processes.

PM2 helpers:

```bash
npm run pm2:start
npm run pm2:restart
npm run pm2:logs
npm run pm2:stop
```

Raw PM2 examples:

```bash
pm2 start ecosystem.config.cjs --only balkon-bot
pm2 restart balkon-bot
pm2 logs balkon-bot
pm2 stop balkon-bot
```

---

## Database Workflow

The project uses MySQL.

Schema areas include:

- members and Discord profile cache
- guilds and Discord server metadata
- sessions
- item templates, rarities and types
- member inventory items
- market listings
- bot shop entries
- craft recipes and ingredients
- jobs and member job cooldowns
- streamers and streamer access
- streamer applications
- streamer services
- OBS media actions
- bot command queue
- notifications
- admin economy adjustments

### Baseline schema

Fresh database baseline is stored in:

```text
sql/tables.sql
```

Fresh DB setup:

```bash
npm run db:init:dev
npm run db:init:prod
```

### Migrations

Migrations live in:

```text
sql/migrations/
```

Migration commands:

```bash
npm run db:migrate:dev
npm run db:migrate:prod
```

Rules:

1. Every schema change needs a migration.
2. Update `sql/tables.sql` when baseline schema changes.
3. Never edit a migration that has already been applied to production.
4. Editing a failed/unapplied migration is acceptable only before it is recorded in `schema_migrations`.
5. Keep migrations additive when possible.
6. Review destructive migrations manually.
7. Run migrations before deploying code that depends on new columns/tables.

### Recent production migration note

During production deployment, migration `018_create_jobs.sql` initially failed because it used `BIGINT` FK columns while the existing production `members.id` and `items.id` columns were `INT`. The migration was fixed before being applied by aligning jobs-related IDs/FKs to `INT`.

This is an important deployment lesson:

```text
Foreign key column types must match referenced column types exactly in MySQL.
```

After the fix, production migrations completed successfully.

### Schema migration tracking

The migration runner tracks applied migrations in `schema_migrations` using the `migration_name` column.

Useful production checks:

```sql
SELECT *
FROM schema_migrations
WHERE migration_name = '018_create_jobs.sql';

SHOW TABLES LIKE 'jobs';
SHOW TABLES LIKE 'member_job_cooldowns';
```

---

## OBS Relay and OBS Agent

Balkon uses an OBS relay and local OBS Agent to control OBS Studio safely.

Reason:

- backend runs on a server
- OBS Studio runs on the streamer's local PC
- direct public access to OBS WebSocket is unsafe
- NAT/router restrictions make direct server-to-OBS connections unreliable

Correct flow:

```text
website / Discord bot
      ↓
backend API / service layer
      ↓
OBS relay WebSocket
      ↓
Balkon OBS Agent on streamer PC
      ↓
local OBS Studio WebSocket
```

OBS-related command categories include:

- get OBS status
- list scenes
- switch scenes
- list scene items
- set source visibility
- update text input
- trigger media input actions
- show configured OBS media/effects

The agent repository contains packaging, tray behavior and auto-update documentation.

---

## Website Integration

The web dashboard lives in:

```text
phenibut645/balkon-website
```

The website uses the backend API and does not store Discord secrets.

Website calls should:

- use API helpers
- include credentials for session cookies
- rely on backend permission checks
- keep the backend as the source of truth for ownership, cooldowns and permissions

Implemented dashboard areas include:

- overview
- profile
- inventory
- market
- bot shop
- OBS shop
- OBS history
- craft
- jobs
- notifications
- streamer application
- Streamer Studio
- admin dashboard
- admin items
- admin jobs
- admin streamers/applications

---

## Development Workflow

### Backend/API change checklist

```text
[ ] identify service layer owner
[ ] add/modify service method
[ ] add/modify route file
[ ] avoid large dashboardRoutes rewrites
[ ] add validation and stable error codes
[ ] update TypeScript types if needed
[ ] update migrations/tables.sql if schema changes
[ ] npm run build
```

Prefer small route modules under:

```text
src/api/routes/dashboard/
```

Avoid broad manual edits of large central route files unless required.

### Database change checklist

```text
[ ] add migration under sql/migrations
[ ] update sql/tables.sql
[ ] update DB TypeScript types if needed
[ ] run npm run db:migrate:dev
[ ] run npm run build
[ ] document production recovery notes for risky migrations
```

### Website-dependent backend change checklist

```text
[ ] define response shape
[ ] include ok/code/message/data consistently
[ ] preserve credentials/session auth
[ ] do not expose tokens/secrets
[ ] test with website lint/build in balkon-website if frontend is changed
```

---

## Manual Test Checklist

### Backend/API

```text
[ ] npm run build passes
[ ] migrations run locally
[ ] migrations second run skips applied files
[ ] /api/health works
[ ] /api/me works with session
[ ] protected routes reject unauthenticated access
```

### Economy

```text
[ ] inventory loads
[ ] market loads
[ ] bot shop loads
[ ] craft recipe executes or returns missing requirement error
[ ] job action rewards ODM and respects cooldown
[ ] item localization fields are returned where needed
```

### Streamer / OBS

```text
[ ] streamer application submit works
[ ] admin approval creates access
[ ] archived streamer disappears from active access lists
[ ] OBS Agent pairing/status works
[ ] OBS control opens through website
[ ] OBS shop service/effect can be triggered when configured
[ ] OBS history opens
```

### Production

```text
[ ] git pull
[ ] npm install if dependencies changed
[ ] npm run build
[ ] npm run db:migrate:prod
[ ] pm2 restart all --update-env
[ ] pm2 logs show no startup errors
```

---

## Diploma Documentation Context

The project is used for a graduation thesis at Tallinna Tööstushariduskeskus.

Student:

```text
Aleksander Milišenko, TARpv23
```

Supervisor:

```text
Irina Merkulova
```

Thesis title:

```text
Discordi bot ja veebirakenduse arendamine OBS Studio haldamiseks ja Discordiserverite administreerimiseks
```

Recommended documentation framing:

- Discord bot is the Discord-side automation layer.
- Backend API is the business logic and data layer.
- Website is the visual dashboard/management layer.
- OBS Agent is the local bridge to OBS Studio.
- MySQL migrations demonstrate versioned database design.
- Economy/inventory/market/craft/jobs are community engagement and server administration modules.
- Streamer applications, Streamer Studio and OBS tools connect the system to OBS Studio management.

Recommended demo/screenshots:

1. Discord OAuth2 login
2. user overview
3. inventory with localized item data
4. market
5. craft
6. jobs and cooldown
7. streamer application
8. admin streamer applications
9. admin jobs
10. admin items with RU/EN/ET fields
11. Streamer Studio list
12. OBS Agent setup/status
13. OBS control
14. OBS shop
15. OBS history
16. production migration result

---

## Related Documentation

Read these repository READMEs together for full context:

- backend/API/bot/DB/relay: `phenibut645/balkon`
- website/dashboard: `phenibut645/balkon-website`
- local OBS desktop app: `phenibut645/balkon-obs-agent`
