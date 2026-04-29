<div align="center">

# 🥀 Balkon

### Discord bot ecosystem for items, economy, crafting, streamer tools and OBS control

<img src="https://media.tenor.com/chNGPcAXt4QAAAAd/pirat.gif" width="285" />
<img src="https://media.tenor.com/SxzG9vFWtTcAAAAM/zxc-cat.gif" width="215" />
<img src="https://images6.fanpop.com/image/photos/41000000/Ken-Kaneki-tokyo-ghoul-GIF-anime-41018150-500-395.gif" width="260" />

<br />

![Node.js](https://img.shields.io/badge/Node.js-Discord_bot-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-ish-3178C6?logo=typescript&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-database-4479A1?logo=mysql&logoColor=white)
![OBS Agent](https://img.shields.io/badge/OBS-Agent_relay-302E31?logo=obsstudio&logoColor=white)
![VNMCR](https://img.shields.io/badge/VNMCR-goth_punk_rock-111111?logo=applemusic&logoColor=white&labelColor=7A0019)

> **zxc lobby management tool**: Discord economy + inventory + crafting + marketplace + OBS Agent relay.  
> Pirate ship included. MMR not guaranteed. VNMCR-coded. 🦜

</div>

---

## 🧭 Navigation

- [What is Balkon?](#-what-is-balkon)
- [Ecosystem](#-ecosystem)
- [Features](#-features)
- [Quick start](#-quick-start)
- [Production deploy](#-production-deploy)
- [OBS Agent mode](#-obs-agent-mode)
- [Project workflow](#-project-workflow)
- [Database workflow](#-database-workflow)
- [Manual test checklist](#-manual-test-checklist)
- [Diploma showcase flow](#-diploma-showcase-flow)

---

## 🧩 What is Balkon?

**Balkon** is a TypeScript Discord bot built with `discord.js`, `mysql2`, slash commands and interactive Discord menus.

It started as a Discord bot diploma project, then evolved into a small ecosystem:

- 🎮 Discord community tools.
- 💰 Economy and balances.
- 🎒 Inventory and item instances.
- 🏪 Market and bot shop.
- ⚒️ Crafting recipes.
- 🎥 OBS Studio control through a standalone OBS Agent.
- 🧙 Streamer-oriented automation.

It was originally created as a thesis project and for a Discord server: [join here](https://discord.gg/eMrbGMzmyt).
But now it’s a publicly available bot with a shared economy across servers

---

## 🏗️ Ecosystem

<<<<<<< HEAD
<table>
  <thead>
    <tr>
      <th>Project</th>
      <th>Role</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>balkon</code></td>
      <td>Main Discord bot, database logic, relay server, slash commands, interactive menu.</td>
      <td>✅ active</td>
    </tr>
    <tr>
      <td><code>balkon-obs-agent</code></td>
      <td>Standalone desktop app for streamers. Connects local OBS Studio to Balkon relay.</td>
      <td>✅ active</td>
    </tr>
    <tr>
      <td><code>balkon-website</code></td>
      <td>Planned web dashboard with Discord login, streamer/session management and admin UI.</td>
      <td>🧪 planned</td>
    </tr>
  </tbody>
</table>
=======
## REST API Foundation

The repository now has two runtime applications:

- `balkon-bot`: existing Discord bot process (Discord gateway + `discord.js` actions).
- `balkon-api`: new REST API process for the future web dashboard.

Flow:

1. Website calls `balkon-api` only.
2. API uses shared services and database for standard data operations.
3. For Discord-specific actions, API writes a command into `bot_commands` queue.
4. Bot process will consume queue commands and execute Discord API calls.

This does not create a custom Discord API and does not expose bot tokens to frontend clients.

### API local run

1. Install dependencies:
   `npm install`
2. Run API in dev mode:
   `npm run dev:api`
3. Build and run API from `dist`:
   `npm run build`
   `npm run start:api`

Default API base path: `/api`

Implemented first endpoints:

- `GET /api/health`
- `GET /api/version`
- `GET /api/me`
- `GET /api/inventory`
- `GET /api/market`
- `GET /api/botshop`
- `GET /api/craft/recipes`
- `GET /api/admin/stats`
- `POST /api/guilds/:guildId/members/:memberId/kick` (enqueue only, does not directly call Discord)

### Temporary development auth

Discord OAuth routes are scaffolded but not implemented yet.

For local development, pass headers:

- `x-dev-discord-id: <discord_user_id>`
- `x-dev-roles: bot_admin,bot_contributor,guild_founder`

These are temporary placeholders and must be replaced by real OAuth/session middleware before production web rollout.

## Database Workflow
>>>>>>> 1cf33a1 (API have created)

### Runtime flow

```text
Discord user/admin
      ↓
Discord slash command or /botmenu
      ↓
Balkon main bot
      ↓
MySQL / OBS Relay / business logic
      ↓
Balkon OBS Agent on streamer PC
      ↓
Local OBS Studio WebSocket
```

---

## ✨ Features

### Discord and admin tools

- Slash commands through `discord.js`.
- Interactive `/menu` / `/botmenu`.
- Role/member command permissions.
- Guild/member/channel/role persistence.

### Item and economy layer

- Item templates.
- Concrete inventory items.
- Rarities and item types.
- Player inventory.
- ODM/LDM balances.
- Player market.
- Bot shop.
- Original owner tracking.

### Crafting

- Admin-managed craft recipes.
- Recipe ingredients.
- Craft result item generation.
- User-facing craft commands and menu flows.

### OBS / streamer layer

- Streamer registration.
- Primary streamer support.
- Multiple streamers per Discord guild.
- OBS Agent credentials.
- OBS relay WebSocket server.
- `/botmenu → OBS` controls selected streamer's connected OBS Agent.
- Scene listing and scene switching.
- Source visibility control.
- Text input update.
- Media source actions.

---

## ⚡ Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Create env files

PowerShell:

```powershell
Copy-Item .env.dev.example .env.dev
Copy-Item .env.prod.example .env.prod
```

Fill Discord, MySQL and Twitch credentials in the copied files.

### 3. Build

```bash
npm run build
```

### 4. Initialize fresh dev database

Use this only when the database is empty:

```bash
npm run db:init:dev
```

### 5. Apply migrations

```bash
npm run db:migrate:dev
```

Running it twice should skip already applied migrations.

### 6. Register dev slash commands

```bash
npm run dev-deploy
```

### 7. Run dev bot

```bash
npm run dev
```

---

## 🚀 Production deploy

### Direct production start

```bash
npm run build
npm run db:migrate:prod
npm run prod-deploy
npm run start
```

For a completely fresh production database, run this once before migrations:

```bash
npm run db:init:prod
```

### PM2 production flow

```bash
git pull
npm install
npm run db:migrate:prod
npm run build
npm run prod-deploy
pm2 restart all --update-env
pm2 logs
```

Raw PM2 helpers:

```bash
pm2 start ecosystem.config.cjs --only balkon-bot
pm2 restart balkon-bot
pm2 logs balkon-bot
pm2 stop balkon-bot
```

Repository scripts:

```bash
npm run pm2:start
npm run pm2:restart
npm run pm2:logs
npm run pm2:stop
```

---

## 🎥 OBS Agent mode

For production with remote streamers, Balkon uses a standalone OBS Agent desktop app.

### Why this exists

The bot runs on a server. OBS Studio runs on the streamer's PC. Direct server → OBS connection is usually impossible because of NAT, routers and local networks.

So the correct flow is:

```text
Discord /botmenu or /obs command
      ↓
Balkon bot on server
      ↓
OBS relay WebSocket
      ↓
Balkon OBS Agent on streamer PC
      ↓
Local OBS Studio ws://127.0.0.1:4455
```

### Streamer setup

1. Install the standalone `balkon-obs-agent` desktop app.
2. Enable OBS WebSocket in OBS Studio:

   ```text
   OBS Studio → Tools → WebSocket Server Settings
   Enable WebSocket server
   Port: 4455
   ```

3. In Discord, generate credentials:

   ```text
   /streamer register nickname:<name> primary:true
   /streamer agent_pair nickname:<name>
   ```

4. Put the generated values into the desktop app:

   ```env
   OBS_AGENT_RELAY_URL=wss://venomancer.aleksandermilisenko23.thkit.ee/
   OBS_AGENT_ID=<from Discord>
   OBS_AGENT_TOKEN=<from Discord>
   OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
   OBS_WEBSOCKET_PASSWORD=
   ```

5. Click **Connect**.
6. Click **Test OBS**.
7. Check status:

   ```text
   /streamer agent_show nickname:<name>
   ```

### `/botmenu → OBS`

The OBS panel is an OBS Agent control panel.

- It does **not** use server-side `OBS_WEBSOCKET_URL`.
- If one streamer is registered, it auto-selects that streamer.
- If multiple streamers are registered, it shows a streamer dropdown.
- The primary streamer is selected by default.
- Legacy direct `Config / Set config / Clear config` buttons are not shown in relay-agent mode.

Normal OBS menu flow:

```text
/botmenu → OBS
→ select streamer
→ resolve streamer's OBS Agent
→ send command through ObsRelayService
→ OBS Agent executes command on local OBS
```

---

## 🧠 Project workflow

<details open>
<summary><strong>🕹️ Menu and button workflow</strong></summary>

Interactive menu logic is centered around `/menu` and `/botmenu`.

The menu keeps per-user session state, including:

- current screen;
- selected inventory item;
- selected market listing;
- selected craft recipe;
- selected OBS streamer;
- selected OBS scene;
- selected OBS source;
- short-lived OBS status/scenes/source cache.

### General menu rules

When changing screens:

1. Update the session state.
2. Persist the session.
3. Re-render the current menu message.
4. Use ephemeral replies where appropriate.
5. Do not perform heavy operations unless the user explicitly opens that screen or clicks a refresh/action button.

### Button workflow

When adding a new button:

1. Add a new `CommandDTO`.
2. Register it in the constructor:

   ```ts
   this.buttons.set(this.someButton.toString(), this.someHandler);
   ```

3. Implement the handler.
4. Update session state only inside the handler.
5. Re-render through the existing render/update helpers.
6. Add locale strings for all supported languages.
7. Run:

   ```bash
   npm run build
   ```

### Select menu workflow

When adding a new select menu:

1. Add a new `CommandDTO`.
2. Register it:

   ```ts
   this.stringSelectMenu.set(this.someSelect.toString(), this.someSelectHandler);
   ```

3. On selection:
   - update the selected value in session state;
   - clear dependent selections;
   - clear related cache;
   - re-render the current screen.

Dependency examples:

```text
Changing OBS streamer
→ clear selected OBS scene
→ clear selected OBS source
→ clear OBS status/scenes/source cache

Changing OBS scene
→ clear selected OBS source
→ clear cached scene items
```

</details>

<details>
<summary><strong>🎬 OBS menu workflow</strong></summary>

The normal OBS panel must use OBS Agent relay mode.

Do not use direct `OBS_WEBSOCKET_URL` server-side configuration in the normal menu flow.

### OBS panel behavior

When opening the OBS panel:

1. Load streamers for the current Discord guild.
2. If no streamers exist, show:

   ```text
   No streamers registered. Use /streamer register first.
   ```

3. If one streamer exists, select it automatically.
4. If multiple streamers exist, render a streamer select dropdown.
5. Default selection order:
   - previously selected streamer if still valid;
   - primary streamer;
   - first streamer.

The OBS panel should display:

- selected streamer nickname;
- primary marker if applicable;
- OBS Agent id;
- agent online/offline status;
- control mode: `relay-agent`;
- OBS endpoint returned by the agent if available;
- current scene;
- selected scene;
- selected source.

### OBS commands

All normal OBS menu actions must route through the selected streamer's OBS Agent.

Relay commands:

```text
obs.getStatus
obs.listScenes
obs.listSceneItems
obs.switchScene
obs.setSourceVisibility
obs.setTextInputText
obs.triggerMediaInputAction
```

Do not call direct `ObsService` methods from the normal OBS menu panel.

### Scene and source rules

Only fetch scene items after a scene is selected.

```text
select scene
→ clear selected source
→ request obs.listSceneItems for selected scene
→ render source dropdown
```

### Error cases

The OBS panel must show clear errors for:

- missing Discord guild id;
- no registered streamers;
- selected streamer not found;
- selected streamer has no OBS Agent configured;
- selected OBS Agent is offline;
- OBS command timeout;
- scene not selected;
- source not selected;
- OBS command failure.

</details>

<details>
<summary><strong>📡 OBS Agent relay workflow</strong></summary>

The relay keeps active WebSocket connections to OBS Agents.

### Agent connection

```text
agent connects to relay
→ agent sends hello with agentId and agentToken
→ relay validates credentials
→ relay registers socket
→ relay sends hello_ack
```

### Command flow

```text
bot creates requestId
→ bot sends command to agent
→ relay stores pending request
→ agent executes OBS command
→ agent returns command_result
→ relay resolves/rejects pending request
```

### Heartbeat flow

```text
agent sends ping
→ relay responds pong
```

Heartbeat prevents idle WebSocket proxy timeouts. No heartbeat = proxy might go afk like 0/10 mid pudge. 🪝

</details>

---

## 🗄️ Database workflow

The project uses MySQL.

Current database responsibilities include:

- Discord guild/member/role/channel data.
- Command permissions.
- Item templates, rarities, inventory, market, and bot shop.
- Craft recipes and ingredients.
- Streamers and guild-streamer bindings.
- OBS Agent bindings through bot settings.
- Service item OBS actions.
- Twitch notification channels.

### Fresh database setup

For a fresh development database:

```bash
npm run db:init:dev
```

For a fresh production database:

```bash
npm run db:init:prod
```

`db:init` creates the baseline schema from `sql/tables.sql`.

Use it for fresh databases only.

### Migration workflow

For existing databases, use migrations:

```bash
npm run db:migrate:dev
npm run db:migrate:prod
```

Migrations live in:

```text
sql/migrations/
```

Every database structure change must be tracked by a new migration file.

Examples:

- creating a new table;
- adding a column;
- adding an index;
- changing constraints;
- moving data into a new structure;
- creating a new relation table.

When changing the database schema:

1. Update `sql/tables.sql` so fresh databases have the correct baseline schema.
2. Add a new migration file:

   ```text
   sql/migrations/00X_description.sql
   ```

3. Test locally:

   ```bash
   npm run db:migrate:dev
   npm run build
   ```

4. Commit SQL and code changes together.
5. On production:

   ```bash
   git pull
   npm run db:migrate:prod
   npm run build
   pm2 restart all --update-env
   ```

### Migration rules

- Never edit old migrations after they were applied to a shared or production database.
- Never reuse migration numbers.
- Prefer additive migrations.
- Destructive migrations must be reviewed manually.
- Do not drop production data silently.
- Keep migrations idempotent where practical.
- Run migrations before restarting production bot when new code depends on new schema.

### Future OBS Agent table

Currently OBS Agent binding is stored through bot settings.

Future improvement:

```sql
CREATE TABLE streamer_obs_agents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  streamer_id INT NOT NULL,
  agent_id VARCHAR(128) NOT NULL UNIQUE,
  agent_token_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(128) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE CASCADE
);
```

This would allow:

- multiple agents per streamer;
- named agents, for example `Home PC`, `Laptop`, `Studio`;
- default agent selection;
- token revocation;
- last seen tracking;
- better auditing.

Do not add this table without a migration.

---

## 🧪 Manual test checklist

<details>
<summary><strong>After changing OBS/menu/relay logic</strong></summary>

```text
[ ] npm run build passes
[ ] bot deploy succeeds
[ ] desktop OBS Agent connects to relay
[ ] OBS Agent connects to local OBS
[ ] /streamer agent_show shows agent online
[ ] /botmenu opens
[ ] OBS panel selects primary streamer by default
[ ] OBS panel shows streamer/agent status
[ ] OBS panel does not ask for OBS_WEBSOCKET_URL
[ ] scenes refresh works
[ ] scene switching works
[ ] source list loads only after scene selection
[ ] source visibility toggle works
[ ] text update works if source is text input
[ ] media action works if source is media input
[ ] agent Recent Events shows incoming commands
```

</details>

<details>
<summary><strong>After changing database schema</strong></summary>

```text
[ ] new migration file exists
[ ] sql/tables.sql updated if baseline changed
[ ] npm run db:migrate:dev passes
[ ] npm run db:migrate:dev second run skips applied migrations
[ ] npm run build passes
[ ] prod migration applied before restart
```

</details>

<details>
<summary><strong>After changing desktop agent protocol</strong></summary>

```text
[ ] main bot relay updated
[ ] desktop agent updated
[ ] main bot deployed first
[ ] agent release created second
[ ] old agent behavior considered
[ ] auto-update assets uploaded
```

</details>

---

## 📦 OBS Agent release workflow

The desktop OBS Agent is released separately in `balkon-obs-agent`.

For a patch release:

```bash
cd balkon-obs-agent
npm version patch --no-git-tag-version
npm run dist
git add .
git commit -m "chore: release v0.1.X"
git push
```

Create a GitHub Release:

```text
Tag: v0.1.X
Title: Balkon OBS Agent v0.1.X
```

Upload:

```text
Balkon-OBS-Agent-Setup-0.1.X.exe
Balkon-OBS-Agent-Setup-0.1.X.exe.blockmap
latest.yml
```

Every new desktop app version must have:

- updated `package.json` version;
- matching GitHub tag;
- matching installer filename;
- matching `latest.yml`.

---

## 🧪 Diploma showcase flow

Recommended demo route:

1. Run `npm run dev`.
2. Register slash commands with `npm run dev-deploy`.
3. Create one rarity with `/raritycreate`.
4. Create an item template with `/itemcreate`, including an `image_url`.
5. Inspect it with `/iteminfo` or `/itemcatalog`.
6. Give the item to a test user with `/itemgive`.
7. Show `/inventory` and `/itemview`.
8. Put one item on the market with `/market sell` and buy it from another user with `/market buy`.
9. Add one fixed bot listing with `/botshop add`, then demonstrate `/botshop buy` and `/botshop sell`.
10. Open `/menu` and show balance, inventory, market, bot shop and admin shortcuts.
11. Create one craft recipe and show `/craft` consuming materials into a crafted result item.
12. Start `balkon-obs-agent`, connect it to OBS, then show `/botmenu → OBS` scene control.

<div align="center">

### 🏴‍☠️ End of README. Go farm items, not technical debt.

<img src="https://media.tenor.com/chNGPcAXt4QAAAAd/pirat.gif" width="260" />

</div>
