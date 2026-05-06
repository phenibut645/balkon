import path from "path";
import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const envFileName = process.env.NODE_ENV === "prod" ? ".env.prod" : ".env.dev";
const envFilePath = path.join(rootDir, envFileName);

dotenv.config({ path: envFilePath, override: true, quiet: true });

const discordUserId = String(process.argv[2] ?? "").trim();
const discordToken = String(process.env.DISCORD_TOKEN ?? "").trim();

if (!/^\d{5,32}$/.test(discordUserId)) {
  console.error("Usage: node scripts/find_user_guilds.mjs <discord_user_id>");
  process.exit(1);
}

if (!discordToken) {
  console.error("Missing DISCORD_TOKEN in environment.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function main() {
  await client.login(discordToken);
  await client.guilds.fetch();

  const guilds = [...client.guilds.cache.values()];
  const foundIn = [];
  const failedGuilds = [];

  console.log(`Checking user ${discordUserId} in ${guilds.length} guild(s)...`);

  for (const guildPreview of guilds) {
    try {
      const guild = await guildPreview.fetch();
      const member = await guild.members.fetch(discordUserId).catch(() => null);

      if (!member) {
        continue;
      }

      foundIn.push({
        guildId: guild.id,
        guildName: guild.name,
        nickname: member.nickname ?? null,
        displayName: member.displayName,
        joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
      });
    } catch (error) {
      failedGuilds.push({
        guildId: guildPreview.id,
        guildName: guildPreview.name ?? "Unknown guild",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!foundIn.length) {
    console.log("User was not found in any guild available to the bot.");
  } else {
    console.log("\nUser found in guilds:");
    for (const entry of foundIn) {
      console.log(`- ${entry.guildName} (${entry.guildId}) | displayName=${entry.displayName} | nickname=${entry.nickname ?? "-"} | joinedAt=${entry.joinedAt ?? "-"}`);
    }
  }

  if (failedGuilds.length) {
    console.log("\nGuilds that could not be checked:");
    for (const entry of failedGuilds) {
      console.log(`- ${entry.guildName} (${entry.guildId}) | ${entry.reason}`);
    }
  }

  console.log("\nSummary:");
  console.log(JSON.stringify({
    userId: discordUserId,
    checkedGuilds: guilds.length,
    foundInCount: foundIn.length,
    failedGuildsCount: failedGuilds.length,
    foundIn,
    failedGuilds,
  }, null, 2));
}

main()
  .catch(error => {
    console.error("User guild lookup failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (client.isReady()) {
      await client.destroy();
      return;
    }

    try {
      await client.destroy();
    } catch {
      // ignore cleanup errors
    }
  });