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

    COMMAND_SESSION_TTL_MS,
    COMMAND_SESSION_MAX_ACTIVE,
    COMMAND_SESSION_INTERACTION_COOLDOWN_MS,

    DEVELOPER_DISCORD_ID,
    BOT_ADMIN_IDS,

    SUBSCRIPTION_GUILD_ID,
    BALKON_PLUS_SKU_ID,
    BALKON_PLUS_ROLE_ID,
    SUBSCRIPTION_SYNC_INTERVAL_MS
} = process.env

export const HOST = databaseHost;
export const USER = databaseUser;
export const PASSWORD = databasePassword;
export const DATABASE = databaseName;

const requiredVariables = [
    { label: "DISCORD_TOKEN", value: DISCORD_TOKEN },
    { label: "CLIENT_ID", value: CLIENT_ID },
    { label: "GUILD_ID", value: GUILD_ID },
    { label: "DB_HOST or HOST", value: HOST },
    { label: "DB_USER or USER", value: USER },
    { label: "DB_PASSWORD or PASSWORD", value: PASSWORD },
    { label: "DB_NAME or DATABASE", value: DATABASE },
    { label: "TWITCH_CLIENT_ID", value: TWITCH_CLIENT_ID },
    { label: "TWITCH_SECRET_ID", value: TWITCH_SECRET_ID },
    { label: "DEVELOPER_DISCORD_ID", value: DEVELOPER_DISCORD_ID },
];

function check(){
    let exit = 0
    requiredVariables.forEach(variable => {
        if(typeof variable.value === "string" && variable.value === ""){
            console.log(`⚠️ Empty variable ${variable.label}`)
        }
        else if(!variable.value){
            console.error(`❌ Variable not found: ${variable.label}`)
            exit = 1
        }
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
export const commandSessionTtlMs = Number(COMMAND_SESSION_TTL_MS ?? 120_000);
export const commandSessionMaxActive = Number(COMMAND_SESSION_MAX_ACTIVE ?? 2_000);
export const commandSessionInteractionCooldownMs = Number(COMMAND_SESSION_INTERACTION_COOLDOWN_MS ?? 750);
export const subscriptionGuildId = SUBSCRIPTION_GUILD_ID ?? "1492085250841640961";
export const balkonPlusSkuId = BALKON_PLUS_SKU_ID?.trim() || null;
export const balkonPlusRoleId = BALKON_PLUS_ROLE_ID?.trim() || null;
export const subscriptionSyncIntervalMs = Number(SUBSCRIPTION_SYNC_INTERVAL_MS ?? 900_000);
