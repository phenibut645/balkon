import { Client } from "discord.js";
import { DataBaseHandler } from "./DataBaseHandler.js";
import { GuildsDB } from "../types/database.types.js";

export interface DataBaseSynchronisationResponse {
    success: boolean
}

export async function syncDiscordClientWithDatabase(client: Client): Promise<DataBaseSynchronisationResponse> {
    const dbHandler = DataBaseHandler.getInstance();
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

    discordSet.forEach(id => {
    if (!dbSet.has(id)) {
        dbHandler.addGuildToDB(id);
    }
    });

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