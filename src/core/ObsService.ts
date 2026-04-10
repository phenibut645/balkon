import OBSWebSocket from "obs-websocket-js";
import { RowDataPacket } from "mysql2";
import { OBS_WEBSOCKET_PASSWORD, OBS_WEBSOCKET_URL } from "../config.js";
import pool from "../db.js";
import { DataBaseHandler } from "./DataBaseHandler.js";

interface ObsSettingRow extends RowDataPacket {
    setting_key: string;
    setting_value: string | null;
}

export interface ObsConnectionStatus {
    connected: boolean;
    obsVersion: string | null;
    websocketVersion: string | null;
    currentSceneName: string | null;
    endpoint: string | null;
    configSource: "database" | "environment" | "missing";
}

export interface ObsSceneView {
    sceneName: string;
}

export interface ObsSceneItemView {
    sceneItemId: number;
    sourceName: string;
    enabled: boolean;
}

export type ObsMediaAction =
    | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NONE"
    | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY"
    | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE"
    | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP"
    | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"
    | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT"
    | "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS";

export class ObsService {
    private static instance: ObsService;
    private readonly obs = new OBSWebSocket();
    private connected = false;
    private obsVersion: string | null = null;
    private websocketVersion: string | null = null;
    private connectionClosedHandlerRegistered = false;

    static getInstance(): ObsService {
        if (!ObsService.instance) {
            ObsService.instance = new ObsService();
        }

        return ObsService.instance;
    }

    async getStatus(): Promise<ObsConnectionStatus> {
        const connectionConfig = await this.getConnectionConfig();
        try {
            await this.ensureConnected();
            const currentScene = await this.obs.call("GetCurrentProgramScene");
            const versionInfo = await this.obs.call("GetVersion");
            this.obsVersion = versionInfo.obsVersion;
            this.websocketVersion = versionInfo.obsWebSocketVersion;

            return {
                connected: true,
                obsVersion: this.obsVersion,
                websocketVersion: this.websocketVersion,
                currentSceneName: String(currentScene.currentProgramSceneName ?? ""),
                endpoint: connectionConfig.url,
                configSource: connectionConfig.source,
            };
        } catch {
            return {
                connected: false,
                obsVersion: this.obsVersion,
                websocketVersion: this.websocketVersion,
                currentSceneName: null,
                endpoint: connectionConfig.url,
                configSource: connectionConfig.source,
            };
        }
    }

    async reconnect(): Promise<ObsConnectionStatus> {
        await this.disconnect();
        return this.getStatus();
    }

    async listScenes(): Promise<ObsSceneView[]> {
        await this.ensureConnected();
        const result = await this.obs.call("GetSceneList");
        return result.scenes
            .map(scene => ({ sceneName: scene.sceneName === null ? "" : String(scene.sceneName) }))
            .filter(scene => scene.sceneName.length > 0);
    }

    async listSceneItems(sceneName: string): Promise<ObsSceneItemView[]> {
        await this.ensureConnected();
        const result = await this.obs.call("GetSceneItemList", { sceneName });
        return result.sceneItems
            .map(sceneItem => ({
                sceneItemId: Number(sceneItem.sceneItemId),
                sourceName: sceneItem.sourceName === null ? "" : String(sceneItem.sourceName),
                enabled: Boolean(sceneItem.sceneItemEnabled),
            }))
            .filter(sceneItem => Number.isFinite(sceneItem.sceneItemId) && sceneItem.sourceName.length > 0);
    }

    async switchScene(sceneName: string): Promise<void> {
        await this.ensureConnected();
        await this.obs.call("SetCurrentProgramScene", { sceneName });
    }

    async setSourceVisibility(sceneName: string, sourceName: string, visible: boolean): Promise<void> {
        await this.ensureConnected();
        const items = await this.listSceneItems(sceneName);
        const targetItem = items.find(item => item.sourceName.toLowerCase() === sourceName.trim().toLowerCase());
        if (!targetItem) {
            throw new Error(`Source '${sourceName}' not found in scene '${sceneName}'.`);
        }

        await this.obs.call("SetSceneItemEnabled", {
            sceneName,
            sceneItemId: targetItem.sceneItemId,
            sceneItemEnabled: visible,
        });
    }

    async setTextInputText(inputName: string, text: string): Promise<void> {
        await this.ensureConnected();
        await this.obs.call("SetInputSettings", {
            inputName,
            inputSettings: {
                text,
            },
            overlay: true,
        });
    }

    async triggerMediaInputAction(inputName: string, mediaAction: ObsMediaAction): Promise<void> {
        await this.ensureConnected();
        await this.obs.call("TriggerMediaInputAction", {
            inputName,
            mediaAction,
        });
    }

    async searchScenes(query: string): Promise<Array<{ name: string; value: string }>> {
        try {
            const scenes = await this.listScenes();
            const loweredQuery = query.trim().toLowerCase();
            return scenes
                .filter(scene => !loweredQuery || scene.sceneName.toLowerCase().includes(loweredQuery))
                .slice(0, 25)
                .map(scene => ({ name: scene.sceneName, value: scene.sceneName }));
        } catch {
            return [];
        }
    }

    async searchSceneItems(sceneName: string, query: string): Promise<Array<{ name: string; value: string }>> {
        try {
            const items = await this.listSceneItems(sceneName);
            const loweredQuery = query.trim().toLowerCase();
            return items
                .filter(item => !loweredQuery || item.sourceName.toLowerCase().includes(loweredQuery))
                .slice(0, 25)
                .map(item => ({
                    name: `${item.sourceName} (${item.enabled ? "visible" : "hidden"})`,
                    value: item.sourceName,
                }));
        } catch {
            return [];
        }
    }

    async setConnectionConfig(input: { url: string; password?: string | null; updatedByDiscordId: string }): Promise<void> {
        const normalizedUrl = this.normalizeObsUrl(input.url);
        const normalizedPassword = input.password === undefined ? null : input.password;
        const updater = await DataBaseHandler.getInstance().isMemberExists(input.updatedByDiscordId, true);

        if (DataBaseHandler.isFail(updater) || !updater.data.memberId) {
            throw new Error("Unable to resolve bot admin in database.");
        }

        await this.upsertSetting("obs_websocket_url", normalizedUrl, updater.data.memberId);
        await this.upsertSetting("obs_websocket_password", normalizedPassword, updater.data.memberId);
        await this.disconnect();
    }

    async clearConnectionConfig(updatedByDiscordId: string): Promise<void> {
        const updater = await DataBaseHandler.getInstance().isMemberExists(updatedByDiscordId, true);

        if (DataBaseHandler.isFail(updater) || !updater.data.memberId) {
            throw new Error("Unable to resolve bot admin in database.");
        }

        await this.upsertSetting("obs_websocket_url", null, updater.data.memberId);
        await this.upsertSetting("obs_websocket_password", null, updater.data.memberId);
        await this.disconnect();
    }

    async getMaskedConnectionConfig(): Promise<{ url: string | null; passwordMask: string | null; source: "database" | "environment" | "missing" }> {
        const config = await this.getConnectionConfig();
        return {
            url: config.url,
            passwordMask: config.password ? "*".repeat(Math.min(Math.max(config.password.length, 1), 12)) : null,
            source: config.source,
        };
    }

    private async ensureConnected(): Promise<void> {
        const connectionConfig = await this.getConnectionConfig();

        if (!connectionConfig.url) {
            throw new Error("OBS_WEBSOCKET_URL is not configured.");
        }

        if (this.connected) {
            return;
        }

        const connectResult = await this.obs.connect(connectionConfig.url, connectionConfig.password || undefined);
        this.connected = true;
        this.obsVersion = null;
        this.websocketVersion = connectResult.obsWebSocketVersion;

        if (!this.connectionClosedHandlerRegistered) {
            this.obs.on("ConnectionClosed", () => {
                this.connected = false;
            });
            this.connectionClosedHandlerRegistered = true;
        }
    }

    private async disconnect(): Promise<void> {
        if (!this.connected) {
            return;
        }

        await this.obs.disconnect();
        this.connected = false;
    }

    private async getConnectionConfig(): Promise<{ url: string | null; password: string | null; source: "database" | "environment" | "missing" }> {
        const [rows] = await pool.query<ObsSettingRow[]>(
            `SELECT setting_key, setting_value FROM bot_settings WHERE setting_key IN ('obs_websocket_url', 'obs_websocket_password')`
        );

        const storedUrl = rows.find(row => row.setting_key === "obs_websocket_url")?.setting_value?.trim() || null;
        const storedPassword = rows.find(row => row.setting_key === "obs_websocket_password")?.setting_value ?? null;

        if (storedUrl) {
            return {
                url: storedUrl,
                password: storedPassword,
                source: "database",
            };
        }

        if (OBS_WEBSOCKET_URL) {
            return {
                url: OBS_WEBSOCKET_URL,
                password: OBS_WEBSOCKET_PASSWORD ?? null,
                source: "environment",
            };
        }

        return {
            url: null,
            password: null,
            source: "missing",
        };
    }

    private async upsertSetting(settingKey: string, settingValue: string | null, updatedByMemberId: number): Promise<void> {
        await pool.query(
            `INSERT INTO bot_settings (setting_key, setting_value, updated_by_member_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_member_id = VALUES(updated_by_member_id), updated_at = CURRENT_TIMESTAMP`,
            [settingKey, settingValue, updatedByMemberId]
        );
    }

    private normalizeObsUrl(url: string): string {
        const normalizedUrl = url.trim();
        let parsedUrl: URL;

        try {
            parsedUrl = new URL(normalizedUrl);
        } catch {
            throw new Error("OBS URL must be a valid ws:// or wss:// URL.");
        }

        if (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") {
            throw new Error("OBS URL must start with ws:// or wss://.");
        }

        return parsedUrl.toString();
    }
}

export const obsService = ObsService.getInstance();