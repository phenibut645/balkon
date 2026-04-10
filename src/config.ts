import dotenv from "dotenv";
import path from "path";

const env = process.env.NODE_ENV || "dev";
const envFilePath = path.resolve(import.meta.dirname, `../.env.${env === "prod" ? "prod" : "dev"}`);

dotenv.config({ path: envFilePath, override: true });

const databaseHost = process.env.DB_HOST ?? process.env.HOST;
const databaseUser = process.env.DB_USER ?? process.env.USER;
const databasePassword = process.env.DB_PASSWORD ?? process.env.PASSWORD;
const databaseName = process.env.DB_NAME ?? process.env.DATABASE;

export const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,

    TWITCH_CLIENT_ID,
    TWITCH_SECRET_ID,

    OBS_WEBSOCKET_URL,
    OBS_WEBSOCKET_PASSWORD,
    OBS_AGENT_RELAY_PORT,
    OBS_AGENT_REQUEST_TIMEOUT_MS,

    DEVELOPER_DISCORD_ID,
    BOT_ADMIN_IDS
} = process.env

export const HOST = databaseHost;
export const USER = databaseUser;
export const PASSWORD = databasePassword;
export const DATABASE = databaseName;

const variables = [
        DISCORD_TOKEN, CLIENT_ID, GUILD_ID, HOST, USER, PASSWORD, DATABASE, TWITCH_CLIENT_ID, TWITCH_SECRET_ID, DEVELOPER_DISCORD_ID
]

function check(){
    let i = 1;
    let exit = 0
    variables.forEach(variable => {
        if(typeof variable === "string" && variable === ""){
            console.log(`⚠️ Empty string ${i}`)
        }
        else if(!variable){
            console.error(`❌ Variable not found ${i}`)
            exit = 1
        }
        i++;
    })
    if(exit) {
        console.log("🛠️ Exiting")
        process.exit(1)
    } 
}

check();

export const botAdminIds = new Set(
    [DEVELOPER_DISCORD_ID, ...(BOT_ADMIN_IDS?.split(",") ?? [])]
        .map(id => id?.trim())
        .filter((id): id is string => Boolean(id))
);

export const obsAgentRelayPort = Number(OBS_AGENT_RELAY_PORT ?? 8787);
export const obsAgentRequestTimeoutMs = Number(OBS_AGENT_REQUEST_TIMEOUT_MS ?? 10_000);
