import { TWITCH_CLIENT_ID, TWITCH_SECRET_ID } from "../config.js";

export interface IStreamerInfo {
    isLive: boolean,
    title: string,
    game: string,
    viewer_count: number
}

export class TwitchHandler {
    OAuthTokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET_ID}&grant_type=client_credentials`;
    token: string | null = null;
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

    async getStreamerInfo(username:string): Promise<IStreamerInfo> {
        if(!this.token) await this.loadToken();
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
            headers: {
            "Client-ID": TWITCH_CLIENT_ID!,
            "Authorization": `Bearer ${this.token}`
            }
        })
        const data = await res.json();
        if(data.status === 401) {
            await this.loadToken()
            return await this.getStreamerInfo(username)
        }
        const isLive = data.data && data.data.length > 0
        const response: IStreamerInfo = {
            isLive,
            title: isLive ? data.data[0].title : null,
            game: isLive ? data.data[0].game_name : null,
            viewer_count: isLive ? data.data[0].viewer_count : null
        }
        return response;
    }
    async getAvatar(username: string) {
        if (!this.token) await this.loadToken();

        const res = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: {
            "Client-ID": TWITCH_CLIENT_ID!,
            "Authorization": `Bearer ${this.token}`
            }
        });

        const data = await res.json();

        if (!data.data || data.data.length === 0) return null;
        const response = {
            avatar: data.data[0].profile_image_url,
            banner: data.data[0].offline_image_url ?? null
        };

        return response;
        }
}