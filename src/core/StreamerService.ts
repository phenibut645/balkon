import crypto from "crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import pool from "../db.js";
import { DataBaseHandler, DBResponse, DBResponseSuccess } from "./DataBaseHandler.js";
import { ObsMediaAction } from "./ObsService.js";
import { GuildStreamersDB, GuildsDB, ItemServiceActionType, ItemServiceActionsDB, MembersDB, StreamersDB } from "../types/database.types.js";
import { itemService } from "./ItemService.js";
import { obsRelayService } from "./ObsRelayService.js";
import { ObsRelayMediaActionPayload, ObsRelaySetSourceVisibilityPayload, ObsRelaySetTextInputPayload } from "../types/obs-agent.types.js";

interface GuildStreamerRow extends RowDataPacket {
    guild_streamer_id: number;
    guild_id: number;
    ds_guild_id: string;
    streamer_id: number;
    nickname: string;
    twitch_url: string;
    is_primary: number;
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
            const existingStreamer = await DataBaseHandler.getInstance().getFromTable<StreamersDB>("streamers", { nickname: normalizedNickname });
            if (DataBaseHandler.isSuccess(existingStreamer) && existingStreamer.data.length) {
                streamerId = existingStreamer.data[0].id;
                await pool.query(
                    `UPDATE streamers SET twitch_url = ? WHERE id = ?`,
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
        let connection: PoolConnection | null = null;

        try {
            const inventoryItem = await itemService.getInventoryItemById(input.inventoryItemId);
            if (DataBaseHandler.isFail(inventoryItem) || !inventoryItem.data) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "member_items",
                        message: "Inventory item not found.",
                    },
                };
            }

            if (inventoryItem.data.ownerDiscordId !== input.discordUserId) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "member_items",
                        message: "You do not own this service item.",
                    },
                };
            }

            if (inventoryItem.data.itemType !== "service") {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "items",
                        message: "Selected inventory item is not a service item.",
                    },
                };
            }

            const actionResponse = await this.getItemServiceAction(inventoryItem.data.itemTemplateId);
            if (DataBaseHandler.isFail(actionResponse) || !actionResponse.data) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_service_actions",
                        message: "No OBS action is bound to this service item yet.",
                    },
                };
            }

            const guildStreamer = await this.resolveGuildStreamer(input.discordGuildId, input.streamerNickname ?? null);
            const streamerAgent = await this.getStreamerObsAgentByStreamerId(guildStreamer.streamerId);
            if (!streamerAgent) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "bot_settings",
                        message: `Streamer '${guildStreamer.nickname}' does not have an OBS agent configured yet.`,
                    },
                };
            }

            await this.executeObsAction({
                action: actionResponse.data,
                agentId: streamerAgent.agentId,
                itemName: inventoryItem.data.name,
                streamerNickname: guildStreamer.nickname,
                twitchUrl: guildStreamer.twitchUrl,
                customText: input.customText ?? null,
                guildId: input.discordGuildId,
                userId: input.discordUserId,
            });

            if (actionResponse.data.consumeOnUse) {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                await connection.query(`DELETE FROM item_public_market WHERE member_item_id = ?`, [input.inventoryItemId]);
                await connection.query(`DELETE FROM member_items WHERE id = ?`, [input.inventoryItemId]);
                await connection.commit();
            }

            return {
                success: true,
                data: {
                    streamerNickname: guildStreamer.nickname,
                    actionType: actionResponse.data.actionType,
                    consumed: actionResponse.data.consumeOnUse,
                },
            };
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            return DataBaseHandler.errorHandling(error);
        } finally {
            connection?.release();
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
        const response = await DataBaseHandler.getInstance().isMemberExists(discordUserId, true);
        if (DataBaseHandler.isFail(response) || !response.data.memberId) {
            throw new Error("Unable to resolve member in database.");
        }

        const member = await DataBaseHandler.getInstance().getFromTable<MembersDB>("members", { id: response.data.memberId });
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

    private async getStreamerObsAgentByStreamerId(streamerId: number): Promise<{ agentId: string; agentToken: string } | null> {
        const bindingValue = await this.readBotSetting(this.getStreamerAgentBindingKey(streamerId));
        if (!bindingValue) {
            return null;
        }

        const parsedBinding = JSON.parse(bindingValue) as { agentId?: string };
        if (!parsedBinding.agentId) {
            return null;
        }

        const agentToken = await this.readBotSetting(this.getAgentCredentialKey(parsedBinding.agentId));
        if (!agentToken) {
            return null;
        }

        return {
            agentId: parsedBinding.agentId,
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