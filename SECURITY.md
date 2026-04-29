# 🔐 Security Policy

Balkon handles Discord bot credentials, MySQL credentials, OBS Agent tokens and streamer automation. Treat secrets seriously even if the project has pirate/zxc energy in the README.

---

## Supported scope

This policy applies to the main repository:

- `phenibut645/balkon` — Discord bot, database access, OBS relay and command/menu logic.

Related repositories have their own runtime responsibilities:

- `phenibut645/balkon-obs-agent` — desktop OBS Agent installed on streamer PCs.
- `phenibut645/balkon-website` — planned web dashboard.

Security issues that affect protocol boundaries may require coordinated fixes across multiple repos.

---

## Never commit secrets

Do not commit:

- `DISCORD_TOKEN`
- Discord application secrets
- database passwords
- production `.env` files
- OBS Agent tokens
- streamer pairing tokens
- SSH private keys
- Zone.ee credentials
- logs containing tokens or database credentials

Safe files are examples/templates only:

```text
.env.example
.env.dev.example
.env.prod.example
.env.agent.example
```

Real files such as `.env.dev`, `.env.prod`, `.env.agent` must remain local/private.

---

## If a Discord token leaks

1. Go to the Discord Developer Portal.
2. Reset the bot token.
3. Update production environment variables.
4. Restart the bot:

   ```bash
   pm2 restart all --update-env
   ```

5. Check recent commits/logs and remove the leaked value if needed.

---

## If an OBS Agent token leaks

Regenerate credentials:

```text
/streamer agent_pair nickname:<streamer>
```

Then update the streamer desktop app with the new Agent ID / Agent Token.

If token revocation gets a dedicated database table later, revoke the old token there too.

---

## Database safety

- Do not run destructive SQL on production without review.
- Do not change production schema manually without a migration.
- Every schema change must use `sql/migrations/`.
- Run production migrations before restarting code that depends on the new schema.

Production deploy order:

```bash
git pull
npm install
npm run db:migrate:prod
npm run build
pm2 restart all --update-env
```

---

## OBS relay safety

The relay accepts long-lived WebSocket connections from OBS Agents.

Security expectations:

- validate `agentId` and `agentToken` during handshake;
- never log full agent tokens;
- keep heartbeat lightweight;
- treat unknown command types as errors;
- keep clear timeout behavior for pending commands;
- do not expose relay internals to unauthenticated clients.

---

## Reporting security issues

This is currently a personal/diploma project, not a large public security program.

If you find a security issue:

1. Do not publish real tokens or exploit details in a public issue.
2. Contact the repository owner directly through GitHub/Discord.
3. Include:
   - affected repository;
   - affected feature;
   - reproduction steps;
   - expected impact;
   - screenshots/logs with secrets removed.

---

## Security checklist before release

```text
[ ] no real .env files committed
[ ] no Discord tokens in git diff
[ ] no OBS Agent tokens in git diff
[ ] no database passwords in README/docs
[ ] npm run build passes
[ ] migrations are non-destructive or reviewed
[ ] production restart uses --update-env when env changed
```
