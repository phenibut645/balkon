import { Client } from "discord.js";
import { syncDiscordClientWithDatabase } from "../utils/syncWithDatabase.js";

export const clientReadyController = async (client: Client) => {
  console.log(`✅ Bot joined as ${client.user?.tag}`);
  console.log(`🛠️ Synchronisation of current data with the database...`)
  const synchronistionResponse = await syncDiscordClientWithDatabase(client);
  if(synchronistionResponse.success) {
    console.log(`✅ Client is synchronised with database!`)
  }
  else {
    console.log(`❌ Client didn't synchronised with database!`)
  }
}