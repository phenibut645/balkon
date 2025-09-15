import { CLIENT_ID, TWITCH_CLIENT_ID, TWITCH_SECRET_ID } from "../config.js";

export class TwitchHandler {
    OAuthTokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET_ID}&grant_type=client_credentials`
    token: string | null = null
    private static instance: TwitchHandler;

    constructor(){}

    static getInstance(): TwitchHandler{
        if(!TwitchHandler.instance){
            TwitchHandler.instance = new TwitchHandler();
        }
        return TwitchHandler.instance;
    }

    async loadToken(){
        const res = await fetch(this.OAuthTokenUrl, {
            method: "POST"
        });
        const data = await res.json();
        this.token = data.access_token;
        return data.access_token;
    }

    async isLive(username:string){
        if(!this.token) await this.loadToken();
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
            headers: {
            "Client-ID": CLIENT_ID!,
            "Authorization": `Bearer ${this.token}`
            }
        })
        const data = await res.json();
        return data.data && data.data.length > 0;
    }
}