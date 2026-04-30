import { RowDataPacket } from "mysql2"

export type DataBaseTables = "guilds" | "logs_channels" | "guild_members" | "guild_member_statuses" | "general_settings" |"log_types" | "guild_roles" | "members" | "member_roles" | "twitch_notification_channels" | "member_command_permissions" | "commands" | "member_items" | "item_public_market" | "item_general_store" | "items" | "item_types" | "role_command_permissions" | "streamers" | "muted_users" | "banned_members" | "guild_item_roles" | "item_roles" | "item_treasures" | "mute_roles" | "item_rarities" | "treasure_contents" | "guild_channels" | "channel_tags_statuses" | "channel_tags" | "guild_role_statuses" | "role_statuses" | "command_access_levels" | "craft_recipes" | "craft_recipe_ingredients" | "bot_settings" | "guild_streamers" | "item_service_actions" | "bot_commands" | "api_sessions";

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

export enum MemberStatuses {
    Default = 1,
    GuildOwner = 2
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
    balance: number,
    ldm_balance?: number,
    home_guild_id?: string | null,
    public_description?: string | null,
    locale?: string | null
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
    obtained_at: number | Date,
    original_owner_member_id?: number | null
}

export interface ItemPublicMarketDB extends DefaultDBTable {
    member_item_id: number,
    price: number
}

export interface StreamersDB extends DefaultDBTable {
    nickname: string,
    twitch_url: string
}

export interface GuildStreamersDB extends DefaultDBTable {
    guild_id: number,
    streamer_id: number,
    is_primary?: boolean,
    created_by_member_id?: number | null,
    created_at?: number | Date,
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

export type ItemTypesDBNames = string

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
    emoji?: string | null,
    added_at: number | Date,
    sellable: boolean,
    tradeable?: boolean,
    image_url?: string | null,
    bot_sell_price?: number | null,
    created_by_member_id?: number | null
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

export type ItemRaritiesDBNames = string

export enum ItemRaritiesDBEnum {
    Common = "common",
    Eclusive = "exclusive",
    Unknown = "unknown"
}

export interface ItemRaritiesDB extends DefaultDBTable {
    name: ItemRaritiesDBNames,
    color_hex?: string | null
}

export interface GeneralSettingsDB extends DefaultDBTable {
    start_balance: number,
    default_earning_multiply: number
}

export interface TreasureContentsDB extends DefaultDBTable {
    item_treasure_id: number,
    item_id: number
}

export interface CraftRecipesDB extends DefaultDBTable {
    name: string,
    description?: string | null,
    result_item_id: number,
    result_amount: number,
    created_by_member_id?: number | null,
    created_at?: number | Date,
}

export interface CraftRecipeIngredientsDB extends DefaultDBTable {
    craft_recipe_id: number,
    item_id: number,
    amount: number,
}

export interface BotSettingsDB extends DefaultDBTable {
    setting_key: string,
    setting_value: string | null,
    updated_by_member_id?: number | null,
    updated_at?: number | Date,
}

export type ItemServiceActionType = "switch_scene" | "source_visibility" | "set_text" | "media_action"

export interface ItemServiceActionsDB extends DefaultDBTable {
    item_id: number,
    action_type: ItemServiceActionType,
    scene_name?: string | null,
    source_name?: string | null,
    text_template?: string | null,
    media_action?: string | null,
    visible?: boolean | null,
    consume_on_use?: boolean,
    updated_by_member_id?: number | null,
    updated_at?: number | Date,
}

export type BotCommandType = "KICK_MEMBER" | "BAN_MEMBER" | "UNBAN_MEMBER" | "ADD_ROLE" | "REMOVE_ROLE" | "SEND_CHANNEL_MESSAGE"
export type BotCommandStatus = "pending" | "processing" | "completed" | "failed"

export interface BotCommandsDB extends DefaultDBTable {
    type: BotCommandType,
    guild_id?: string | null,
    requested_by_discord_id: string,
    payload_json: string,
    status: BotCommandStatus,
    result_json?: string | null,
    error_message?: string | null,
    created_at?: number | Date,
    started_at?: number | Date | null,
    completed_at?: number | Date | null,
}

export interface ApiSessionsDB extends DefaultDBTable {
    session_token_hash: string,
    discord_id: string,
    username?: string | null,
    global_name?: string | null,
    avatar?: string | null,
    access_token: string,
    refresh_token?: string | null,
    token_expires_at?: number | Date | null,
    scopes: string,
    user_json?: string | null,
    guilds_json?: string | null,
    created_at?: number | Date,
    updated_at?: number | Date,
    expires_at: number | Date,
    revoked_at?: number | Date | null,
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

export enum CommandAccessLevels {
    Public = "public",
    Private = "private"
}

export interface CommandAccessLevelsDB extends DefaultDBTable {
    name: CommandAccessLevels
}
