import dotenv from "dotenv";

const env = process.env.NODE_ENV || "dev";

if (env === "prod") {
  dotenv.config({ path: ".env.prod" });
} else {
  dotenv.config({ path: ".env.dev" });
}

export const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,

    HOST,
    USER,
    PASSWORD,
    DATABASE,

    TWITCH_CLIENT_ID,
    TWITCH_SECRET_ID,

    DEVELOPER_DISCORD_ID
} = process.env

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