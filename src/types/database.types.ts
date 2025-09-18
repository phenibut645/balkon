import { RowDataPacket } from "mysql2"

export type DataBaseTables = "guilds" | "logs_channel" | "guild_members" | "member_statuses" | "general_settings" |"log_types" | "guild_roles" | "members" | "member_roles" | "twitch_notification_channels" | "member_command_permissions" | "commands" | "member_items" | "item_public_market" | "item_general_store" | "items" | "item_types" | "role_command_permissions" | "streamers" | "muted_users" | "banned_members" | "guild_item_roles" | "item_roles" | "item_treasures" | "mute_roles" | "item_rarities" | "treasure_contents";

export interface DefaultDBTable {
    id: number;
    [key: string]: any;
}

export interface GuildsDB extends DefaultDBTable {
    ds_guild_id: string,
    earning_multiply: number
}

export interface LogsChannelsDB extends DefaultDBTable {
    guild_id: number,
    log_type_id: number,
    ds_channel_id: string
}

export interface GuildMembersD extends DefaultDBTable {
    guild_id: number,
    member_id: number
}

export interface MemberStatusesDB extends DefaultDBTable {
    name: string // add
}

export interface LogTypesDB extends DefaultDBTable {
    name: string // add
}

export interface GuildRolesDB extends DefaultDBTable {
    guild_id: number,
    ds_role_id: string
}

export interface MembersDB extends DefaultDBTable {
    ds_member_id: string,
    balance: number
}

export interface MemberRolesDB extends DefaultDBTable {
    member_id: number,
    guild_role_id: number
}

export interface MemberCommandPermissionsDB extends DefaultDBTable {
    guild_id: number,
    member_id: number,
    command_id: number,
    allowed: boolean
}

export interface CommandsDB extends DefaultDBTable {
    tag: string
}

export interface MemberItemsDB extends DefaultDBTable {
    member_id: number,
    item_id: number,
    tier: number,
    obtained_at: number
}

export interface ItemPublicMarketDB extends DefaultDBTable {
    member_item_id: number,
    price: number
}

export interface StreamersDB extends DefaultDBTable {
    nickname: string,
    twitch_url: string
}

export interface TwitchNotificationChannelsDB extends DefaultDBTable {
    streamer_id: number,
    guild_channel_id: number,
}

export interface RoleCommandPermissionsDB extends DefaultDBTable {
    guild_role_id: number,
    command_id: number,
    allowed: boolean
}

export type ItemTypesDBNames = "role" | "treasure" | "unknown"

export enum ItemTypes {
    Role = "role",
    Treasure = "treasure",
    Unknown = "unknown"
}


export interface ItemTypesDB extends DefaultDBTable {
    name: ItemTypesDBNames
}

export interface ItemsDB extends DefaultDBTable {
    item_type_id: number,
    item_rarity_id: number,
    name: string,
    description: string,
    added_at: number,
    sellable: boolean
}

export interface ItemGeneralStoreDB extends DefaultDBTable {
    item_id: number,
    price: number
}

export interface MutedUsersDB extends DefaultDBTable {
    guild_member_id: number,
    reason: string,
    muted_at: number,
    mute_time: number
}

export interface BannedUsersDB extends DefaultDBTable {
    guild_member_id: number,
    reason: string,
    banned_at: number,
    ban_time: number
}

export interface GuildItemRolesDB extends DefaultDBTable {
    item_role_id: number,
    guild_id: number,
    guild_role_id: number
}

export interface ItemRolesDB extends DefaultDBTable {
    item_id: number,
    color: string,
    pinned: boolean
}

export interface ItemTreasuresDB extends DefaultDBTable {
    item_id: number
}

export interface MuteRolesDB extends DefaultDBTable {
    guild_role_id: number
}

export type ItemRaritiesDBNames = "common" | "exclusive" | "unknown"

export enum ItemRaritiesDBEnum {
    Common = "common",
    Eclusive = "exclusive",
    Unknown = "unknown"
}

export interface ItemRaritiesDB extends DefaultDBTable {
    name: ItemRaritiesDBNames
}

export interface GeneralSettingsDB extends DefaultDBTable {
    start_balance: number,
    default_earning_multiply: number
}

export interface TreasureContentsDB extends DefaultDBTable {
    item_treasure_id: number,
    item_id: number
}

export type ChannelTagsStatusesNames = "public" | "private"

export enum ChannelTagsStatuses {
    Public = "public",
    Private = "private"
}

export interface ChannelTagsStatusesDB extends DefaultDBTable {
    name: string
}

export interface ChannelTagsDB extends DefaultDBTable {
    name: string,
    channel_tags_status_id: number
}

export interface GuildChannelsTagsDB extends DefaultDBTable {
    guild_channel_id: number,
    channel_tag_id: number
}

export interface GuildChannels extends DefaultDBTable {
    guild_id: number,
    ds_channel_id: string
}