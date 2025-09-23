import { Guild } from "discord.js";
import { dataBaseHandler, DataBaseHandler } from "../core/DataBaseHandler.js";

export const guildCreateController = async (guild: Guild) => {
  console.log(`📝 ${guild.name} (Guild) is adding to database...`)
  const response = await dataBaseHandler.addGuildToDB(guild);
  if(DataBaseHandler.isSuccess(response)){
    console.log(`✅ ${guild.name} (Guild) has added!`)
  }
  else{
    console.log(`❌ ${guild.name} hasn't added! Message: ${response.error}`)
    
  }
}