import { Client } from "discord.js";
import { saveGuildBootstrapStatus } from "../core/BotAdmin.js";
import { DataBaseHandler } from "../core/DataBaseHandler.js";
import { DiscordMetadataService } from "../core/DiscordMetadataService.js";
import { GuildsDB } from "../types/database.types.js";

export interface DataBaseSynchronisationResponse {
    success: boolean
}

export async function syncDiscordClientWithDatabase(client: Client): Promise<DataBaseSynchronisationResponse> {
    const dbHandler = DataBaseHandler.getInstance();
    const metadataService = DiscordMetadataService.getInstance();
    const dbGuilds = await dbHandler.getFromTable<GuildsDB>("guilds");
    const discordGuilds = await client.guilds.fetch();
    
    if(!DataBaseHandler.isSuccess(dbGuilds)){
        return {
            success: false
        }
    }

    const discordGuildIds = discordGuilds.map(g => g.id); 
    const dbGuildIds = dbGuilds.data.map(g => g.ds_guild_id);

    const discordSet = new Set(discordGuildIds);
    const dbSet = new Set(dbGuildIds);

    for (const discordGuild of discordGuilds.values()) {
        const guild = await discordGuild.fetch();
        await metadataService.upsertGuildDiscordMetadata({
            guildId: guild.id,
            displayName: guild.name,
            iconUrl: guild.iconURL({ size: 128 }) ?? null,
        });
        const bootstrapResponse = await dbHandler.ensureGuildBootstrap(guild);
        if (DataBaseHandler.isFail(bootstrapResponse)) {
            await saveGuildBootstrapStatus({
                guildId: guild.id,
                guildName: guild.name,
                source: "clientReady",
                status: "error",
                updatedAt: new Date().toISOString(),
                message: bootstrapResponse.error.message ?? bootstrapResponse.error.reason,
            });
            return {
                success: false
            }
        }

        await saveGuildBootstrapStatus({
            guildId: guild.id,
            guildName: guild.name,
            source: "clientReady",
            status: "ok",
            syncedChannels: bootstrapResponse.data.syncedChannels,
            removedChannels: bootstrapResponse.data.removedChannels,
            syncedRoles: bootstrapResponse.data.syncedRoles,
            removedRoles: bootstrapResponse.data.removedRoles,
            configuredLogChannels: bootstrapResponse.data.configuredLogChannels,
            bootstrapChannelId: bootstrapResponse.data.bootstrapChannelId,
            updatedAt: new Date().toISOString(),
            message: "Bootstrap synchronised on startup",
        });
    }

    dbSet.forEach(id => {
    if (!discordSet.has(id)) {
        dbHandler.deleteGuildFromDB(id);
    }
    });

    return {
        success: true
    }
}

// - ADD SYNCHRONISATION FOR CHANNELS, ROLES AND OTHER !
// - MODIFY RESPONSE FOR ERRORS