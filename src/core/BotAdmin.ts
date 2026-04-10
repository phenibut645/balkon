import { ChatInputCommandInteraction, User } from "discord.js";
import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { DEVELOPER_DISCORD_ID, botAdminIds } from "../config.js";
import { BotSettingsDB, MemberStatuses } from "../types/database.types.js";
import { DataBaseHandler } from "./DataBaseHandler.js";

const BOT_CONTRIBUTORS_SETTING_KEY = "bot_contributor_ids";

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

interface ObsSettingsRow extends RowDataPacket {
    setting_key: string;
    setting_value: string | null;
    updated_at: Date | null;
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

    return {
        counts: countRows[0],
        contributors: await getBotContributorIds(),
        obsSettings: obsRows,
    };
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
