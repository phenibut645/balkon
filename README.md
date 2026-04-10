# 🚬 Balkon

The bot was created for [Discord Server](https://discord.gg/eMrbGMzmyt)

Written in Node.js using mysql2 for the database and discord.js/rest for communication with the Discord API.

## Setup

1. Install dependencies:
   `npm install`
2. Create local env files from the templates:
   `Copy-Item .env.dev.example .env.dev`
   `Copy-Item .env.prod.example .env.prod`
3. Fill in Discord, MySQL and Twitch credentials in the copied files.
4. Run the bot in development mode:
   `npm run dev`
5. Register slash commands when needed:
   `npm run dev-deploy`

## Production Start

Direct production start:

1. Build the bot:
   `npm run build`
2. Register production slash commands if needed:
   `npm run prod-deploy`
3. Start the compiled bot in production mode:
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
2. Register production slash commands if needed:
   `npm run prod-deploy`
3. Start through PM2:
   `npm run pm2:start`
4. Check logs:
   `npm run pm2:logs`
5. Restart after updates:
   `npm run pm2:restart`
6. Stop the process:
   `npm run pm2:stop`

Equivalent raw PM2 commands:

- `pm2 start ecosystem.config.cjs --only balkon-bot`
- `pm2 restart balkon-bot`
- `pm2 logs balkon-bot`
- `pm2 stop balkon-bot`

## Environment variables

Current runtime requires these values:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `HOST`
- `USER`
- `PASSWORD`
- `DATABASE`
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

For production with remote streamers, the bot now supports an agent-based OBS flow:

- The main Discord bot runs on your server.
- The bot starts a WebSocket relay on `OBS_AGENT_RELAY_PORT`.
- Each streamer runs a local `obs_agent` process on the same PC as OBS.
- The local agent connects outward to your relay and controls local OBS via `ws://127.0.0.1:4455`.

Why this matters:

- The bot no longer needs direct network access to the streamer's OBS.
- OBS stays local to the streamer PC.
- NAT and home-router limitations are avoided because the agent uses an outgoing connection.

Agent setup on the streamer PC:

1. Copy `.env.agent.example` to `.env.agent`.
2. Fill in `OBS_AGENT_RELAY_URL`, `OBS_AGENT_ID`, `OBS_AGENT_TOKEN`.
3. Point local OBS connection to `OBS_WEBSOCKET_URL=ws://127.0.0.1:4455` and set password if needed.
4. Start the local agent with `npm run agent`.

Bot-side binding flow:

1. Register the streamer with `/streamer register`.
2. Bind the streamer's agent with `/streamer agent_set`.
3. Check status with `/streamer agent_show` or `/streamer list`.
4. Use `/serviceuse` and service items will route OBS actions through that streamer's local agent.

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
