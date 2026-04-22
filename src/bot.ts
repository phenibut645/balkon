import { ButtonInteraction, Client, Events, GatewayIntentBits, Interaction, Partials, VoiceChannel } from "discord.js";
import * as ping from "./commands/ping.js";
import path from "path";
import fs from "fs";
import { DISCORD_TOKEN, GUILD_ID } from "./config.js";
import { checkStream } from "./utils/checkStream.js";
import { IStreamers } from "./types/streamers.types.js";
import { DataBaseHandler } from "./core/DataBaseHandler.js";
import { clientReadyController } from "./events/clientReady.js";
import { interactionCreateController } from "./events/interactionCreate.js";
import { guildCreateController } from "./events/guildCreate.js";
import { guildDeleteController } from "./events/guildDelete.js";
import { messageCreateController } from "./events/messageCreate.js";
import { obsRelayService } from "./core/ObsRelayService.js";
import { BalkonPlusSubscriptionService } from "./core/BalkonPlusSubscriptionService.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent  
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
    Partials.ThreadMember
  ]
});

const balkonPlusSubscriptionService = new BalkonPlusSubscriptionService(client);

client.once("clientReady", async readyClient => {
  await clientReadyController(readyClient);
  await balkonPlusSubscriptionService.start();
});

client.on("interactionCreate", interactionCreateController);
client.on("guildCreate", guildCreateController)
client.on("guildDelete", guildDeleteController)
client.on("messageCreate", messageCreateController)
client.on("entitlementCreate", async entitlement => {
  await balkonPlusSubscriptionService.handleEntitlementEvent(entitlement.userId, "entitlementCreate");
});
client.on("entitlementUpdate", async (_, entitlement) => {
  await balkonPlusSubscriptionService.handleEntitlementEvent(entitlement.userId, "entitlementUpdate");
});
client.on("entitlementDelete", async entitlement => {
  await balkonPlusSubscriptionService.handleEntitlementEvent(entitlement.userId, "entitlementDelete");
});

obsRelayService.start();

client.login(DISCORD_TOKEN);

let streamers: IStreamers
  // "pr1smoo": {
  //   "guild_id": GUILD_ID!,
  //   "channels": [{
  //     "id": "1416520681272774716",
  //     "message_id": null
  //   }],
  //   "is_live": false,
  //   "twitch_url": "https://www.twitch.tv/pr1smoo"
  // },
  // "justhatemeeecatq": {
  //   "guild_id": GUILD_ID!,
  //   "channels": [{
  //     "id": "1416520681272774716",
  //     "message_id": null
  //   }],
  //   "is_live": false,
  //   "twitch_url": "https://www.twitch.tv/justhatemeeecatq"
  // }
async function setNotification(){
  const response = await DataBaseHandler.getInstance().loadStreamers();
  if(DataBaseHandler.isSuccess(response)){
      streamers = response.data
      setInterval(async () => {
        checkStream(client, streamers);
      }, 2_000);
  }
  else {
    console.log("⚠️ Database Error...", streamers)
  }
}

setNotification();