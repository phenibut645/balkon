import { ChatInputCommandInteraction, User } from "discord.js";
import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { DEVELOPER_DISCORD_ID, botAdminIds } from "../config.js";
import { BotSettingsDB, MemberStatuses } from "../types/database.types.js";
import { DataBaseHandler } from "./DataBaseHandler.js";

const BOT_CONTRIBUTORS_SETTING_KEY = "bot_contributor_ids";
const GUILD_BOOTSTRAP_STATUS_PREFIX = "guild_bootstrap_status:";

interface BotAdminStatsRow extends RowDataPacket {
    guilds_count: number;
    members_count: number;
    items_count: number;
    inventory_count: number;
    market_count: number;
    store_count: number;
    recipes_count: number;
    streamers_count: number;
    settings_count: number;
    actions_count: number;
}

interface FounderStatsRow extends RowDataPacket {
    guild_members_count: number;
    channels_count: number;
    streamers_count: number;
    muted_count: number;
    banned_count: number;
}

interface FounderAuditSummaryRow extends RowDataPacket {
    guild_db_id: number | null;
    guild_owner_member_id: number | null;
    guild_member_count: number;
    guild_role_count: number;
    guild_channel_count: number;
    log_channel_count: number;
}

interface FounderAuditLogBindingRow extends RowDataPacket {
    log_type_name: string;
    ds_channel_id: string;
}

interface FounderAuditChannelRow extends RowDataPacket {
    ds_channel_id: string;
}

interface FounderAuditRoleRow extends RowDataPacket {
    ds_role_id: string;
}

interface ObsSettingsRow extends RowDataPacket {
    setting_key: string;
    setting_value: string | null;
    updated_at: Date | null;
}

interface BootstrapStatusSettingRow extends RowDataPacket {
    setting_key: string;
    setting_value: string | null;
    updated_at: Date | null;
}

export interface GuildBootstrapStatus {
    guildId: string;
    guildName?: string;
    source: "guildCreate" | "clientReady";
    status: "ok" | "error";
    syncedChannels?: number;
    removedChannels?: number;
    syncedRoles?: number;
    removedRoles?: number;
    configuredLogChannels?: number;
    bootstrapChannelId?: string | null;
    message?: string;
    updatedAt: string;
}

export interface FounderBootstrapAudit {
    guildId: string;
    guildDbId: number | null;
    ownerRecorded: boolean;
    guildMemberCount: number;
    guildRoleCount: number;
    guildChannelCount: number;
    logBindings: Array<{ logType: string; channelId: string }>;
    channelIds: string[];
    roleIds: string[];
    latestBootstrapStatus: GuildBootstrapStatus | null;
}

function parseContributorIds(rawValue: string | null | undefined): string[] {
    if (!rawValue) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map(value => value.trim())
            : [];
    } catch {
        return [];
    }
}

export function isBotOwner(userId: string): boolean {
    return Boolean(DEVELOPER_DISCORD_ID) && userId === DEVELOPER_DISCORD_ID;
}

export function isBotAdmin(userId: string): boolean {
    return botAdminIds.has(userId);
}

export async function getStoredBotContributorIds(): Promise<string[]> {
    const response = await DataBaseHandler.getInstance().getFromTable<BotSettingsDB>("bot_settings", { setting_key: BOT_CONTRIBUTORS_SETTING_KEY }, ["setting_value"]);
    if (DataBaseHandler.isFail(response) || !response.data.length) {
        return [];
    }

    return parseContributorIds(response.data[0].setting_value);
}

export async function getBotContributorIds(): Promise<string[]> {
    return Array.from(new Set([...botAdminIds, ...await getStoredBotContributorIds()].filter(Boolean)));
}

export async function isBotContributor(userId: string): Promise<boolean> {
    if (isBotOwner(userId) || isBotAdmin(userId)) {
        return true;
    }

    const contributorIds = await getStoredBotContributorIds();
    return contributorIds.includes(userId);
}

export async function updateBotContributor(actorUserId: string, targetUserId: string, enabled: boolean): Promise<{ success: boolean; message?: string }> {
    if (!isBotOwner(actorUserId)) {
        return {
            success: false,
            message: "Only the bot owner can manage contributors.",
        };
    }

    const memberResponse = await DataBaseHandler.getInstance().isMemberExists(actorUserId, true);
    const updatedByMemberId = DataBaseHandler.isSuccess(memberResponse) ? memberResponse.data.memberId ?? null : null;
    const currentIds = await getStoredBotContributorIds();
    const nextIds = enabled
        ? Array.from(new Set([...currentIds, targetUserId]))
        : currentIds.filter(id => id !== targetUserId);

    await pool.query(
        `INSERT INTO bot_settings (setting_key, setting_value, updated_by_member_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_member_id = VALUES(updated_by_member_id), updated_at = CURRENT_TIMESTAMP`,
        [BOT_CONTRIBUTORS_SETTING_KEY, JSON.stringify(nextIds), updatedByMemberId]
    );

    return { success: true };
}

export async function getBotAdminDashboardStats(): Promise<{
    counts: BotAdminStatsRow;
    contributors: string[];
    obsSettings: ObsSettingsRow[];
    bootstrapStatuses: GuildBootstrapStatus[];
}> {
    const [countRows] = await pool.query<BotAdminStatsRow[]>(
        `SELECT
            (SELECT COUNT(*) FROM guilds) AS guilds_count,
            (SELECT COUNT(*) FROM members) AS members_count,
            (SELECT COUNT(*) FROM items) AS items_count,
            (SELECT COUNT(*) FROM member_items) AS inventory_count,
            (SELECT COUNT(*) FROM item_public_market) AS market_count,
            (SELECT COUNT(*) FROM item_general_store) AS store_count,
            (SELECT COUNT(*) FROM craft_recipes) AS recipes_count,
            (SELECT COUNT(*) FROM streamers) AS streamers_count,
            (SELECT COUNT(*) FROM bot_settings) AS settings_count,
            (SELECT COUNT(*) FROM item_service_actions) AS actions_count`
    );

    const [obsRows] = await pool.query<ObsSettingsRow[]>(
        `SELECT setting_key, setting_value, updated_at
         FROM bot_settings
         WHERE setting_key IN ('obs_websocket_url', 'obs_websocket_password', ?)`,
        [BOT_CONTRIBUTORS_SETTING_KEY]
    );

    const [bootstrapRows] = await pool.query<BootstrapStatusSettingRow[]>(
        `SELECT setting_key, setting_value, updated_at
         FROM bot_settings
         WHERE setting_key LIKE ?
         ORDER BY updated_at DESC
         LIMIT 10`,
        [`${GUILD_BOOTSTRAP_STATUS_PREFIX}%`]
    );

    return {
        counts: countRows[0],
        contributors: await getBotContributorIds(),
        obsSettings: obsRows,
        bootstrapStatuses: bootstrapRows.flatMap(row => {
            if (!row.setting_value) {
                return [];
            }

            try {
                const parsed = JSON.parse(row.setting_value) as GuildBootstrapStatus;
                return [{
                    ...parsed,
                    guildId: parsed.guildId || row.setting_key.replace(GUILD_BOOTSTRAP_STATUS_PREFIX, ""),
                    updatedAt: parsed.updatedAt || row.updated_at?.toISOString() || new Date().toISOString(),
                }];
            } catch {
                return [];
            }
        }),
    };
}

export async function saveGuildBootstrapStatus(status: GuildBootstrapStatus): Promise<void> {
    await pool.query(
        `INSERT INTO bot_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
        [`${GUILD_BOOTSTRAP_STATUS_PREFIX}${status.guildId}`, JSON.stringify(status)]
    );
}

export async function isGuildFounder(userId: string, guildDiscordId?: string): Promise<boolean> {
    if (!guildDiscordId) {
        return false;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT gm.id
         FROM guild_members AS gm
         INNER JOIN guilds AS g ON g.id = gm.guild_id
         INNER JOIN members AS m ON m.id = gm.member_id
         WHERE g.ds_guild_id = ? AND m.ds_member_id = ? AND gm.member_status_id = ?
         LIMIT 1`,
        [guildDiscordId, userId, MemberStatuses.GuildOwner]
    );

    return rows.length > 0;
}

export async function getFounderDashboardStats(guildDiscordId: string): Promise<FounderStatsRow> {
    const [rows] = await pool.query<FounderStatsRow[]>(
        `SELECT
            (SELECT COUNT(*) FROM guild_members gm INNER JOIN guilds g ON g.id = gm.guild_id WHERE g.ds_guild_id = ?) AS guild_members_count,
            (SELECT COUNT(*) FROM guild_channels gc INNER JOIN guilds g ON g.id = gc.guild_id WHERE g.ds_guild_id = ?) AS channels_count,
            (SELECT COUNT(*) FROM guild_streamers gs INNER JOIN guilds g ON g.id = gs.guild_id WHERE g.ds_guild_id = ?) AS streamers_count,
            (SELECT COUNT(*) FROM muted_users mu INNER JOIN guild_members gm ON gm.id = mu.guild_member_id INNER JOIN guilds g ON g.id = gm.guild_id WHERE g.ds_guild_id = ?) AS muted_count,
            (SELECT COUNT(*) FROM banned_members bm INNER JOIN guild_members gm ON gm.id = bm.guild_member_id INNER JOIN guilds g ON g.id = gm.guild_id WHERE g.ds_guild_id = ?) AS banned_count`,
        [guildDiscordId, guildDiscordId, guildDiscordId, guildDiscordId, guildDiscordId]
    );

    return rows[0];
}

export async function getFounderBootstrapAudit(guildDiscordId: string): Promise<FounderBootstrapAudit> {
    const [summaryRows] = await pool.query<FounderAuditSummaryRow[]>(
        `SELECT
            g.id AS guild_db_id,
            (SELECT gm.id
             FROM guild_members gm
             WHERE gm.guild_id = g.id AND gm.member_status_id = ?
             LIMIT 1) AS guild_owner_member_id,
            (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS guild_member_count,
            (SELECT COUNT(*) FROM guild_roles gr WHERE gr.guild_id = g.id) AS guild_role_count,
            (SELECT COUNT(*) FROM guild_channels gc WHERE gc.guild_id = g.id) AS guild_channel_count,
            (SELECT COUNT(*) FROM logs_channels lc WHERE lc.guild_id = g.id) AS log_channel_count
         FROM guilds g
         WHERE g.ds_guild_id = ?
         LIMIT 1`,
        [MemberStatuses.GuildOwner, guildDiscordId]
    );

    const [bindingRows] = await pool.query<FounderAuditLogBindingRow[]>(
        `SELECT lt.name AS log_type_name, lc.ds_channel_id
         FROM logs_channels lc
         INNER JOIN guilds g ON g.id = lc.guild_id
         INNER JOIN log_types lt ON lt.id = lc.log_type_id
         WHERE g.ds_guild_id = ?
         ORDER BY lt.name ASC`,
        [guildDiscordId]
    );

    const [channelRows] = await pool.query<FounderAuditChannelRow[]>(
        `SELECT gc.ds_channel_id
         FROM guild_channels gc
         INNER JOIN guilds g ON g.id = gc.guild_id
         WHERE g.ds_guild_id = ?
         ORDER BY gc.id ASC
         LIMIT 25`,
        [guildDiscordId]
    );

    const [roleRows] = await pool.query<FounderAuditRoleRow[]>(
        `SELECT gr.ds_role_id
         FROM guild_roles gr
         INNER JOIN guilds g ON g.id = gr.guild_id
         WHERE g.ds_guild_id = ?
         ORDER BY gr.id ASC
         LIMIT 25`,
        [guildDiscordId]
    );

    const [bootstrapRows] = await pool.query<BootstrapStatusSettingRow[]>(
        `SELECT setting_key, setting_value, updated_at
         FROM bot_settings
         WHERE setting_key = ?
         LIMIT 1`,
        [`${GUILD_BOOTSTRAP_STATUS_PREFIX}${guildDiscordId}`]
    );

    const latestBootstrapStatus = bootstrapRows.length && bootstrapRows[0].setting_value
        ? (() => {
            try {
                return JSON.parse(bootstrapRows[0].setting_value!) as GuildBootstrapStatus;
            } catch {
                return null;
            }
        })()
        : null;

    const summary = summaryRows[0];
    return {
        guildId: guildDiscordId,
        guildDbId: summary?.guild_db_id ?? null,
        ownerRecorded: Boolean(summary?.guild_owner_member_id),
        guildMemberCount: Number(summary?.guild_member_count ?? 0),
        guildRoleCount: Number(summary?.guild_role_count ?? 0),
        guildChannelCount: Number(summary?.guild_channel_count ?? 0),
        logBindings: bindingRows.map(row => ({ logType: row.log_type_name, channelId: row.ds_channel_id })),
        channelIds: channelRows.map(row => row.ds_channel_id),
        roleIds: roleRows.map(row => row.ds_role_id),
        latestBootstrapStatus,
    };
}

export async function ensureBotAdmin(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (isBotAdmin(interaction.user.id)) {
        return true;
    }

    await interaction.reply({
        content: "You do not have access to this bot-admin command.",
        flags: ["Ephemeral"],
    });
    return false;
}

export function canViewForeignInventory(requesterId: string, targetUser: User): boolean {
    return requesterId === targetUser.id || isBotAdmin(requesterId);
}
