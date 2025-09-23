import { Guild } from "discord.js";
import { DataBaseHandler, dataBaseHandler } from "../core/DataBaseHandler.js";

export const guildDeleteController = async (guild: Guild) => {
  console.log(`📝 Deleting ${guild.name} (Guild) from database...`)
  const response = await dataBaseHandler.deleteGuildFromDB(guild);
  if(DataBaseHandler.isSuccess(response)){
    console.log(`✅ ${guild.name} (Guild) has deleted from database!`)
  }
  else{
    console.log(`❌ ${guild.name} (Guild) hasn't deleted from database! Message: ${response.error}`);
  }
}