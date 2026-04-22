import { Guild } from "discord.js";
import { saveGuildBootstrapStatus } from "../core/BotAdmin.js";
import { dataBaseHandler, DataBaseHandler } from "../core/DataBaseHandler.js";

export const guildCreateController = async (guild: Guild) => {
  console.log(`📝 ${guild.name} (Guild) is adding to database...`)
  const response = await dataBaseHandler.ensureGuildBootstrap(guild);
  if(DataBaseHandler.isSuccess(response)){
    if (response.data.bootstrapChannelId) {
      const bootstrapChannel = guild.channels.cache.get(response.data.bootstrapChannelId);
      if (bootstrapChannel?.isTextBased() && !bootstrapChannel.isThread()) {
        await bootstrapChannel.send([
          "Thanks for adding Balkon.",
          "Server bootstrap is complete.",
          "Use /menu to start the user flow or /botmenu if you are a bot contributor.",
        ].join("\n"));
      }
    }

    await saveGuildBootstrapStatus({
      guildId: guild.id,
      guildName: guild.name,
      source: "guildCreate",
      status: "ok",
      syncedChannels: response.data.syncedChannels,
      removedChannels: response.data.removedChannels,
      syncedRoles: response.data.syncedRoles,
      removedRoles: response.data.removedRoles,
      configuredLogChannels: response.data.configuredLogChannels,
      bootstrapChannelId: response.data.bootstrapChannelId,
      updatedAt: new Date().toISOString(),
      message: "Bootstrap completed",
    });

    console.log(`✅ ${guild.name} (Guild) has added! Channels synced: ${response.data.syncedChannels}. Roles synced: ${response.data.syncedRoles}. Removed channels: ${response.data.removedChannels}. Removed roles: ${response.data.removedRoles}.`)
  }
  else{
    await saveGuildBootstrapStatus({
      guildId: guild.id,
      guildName: guild.name,
      source: "guildCreate",
      status: "error",
      updatedAt: new Date().toISOString(),
      message: response.error.message ?? response.error.reason,
    });
    console.log(`❌ ${guild.name} hasn't added! Message: ${response.error}`)
    
  }
}