# 📜 Changelog

All notable changes to the main `balkon` Discord bot repository are documented here.

This changelog covers only the main bot repository:

- Discord commands
- interactive `/menu` / `/botmenu`
- MySQL schema/migrations
- OBS relay server
- streamer registration and agent binding logic

Related projects are versioned separately:

- `phenibut645/balkon-obs-agent` — standalone desktop OBS Agent app.
- `phenibut645/balkon-website` — planned web dashboard.

---

## Unreleased

### Planned

- Dedicated `streamer_obs_agents` table instead of storing OBS Agent bindings in generic bot settings.
- Better `last_seen_at` tracking for OBS Agents.
- Web dashboard with Discord OAuth.
- More screenshots and demo GIFs in documentation.
- CI workflow for build validation.

---

## v2.0.0 — OBS Agent architecture era

### Added

- Standalone OBS Agent workflow for remote streamers.
- OBS relay WebSocket server in the main bot.
- Agent pairing flow through streamer commands.
- Multi-streamer OBS control in `/botmenu → OBS`.
- Relay heartbeat support to keep WebSocket connections alive behind proxies.
- Database migration workflow with `sql/migrations`.
- Documentation for OBS Agent setup, migration workflow and production deploy flow.
- README visual refresh with project badges and VNMCR/zxc flavor.

### Changed

- Production OBS control now uses relay-agent mode instead of direct server-side OBS WebSocket config.
- `/botmenu → OBS` targets the selected streamer's connected OBS Agent.
- Legacy direct OBS config is treated as development/fallback behavior.
- Streamers no longer need to clone the main bot repo to control OBS.

### Notes

- The desktop OBS Agent is released separately in `balkon-obs-agent`.
- If the relay protocol changes, update the main bot first, then release a compatible OBS Agent version.

---

## v1.x — Economy, inventory and menu MVP

### Added

- Item template creation.
- Concrete inventory items.
- Rarity and item type support.
- Player inventory commands.
- Global player market.
- Bot shop.
- Craft recipe system.
- Interactive `/menu` navigation.
- Basic OBS command support.

---

## v0.x — Initial bot foundation

### Added

- Discord bot bootstrap.
- Slash command registration.
- MySQL persistence.
- Basic guild/member/role/channel data handling.
- Permission-oriented command structure.

---

## Release notes convention

Use sections when possible:

```text
### Added
### Changed
### Fixed
### Removed
### Security
```

Commit examples:

```text
feat: support multi-streamer OBS agent menu
fix: keep relay connection alive with heartbeat
chore: add database migration workflow
docs: update OBS Agent setup guide
```
