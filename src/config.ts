import { config } from "dotenv";

config();

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const CLIENT_ID = process.env.CLIENT_ID;
export const GUILD_ID = process.env.GUILD_ID;

export const HOST = process.env.HOST;
export const USER = process.env.USER;
export const PASSWORD = process.env.PASSWORD;
export const DATABASE = process.env.DATABASE;

export const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
export const TWITCH_SECRET_ID = process.env.TWITCH_SECRET_ID;

const variables = [DISCORD_TOKEN, CLIENT_ID, GUILD_ID, HOST, USER, PASSWORD, DATABASE, TWITCH_CLIENT_ID, TWITCH_SECRET_ID]
variables.forEach(variable => {
    let exit = 0
    if(!variable){
        console.error(`❌ Variable not found `)
        exit = 1
    }
    if(exit) {
        console.log("🛠️ Exiting")
        process.exit(1)
    } 
})