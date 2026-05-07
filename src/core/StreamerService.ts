import crypto from "crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import pool from "../db.js";
import { DataBaseHandler, DBResponse, DBResponseSuccess } from "./DataBaseHandler.js";
import { memberService } from "./MemberService.js";
import { ObsMediaAction } from "./ObsService.js";
import { GuildStreamersDB, GuildsDB, ItemServiceActionType, ItemServiceActionsDB, MembersDB, StreamersDB } from "../types/database.types.js";
import { itemService } from "./ItemService.js";
import { obsRelayService } from "./ObsRelayService.js";
import { obsAgentStatusService } from "./ObsAgentStatusService.js";
import { ObsRelayCommandName, ObsRelayGetStatusResult, ObsRelayMediaActionPayload, ObsRelaySceneItem, ObsRelaySetSourceVisibilityPayload, ObsRelaySetTextInputPayload } from "../types/obs-agent.types.js";

interface GuildStreamerRow extends RowDataPacket {
    guild_streamer_id: number;
    guild_id: number;
    ds_guild_id: string;
    streamer_id: number;
    nickname: string;
    twitch_url: string;
    is_primary: number;
}

interface StreamerRow extends RowDataPacket {
    id: number;
    nickname: string;
    twitch_url: string;
    archived_at: Date | string | null;
    archived_by_member_id: number | null;
}

interface AdminStreamerListRow extends RowDataPacket {
    id: number;
    nickname: string;
    twitch_url: string;
    archived_at: Date | string | null;
    created_at: Date | string | null;
    updated_at: Date | string | null;
    owner_count: number;
}

interface ItemServiceActionRow extends RowDataPacket {
    id: number;
    item_id: number;
    action_type: ItemServiceActionType;
    scene_name: string | null;
    source_name: string | null;
    text_template: string | null;
    media_action: string | null;
    visible: number | null;
    consume_on_use: number;
    updated_by_member_id: number | null;
}

export interface GuildStreamerView {
    guildStreamerId: number;
    discordGuildId: string;
    streamerId: number;
    nickname: string;
    twitchUrl: string;
    isPrimary: boolean;
    obsAgentId: string | null;
    obsAgentOnline: boolean;
}

export interface ItemServiceActionView {
    itemTemplateId: number;
    actionType: ItemServiceActionType;
    sceneName: string | null;
    sourceName: string | null;
    textTemplate: string | null;
    mediaAction: string | null;
    visible: boolean | null;
    consumeOnUse: boolean;
}

export interface StreamerObsAgentConfigView {
    agentId: string;
    tokenMask: string;
    online: boolean;
}

export interface StreamerObsAgentProvisioningView {
    streamerId: number;
    agentId: string;
    agentToken: string;
}

export interface StreamerObsAgentSetupView {
    streamerId: number;
    configured: boolean;
    agentId: string | null;
    tokenPresent: boolean;
    online: boolean;
    lastSeenAt: string | null;
    agentVersion: string | null;
    relayProtocolVersion: number | null;
    capabilities: string[];
    obsConnected: boolean | null;
    obsVersion: string | null;
    obsWebsocketVersion: string | null;
    relayUrl: string | null;
}

export interface StreamerObsAgentBindingView {
    streamerId: number;
    agentId: string;
    configured: true;
    tokenPresent: true;
}

export interface AdminStreamerListView {
    streamerId: number;
    nickname: string;
    twitchUrl: string | null;
    ownerCount: number;
    obsAgentConfigured: boolean;
    obsAgentOnline: boolean;
    createdAt: string | null;
    updatedAt: string | null;
    archived: boolean;
}

export interface PrimaryGuildStreamerAgentView {
    discordGuildId: string;
    streamerId: number;
    streamerNickname: string;
    agentId: string;
    online: boolean;
}

export interface ObsTargetView {
    streamer: GuildStreamerView;
    agentId: string;
    online: boolean;
}

interface ServiceItemExecutionContext {
    inventoryItem: Awaited<ReturnType<typeof itemService.getInventoryItemById>> extends DBResponse<infer T> ? NonNullable<T> : never;
    action: ItemServiceActionView;
    streamerId: number;
    streamerNickname: string;
    twitchUrl: string;
    agentId: string;
    guildId: string;
}

interface StreamerAgentBindingRecord {
    streamerId: number;
    agentId: string;
}

const OBS_AGENT_BINDING_PREFIX = "obs_agent_binding:";
const OBS_AGENT_CREDENTIAL_PREFIX = "obs_agent_credentials:";

export class StreamerService {
    private static instance: StreamerService;

    static getInstance(): StreamerService {
        if (!StreamerService.instance) {
            StreamerService.instance = new StreamerService();
        }

        return StreamerService.instance;
    }

    async registerGuildStreamer(input: {
        discordGuildId: string;
        nickname: string;
        twitchUrl?: string | null;
        createdByDiscordId: string;
        isPrimary?: boolean;
    }): Promise<DBResponse<{ guildStreamerId: number; streamerId: number }>> {
        try {
            const guild = await this.ensureGuildByDiscordId(input.discordGuildId);
            const creator = await this.ensureMemberByDiscordId(input.createdByDiscordId);
            const normalizedNickname = input.nickname.trim().toLowerCase();
            const normalizedTwitchUrl = this.normalizeTwitchUrl(input.twitchUrl, normalizedNickname);

            let streamerId: number;
            const existingStreamer = await this.findStreamerByNickname(normalizedNickname, true);
            if (existingStreamer) {
                streamerId = existingStreamer.id;
                await pool.query(
                    `UPDATE streamers
                     SET twitch_url = ?,
                         archived_at = NULL,
                         archived_by_member_id = NULL
                     WHERE id = ?`,
                    [normalizedTwitchUrl, streamerId]
                );
            } else {
                const insertStreamer = await DataBaseHandler.getInstance().addRecords<StreamersDB>([{
                    id: 0,
                    nickname: normalizedNickname,
                    twitch_url: normalizedTwitchUrl,
                }], "streamers");

                if (DataBaseHandler.isFail(insertStreamer)) {
                    return insertStreamer;
                }

                streamerId = insertStreamer.data.insertId;
            }

            const existingGuildBinding = await this.getGuildStreamerBinding(guild.data.id, streamerId);
            if (existingGuildBinding) {
                if (input.isPrimary) {
                    await this.clearPrimaryGuildStreamer(guild.data.id);
                    await pool.query(`UPDATE guild_streamers SET is_primary = TRUE WHERE id = ?`, [existingGuildBinding.guildStreamerId]);
                }

                await this.ensureStreamerOwner(streamerId, creator.data.id);

                return {
                    success: true,
                    data: {
                        guildStreamerId: existingGuildBinding.guildStreamerId,
                        streamerId,
                    },
                };
            }

            const shouldBePrimary = input.isPrimary ?? !(await this.guildHasAnyStreamers(guild.data.id));
            if (shouldBePrimary) {
                await this.clearPrimaryGuildStreamer(guild.data.id);
            }

            const insertBinding = await DataBaseHandler.getInstance().addRecords<GuildStreamersDB>([{
                id: 0,
                guild_id: guild.data.id,
                streamer_id: streamerId,
                is_primary: shouldBePrimary,
                created_by_member_id: creator.data.id,
                created_at: new Date(),
            }], "guild_streamers");

            if (DataBaseHandler.isFail(insertBinding)) {
                return insertBinding;
            }

            await this.ensureStreamerOwner(streamerId, creator.data.id);

            return {
                success: true,
                data: {
                    guildStreamerId: insertBinding.data.insertId,
                    streamerId,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async listGuildStreamers(discordGuildId: string): Promise<DBResponse<GuildStreamerView[]>> {
        try {
            const [rows] = await pool.query<GuildStreamerRow[]>(
                `SELECT
                    gs.id AS guild_streamer_id,
                    g.id AS guild_id,
                    g.ds_guild_id,
                    s.id AS streamer_id,
                    s.nickname,
                    s.twitch_url,
                    gs.is_primary
                 FROM guild_streamers AS gs
                 INNER JOIN guilds AS g ON g.id = gs.guild_id
                 INNER JOIN streamers AS s ON s.id = gs.streamer_id
                 WHERE g.ds_guild_id = ?
                   AND s.archived_at IS NULL
                 ORDER BY gs.is_primary DESC, s.nickname ASC`,
                [discordGuildId]
            );

            const agentBindings = await this.loadStreamerAgentBindings(rows.map(row => row.streamer_id));

            return {
                success: true,
                data: rows.map(row => this.mapGuildStreamerRow(row, agentBindings.get(row.streamer_id) ?? null)),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchGuildStreamers(discordGuildId: string, query: string): Promise<DBResponse<Array<{ name: string; value: string }>>> {
        try {
            const [rows] = await pool.query<GuildStreamerRow[]>(
                `SELECT
                    gs.id AS guild_streamer_id,
                    g.id AS guild_id,
                    g.ds_guild_id,
                    s.id AS streamer_id,
                    s.nickname,
                    s.twitch_url,
                    gs.is_primary
                 FROM guild_streamers AS gs
                 INNER JOIN guilds AS g ON g.id = gs.guild_id
                 INNER JOIN streamers AS s ON s.id = gs.streamer_id
                 WHERE g.ds_guild_id = ? AND (s.nickname LIKE ? OR s.twitch_url LIKE ?)
                 ORDER BY gs.is_primary DESC, s.nickname ASC
                 LIMIT 25`,
                [discordGuildId, `%${query}%`, `%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: `${row.nickname}${row.is_primary ? " [primary]" : ""}`,
                    value: row.nickname,
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async removeGuildStreamer(input: { discordGuildId: string; nickname: string }): Promise<DBResponse<{ removed: boolean }>> {
        try {
            const [result] = await pool.query<ResultSetHeader>(
                `DELETE gs
                 FROM guild_streamers AS gs
                 INNER JOIN guilds AS g ON g.id = gs.guild_id
                 INNER JOIN streamers AS s ON s.id = gs.streamer_id
                 WHERE g.ds_guild_id = ? AND s.nickname = ?`,
                [input.discordGuildId, input.nickname.trim().toLowerCase()]
            );

            return {
                success: true,
                data: {
                    removed: result.affectedRows > 0,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async setStreamerObsAgent(input: {
        discordGuildId: string;
        nickname: string;
        agentId: string;
        agentToken: string;
        updatedByDiscordId: string;
    }): Promise<DBResponse<{ streamerId: number; agentId: string }>> {
        try {
            const streamer = await this.resolveGuildStreamer(input.discordGuildId, input.nickname);
            const updater = await this.ensureMemberByDiscordId(input.updatedByDiscordId);
            const normalizedAgentId = input.agentId.trim();
            const normalizedAgentToken = input.agentToken.trim();

            if (!normalizedAgentId.length || !normalizedAgentToken.length) {
                throw new Error("Agent id and agent token are required.");
            }

            await this.upsertBotSetting(this.getStreamerAgentBindingKey(streamer.streamerId), JSON.stringify({ agentId: normalizedAgentId }), updater.data.id);
            await this.upsertBotSetting(this.getAgentCredentialKey(normalizedAgentId), normalizedAgentToken, updater.data.id);

            return {
                success: true,
                data: {
                    streamerId: streamer.streamerId,
                    agentId: normalizedAgentId,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async provisionStreamerObsAgent(input: {
        discordGuildId: string;
        nickname: string;
        updatedByDiscordId: string;
        agentId?: string | null;
    }): Promise<DBResponse<StreamerObsAgentProvisioningView>> {
        try {
            const streamer = await this.resolveGuildStreamer(input.discordGuildId, input.nickname);
            const updater = await this.ensureMemberByDiscordId(input.updatedByDiscordId);
            const normalizedAgentId = this.normalizeAgentId(input.agentId, streamer.nickname);
            const agentToken = crypto.randomBytes(24).toString("hex");
            const currentConfig = await this.getStreamerObsAgentByStreamerId(streamer.streamerId);

            if (currentConfig?.agentId && currentConfig.agentId !== normalizedAgentId) {
                await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getAgentCredentialKey(currentConfig.agentId)]);
            }

            await this.upsertBotSetting(this.getStreamerAgentBindingKey(streamer.streamerId), JSON.stringify({ agentId: normalizedAgentId }), updater.data.id);
            await this.upsertBotSetting(this.getAgentCredentialKey(normalizedAgentId), agentToken, updater.data.id);

            return {
                success: true,
                data: {
                    streamerId: streamer.streamerId,
                    agentId: normalizedAgentId,
                    agentToken,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async clearStreamerObsAgent(input: { discordGuildId: string; nickname: string }): Promise<DBResponse<{ cleared: boolean }>> {
        try {
            const streamer = await this.resolveGuildStreamer(input.discordGuildId, input.nickname);
            const currentConfig = await this.getStreamerObsAgentByStreamerId(streamer.streamerId);
            await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getStreamerAgentBindingKey(streamer.streamerId)]);

            if (currentConfig?.agentId) {
                await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getAgentCredentialKey(currentConfig.agentId)]);
            }

            return {
                success: true,
                data: {
                    cleared: true,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async getStreamerObsAgent(input: { discordGuildId: string; nickname: string }): Promise<DBResponse<StreamerObsAgentConfigView | null>> {
        try {
            const streamer = await this.resolveGuildStreamer(input.discordGuildId, input.nickname);
            const config = await this.getStreamerObsAgentByStreamerId(streamer.streamerId);

            if (!config) {
                return {
                    success: true,
                    data: null,
                };
            }

            return {
                success: true,
                data: {
                    agentId: config.agentId,
                    tokenMask: "*".repeat(Math.min(Math.max(config.agentToken.length, 1), 12)),
                    online: obsRelayService.isAgentConnected(config.agentId),
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async ensureStreamerExistsById(streamerId: number): Promise<void> {
        await this.requireStreamerById(streamerId);
    }

    async listAdminStreamers(): Promise<AdminStreamerListView[]> {
        const [rows] = await pool.query<AdminStreamerListRow[]>(
            `SELECT
                s.id,
                s.nickname,
                s.twitch_url,
                s.archived_at,
                MIN(gs.created_at) AS created_at,
                MAX(gs.created_at) AS updated_at,
                COUNT(DISTINCT so.member_id) AS owner_count
             FROM streamers AS s
             LEFT JOIN guild_streamers AS gs ON gs.streamer_id = s.id
             LEFT JOIN streamer_owners AS so ON so.streamer_id = s.id
             WHERE s.archived_at IS NULL
             GROUP BY s.id, s.nickname, s.twitch_url, s.archived_at
             ORDER BY s.nickname ASC, s.id ASC`
        );

        const bindings = await this.loadStreamerAgentBindings(rows.map(row => Number(row.id)));

        return rows.map(row => {
            const streamerId = Number(row.id);
            const binding = bindings.get(streamerId) ?? null;

            return {
                streamerId,
                nickname: row.nickname,
                twitchUrl: row.twitch_url ?? null,
                ownerCount: Number(row.owner_count ?? 0),
                obsAgentConfigured: Boolean(binding?.agentId),
                obsAgentOnline: binding ? obsRelayService.isAgentConnected(binding.agentId) : false,
                createdAt: this.toIsoTimestampOrNull(row.created_at),
                updatedAt: this.toIsoTimestampOrNull(row.updated_at),
                archived: false,
            };
        });
    }

    async archiveStreamerById(input: { streamerId: number; archivedByDiscordId: string }): Promise<DBResponse<{ streamerId: number; archived: true }>> {
        try {
            const streamer = await this.requireStreamerById(input.streamerId, true);
            if (streamer.archived_at) {
                return {
                    success: true,
                    data: {
                        streamerId: streamer.id,
                        archived: true,
                    },
                };
            }

            const actor = await this.ensureMemberByDiscordId(input.archivedByDiscordId);
            const binding = await this.getStreamerAgentBindingByStreamerId(streamer.id);

            await pool.query(
                `UPDATE streamers
                 SET archived_at = CURRENT_TIMESTAMP,
                     archived_by_member_id = ?
                 WHERE id = ? AND archived_at IS NULL`,
                [actor.data.id, streamer.id]
            );

            await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getStreamerAgentBindingKey(streamer.id)]);
            if (binding?.agentId) {
                await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getAgentCredentialKey(binding.agentId)]);
            }

            return {
                success: true,
                data: {
                    streamerId: streamer.id,
                    archived: true,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async getStreamerObsAgentSetupByStreamerId(streamerId: number): Promise<DBResponse<StreamerObsAgentSetupView>> {
        try {
            await this.requireStreamerById(streamerId);
            const binding = await this.getStreamerAgentBindingByStreamerId(streamerId);
            const agentToken = binding?.agentId ? await this.readBotSetting(this.getAgentCredentialKey(binding.agentId)) : null;
            const status = binding?.agentId ? await obsAgentStatusService.getStatus(binding.agentId) : null;

            return {
                success: true,
                data: {
                    streamerId,
                    configured: Boolean(binding?.agentId),
                    agentId: binding?.agentId ?? null,
                    tokenPresent: Boolean(agentToken),
                    online: status?.online ?? (binding?.agentId ? obsRelayService.isAgentConnected(binding.agentId) : false),
                    lastSeenAt: status?.lastSeenAt ?? null,
                    agentVersion: status?.agentVersion ?? null,
                    relayProtocolVersion: status?.relayProtocolVersion ?? null,
                    capabilities: status?.capabilities ?? [],
                    obsConnected: status?.obsConnected ?? null,
                    obsVersion: status?.obsVersion ?? null,
                    obsWebsocketVersion: status?.websocketVersion ?? null,
                    relayUrl: null,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async provisionStreamerObsAgentByStreamerId(input: {
        streamerId: number;
        updatedByDiscordId: string;
        agentId?: string | null;
    }): Promise<DBResponse<StreamerObsAgentProvisioningView>> {
        try {
            const streamer = await this.requireStreamerById(input.streamerId);
            const updater = await this.ensureMemberByDiscordId(input.updatedByDiscordId);
            const normalizedAgentId = this.normalizeAgentId(input.agentId, streamer.nickname);
            const agentToken = crypto.randomBytes(24).toString("hex");
            const currentConfig = await this.getStreamerObsAgentByStreamerId(streamer.id);

            if (currentConfig?.agentId && currentConfig.agentId !== normalizedAgentId) {
                await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getAgentCredentialKey(currentConfig.agentId)]);
            }

            await this.upsertBotSetting(this.getStreamerAgentBindingKey(streamer.id), JSON.stringify({ agentId: normalizedAgentId }), updater.data.id);
            await this.upsertBotSetting(this.getAgentCredentialKey(normalizedAgentId), agentToken, updater.data.id);

            return {
                success: true,
                data: {
                    streamerId: streamer.id,
                    agentId: normalizedAgentId,
                    agentToken,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async setStreamerObsAgentByStreamerId(input: {
        streamerId: number;
        agentId: string;
        agentToken: string;
        updatedByDiscordId: string;
    }): Promise<DBResponse<StreamerObsAgentBindingView>> {
        try {
            const streamer = await this.requireStreamerById(input.streamerId);
            const updater = await this.ensureMemberByDiscordId(input.updatedByDiscordId);
            const normalizedAgentToken = input.agentToken.trim();
            if (!normalizedAgentToken.length) {
                throw new Error("Agent token is required.");
            }

            const normalizedAgentId = this.normalizeAgentId(input.agentId, streamer.nickname);

            await this.upsertBotSetting(this.getStreamerAgentBindingKey(streamer.id), JSON.stringify({ agentId: normalizedAgentId }), updater.data.id);
            await this.upsertBotSetting(this.getAgentCredentialKey(normalizedAgentId), normalizedAgentToken, updater.data.id);

            return {
                success: true,
                data: {
                    streamerId: streamer.id,
                    agentId: normalizedAgentId,
                    configured: true,
                    tokenPresent: true,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async clearStreamerObsAgentByStreamerId(streamerId: number): Promise<DBResponse<{ streamerId: number; cleared: true }>> {
        try {
            await this.requireStreamerById(streamerId);
            const binding = await this.getStreamerAgentBindingByStreamerId(streamerId);
            await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getStreamerAgentBindingKey(streamerId)]);

            if (binding?.agentId) {
                await pool.query(`DELETE FROM bot_settings WHERE setting_key = ?`, [this.getAgentCredentialKey(binding.agentId)]);
            }

            return {
                success: true,
                data: {
                    streamerId,
                    cleared: true,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async getPrimaryGuildStreamerAgent(discordGuildId: string): Promise<DBResponse<PrimaryGuildStreamerAgentView>> {
        try {
            const normalizedGuildId = discordGuildId.trim();
            if (!normalizedGuildId) {
                throw new Error("OBS relay requires a Discord guild id.");
            }

            const primaryStreamer = await this.resolveGuildStreamer(normalizedGuildId, null);
            const streamerAgent = await this.getStreamerObsAgentByStreamerId(primaryStreamer.streamerId);
            if (!streamerAgent) {
                throw new Error(`Primary streamer '${primaryStreamer.nickname}' has no OBS agent configured.`);
            }

            const online = obsRelayService.isAgentConnected(streamerAgent.agentId);
            if (!online) {
                throw new Error(`OBS agent '${streamerAgent.agentId}' is offline.`);
            }

            return {
                success: true,
                data: {
                    discordGuildId: normalizedGuildId,
                    streamerId: primaryStreamer.streamerId,
                    streamerNickname: primaryStreamer.nickname,
                    agentId: streamerAgent.agentId,
                    online,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async sendObsCommandToPrimaryStreamer<T>(
        discordGuildId: string,
        command: ObsRelayCommandName,
        payload?: Record<string, unknown>,
    ): Promise<DBResponse<T>> {
        try {
            const primaryAgent = await this.getPrimaryGuildStreamerAgent(discordGuildId);
            if (DataBaseHandler.isFail(primaryAgent)) {
                return primaryAgent;
            }

            const result = await obsRelayService.sendCommand<T>(primaryAgent.data.agentId, command, payload);
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async listPrimaryStreamerScenes(discordGuildId: string): Promise<DBResponse<Array<{ sceneName: string }>>> {
        return this.sendObsCommandToPrimaryStreamer<Array<{ sceneName: string }>>(discordGuildId, "obs.listScenes");
    }

    async listPrimaryStreamerSceneItems(discordGuildId: string, sceneName: string): Promise<DBResponse<ObsRelaySceneItem[]>> {
        return this.sendObsCommandToPrimaryStreamer<ObsRelaySceneItem[]>(discordGuildId, "obs.listSceneItems", { sceneName });
    }

    async getPrimaryStreamerObsStatus(discordGuildId: string): Promise<DBResponse<ObsRelayGetStatusResult>> {
        return this.sendObsCommandToPrimaryStreamer<ObsRelayGetStatusResult>(discordGuildId, "obs.getStatus");
    }

    async resolveObsTargetForGuild(
        discordGuildId: string,
        selectedNickname?: string | null,
    ): Promise<DBResponse<ObsTargetView>> {
        try {
            const normalizedGuildId = discordGuildId.trim();
            if (!normalizedGuildId) {
                return {
                    success: false,
                    error: { reason: "unknown", relatedTo: "guilds", message: "OBS relay requires a Discord guild id." },
                };
            }

            const listResponse = await this.listGuildStreamers(normalizedGuildId);
            if (DataBaseHandler.isFail(listResponse)) {
                return listResponse;
            }

            if (!listResponse.data.length) {
                return {
                    success: false,
                    error: { reason: "record_not_found", relatedTo: "guild_streamers", message: "This server has no registered streamers yet." },
                };
            }

            let streamer: GuildStreamerView | undefined;
            const normalizedNickname = selectedNickname?.trim().toLowerCase();
            if (normalizedNickname) {
                streamer = listResponse.data.find(s => s.nickname === normalizedNickname);
            }
            if (!streamer) {
                streamer = listResponse.data.find(s => s.isPrimary) ?? listResponse.data[0];
            }

            if (!streamer.obsAgentId) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "bot_settings",
                        message: `Streamer '${streamer.nickname}' has no OBS Agent configured. Use /streamer agent_pair nickname:${streamer.nickname}.`,
                    },
                };
            }

            const online = obsRelayService.isAgentConnected(streamer.obsAgentId);
            if (!online) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "bot_settings",
                        message: `OBS Agent for '${streamer.nickname}' is offline. Start Balkon OBS Agent on the streamer PC.`,
                    },
                };
            }

            return {
                success: true,
                data: { streamer, agentId: streamer.obsAgentId, online },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async sendObsCommandToStreamer<T>(
        discordGuildId: string,
        selectedNickname: string | null | undefined,
        command: ObsRelayCommandName,
        payload?: Record<string, unknown>,
    ): Promise<DBResponse<T>> {
        try {
            const targetResult = await this.resolveObsTargetForGuild(discordGuildId, selectedNickname);
            if (DataBaseHandler.isFail(targetResult)) {
                return targetResult;
            }

            const result = await obsRelayService.sendCommand<T>(targetResult.data.agentId, command, payload);
            return { success: true, data: result };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async upsertItemServiceAction(input: {
        itemTemplateId: number;
        actionType: ItemServiceActionType;
        sceneName?: string | null;
        sourceName?: string | null;
        textTemplate?: string | null;
        mediaAction?: string | null;
        visible?: boolean | null;
        consumeOnUse?: boolean;
        updatedByDiscordId: string;
    }): Promise<DBResponse<{ itemTemplateId: number }>> {
        try {
            const item = await itemService.getItemTemplateById(input.itemTemplateId);
            if (DataBaseHandler.isFail(item) || !item.data) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "items",
                        message: "Item template not found.",
                    },
                };
            }

            if (item.data.itemType !== "service") {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "items",
                        message: "Only items of type 'service' can be bound to OBS actions.",
                    },
                };
            }

            this.validateServiceActionInput(input.actionType, input);
            const updater = await this.ensureMemberByDiscordId(input.updatedByDiscordId);

            await pool.query(
                `INSERT INTO item_service_actions (
                    item_id,
                    action_type,
                    scene_name,
                    source_name,
                    text_template,
                    media_action,
                    visible,
                    consume_on_use,
                    updated_by_member_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    action_type = VALUES(action_type),
                    scene_name = VALUES(scene_name),
                    source_name = VALUES(source_name),
                    text_template = VALUES(text_template),
                    media_action = VALUES(media_action),
                    visible = VALUES(visible),
                    consume_on_use = VALUES(consume_on_use),
                    updated_by_member_id = VALUES(updated_by_member_id),
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    input.itemTemplateId,
                    input.actionType,
                    input.sceneName ?? null,
                    input.sourceName ?? null,
                    input.textTemplate ?? null,
                    input.mediaAction ?? null,
                    input.visible ?? null,
                    input.consumeOnUse ?? true,
                    updater.data.id,
                ]
            );

            return {
                success: true,
                data: {
                    itemTemplateId: input.itemTemplateId,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async getItemServiceAction(itemTemplateId: number): Promise<DBResponse<ItemServiceActionView | null>> {
        try {
            const [rows] = await pool.query<ItemServiceActionRow[]>(
                `SELECT * FROM item_service_actions WHERE item_id = ? LIMIT 1`,
                [itemTemplateId]
            );

            return {
                success: true,
                data: rows.length ? this.mapItemServiceActionRow(rows[0]) : null,
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async useServiceItem(input: {
        discordUserId: string;
        discordGuildId: string;
        inventoryItemId: number;
        streamerNickname?: string | null;
        customText?: string | null;
    }): Promise<DBResponse<{ streamerNickname: string; actionType: ItemServiceActionType; consumed: boolean }>> {
        try {
            const guildStreamer = await this.resolveGuildStreamer(input.discordGuildId, input.streamerNickname ?? null);
            const executionContext = await this.prepareServiceItemExecution({
                discordUserId: input.discordUserId,
                inventoryItemId: input.inventoryItemId,
                streamerId: guildStreamer.streamerId,
                fallbackGuildId: input.discordGuildId,
            });

            await this.executePreparedServiceItem({
                context: executionContext,
                discordUserId: input.discordUserId,
                customText: input.customText ?? null,
            });

            return {
                success: true,
                data: {
                    streamerNickname: executionContext.streamerNickname,
                    actionType: executionContext.action.actionType,
                    consumed: executionContext.action.consumeOnUse,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async useServiceItemByStreamerId(input: {
        discordUserId: string;
        inventoryItemId: number;
        streamerId: number;
        customText?: string | null;
    }): Promise<DBResponse<{ streamerId: number; streamerNickname: string; actionType: ItemServiceActionType; consumed: boolean }>> {
        try {
            const executionContext = await this.prepareServiceItemExecution({
                discordUserId: input.discordUserId,
                inventoryItemId: input.inventoryItemId,
                streamerId: input.streamerId,
            });

            await this.executePreparedServiceItem({
                context: executionContext,
                discordUserId: input.discordUserId,
                customText: input.customText ?? null,
            });

            return {
                success: true,
                data: {
                    streamerId: executionContext.streamerId,
                    streamerNickname: executionContext.streamerNickname,
                    actionType: executionContext.action.actionType,
                    consumed: executionContext.action.consumeOnUse,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    private async executeObsAction(input: {
        action: ItemServiceActionView;
        agentId: string;
        itemName: string;
        streamerNickname: string;
        twitchUrl: string;
        customText: string | null;
        guildId: string;
        userId: string;
    }) {
        switch (input.action.actionType) {
            case "switch_scene":
                if (!input.action.sceneName) {
                    throw new Error("Service action is missing target scene.");
                }
                await obsRelayService.sendCommand<void>(input.agentId, "obs.switchScene", { sceneName: input.action.sceneName });
                return;
            case "source_visibility":
                if (!input.action.sceneName || !input.action.sourceName || input.action.visible === null) {
                    throw new Error("Service action is missing scene/source visibility settings.");
                }
                await obsRelayService.sendCommand<void>(input.agentId, "obs.setSourceVisibility", {
                    sceneName: input.action.sceneName,
                    sourceName: input.action.sourceName,
                    visible: input.action.visible,
                } satisfies ObsRelaySetSourceVisibilityPayload);
                return;
            case "set_text": {
                if (!input.action.sourceName) {
                    throw new Error("Service action is missing text source name.");
                }
                const text = this.renderTextTemplate(input.action.textTemplate, input);
                await obsRelayService.sendCommand<void>(input.agentId, "obs.setTextInputText", {
                    inputName: input.action.sourceName,
                    text,
                } satisfies ObsRelaySetTextInputPayload);
                return;
            }
            case "media_action":
                if (!input.action.sourceName || !input.action.mediaAction) {
                    throw new Error("Service action is missing media input settings.");
                }
                await obsRelayService.sendCommand<void>(input.agentId, "obs.triggerMediaInputAction", {
                    inputName: input.action.sourceName,
                    mediaAction: input.action.mediaAction as ObsMediaAction,
                } satisfies ObsRelayMediaActionPayload);
                return;
            default:
                throw new Error("Unsupported service action type.");
        }
    }

    private renderTextTemplate(template: string | null, input: {
        itemName: string;
        streamerNickname: string;
        twitchUrl: string;
        customText: string | null;
        guildId: string;
        userId: string;
    }) {
        const baseTemplate = template?.trim() || "{streamer}: {custom_text}";
        return baseTemplate
            .replaceAll("{streamer}", input.streamerNickname)
            .replaceAll("{item}", input.itemName)
            .replaceAll("{twitch_url}", input.twitchUrl)
            .replaceAll("{guild}", input.guildId)
            .replaceAll("{user}", input.userId)
            .replaceAll("{custom_text}", input.customText?.trim() || input.itemName);
    }

    private async prepareServiceItemExecution(input: {
        discordUserId: string;
        inventoryItemId: number;
        streamerId: number;
        fallbackGuildId?: string;
    }): Promise<ServiceItemExecutionContext> {
        const inventoryItem = await itemService.getInventoryItemById(input.inventoryItemId);
        if (DataBaseHandler.isFail(inventoryItem) || !inventoryItem.data) {
            throw this.createServiceItemError("record_not_found", "member_items", "Inventory item not found.");
        }

        if (inventoryItem.data.ownerDiscordId !== input.discordUserId) {
            throw this.createServiceItemError("unknown", "member_items", "You do not own this service item.");
        }

        if (inventoryItem.data.itemType !== "service") {
            throw this.createServiceItemError("unknown", "items", "Selected inventory item is not a service item.");
        }

        const actionResponse = await this.getItemServiceAction(inventoryItem.data.itemTemplateId);
        if (DataBaseHandler.isFail(actionResponse) || !actionResponse.data) {
            throw this.createServiceItemError("record_not_found", "item_service_actions", "No OBS action is bound to this service item yet.");
        }

        const streamer = await this.requireStreamerById(input.streamerId);
        const streamerAgent = await this.getStreamerObsAgentByStreamerId(streamer.id);
        if (!streamerAgent) {
            throw this.createServiceItemError("record_not_found", "bot_settings", `Streamer '${streamer.nickname}' does not have an OBS agent configured yet.`);
        }

        const guildId = input.fallbackGuildId ?? await this.resolvePrimaryGuildIdForStreamer(streamer.id);

        return {
            inventoryItem: inventoryItem.data,
            action: actionResponse.data,
            streamerId: streamer.id,
            streamerNickname: streamer.nickname,
            twitchUrl: streamer.twitch_url,
            agentId: streamerAgent.agentId,
            guildId,
        };
    }

    private async executePreparedServiceItem(input: {
        context: ServiceItemExecutionContext;
        discordUserId: string;
        customText: string | null;
    }): Promise<void> {
        let connection: PoolConnection | null = null;

        try {
            await this.executeObsAction({
                action: input.context.action,
                agentId: input.context.agentId,
                itemName: input.context.inventoryItem.name,
                streamerNickname: input.context.streamerNickname,
                twitchUrl: input.context.twitchUrl,
                customText: input.customText,
                guildId: input.context.guildId,
                userId: input.discordUserId,
            });

            if (!input.context.action.consumeOnUse) {
                return;
            }

            connection = await pool.getConnection();
            await connection.beginTransaction();
            await connection.query(`DELETE FROM item_public_market WHERE member_item_id = ?`, [input.context.inventoryItem.inventoryItemId]);
            await connection.query(`DELETE FROM member_items WHERE id = ?`, [input.context.inventoryItem.inventoryItemId]);
            await connection.commit();
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        } finally {
            connection?.release();
        }
    }

    private async resolvePrimaryGuildIdForStreamer(streamerId: number): Promise<string> {
        const [rows] = await pool.query<Array<RowDataPacket & { ds_guild_id: string }>>(
            `SELECT
                g.ds_guild_id
             FROM guild_streamers AS gs
             INNER JOIN guilds AS g ON g.id = gs.guild_id
             WHERE gs.streamer_id = ?
             ORDER BY gs.is_primary DESC, gs.id ASC
             LIMIT 1`,
            [streamerId]
        );

        const guildId = rows[0]?.ds_guild_id ? String(rows[0].ds_guild_id) : "";
        if (!guildId) {
            throw this.createServiceItemError("record_not_found", "guild_streamers", "Streamer is not linked to any Discord guild.");
        }

        return guildId;
    }

    private createServiceItemError(reason: string, relatedTo: string, message: string) {
        return Object.assign(new Error(message), {
            reason,
            relatedTo,
        });
    }

    private async resolveGuildStreamer(discordGuildId: string, nickname: string | null): Promise<GuildStreamerView> {
        const listResponse = await this.listGuildStreamers(discordGuildId);
        if (DataBaseHandler.isFail(listResponse) || !listResponse.data.length) {
            throw new Error("This server has no registered streamers yet.");
        }

        if (nickname) {
            const match = listResponse.data.find(streamer => streamer.nickname === nickname.trim().toLowerCase());
            if (!match) {
                throw new Error(`Streamer '${nickname}' is not registered on this server.`);
            }
            return match;
        }

        return listResponse.data.find(streamer => streamer.isPrimary) ?? listResponse.data[0];
    }

    private async requireStreamerById(streamerId: number, includeArchived = false): Promise<StreamerRow> {
        const [rows] = await pool.query<StreamerRow[]>(
            `SELECT id, nickname, twitch_url, archived_at, archived_by_member_id
             FROM streamers
             WHERE id = ? ${includeArchived ? "" : "AND archived_at IS NULL"}
             LIMIT 1`,
            [streamerId]
        );

        if (!rows.length) {
            throw Object.assign(new Error("Streamer not found."), { code: "STREAMER_NOT_FOUND" });
        }

        return rows[0];
    }

    private async findStreamerByNickname(nickname: string, includeArchived = false): Promise<StreamerRow | null> {
        const [rows] = await pool.query<StreamerRow[]>(
            `SELECT id, nickname, twitch_url, archived_at, archived_by_member_id
             FROM streamers
             WHERE nickname = ? ${includeArchived ? "" : "AND archived_at IS NULL"}
             LIMIT 1`,
            [nickname]
        );

        return rows[0] ?? null;
    }

    private async ensureGuildByDiscordId(discordGuildId: string): Promise<DBResponseSuccess<GuildsDB>> {
        const existingGuild = await DataBaseHandler.getInstance().getFromTable<GuildsDB>("guilds", { ds_guild_id: discordGuildId });
        if (DataBaseHandler.isSuccess(existingGuild) && existingGuild.data.length) {
            return {
                success: true,
                data: existingGuild.data[0],
            };
        }

        const insertGuild = await DataBaseHandler.getInstance().addGuildToDB(discordGuildId);
        if (DataBaseHandler.isFail(insertGuild)) {
            throw new Error(insertGuild.error.message ?? "Unable to create guild record.");
        }

        return {
            success: true,
            data: {
                id: insertGuild.data.insertId,
                ds_guild_id: discordGuildId,
                earning_multiply: 1,
            },
        };
    }

    private async ensureMemberByDiscordId(discordUserId: string): Promise<DBResponseSuccess<MembersDB>> {
        let memberId: number;
        try {
            memberId = await memberService.ensureMemberByDiscordId(discordUserId, { createdSource: "unknown" });
        } catch {
            throw new Error("Unable to resolve member in database.");
        }

        const member = await DataBaseHandler.getInstance().getFromTable<MembersDB>("members", { id: memberId });
        if (DataBaseHandler.isFail(member) || !member.data.length) {
            throw new Error("Unable to load member record.");
        }

        return {
            success: true,
            data: member.data[0],
        };
    }

    private normalizeTwitchUrl(url: string | null | undefined, nickname: string) {
        const normalizedValue = url?.trim();
        if (!normalizedValue) {
            return `https://www.twitch.tv/${nickname}`;
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(normalizedValue);
        } catch {
            throw new Error("Twitch URL must be a valid absolute URL.");
        }

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            throw new Error("Twitch URL must start with http:// or https://.");
        }

        return parsedUrl.toString();
    }

    private normalizeAgentId(agentId: string | null | undefined, nickname: string) {
        const normalizedValue = agentId?.trim();
        const fallbackAgentId = `streamer-${nickname}-${crypto.randomBytes(4).toString("hex")}`;
        const resolvedValue = normalizedValue?.length ? normalizedValue : fallbackAgentId;

        if (!/^[a-zA-Z0-9._:-]{3,80}$/.test(resolvedValue)) {
            throw new Error("Agent id must be 3-80 chars and use only letters, numbers, dot, underscore, colon or dash.");
        }

        return resolvedValue;
    }

    private async guildHasAnyStreamers(guildId: number) {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT id FROM guild_streamers WHERE guild_id = ? LIMIT 1`, [guildId]);
        return rows.length > 0;
    }

    private async clearPrimaryGuildStreamer(guildId: number) {
        await pool.query(`UPDATE guild_streamers SET is_primary = FALSE WHERE guild_id = ?`, [guildId]);
    }

    private async getGuildStreamerBinding(guildId: number, streamerId: number) {
        const [rows] = await pool.query<GuildStreamerRow[]>(
            `SELECT
                gs.id AS guild_streamer_id,
                g.id AS guild_id,
                g.ds_guild_id,
                s.id AS streamer_id,
                s.nickname,
                s.twitch_url,
                gs.is_primary
             FROM guild_streamers AS gs
             INNER JOIN guilds AS g ON g.id = gs.guild_id
             INNER JOIN streamers AS s ON s.id = gs.streamer_id
             WHERE gs.guild_id = ? AND gs.streamer_id = ?
               AND s.archived_at IS NULL
             LIMIT 1`,
            [guildId, streamerId]
        );

        const agentBinding = (await this.loadStreamerAgentBindings([streamerId])).get(streamerId) ?? null;
        return rows.length ? this.mapGuildStreamerRow(rows[0], agentBinding) : null;
    }

    private validateServiceActionInput(actionType: ItemServiceActionType, input: {
        sceneName?: string | null;
        sourceName?: string | null;
        textTemplate?: string | null;
        mediaAction?: string | null;
        visible?: boolean | null;
    }) {
        if (actionType === "switch_scene" && !input.sceneName) {
            throw new Error("switch_scene action requires sceneName.");
        }
        if (actionType === "source_visibility" && (!input.sceneName || !input.sourceName || input.visible === undefined || input.visible === null)) {
            throw new Error("source_visibility action requires sceneName, sourceName and visible.");
        }
        if (actionType === "set_text" && !input.sourceName) {
            throw new Error("set_text action requires sourceName.");
        }
        if (actionType === "media_action" && (!input.sourceName || !input.mediaAction)) {
            throw new Error("media_action action requires sourceName and mediaAction.");
        }
    }

    private mapGuildStreamerRow(row: GuildStreamerRow, agentBinding: StreamerAgentBindingRecord | null): GuildStreamerView {
        return {
            guildStreamerId: row.guild_streamer_id,
            discordGuildId: row.ds_guild_id,
            streamerId: row.streamer_id,
            nickname: row.nickname,
            twitchUrl: row.twitch_url,
            isPrimary: Boolean(row.is_primary),
            obsAgentId: agentBinding?.agentId ?? null,
            obsAgentOnline: agentBinding ? obsRelayService.isAgentConnected(agentBinding.agentId) : false,
        };
    }

    private async getStreamerAgentBindingByStreamerId(streamerId: number): Promise<{ agentId: string } | null> {
        const bindingValue = await this.readBotSetting(this.getStreamerAgentBindingKey(streamerId));
        if (!bindingValue) {
            return null;
        }

        try {
            const parsedBinding = JSON.parse(bindingValue) as { agentId?: string };
            const agentId = typeof parsedBinding.agentId === "string" ? parsedBinding.agentId.trim() : "";
            if (!agentId.length) {
                return null;
            }

            return { agentId };
        } catch {
            return null;
        }
    }

    private async getStreamerObsAgentByStreamerId(streamerId: number): Promise<{ agentId: string; agentToken: string } | null> {
        const binding = await this.getStreamerAgentBindingByStreamerId(streamerId);
        if (!binding) {
            return null;
        }

        const agentToken = await this.readBotSetting(this.getAgentCredentialKey(binding.agentId));
        if (!agentToken) {
            return null;
        }

        return {
            agentId: binding.agentId,
            agentToken,
        };
    }

    private async loadStreamerAgentBindings(streamerIds: number[]): Promise<Map<number, StreamerAgentBindingRecord>> {
        const bindings = new Map<number, StreamerAgentBindingRecord>();
        if (!streamerIds.length) {
            return bindings;
        }

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT setting_key, setting_value FROM bot_settings WHERE setting_key LIKE ?`,
            [`${OBS_AGENT_BINDING_PREFIX}%`]
        );

        for (const row of rows) {
            const settingKey = String(row.setting_key ?? "");
            const streamerId = Number(settingKey.replace(OBS_AGENT_BINDING_PREFIX, ""));
            if (!streamerIds.includes(streamerId) || !row.setting_value) {
                continue;
            }

            try {
                const parsedValue = JSON.parse(String(row.setting_value)) as { agentId?: string };
                if (!parsedValue.agentId) {
                    continue;
                }

                bindings.set(streamerId, {
                    streamerId,
                    agentId: parsedValue.agentId,
                });
            } catch {
                continue;
            }
        }

        return bindings;
    }

    private async readBotSetting(settingKey: string): Promise<string | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT setting_value FROM bot_settings WHERE setting_key = ? LIMIT 1`,
            [settingKey]
        );

        return rows[0]?.setting_value ? String(rows[0].setting_value) : null;
    }

    private toIsoTimestampOrNull(value: Date | string | null | undefined): string | null {
        if (!value) {
            return null;
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
    }

    private async ensureStreamerOwner(streamerId: number, memberId: number): Promise<void> {
        await pool.query(
            `INSERT INTO streamer_owners (streamer_id, member_id, role)
             VALUES (?, ?, 'owner')
             ON DUPLICATE KEY UPDATE role = role`,
            [streamerId, memberId]
        );
    }

    private async upsertBotSetting(settingKey: string, settingValue: string | null, updatedByMemberId: number) {
        await pool.query(
            `INSERT INTO bot_settings (setting_key, setting_value, updated_by_member_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_member_id = VALUES(updated_by_member_id), updated_at = CURRENT_TIMESTAMP`,
            [settingKey, settingValue, updatedByMemberId]
        );
    }

    private getStreamerAgentBindingKey(streamerId: number) {
        return `${OBS_AGENT_BINDING_PREFIX}${streamerId}`;
    }

    private getAgentCredentialKey(agentId: string) {
        return `${OBS_AGENT_CREDENTIAL_PREFIX}${agentId}`;
    }

    private mapItemServiceActionRow(row: ItemServiceActionRow): ItemServiceActionView {
        return {
            itemTemplateId: row.item_id,
            actionType: row.action_type,
            sceneName: row.scene_name,
            sourceName: row.source_name,
            textTemplate: row.text_template,
            mediaAction: row.media_action,
            visible: row.visible === null ? null : Boolean(row.visible),
            consumeOnUse: Boolean(row.consume_on_use),
        };
    }
}

export const streamerService = StreamerService.getInstance();