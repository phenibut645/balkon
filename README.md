# 🚬 Balkon

The bot was created for [Discord Server](https://discord.gg/eMrbGMzmyt)

Written in Node.js using mysql2 for the database and discord.js/rest for communication with the Discord API.

<p align="center">
  <img src="https://media.tenor.com/chNGPcAXt4QAAAAd/pirat.gif" width="300" />
  <img src="https://media.tenor.com/SxzG9vFWtTcAAAAM/zxc-cat.gif" width="224" />
  <img src="https://images6.fanpop.com/image/photos/41000000/Ken-Kaneki-tokyo-ghoul-GIF-anime-41018150-500-395.gif" width="283" />
</p>

## Setup

1. Install dependencies:
   `npm install`
2. Create local env files from the templates:
   `Copy-Item .env.dev.example .env.dev`
   `Copy-Item .env.prod.example .env.prod`
3. Fill in Discord, MySQL and Twitch credentials in the copied files.
4. Build the bot:
   `npm run build`
5. Initialize the database schema if the database is empty:
   `npm run db:init:dev`
6. Apply incremental schema migrations:
   `npm run db:migrate:dev`
7. Run the bot in development mode:
   `npm run dev`
8. Register slash commands when needed:
   `npm run dev-deploy`

## Production Start

Direct production start:

1. Build the bot:
   `npm run build`
2. Initialize the production database schema if the database is empty:
   `npm run db:init:prod`
3. Apply incremental schema migrations:
   `npm run db:migrate:prod`
4. Register production slash commands if needed:
   `npm run prod-deploy`
5. Start the compiled bot in production mode:
   `npm run start`

One-liner for full production start:

`npm run start:prod`

If you want to run production without building `dist` first, use:

`npm run start:prod:tsx`

## PM2 Start

The repository now includes `ecosystem.config.cjs` for PM2.

Typical flow:

1. Build the bot:
   `npm run build`
2. Initialize the production database schema if the database is empty:
   `npm run db:init:prod`
3. Apply incremental schema migrations:
   `npm run db:migrate:prod`
4. Register production slash commands if needed:
   `npm run prod-deploy`
5. Start through PM2:
   `npm run pm2:start`
6. Check logs:
   `npm run pm2:logs`
7. Restart after updates:
   `npm run pm2:restart`
8. Stop the process:
   `npm run pm2:stop`

Equivalent raw PM2 commands:

- `pm2 start ecosystem.config.cjs --only balkon-bot`
- `pm2 restart balkon-bot`
- `pm2 logs balkon-bot`
- `pm2 stop balkon-bot`

## Project workflow

This project is a Discord bot ecosystem built around Discord slash commands, interactive Discord menus, MySQL storage, OBS Agent relay integration, and streamer-oriented automation.

The project currently consists of three logical parts:

- `balkon` — main Discord bot, database access, slash commands, OBS relay, and interactive menu.
- `balkon-obs-agent` — standalone desktop app that runs on a streamer's PC and connects local OBS Studio to the bot relay.
- `balkon-website` — planned web dashboard for Discord login, configuration, streamer/agent management, and selected bot features.

### Runtime architecture

#### Main bot

The main bot is responsible for:

- Discord slash commands.
- Interactive `/menu` / `/botmenu`.
- MySQL database access.
- Economy, inventory, market, bot shop, and crafting logic.
- Streamer registration.
- OBS Agent credential generation.
- OBS relay WebSocket server.
- Routing OBS commands to the correct connected OBS Agent.

The bot should be treated as the source of truth for Discord-facing actions and database mutations.

#### OBS Agent

The OBS Agent is a standalone app installed by a streamer. It connects to the public relay:

```env
OBS_AGENT_RELAY_URL=wss://your-relay-domain.example/
```

and also connects locally to OBS Studio:

```env
OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
```

The agent receives OBS commands from the bot relay and executes them on the local OBS Studio instance.

The streamer should not clone or run the full bot repository locally.

#### Website

The website should eventually provide a clean dashboard for:

- Discord login.
- User profile.
- Streamer profile management.
- OBS Agent pairing/session management.
- Inventory/catalog/craft views.
- Admin configuration panels.

The website should not replace the bot relay. OBS real-time control remains:

```text
Discord command/menu
→ main bot
→ OBS relay
→ streamer OBS Agent
→ local OBS Studio
```

### Menu and button workflow

Interactive menu logic is centered around `/menu` or `/botmenu`.

The menu keeps per-user session state, including:

- current screen;
- selected inventory item;
- selected market listing;
- selected craft recipe;
- selected OBS streamer;
- selected OBS scene;
- selected OBS source;
- short-lived OBS status/scenes/source cache.

#### General menu rules

When changing screens:

1. Update the session state.
2. Persist the session.
3. Re-render the current menu message.
4. Use ephemeral replies where appropriate.
5. Never perform heavy operations unless the user explicitly opens that screen or clicks refresh/action buttons.

#### Button workflow

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

#### Select menu workflow

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

### OBS menu workflow

The normal OBS panel must use OBS Agent relay mode.

Do not use direct `OBS_WEBSOCKET_URL` server-side configuration in the normal menu flow.

Correct production flow:

```text
/botmenu → OBS
→ select streamer
→ resolve streamer's OBS Agent
→ send command through ObsRelayService
→ OBS Agent executes command on local OBS
```

#### OBS panel behavior

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

#### OBS streamer selection

When the selected streamer changes:

1. Store the selected streamer in session state.
2. Clear selected scene.
3. Clear selected source.
4. Clear OBS status/scenes/source cache.
5. Re-render OBS panel.

#### OBS commands

All normal OBS menu actions must route through the selected streamer's OBS Agent.

Use relay commands:

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

#### OBS status refresh

When refreshing OBS status:

1. Resolve selected streamer.
2. Verify OBS Agent is configured.
3. Verify OBS Agent is online.
4. Send:

   ```text
   obs.getStatus
   ```

5. Cache the result briefly.
6. Re-render panel.

#### OBS scenes refresh

When refreshing scenes:

1. Resolve selected streamer.
2. Verify OBS Agent is online.
3. Send:

   ```text
   obs.listScenes
   ```

4. Cache scene list briefly.
5. Re-render panel.

#### OBS scene items

Only fetch scene items after a scene is selected.

Do not fetch scene items on every render.

Flow:

```text
select scene
→ clear selected source
→ request obs.listSceneItems for selected scene
→ render source dropdown
```

#### OBS error handling

The OBS panel must show clear user-facing errors for:

- missing Discord guild id;
- no registered streamers;
- selected streamer not found;
- selected streamer has no OBS Agent configured;
- selected OBS Agent is offline;
- OBS command timeout;
- scene not selected;
- source not selected;
- OBS command failure.

### OBS Agent relay workflow

The relay is responsible for keeping active WebSocket connections to OBS Agents.

Agent connection flow:

```text
agent connects to relay
→ agent sends hello with agentId and agentToken
→ relay validates credentials
→ relay registers socket
→ relay sends hello_ack
```

Command flow:

```text
bot creates requestId
→ bot sends command to agent
→ relay stores pending request
→ agent executes OBS command
→ agent returns command_result
→ relay resolves/rejects pending request
```

Heartbeat flow:

```text
agent sends ping
→ relay responds pong
```

Heartbeat exists to prevent idle WebSocket proxy timeouts.

### Database workflow

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

#### Fresh database setup

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

#### Database migration workflow

For existing databases, use migrations.

Migrations must live in:

```text
sql/migrations/
```

Every database structure change must be tracked by a new migration file.

Examples of schema changes requiring migrations:

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

#### Migration rules

- Never edit old migrations after they were applied to a shared or production database.
- Never reuse migration numbers.
- Prefer additive migrations.
- Destructive migrations must be reviewed manually.
- Do not drop production data silently.
- Keep migrations idempotent where practical.
- Run migrations before restarting production bot when new code depends on new schema.

#### Recommended future OBS Agent table

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

### Development workflow

Local development:

```bash
npm install
npm run db:init:dev
npm run db:migrate:dev
npm run dev-deploy
npm run dev
```

Before every commit:

```bash
npm run build
```

For development Discord commands:

```bash
npm run dev-deploy
```

For production Discord commands:

```bash
npm run prod-deploy
```

### Production deploy workflow

Production deploy should follow this order:

```bash
git pull
npm install
npm run db:migrate:prod
npm run build
pm2 restart all --update-env
pm2 logs
```

If no database migrations were added, `db:migrate:prod` should safely skip already applied migrations.

Expected checks after deploy:

- bot is online;
- OBS relay is listening;
- `/streamer list` works;
- `/streamer agent_show` works;
- `/botmenu` opens;
- `/botmenu → OBS` shows relay-agent mode;
- `/obs` or menu OBS commands reach the desktop agent.

### Release workflow for OBS Agent

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

Create a GitHub Release with:

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

### Manual test checklist

After changing OBS/menu/relay logic:

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

After changing database schema:

```text
[ ] new migration file exists
[ ] sql/tables.sql updated if baseline changed
[ ] npm run db:migrate:dev passes
[ ] npm run db:migrate:dev second run skips applied migrations
[ ] npm run build passes
[ ] prod migration applied before restart
```

After changing desktop agent protocol:

```text
[ ] main bot relay updated
[ ] desktop agent updated
[ ] main bot deployed first
[ ] agent release created second
[ ] old agent behavior considered
[ ] auto-update assets uploaded
```

## Database Workflow

Use the two database commands for different jobs:

- `db:init` creates the base tables from `sql/tables.sql` for a fresh database.
- `db:migrate` applies incremental schema updates from `sql/migrations` to an existing database.

For production deploys, run:

1. `npm run db:migrate:prod`
2. `npm run build`
3. `pm2 restart all --update-env`

### Database change workflow

1. Change `sql/tables.sql` if the baseline schema changes.
2. Add a new `sql/migrations/00X_description.sql` file.
3. Test with `npm run db:migrate:dev`.
4. Commit SQL and code changes together.
5. On production, run `npm run db:migrate:prod` before restarting the bot.

Rules for future schema work:

- Do not change production database structure through `sql/tables.sql` only.
- Every schema change must be added as a new numbered migration under `sql/migrations`.
- `sql/tables.sql` is the baseline for fresh databases.
- Migrations are for incremental updates to existing databases.
- When adding a new table or column, update both the baseline schema and a new migration file.

## Environment variables

Current runtime requires these values:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `DB_HOST` (preferred) or `HOST`
- `DB_PORT` (optional, defaults to `3306`)
- `DB_USER` (preferred) or `USER`
- `DB_PASSWORD` (preferred) or `PASSWORD`
- `DB_NAME` (preferred) or `DATABASE`
- `TWITCH_CLIENT_ID`
- `TWITCH_SECRET_ID`
- `DEVELOPER_DISCORD_ID`
- `BOT_ADMIN_IDS` (optional, comma-separated)

Reserved variables for upcoming diploma features:

- `OBS_WEBSOCKET_URL`
- `OBS_WEBSOCKET_PASSWORD`
- `OBS_AGENT_RELAY_PORT`
- `OBS_AGENT_REQUEST_TIMEOUT_MS`
- `WEB_SESSION_SECRET`
- `WEB_PORT`

## OBS Agent Mode

For production with remote streamers, Balkon now uses a separate standalone OBS Agent app:

- The main Discord bot runs on your server.
- The bot starts a WebSocket relay on `OBS_AGENT_RELAY_PORT`.
- Each streamer runs the standalone `balkon-obs-agent` desktop app on the same PC as OBS.
- The local agent connects outward to your relay and controls local OBS via `ws://127.0.0.1:4455`.

Why this matters:

- The bot no longer needs direct network access to the streamer's OBS.
- OBS stays local to the streamer PC.
- NAT and home-router limitations are avoided because the agent uses an outgoing connection.
- Streamers do not need to clone this full Discord bot repository or install bot/database dependencies.

Standalone agent setup on the streamer PC:

1. Install or run the separate `balkon-obs-agent` project.
2. Generate credentials from Discord with `/streamer agent_pair`.
3. Put the generated Agent ID and Agent Token into the desktop app.
4. Use Relay URL `wss://venomancer.aleksandermilisenko23.thkit.ee/` for the current hosted relay.
5. Keep OBS WebSocket URL as `ws://127.0.0.1:4455` unless OBS uses a different port.
6. Click `Connect`, then `Test OBS`.

The old `npm run agent` CLI prototype and `.env.agent.example` remain in this repository only as a legacy/development reference. Production streamers should use the standalone desktop app instead.

Bot-side binding flow:

1. Register the streamer with `/streamer register`.
2. Generate remote agent credentials with `/streamer agent_pair`.
3. Put the generated values into `balkon-obs-agent` on the streamer PC.
4. Connect the app and check status with `/streamer agent_show` or `/streamer list`.
5. Use `/serviceuse` and service items will route OBS actions through that streamer's local agent.

### /botmenu OBS panel

The `/botmenu → OBS` panel is a clean OBS Agent control panel. It does not use a direct
`OBS_WEBSOCKET_URL` connection from the bot server.

- A guild can have multiple streamers registered, each with their own OBS Agent.
- If only one streamer is registered, the panel auto-selects that streamer.
- If multiple streamers are registered, a **Select Streamer** dropdown appears so you can choose which streamer's OBS to control.
- The primary streamer is selected by default when opening the panel.
- To register a streamer: `/streamer register nickname:<name>`
- To pair an OBS Agent: `/streamer agent_pair nickname:<name>`
- Start Balkon OBS Agent desktop app on the streamer PC.
- Then use `/botmenu → OBS` to select the streamer and control OBS via relay.

Legacy direct `Config / Set config / Clear config` buttons are not shown in the relay-agent panel.

Manual fallback still exists:

- If you want to bring your own stable `agent_id` and `agent_token`, you can still use `/streamer agent_set`.

## Current Item MVP

This diploma-ready MVP already supports the core admin-managed item flow:

- `/raritycreate` creates a custom rarity with an optional embed color.
- `/itemcreate` creates an item template with name, description, rarity, type, image URL, tradeability and optional bot sell price.
- `/itemcatalog` shows the latest item templates.
- `/iteminfo` shows the full card of one item template, including the image.
- `/itemgive` issues one or more concrete item copies to a Discord user.
- `/inventory` shows a user's inventory. Foreign inventory viewing is restricted to bot admins.
- `/itemview` shows the full card of one concrete inventory item.
- `/menu` provides quick navigation and item-management shortcuts.

The broader diploma demo flow already includes the first connected economy loop:

- `/balance` shows current ODM and LDM.
- `/market list`, `/market sell`, `/market buy` cover the global player-to-player market.
- `/botshop list`, `/botshop add`, `/botshop buy`, `/botshop sell` cover fixed-price bot commerce.

The next diploma-ready gameplay layer now includes:

- `/craftrecipecreate` for admin-managed craft recipes.
- `/craftrecipes`, `/craftinfo`, `/craft` for user crafting.
- `/obs status`, `/obs scenes`, `/obs switch_scene`, `/obs source_visibility`, `/obs reconnect` for OBS WebSocket interaction.

Recommended showcase flow:

1. Run `npm run dev`.
2. Register slash commands with `npm run dev-deploy`.
3. As a bot admin, create one rarity with `/raritycreate`.
4. Create an item template with `/itemcreate`, including an `image_url`.
5. Inspect it with `/iteminfo` or `/itemcatalog`.
6. Give the item to a test user with `/itemgive`.
7. Show `/inventory` and `/itemview` in Discord to demonstrate concrete item instances, original owner tracking and image rendering.
8. Put one item on the market with `/market sell` and buy it from another user with `/market buy`.
9. Add one fixed bot listing with `/botshop add`, then demonstrate `/botshop buy` and `/botshop sell`.
10. Open `/menu` and show that the user can navigate between balance, inventory, market, bot shop and admin shortcuts.
11. Create one craft recipe and show `/craft` consuming materials into a crafted result item.
12. If OBS is available, show `/obs status` and `/obs switch_scene` as the streamer-control extension point.


<p align="center">
  <img src="https://media.tenor.com/chNGPcAXt4QAAAAd/pirat.gif" width="300" />
  <img src="https://media.tenor.com/SxzG9vFWtTcAAAAM/zxc-cat.gif" width="224" />
  <img src="https://images6.fanpop.com/image/photos/41000000/Ken-Kaneki-tokyo-ghoul-GIF-anime-41018150-500-395.gif" width="283" />
</p>
