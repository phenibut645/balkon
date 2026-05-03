import pool from "../db.js";
import { getBotCommandQueue } from "./BotCommandQueue.js";
import { StreamerAccessService } from "./StreamerAccessService.js";
import { ObsAgentStatusService, ObsAgentStatusView } from "./ObsAgentStatusService.js";
import { ObsRelayCommandName } from "../types/obs-agent.types.js";
import {
  ApplySceneItemTransformInput,
  ApplySceneItemTransformResult,
  BotCommandStatusRow,
  BotSettingRow,
  CreateBrowserSourceInput,
  CreateBrowserSourceResult,
  CreateTextSourceInput,
  CreateTextSourceResult,
  GetSourceSettingsInput,
  GetSourceSettingsResult,
  RemoveSceneItemInput,
  RemoveSceneItemResult,
  SceneItemsListResult,
  ScenesListResult,
  SetSceneItemIndexInput,
  SetSceneItemIndexResult,
  SetSceneItemVisibilityInput,
  SetSceneItemVisibilityResult,
  StreamerRow,
  UpdateBrowserSourceInput,
  UpdateBrowserSourceResult,
  UpdateTextSourceInput,
  UpdateTextSourceResult,
} from "./streamer-studio/controlTypes.js";
import {
  clampNumber,
  isRecord,
  OBS_AGENT_BINDING_PREFIX,
  OBS_AGENT_STALE_MS,
  OBS_COMMAND_POLL_MS,
  OBS_COMMAND_TIMEOUT_MS,
  safeJsonObjectParse,
} from "./streamer-studio/controlUtils.js";

class StreamerStudioControlError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "StreamerStudioControlError";
  }
}

export class StreamerStudioControlService {
  private static instance: StreamerStudioControlService;

  static getInstance(): StreamerStudioControlService {
    if (!StreamerStudioControlService.instance) {
      StreamerStudioControlService.instance = new StreamerStudioControlService();
    }
    return StreamerStudioControlService.instance;
  }

  async listScenes(discordId: string, streamerId: number): Promise<ScenesListResult> {
    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);

    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const data = await this.dispatchObsCommand(streamerId, discordId, agentId, "obs.scenes.list", {});
    return this.normalizeScenesListResult(data);
  }

  async listSceneItems(discordId: string, streamerId: number, sceneName: string): Promise<SceneItemsListResult> {
    const normalizedSceneName = sceneName.trim();
    if (!normalizedSceneName.length || normalizedSceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_SCENE_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);

    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const data = await this.dispatchObsCommand(streamerId, discordId, agentId, "obs.scene.items.list", { sceneName: normalizedSceneName });
    return this.normalizeSceneItemsListResult(data, normalizedSceneName);
  }

  async applySceneItemTransform(
    discordId: string,
    streamerId: number,
    input: ApplySceneItemTransformInput,
  ): Promise<ApplySceneItemTransformResult> {
    const normalizedInput = this.normalizeApplySceneItemTransformInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sceneItemId: normalizedInput.sceneItemId,
      sourceName: normalizedInput.sourceName ?? null,
      transform: {
        positionX: normalizedInput.transform.positionX,
        positionY: normalizedInput.transform.positionY,
        scaleX: normalizedInput.transform.scaleX,
        scaleY: normalizedInput.transform.scaleY,
        rotation: normalizedInput.transform.rotation ?? 0,
      },
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.item.transform.set",
      payload,
      "OBS_TRANSFORM_COMMAND_FAILED",
      "OBS transform command failed.",
    );

    return this.normalizeApplySceneItemTransformResult(data, normalizedInput);
  }

  async setSceneItemIndex(
    discordId: string,
    streamerId: number,
    input: SetSceneItemIndexInput,
  ): Promise<SetSceneItemIndexResult> {
    const normalizedInput = this.normalizeSetSceneItemIndexInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sceneItemId: normalizedInput.sceneItemId,
      sourceName: normalizedInput.sourceName ?? null,
      sceneItemIndex: normalizedInput.sceneItemIndex,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.item.index.set",
      payload,
      "OBS_INDEX_COMMAND_FAILED",
      "OBS scene item index command failed.",
    );

    return this.normalizeSetSceneItemIndexResult(data, normalizedInput);
  }

  async setSceneItemVisibility(
    discordId: string,
    streamerId: number,
    input: SetSceneItemVisibilityInput,
  ): Promise<SetSceneItemVisibilityResult> {
    const normalizedInput = this.normalizeSetSceneItemVisibilityInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sceneItemId: normalizedInput.sceneItemId,
      sourceName: normalizedInput.sourceName ?? null,
      enabled: normalizedInput.enabled,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.item.visibility.set",
      payload,
      "OBS_VISIBILITY_COMMAND_FAILED",
      "OBS scene item visibility command failed.",
    );

    return this.normalizeSetSceneItemVisibilityResult(data, normalizedInput);
  }

  async removeSceneItem(
    discordId: string,
    streamerId: number,
    input: RemoveSceneItemInput,
  ): Promise<RemoveSceneItemResult> {
    const normalizedInput = this.normalizeRemoveSceneItemInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sceneItemId: normalizedInput.sceneItemId,
      sourceName: normalizedInput.sourceName ?? null,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.item.remove",
      payload,
      "OBS_REMOVE_COMMAND_FAILED",
      "OBS remove scene item command failed.",
    );

    return this.normalizeRemoveSceneItemResult(data, normalizedInput);
  }

  async createTextSource(
    discordId: string,
    streamerId: number,
    input: CreateTextSourceInput,
  ): Promise<CreateTextSourceResult> {
    const normalizedInput = this.normalizeCreateTextSourceInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sourceName: normalizedInput.sourceName ?? null,
      text: normalizedInput.text,
      positionX: normalizedInput.positionX,
      positionY: normalizedInput.positionY,
      scaleX: normalizedInput.scaleX,
      scaleY: normalizedInput.scaleY,
      rotation: normalizedInput.rotation,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.source.text.create",
      payload,
      "OBS_TEXT_SOURCE_COMMAND_FAILED",
      "OBS text source command failed.",
    );

    return this.normalizeCreateTextSourceResult(data, normalizedInput);
  }

  async createBrowserSource(
    discordId: string,
    streamerId: number,
    input: CreateBrowserSourceInput,
  ): Promise<CreateBrowserSourceResult> {
    const normalizedInput = this.normalizeCreateBrowserSourceInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sourceName: normalizedInput.sourceName ?? null,
      url: normalizedInput.url,
      width: normalizedInput.width,
      height: normalizedInput.height,
      positionX: normalizedInput.positionX,
      positionY: normalizedInput.positionY,
      scaleX: normalizedInput.scaleX,
      scaleY: normalizedInput.scaleY,
      rotation: normalizedInput.rotation,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.source.browser.create",
      payload,
      "OBS_BROWSER_SOURCE_COMMAND_FAILED",
      "OBS browser source command failed.",
    );

    return this.normalizeCreateBrowserSourceResult(data, normalizedInput);
  }

  async updateTextSource(
    discordId: string,
    streamerId: number,
    input: UpdateTextSourceInput,
  ): Promise<UpdateTextSourceResult> {
    const normalizedInput = this.normalizeUpdateTextSourceInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sceneItemId: normalizedInput.sceneItemId,
      sourceName: normalizedInput.sourceName,
      text: normalizedInput.text,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.source.text.update",
      payload,
      "OBS_TEXT_SOURCE_UPDATE_COMMAND_FAILED",
      "OBS text source update command failed.",
    );

    return this.normalizeUpdateTextSourceResult(data, normalizedInput);
  }

  async updateBrowserSource(
    discordId: string,
    streamerId: number,
    input: UpdateBrowserSourceInput,
  ): Promise<UpdateBrowserSourceResult> {
    const normalizedInput = this.normalizeUpdateBrowserSourceInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sceneItemId: normalizedInput.sceneItemId,
      sourceName: normalizedInput.sourceName,
      url: normalizedInput.url ?? undefined,
      width: normalizedInput.width ?? undefined,
      height: normalizedInput.height ?? undefined,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.source.browser.update",
      payload,
      "OBS_BROWSER_SOURCE_UPDATE_COMMAND_FAILED",
      "OBS browser source update command failed.",
    );

    return this.normalizeUpdateBrowserSourceResult(data, normalizedInput);
  }

  async getSourceSettings(
    discordId: string,
    streamerId: number,
    input: GetSourceSettingsInput,
  ): Promise<GetSourceSettingsResult> {
    const normalizedInput = this.normalizeGetSourceSettingsInput(input);

    await this.ensureStreamerExists(streamerId);
    await this.ensureCanControl(discordId, streamerId);
    const agentId = await this.resolveOnlineAgentBinding(streamerId);

    const payload: Record<string, unknown> = {
      sceneName: normalizedInput.sceneName,
      sceneItemId: normalizedInput.sceneItemId,
      sourceName: normalizedInput.sourceName ?? null,
    };

    const data = await this.dispatchObsCommand(
      streamerId,
      discordId,
      agentId,
      "obs.scene.source.settings.get",
      payload,
      "OBS_SOURCE_SETTINGS_COMMAND_FAILED",
      "OBS source settings command failed.",
    );

    return this.normalizeGetSourceSettingsResult(data, normalizedInput);
  }

  isControlError(error: unknown): error is { code: string; message: string } {
    return error instanceof StreamerStudioControlError;
  }

  // ──────────────────────────────────────────────────────────────────────────────

  private async ensureCanControl(discordId: string, streamerId: number): Promise<void> {
    const allowed = await StreamerAccessService.getInstance().canControlStreamer(discordId, streamerId);
    if (!allowed) {
      throw new StreamerStudioControlError("STREAMER_STUDIO_FORBIDDEN", "You do not have access to control this streamer.");
    }
  }

  private async ensureStreamerExists(streamerId: number): Promise<void> {
    const [rows] = await pool.query<StreamerRow[]>(
      `SELECT id FROM streamers WHERE id = ? AND archived_at IS NULL LIMIT 1`,
      [streamerId],
    );
    if (!rows[0]) {
      throw new StreamerStudioControlError("STREAMER_NOT_FOUND", "Streamer not found.");
    }
  }

  private async resolveAgentId(streamerId: number): Promise<string | null> {
    const [rows] = await pool.query<BotSettingRow[]>(
      `SELECT setting_key, setting_value FROM bot_settings WHERE setting_key = ? LIMIT 1`,
      [`${OBS_AGENT_BINDING_PREFIX}${streamerId}`],
    );

    const value = rows[0]?.setting_value ? String(rows[0].setting_value) : "";
    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as { agentId?: unknown };
      const agentId = typeof parsed.agentId === "string" ? parsed.agentId.trim() : "";
      return agentId.length ? agentId : null;
    } catch {
      return null;
    }
  }

  private async resolveOnlineAgentBinding(streamerId: number): Promise<string> {
    const agentId = await this.resolveAgentId(streamerId);
    if (!agentId) {
      throw new StreamerStudioControlError("OBS_AGENT_NOT_CONFIGURED", "Streamer OBS Agent is not configured.");
    }

    await this.ensureAgentOnlineRecent(agentId);
    return agentId;
  }

  private isAgentStatusOnlineRecent(status: ObsAgentStatusView | null): boolean {
    if (!status || !status.online || !status.lastSeenAt) {
      return false;
    }

    const lastSeenAtMs = Date.parse(status.lastSeenAt);
    if (Number.isNaN(lastSeenAtMs)) {
      return false;
    }

    return Date.now() - lastSeenAtMs <= OBS_AGENT_STALE_MS;
  }

  private async ensureAgentOnlineRecent(agentId: string): Promise<void> {
    const status = await ObsAgentStatusService.getInstance().getStatus(agentId);
    if (!this.isAgentStatusOnlineRecent(status)) {
      throw new StreamerStudioControlError("OBS_AGENT_OFFLINE", "Streamer OBS Agent is offline.");
    }
  }

  private async dispatchObsCommand(
    streamerId: number,
    requestedByDiscordId: string,
    agentId: string,
    command: ObsRelayCommandName,
    payload: Record<string, unknown>,
    errorCode = "OBS_SCENE_COMMAND_FAILED",
    defaultErrorMessage = "OBS command failed.",
  ): Promise<unknown> {
    const queue = getBotCommandQueue();
    const { commandId } = await queue.enqueue({
      type: "OBS_RELAY_COMMAND",
      guildId: null,
      requestedByDiscordId,
      payload: {
        agentId,
        streamerId,
        command,
        payload,
        source: "streamer_studio",
      },
    });

    const result = await this.waitForBotCommandCompletion(commandId, OBS_COMMAND_TIMEOUT_MS, errorCode, defaultErrorMessage);
    if (!result) {
      throw new StreamerStudioControlError(errorCode, `${defaultErrorMessage} Empty result.`);
    }

    const data = result.data;
    return data;
  }

  private async waitForBotCommandCompletion(
    commandId: number,
    timeoutMs: number,
    errorCode = "OBS_SCENE_COMMAND_FAILED",
    defaultErrorMessage = "OBS command failed.",
  ): Promise<Record<string, unknown> | null> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const [rows] = await pool.query<BotCommandStatusRow[]>(
        `SELECT id, status, result_json, error_message
         FROM bot_commands
         WHERE id = ?
         LIMIT 1`,
        [commandId],
      );

      const row = rows[0];
      if (!row) {
        throw new StreamerStudioControlError(errorCode, `${defaultErrorMessage} Command record disappeared.`);
      }

      if (row.status === "completed") {
        return safeJsonObjectParse(row.result_json);
      }

      if (row.status === "failed") {
        throw new StreamerStudioControlError(errorCode, row.error_message || defaultErrorMessage);
      }

      await new Promise(resolve => setTimeout(resolve, OBS_COMMAND_POLL_MS));
    }

    throw new StreamerStudioControlError(errorCode, `${defaultErrorMessage} Command timed out.`);
  }

  private normalizeScenesListResult(raw: unknown): ScenesListResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_SCENE_COMMAND_FAILED", "Invalid scenes list response.");
    }

    const scenesValue = raw.scenes;
    const currentValue = raw.currentProgramSceneName;

    const scenes = Array.isArray(scenesValue)
      ? scenesValue
        .filter(isRecord)
        .map(item => (typeof item.name === "string" ? item.name.trim() : ""))
        .filter(Boolean)
        .map(name => ({ name }))
      : [];

    const currentProgramSceneName = typeof currentValue === "string"
      ? (currentValue.trim() || null)
      : null;

    return { scenes, currentProgramSceneName };
  }

  private normalizeApplySceneItemTransformInput(input: ApplySceneItemTransformInput): ApplySceneItemTransformInput {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_TRANSFORM_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    if (!Number.isInteger(input.sceneItemId) || input.sceneItemId <= 0) {
      throw new StreamerStudioControlError("OBS_TRANSFORM_INVALID", "sceneItemId must be a positive integer.");
    }

    if (!isRecord(input.transform)) {
      throw new StreamerStudioControlError("OBS_TRANSFORM_INVALID", "transform must be an object.");
    }

    const positionX = Number(input.transform.positionX);
    const positionY = Number(input.transform.positionY);
    const scaleX = Number(input.transform.scaleX);
    const scaleY = Number(input.transform.scaleY);
    const rotationRaw = input.transform.rotation;
    const rotation = rotationRaw === undefined ? 0 : Number(rotationRaw);

    if (!Number.isFinite(positionX) || !Number.isFinite(positionY) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
      throw new StreamerStudioControlError("OBS_TRANSFORM_INVALID", "transform position/scale fields must be finite numbers.");
    }
    if (rotationRaw !== undefined && !Number.isFinite(rotation)) {
      throw new StreamerStudioControlError("OBS_TRANSFORM_INVALID", "transform.rotation must be a finite number.");
    }

    const sourceName = input.sourceName;
    if (sourceName !== undefined && sourceName !== null && typeof sourceName !== "string") {
      throw new StreamerStudioControlError("OBS_TRANSFORM_INVALID", "sourceName must be a string or null.");
    }
    if (typeof sourceName === "string" && sourceName.trim().length > 160) {
      throw new StreamerStudioControlError("OBS_TRANSFORM_INVALID", "sourceName must be up to 160 chars.");
    }

    return {
      sceneName,
      sceneItemId: input.sceneItemId,
      sourceName: typeof sourceName === "string" ? (sourceName.trim() || null) : (sourceName ?? null),
      transform: {
        positionX: clampNumber(positionX, -10_000, 10_000),
        positionY: clampNumber(positionY, -10_000, 10_000),
        scaleX: clampNumber(scaleX, 0.05, 10),
        scaleY: clampNumber(scaleY, 0.05, 10),
        rotation: clampNumber(rotation, -360, 360),
      },
    };
  }

  private normalizeSetSceneItemVisibilityInput(input: SetSceneItemVisibilityInput): SetSceneItemVisibilityInput {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_VISIBILITY_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    if (!Number.isInteger(input.sceneItemId) || input.sceneItemId <= 0) {
      throw new StreamerStudioControlError("OBS_VISIBILITY_INVALID", "sceneItemId must be a positive integer.");
    }

    if (typeof input.enabled !== "boolean") {
      throw new StreamerStudioControlError("OBS_VISIBILITY_INVALID", "enabled must be a boolean.");
    }

    const sourceName = input.sourceName;
    if (sourceName !== undefined && sourceName !== null && typeof sourceName !== "string") {
      throw new StreamerStudioControlError("OBS_VISIBILITY_INVALID", "sourceName must be a string or null.");
    }
    if (typeof sourceName === "string" && sourceName.trim().length > 160) {
      throw new StreamerStudioControlError("OBS_VISIBILITY_INVALID", "sourceName must be up to 160 chars.");
    }

    return {
      sceneName,
      sceneItemId: input.sceneItemId,
      sourceName: typeof sourceName === "string" ? (sourceName.trim() || null) : (sourceName ?? null),
      enabled: input.enabled,
    };
  }

  private normalizeRemoveSceneItemInput(input: RemoveSceneItemInput): RemoveSceneItemInput {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_REMOVE_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    if (!Number.isInteger(input.sceneItemId) || input.sceneItemId <= 0) {
      throw new StreamerStudioControlError("OBS_REMOVE_INVALID", "sceneItemId must be a positive integer.");
    }

    const sourceName = input.sourceName;
    if (sourceName !== undefined && sourceName !== null && typeof sourceName !== "string") {
      throw new StreamerStudioControlError("OBS_REMOVE_INVALID", "sourceName must be a string or null.");
    }
    if (typeof sourceName === "string" && sourceName.trim().length > 160) {
      throw new StreamerStudioControlError("OBS_REMOVE_INVALID", "sourceName must be up to 160 chars.");
    }

    return {
      sceneName,
      sceneItemId: input.sceneItemId,
      sourceName: typeof sourceName === "string" ? (sourceName.trim() || null) : (sourceName ?? null),
    };
  }

  private normalizeUpdateTextSourceInput(
    input: UpdateTextSourceInput,
  ): UpdateTextSourceInput & { sourceName: string | null } {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_UPDATE_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    if (!Number.isInteger(input.sceneItemId) || input.sceneItemId <= 0) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_UPDATE_INVALID", "sceneItemId must be a positive integer.");
    }

    const sourceNameRaw = input.sourceName;
    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_UPDATE_INVALID", "sourceName must be a string or null.");
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw ?? null;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_UPDATE_INVALID", "sourceName must be up to 160 chars.");
    }

    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text.length || text.length > 500) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_UPDATE_INVALID", "text must be a non-empty string up to 500 chars.");
    }

    return {
      sceneName,
      sceneItemId: input.sceneItemId,
      sourceName,
      text,
    };
  }

  private normalizeUpdateBrowserSourceInput(
    input: UpdateBrowserSourceInput,
  ): UpdateBrowserSourceInput & { sourceName: string | null } {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    if (!Number.isInteger(input.sceneItemId) || input.sceneItemId <= 0) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "sceneItemId must be a positive integer.");
    }

    const sourceNameRaw = input.sourceName;
    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "sourceName must be a string or null.");
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw ?? null;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "sourceName must be up to 160 chars.");
    }

    const urlRaw = input.url;
    let url: string | undefined;
    if (urlRaw !== undefined) {
      if (urlRaw === null || typeof urlRaw !== "string") {
        throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "url must be a string.");
      }
      const trimmed = urlRaw.trim();
      if (!trimmed.length || trimmed.length > 1000 || !/^https?:\/\//i.test(trimmed)) {
        throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "url must be a valid http:// or https:// URL up to 1000 chars.");
      }
      url = trimmed;
    }

    const width = input.width === undefined ? undefined : Number(input.width);
    if (width !== undefined && !Number.isFinite(width)) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "width must be a finite number.");
    }

    const height = input.height === undefined ? undefined : Number(input.height);
    if (height !== undefined && !Number.isFinite(height)) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "height must be a finite number.");
    }

    if (url === undefined && width === undefined && height === undefined) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_INVALID", "At least one of url, width, or height must be provided.");
    }

    return {
      sceneName,
      sceneItemId: input.sceneItemId,
      sourceName,
      url,
      width: width === undefined ? undefined : clampNumber(Math.round(width), 64, 3840),
      height: height === undefined ? undefined : clampNumber(Math.round(height), 64, 2160),
    };
  }

  private normalizeGetSourceSettingsInput(
    input: GetSourceSettingsInput,
  ): GetSourceSettingsInput & { sourceName: string | null } {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_SOURCE_SETTINGS_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    if (!Number.isInteger(input.sceneItemId) || input.sceneItemId <= 0) {
      throw new StreamerStudioControlError("OBS_SOURCE_SETTINGS_INVALID", "sceneItemId must be a positive integer.");
    }

    const sourceNameRaw = input.sourceName;
    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      throw new StreamerStudioControlError("OBS_SOURCE_SETTINGS_INVALID", "sourceName must be a string or null.");
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw ?? null;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      throw new StreamerStudioControlError("OBS_SOURCE_SETTINGS_INVALID", "sourceName must be up to 160 chars.");
    }

    return {
      sceneName,
      sceneItemId: input.sceneItemId,
      sourceName,
    };
  }

  private normalizeCreateTextSourceInput(input: CreateTextSourceInput): Required<CreateTextSourceInput> {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text.length || text.length > 500) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_INVALID", "text must be a non-empty string up to 500 chars.");
    }

    const sourceName = input.sourceName;
    if (sourceName !== undefined && sourceName !== null && typeof sourceName !== "string") {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_INVALID", "sourceName must be a string or null.");
    }
    if (typeof sourceName === "string" && sourceName.trim().length > 160) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_INVALID", "sourceName must be up to 160 chars.");
    }

    const positionX = input.positionX === undefined ? 100 : Number(input.positionX);
    const positionY = input.positionY === undefined ? 100 : Number(input.positionY);
    const scaleX = input.scaleX === undefined ? 1 : Number(input.scaleX);
    const scaleY = input.scaleY === undefined ? 1 : Number(input.scaleY);
    const rotation = input.rotation === undefined ? 0 : Number(input.rotation);

    if (!Number.isFinite(positionX) || !Number.isFinite(positionY) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY) || !Number.isFinite(rotation)) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_INVALID", "position, scale, and rotation fields must be finite numbers.");
    }

    return {
      sceneName,
      sourceName: typeof sourceName === "string" ? (sourceName.trim() || null) : null,
      text,
      positionX: clampNumber(positionX, -10_000, 10_000),
      positionY: clampNumber(positionY, -10_000, 10_000),
      scaleX: clampNumber(scaleX, 0.05, 10),
      scaleY: clampNumber(scaleY, 0.05, 10),
      rotation: clampNumber(rotation, -360, 360),
    };
  }

  private normalizeCreateBrowserSourceInput(input: CreateBrowserSourceInput): Required<CreateBrowserSourceInput> {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    const url = typeof input.url === "string" ? input.url.trim() : "";
    if (!url.length || url.length > 1000) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_INVALID", "url must be a non-empty string up to 1000 chars.");
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_INVALID", "url must be a valid http:// or https:// URL.");
    }

    const sourceName = input.sourceName;
    if (sourceName !== undefined && sourceName !== null && typeof sourceName !== "string") {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_INVALID", "sourceName must be a string or null.");
    }
    if (typeof sourceName === "string" && sourceName.trim().length > 160) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_INVALID", "sourceName must be up to 160 chars.");
    }

    const width = input.width === undefined ? 800 : Number(input.width);
    const height = input.height === undefined ? 450 : Number(input.height);
    const positionX = input.positionX === undefined ? 100 : Number(input.positionX);
    const positionY = input.positionY === undefined ? 100 : Number(input.positionY);
    const scaleX = input.scaleX === undefined ? 1 : Number(input.scaleX);
    const scaleY = input.scaleY === undefined ? 1 : Number(input.scaleY);
    const rotation = input.rotation === undefined ? 0 : Number(input.rotation);

    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(positionX) || !Number.isFinite(positionY) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY) || !Number.isFinite(rotation)) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_INVALID", "width, height, position, scale, and rotation fields must be finite numbers.");
    }

    return {
      sceneName,
      sourceName: typeof sourceName === "string" ? (sourceName.trim() || null) : null,
      url,
      width: clampNumber(Math.round(width), 64, 3840),
      height: clampNumber(Math.round(height), 64, 2160),
      positionX: clampNumber(positionX, -10_000, 10_000),
      positionY: clampNumber(positionY, -10_000, 10_000),
      scaleX: clampNumber(scaleX, 0.05, 10),
      scaleY: clampNumber(scaleY, 0.05, 10),
      rotation: clampNumber(rotation, -360, 360),
    };
  }

  private normalizeSetSceneItemIndexInput(input: SetSceneItemIndexInput): SetSceneItemIndexInput {
    const sceneName = typeof input.sceneName === "string" ? input.sceneName.trim() : "";
    if (!sceneName.length || sceneName.length > 160) {
      throw new StreamerStudioControlError("OBS_INDEX_INVALID", "sceneName must be a non-empty string up to 160 chars.");
    }

    if (!Number.isInteger(input.sceneItemId) || input.sceneItemId <= 0) {
      throw new StreamerStudioControlError("OBS_INDEX_INVALID", "sceneItemId must be a positive integer.");
    }

    if (!Number.isInteger(input.sceneItemIndex) || input.sceneItemIndex < 0) {
      throw new StreamerStudioControlError("OBS_INDEX_INVALID", "sceneItemIndex must be an integer greater than or equal to 0.");
    }

    const sourceName = input.sourceName;
    if (sourceName !== undefined && sourceName !== null && typeof sourceName !== "string") {
      throw new StreamerStudioControlError("OBS_INDEX_INVALID", "sourceName must be a string or null.");
    }
    if (typeof sourceName === "string" && sourceName.trim().length > 160) {
      throw new StreamerStudioControlError("OBS_INDEX_INVALID", "sourceName must be up to 160 chars.");
    }

    return {
      sceneName,
      sceneItemId: input.sceneItemId,
      sourceName: typeof sourceName === "string" ? (sourceName.trim() || null) : (sourceName ?? null),
      sceneItemIndex: input.sceneItemIndex,
    };
  }

  private normalizeSetSceneItemIndexResult(raw: unknown, fallback: SetSceneItemIndexInput): SetSceneItemIndexResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_INDEX_COMMAND_FAILED", "Invalid scene item index response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = raw.sourceName;
    const sceneItemIndexRaw = Number(raw.sceneItemIndex);
    const itemsValue = raw.items;

    const items = Array.isArray(itemsValue)
      ? itemsValue
        .filter(isRecord)
        .map(item => ({
          sceneItemId: Number(item.sceneItemId),
          sourceName: typeof item.sourceName === "string" ? item.sourceName.trim() : "",
          sceneItemIndex: Number(item.sceneItemIndex),
        }))
        .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0 && Number.isInteger(item.sceneItemIndex) && item.sceneItemIndex >= 0)
      : [];

    return {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : fallback.sceneItemId,
      sourceName: typeof sourceNameRaw === "string" ? (sourceNameRaw.trim() || null) : null,
      sceneItemIndex: Number.isInteger(sceneItemIndexRaw) && sceneItemIndexRaw >= 0 ? sceneItemIndexRaw : fallback.sceneItemIndex,
      items,
    };
  }

  private normalizeSetSceneItemVisibilityResult(
    raw: unknown,
    fallback: SetSceneItemVisibilityInput,
  ): SetSceneItemVisibilityResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_VISIBILITY_COMMAND_FAILED", "Invalid scene item visibility response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = raw.sourceName;
    const enabledRaw = raw.enabled;
    const itemsValue = raw.items;

    const items = Array.isArray(itemsValue)
      ? itemsValue
        .filter(isRecord)
        .map(item => ({
          sceneItemId: Number(item.sceneItemId),
          sourceName: typeof item.sourceName === "string" ? item.sourceName.trim() : "",
          sceneItemIndex: Number(item.sceneItemIndex),
          enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
        }))
        .filter(item => Number.isInteger(item.sceneItemId)
          && item.sceneItemId > 0
          && item.sourceName.length > 0
          && Number.isInteger(item.sceneItemIndex)
          && item.sceneItemIndex >= 0)
      : [];

    const enabled = typeof enabledRaw === "boolean" ? enabledRaw : fallback.enabled;

    return {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : fallback.sceneItemId,
      sourceName: typeof sourceNameRaw === "string" ? (sourceNameRaw.trim() || null) : fallback.sourceName ?? null,
      enabled,
      items,
    };
  }

  private normalizeRemoveSceneItemResult(raw: unknown, fallback: RemoveSceneItemInput): RemoveSceneItemResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_REMOVE_COMMAND_FAILED", "Invalid remove scene item response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = raw.sourceName;
    const removedRaw = raw.removed;
    const itemsValue = raw.items;

    if (removedRaw !== true) {
      throw new StreamerStudioControlError("OBS_REMOVE_COMMAND_FAILED", "OBS remove scene item response did not confirm removal.");
    }

    const items = Array.isArray(itemsValue)
      ? itemsValue
        .filter(isRecord)
        .map(item => ({
          sceneItemId: Number(item.sceneItemId),
          sourceName: typeof item.sourceName === "string" ? item.sourceName.trim() : "",
          sceneItemIndex: Number(item.sceneItemIndex),
          enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
        }))
        .filter(item => Number.isInteger(item.sceneItemId)
          && item.sceneItemId > 0
          && item.sourceName.length > 0
          && Number.isInteger(item.sceneItemIndex)
          && item.sceneItemIndex >= 0)
      : [];

    return {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : fallback.sceneItemId,
      sourceName: typeof sourceNameRaw === "string" ? (sourceNameRaw.trim() || null) : fallback.sourceName ?? null,
      removed: true,
      items,
    };
  }

  private normalizeApplySceneItemTransformResult(
    raw: unknown,
    fallback: ApplySceneItemTransformInput,
  ): ApplySceneItemTransformResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_TRANSFORM_COMMAND_FAILED", "Invalid transform response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = raw.sourceName;
    const transformRaw = isRecord(raw.transform) ? raw.transform : {};

    const positionX = Number(transformRaw.positionX);
    const positionY = Number(transformRaw.positionY);
    const scaleX = Number(transformRaw.scaleX);
    const scaleY = Number(transformRaw.scaleY);
    const rotation = Number(transformRaw.rotation);
    const width = transformRaw.width === undefined || transformRaw.width === null ? undefined : Number(transformRaw.width);
    const height = transformRaw.height === undefined || transformRaw.height === null ? undefined : Number(transformRaw.height);

    const output: ApplySceneItemTransformResult = {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isFinite(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : fallback.sceneItemId,
      sourceName: typeof sourceNameRaw === "string" ? (sourceNameRaw.trim() || null) : null,
      transform: {
        positionX: Number.isFinite(positionX) ? positionX : fallback.transform.positionX,
        positionY: Number.isFinite(positionY) ? positionY : fallback.transform.positionY,
        scaleX: Number.isFinite(scaleX) ? scaleX : fallback.transform.scaleX,
        scaleY: Number.isFinite(scaleY) ? scaleY : fallback.transform.scaleY,
        rotation: Number.isFinite(rotation) ? rotation : (fallback.transform.rotation ?? 0),
      },
    };

    if (width !== undefined && Number.isFinite(width)) {
      output.transform.width = width;
    }
    if (height !== undefined && Number.isFinite(height)) {
      output.transform.height = height;
    }

    return output;
  }

  private normalizeUpdateTextSourceResult(raw: unknown, fallback: UpdateTextSourceInput & { sourceName: string | null }): UpdateTextSourceResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_UPDATE_COMMAND_FAILED", "Invalid text source update response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = typeof raw.sourceName === "string" ? raw.sourceName.trim() : fallback.sourceName ?? "";
    const inputKindRaw = raw.inputKind;
    const textRaw = typeof raw.text === "string" ? raw.text : fallback.text;

    if (!sourceNameRaw.length) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_UPDATE_COMMAND_FAILED", "Text source update response is missing sourceName.");
    }

    return {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : fallback.sceneItemId,
      sourceName: sourceNameRaw,
      inputKind: typeof inputKindRaw === "string" ? inputKindRaw.trim() || null : null,
      text: textRaw,
    };
  }

  private normalizeUpdateBrowserSourceResult(raw: unknown, fallback: UpdateBrowserSourceInput & { sourceName: string | null }): UpdateBrowserSourceResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_COMMAND_FAILED", "Invalid browser source update response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = typeof raw.sourceName === "string" ? raw.sourceName.trim() : fallback.sourceName ?? "";
    const inputKindRaw = typeof raw.inputKind === "string" ? raw.inputKind.trim() : "";
    const urlRaw = typeof raw.url === "string" ? raw.url.trim() : fallback.url;
    const widthRaw = raw.width;
    const heightRaw = raw.height;

    if (!sourceNameRaw.length) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_COMMAND_FAILED", "Browser source update response is missing sourceName.");
    }

    if (!inputKindRaw.length) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_UPDATE_COMMAND_FAILED", "Browser source update response is missing inputKind.");
    }

    const width = typeof widthRaw === "number" && Number.isFinite(widthRaw) ? widthRaw : fallback.width;
    const height = typeof heightRaw === "number" && Number.isFinite(heightRaw) ? heightRaw : fallback.height;

    return {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : fallback.sceneItemId,
      sourceName: sourceNameRaw,
      inputKind: inputKindRaw,
      url: urlRaw,
      width,
      height,
    };
  }

  private normalizeGetSourceSettingsResult(
    raw: unknown,
    fallback: GetSourceSettingsInput & { sourceName: string | null },
  ): GetSourceSettingsResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_SOURCE_SETTINGS_COMMAND_FAILED", "Invalid source settings response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = typeof raw.sourceName === "string" ? raw.sourceName.trim() : "";
    const inputKindRaw = typeof raw.inputKind === "string" ? raw.inputKind.trim() : "";
    const settingsRaw = isRecord(raw.settings) ? raw.settings : {};

    if (!sourceNameRaw.length) {
      throw new StreamerStudioControlError("OBS_SOURCE_SETTINGS_COMMAND_FAILED", "Source settings response is missing sourceName.");
    }

    const output: GetSourceSettingsResult = {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : fallback.sceneItemId,
      sourceName: sourceNameRaw,
      inputKind: inputKindRaw || null,
      settings: {},
    };

    if (typeof settingsRaw.text === "string") {
      output.settings.text = settingsRaw.text;
    }
    if (typeof settingsRaw.url === "string") {
      output.settings.url = settingsRaw.url;
    }
    if (typeof settingsRaw.width === "number" && Number.isFinite(settingsRaw.width)) {
      output.settings.width = settingsRaw.width;
    }
    if (typeof settingsRaw.height === "number" && Number.isFinite(settingsRaw.height)) {
      output.settings.height = settingsRaw.height;
    }

    return output;
  }

  private normalizeCreateTextSourceResult(raw: unknown, fallback: Required<CreateTextSourceInput>): CreateTextSourceResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_COMMAND_FAILED", "Invalid text source response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = typeof raw.sourceName === "string" ? raw.sourceName.trim() : "";
    const inputKindRaw = typeof raw.inputKind === "string" ? raw.inputKind.trim() : "";
    const transformRaw = isRecord(raw.transform) ? raw.transform : {};

    const positionX = Number(transformRaw.positionX);
    const positionY = Number(transformRaw.positionY);
    const scaleX = Number(transformRaw.scaleX);
    const scaleY = Number(transformRaw.scaleY);
    const rotation = Number(transformRaw.rotation);
    const width = transformRaw.width === undefined || transformRaw.width === null ? undefined : Number(transformRaw.width);
    const height = transformRaw.height === undefined || transformRaw.height === null ? undefined : Number(transformRaw.height);
    const itemsValue = raw.items;

    const items = Array.isArray(itemsValue)
      ? itemsValue
        .filter(isRecord)
        .map(item => ({
          sceneItemId: Number(item.sceneItemId),
          sourceName: typeof item.sourceName === "string" ? item.sourceName.trim() : "",
          sceneItemIndex: Number(item.sceneItemIndex),
        }))
        .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0 && Number.isInteger(item.sceneItemIndex) && item.sceneItemIndex >= 0)
      : [];

    const output: CreateTextSourceResult = {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : 0,
      sourceName: sourceNameRaw || fallback.sourceName || "",
      inputKind: inputKindRaw,
      transform: {
        positionX: Number.isFinite(positionX) ? positionX : fallback.positionX,
        positionY: Number.isFinite(positionY) ? positionY : fallback.positionY,
        scaleX: Number.isFinite(scaleX) ? scaleX : fallback.scaleX,
        scaleY: Number.isFinite(scaleY) ? scaleY : fallback.scaleY,
        rotation: Number.isFinite(rotation) ? rotation : fallback.rotation,
      },
      items,
    };

    if (!output.sceneItemId || !output.sourceName.length || !output.inputKind.length) {
      throw new StreamerStudioControlError("OBS_TEXT_SOURCE_COMMAND_FAILED", "Invalid text source response.");
    }

    if (width !== undefined && Number.isFinite(width)) {
      output.transform.width = width;
    }
    if (height !== undefined && Number.isFinite(height)) {
      output.transform.height = height;
    }

    return output;
  }

  private normalizeCreateBrowserSourceResult(raw: unknown, fallback: Required<CreateBrowserSourceInput>): CreateBrowserSourceResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_COMMAND_FAILED", "Invalid browser source response.");
    }

    const sceneNameRaw = typeof raw.sceneName === "string" ? raw.sceneName.trim() : "";
    const sceneItemIdRaw = Number(raw.sceneItemId);
    const sourceNameRaw = typeof raw.sourceName === "string" ? raw.sourceName.trim() : "";
    const inputKindRaw = typeof raw.inputKind === "string" ? raw.inputKind.trim() : "";
    const urlRaw = typeof raw.url === "string" ? raw.url.trim() : "";
    const widthRaw = Number(raw.width);
    const heightRaw = Number(raw.height);
    const transformRaw = isRecord(raw.transform) ? raw.transform : {};

    const positionX = Number(transformRaw.positionX);
    const positionY = Number(transformRaw.positionY);
    const scaleX = Number(transformRaw.scaleX);
    const scaleY = Number(transformRaw.scaleY);
    const rotation = Number(transformRaw.rotation);
    const transformWidth = transformRaw.width === undefined || transformRaw.width === null ? undefined : Number(transformRaw.width);
    const transformHeight = transformRaw.height === undefined || transformRaw.height === null ? undefined : Number(transformRaw.height);
    const itemsValue = raw.items;

    const items = Array.isArray(itemsValue)
      ? itemsValue
        .filter(isRecord)
        .map(item => ({
          sceneItemId: Number(item.sceneItemId),
          sourceName: typeof item.sourceName === "string" ? item.sourceName.trim() : "",
          sceneItemIndex: Number(item.sceneItemIndex),
        }))
        .filter(item => Number.isInteger(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0 && Number.isInteger(item.sceneItemIndex) && item.sceneItemIndex >= 0)
      : [];

    const output: CreateBrowserSourceResult = {
      sceneName: sceneNameRaw || fallback.sceneName,
      sceneItemId: Number.isInteger(sceneItemIdRaw) && sceneItemIdRaw > 0 ? sceneItemIdRaw : 0,
      sourceName: sourceNameRaw || fallback.sourceName || "",
      inputKind: (inputKindRaw || "browser_source") as "browser_source",
      url: urlRaw || fallback.url,
      width: Number.isFinite(widthRaw) ? widthRaw : fallback.width,
      height: Number.isFinite(heightRaw) ? heightRaw : fallback.height,
      transform: {
        positionX: Number.isFinite(positionX) ? positionX : fallback.positionX,
        positionY: Number.isFinite(positionY) ? positionY : fallback.positionY,
        scaleX: Number.isFinite(scaleX) ? scaleX : fallback.scaleX,
        scaleY: Number.isFinite(scaleY) ? scaleY : fallback.scaleY,
        rotation: Number.isFinite(rotation) ? rotation : fallback.rotation,
      },
      items,
    };

    if (!output.sceneItemId || !output.sourceName.length) {
      throw new StreamerStudioControlError("OBS_BROWSER_SOURCE_COMMAND_FAILED", "Invalid browser source response.");
    }

    if (transformWidth !== undefined && Number.isFinite(transformWidth)) {
      output.transform.width = transformWidth;
    }
    if (transformHeight !== undefined && Number.isFinite(transformHeight)) {
      output.transform.height = transformHeight;
    }

    return output;
  }

  private normalizeSceneItemsListResult(raw: unknown, requestedSceneName: string): SceneItemsListResult {
    if (!isRecord(raw)) {
      throw new StreamerStudioControlError("OBS_SCENE_COMMAND_FAILED", "Invalid scene items response.");
    }

    const sceneName = typeof raw.sceneName === "string" ? raw.sceneName.trim() : requestedSceneName;
    const itemsValue = raw.items;

    const items = Array.isArray(itemsValue)
      ? itemsValue
        .filter(isRecord)
        .map(item => {
          const sceneItemId = Number(item.sceneItemId);
          const sourceName = typeof item.sourceName === "string" ? item.sourceName.trim() : "";
          const inputKind = typeof item.inputKind === "string" ? (item.inputKind.trim() || null) : null;
          const enabled = Boolean(item.enabled);

          const transformRaw = isRecord(item.transform) ? item.transform : {};
          const positionX = Number(transformRaw.positionX ?? 0);
          const positionY = Number(transformRaw.positionY ?? 0);
          const scaleX = Number(transformRaw.scaleX ?? 1);
          const scaleY = Number(transformRaw.scaleY ?? 1);
          const rotation = Number(transformRaw.rotation ?? 0);
          const width = transformRaw.width === undefined || transformRaw.width === null ? undefined : Number(transformRaw.width);
          const height = transformRaw.height === undefined || transformRaw.height === null ? undefined : Number(transformRaw.height);

          const baseTransform: SceneItemsListResult["items"][number]["transform"] = {
            positionX: Number.isFinite(positionX) ? positionX : 0,
            positionY: Number.isFinite(positionY) ? positionY : 0,
            scaleX: Number.isFinite(scaleX) ? scaleX : 1,
            scaleY: Number.isFinite(scaleY) ? scaleY : 1,
            rotation: Number.isFinite(rotation) ? rotation : 0,
          };

          if (width !== undefined && Number.isFinite(width)) {
            baseTransform.width = width;
          }
          if (height !== undefined && Number.isFinite(height)) {
            baseTransform.height = height;
          }

          return {
            sceneItemId,
            sourceName,
            inputKind,
            enabled,
            transform: baseTransform,
          };
        })
        .filter(item => Number.isFinite(item.sceneItemId) && item.sceneItemId > 0 && item.sourceName.length > 0)
      : [];

    return {
      sceneName,
      items,
    };
  }
}

export const streamerStudioControlService = StreamerStudioControlService.getInstance();

