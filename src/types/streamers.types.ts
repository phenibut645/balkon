export interface INotificationChannels {
    "id": string,
    "message_id": string | null
}
export interface IStreamersData {
  "guild_id": string,
  "channels": INotificationChannels[],
  "is_live": boolean,
  "twitch_url": string
}
export interface IStreamers {
  [username: string]: IStreamersData
}