import { FastifyInstance } from "fastify";
import { isBotAdmin } from "../../../core/BotAdmin.js";
import { StreamerAccessService } from "../../../core/StreamerAccessService.js";
import { streamerServicesService } from "../../../core/StreamerServicesService.js";
import { streamerService } from "../../../core/StreamerService.js";
import { StreamerStudioControlService } from "../../../core/StreamerStudioControlService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

type ServiceError = {
  message?: string;
};

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function serviceErrorResponse(defaultCode: string, defaultMessage: string, error?: ServiceError) {
  return {
    ok: false,
    error: defaultCode,
    message: error?.message || defaultMessage,
  };
}

export async function registerStreamerStudioRoutes(app: FastifyInstance): Promise<void> {
  const streamerAccessService = StreamerAccessService.getInstance();
  const streamerStudioControlService = StreamerStudioControlService.getInstance();

  const ensureStreamerManageAccess = async (discordId: string, streamerId: number) => {
    await streamerService.ensureStreamerExistsById(streamerId);
    const canManage = await streamerAccessService.canManageStreamer(discordId, streamerId);
    if (!canManage) {
      throw Object.assign(new Error("You do not have access to manage this streamer."), { code: "STREAMER_STUDIO_FORBIDDEN" });
    }
  };

  app.get("/streamer-studio/me", { preHandler: requireAuth }, async request => {
    try {
      const discordId = request.authUser!.discordId;
      const admin = request.authUser!.roles.includes("bot_admin") || isBotAdmin(discordId);
      const data = await streamerAccessService.getMyStreamerAccess(discordId);

      return {
        ok: true,
        data: {
          owned: data.owned,
          trusted: data.trusted,
          isBotAdmin: admin,
        },
      };
    } catch (error) {
      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to load streamer studio access.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/streamer-studio/:streamerId/agent/setup", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    try {
      await ensureStreamerManageAccess(request.authUser!.discordId, streamerId);
      const response = await streamerService.getStreamerObsAgentSetupByStreamerId(streamerId);
      if (!response.success) {
        return serviceErrorResponse(
          "STREAMER_STUDIO_AGENT_SETUP_FAILED",
          response.error.message ?? "Failed to load OBS agent setup.",
          response.error,
        );
      }

      return {
        ok: true,
        data: response.data,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_AGENT_SETUP_FAILED",
        "Failed to load OBS agent setup.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/agent/provision", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const agentIdRaw = body.agentId;
    if (agentIdRaw !== undefined && agentIdRaw !== null && typeof agentIdRaw !== "string") {
      return {
        ok: false,
        error: "STREAMER_STUDIO_AGENT_INVALID",
        message: "agentId must be a string or null when provided.",
      };
    }

    const agentId = typeof agentIdRaw === "string" ? agentIdRaw.trim() : null;

    try {
      await ensureStreamerManageAccess(request.authUser!.discordId, streamerId);
      const response = await streamerService.provisionStreamerObsAgentByStreamerId({
        streamerId,
        updatedByDiscordId: request.authUser!.discordId,
        agentId,
      });

      if (!response.success) {
        return serviceErrorResponse(
          "STREAMER_STUDIO_AGENT_PROVISION_FAILED",
          response.error.message ?? "Failed to provision OBS agent credentials.",
          response.error,
        );
      }

      return {
        ok: true,
        data: {
          streamerId: response.data.streamerId,
          agentId: response.data.agentId,
          agentToken: response.data.agentToken,
          tokenShownOnce: true,
        },
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_AGENT_PROVISION_FAILED",
        "Failed to provision OBS agent credentials.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/agent/bind", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
    const agentToken = typeof body.agentToken === "string" ? body.agentToken.trim() : "";

    if (!agentId.length || !agentToken.length) {
      return {
        ok: false,
        error: "STREAMER_STUDIO_AGENT_INVALID",
        message: "agentId and agentToken are required.",
      };
    }

    try {
      await ensureStreamerManageAccess(request.authUser!.discordId, streamerId);
      const response = await streamerService.setStreamerObsAgentByStreamerId({
        streamerId,
        agentId,
        agentToken,
        updatedByDiscordId: request.authUser!.discordId,
      });

      if (!response.success) {
        return serviceErrorResponse(
          "STREAMER_STUDIO_AGENT_BIND_FAILED",
          response.error.message ?? "Failed to bind OBS agent.",
          response.error,
        );
      }

      return {
        ok: true,
        data: response.data,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_AGENT_BIND_FAILED",
        "Failed to bind OBS agent.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.delete("/streamer-studio/:streamerId/agent", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    try {
      await ensureStreamerManageAccess(request.authUser!.discordId, streamerId);
      const response = await streamerService.clearStreamerObsAgentByStreamerId(streamerId);
      if (!response.success) {
        return serviceErrorResponse(
          "STREAMER_STUDIO_AGENT_CLEAR_FAILED",
          response.error.message ?? "Failed to clear OBS agent binding.",
          response.error,
        );
      }

      return {
        ok: true,
        data: response.data,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_AGENT_CLEAR_FAILED",
        "Failed to clear OBS agent binding.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/streamer-studio/:streamerId/services", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    try {
      const services = await streamerServicesService.listStreamerServices(request.authUser!.discordId, streamerId);
      return {
        ok: true,
        services,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_SERVICE_LOAD_FAILED",
        "Failed to load streamer services.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/streamer-studio/:streamerId/services/catalog", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    try {
      const services = await streamerServicesService.listEnabledStreamerServiceCatalog(streamerId);
      return {
        ok: true,
        services,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_SERVICE_LOAD_FAILED",
        "Failed to load streamer service catalog.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/services/:serviceId/purchase", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    const serviceId = parsePositiveInteger((request.params as { serviceId?: string }).serviceId);
    if (!streamerId || !serviceId) {
      return {
        ok: false,
        error: "STREAMER_SERVICE_PURCHASE_INVALID",
        message: "streamerId and serviceId must be positive integers.",
      };
    }

    try {
      const data = await streamerServicesService.purchaseStreamerService({
        buyerDiscordId: request.authUser!.discordId,
        streamerId,
        serviceId,
      });

      return {
        ok: true,
        data,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      switch (e?.code) {
        case "STREAMER_NOT_FOUND":
          return {
            ok: false,
            error: "STREAMER_NOT_FOUND",
            message: "Streamer not found.",
          };
        case "STREAMER_SERVICE_NOT_FOUND":
          return {
            ok: false,
            error: "STREAMER_SERVICE_NOT_FOUND",
            message: "Streamer service not found.",
          };
        case "STREAMER_SERVICE_DISABLED":
        case "STREAMER_SERVICE_UNSUPPORTED":
        case "STREAMER_SERVICE_PURCHASE_INVALID":
        case "STREAMER_SERVICE_NOT_ENOUGH_ODM":
        case "STREAMER_SERVICE_AGENT_NOT_CONFIGURED":
        case "STREAMER_SERVICE_AGENT_OFFLINE":
        case "STREAMER_SERVICE_PURCHASE_FAILED":
        case "STREAMER_SERVICE_COMMAND_FAILED":
          return {
            ok: false,
            error: e.code,
            message: e.message || "Streamer service purchase failed.",
          };
        default:
          return serviceErrorResponse(
            "STREAMER_SERVICE_PURCHASE_FAILED",
            "Failed to purchase streamer service.",
            error instanceof Error ? error : undefined,
          );
      }
    }
  });

  app.post("/streamer-studio/:streamerId/services", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;

    try {
      const service = await streamerServicesService.createStreamerService({
        actorDiscordId: request.authUser!.discordId,
        streamerId,
        serviceKey: body.serviceKey,
        title: body.title,
        description: body.description,
        serviceType: body.serviceType,
        mediaKind: body.mediaKind,
        mediaUrl: body.mediaUrl,
        durationMs: body.durationMs,
        price: body.price,
        enabled: body.enabled,
      });

      return {
        ok: true,
        service,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }
      if (e?.code === "STREAMER_SERVICE_INVALID") {
        return {
          ok: false,
          error: "STREAMER_SERVICE_INVALID",
          message: e.message || "Invalid streamer service input.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_SERVICE_CREATE_FAILED",
        "Failed to create streamer service.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.patch("/streamer-studio/:streamerId/services/:serviceId", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    const serviceId = parsePositiveInteger((request.params as { serviceId?: string }).serviceId);
    if (!streamerId || !serviceId) {
      return {
        ok: false,
        error: "STREAMER_SERVICE_INVALID",
        message: "streamerId and serviceId must be positive integers.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;

    try {
      const service = await streamerServicesService.updateStreamerService({
        actorDiscordId: request.authUser!.discordId,
        streamerId,
        serviceId,
        serviceKey: body.serviceKey,
        title: body.title,
        description: body.description,
        serviceType: body.serviceType,
        mediaKind: body.mediaKind,
        mediaUrl: body.mediaUrl,
        durationMs: body.durationMs,
        price: body.price,
        enabled: body.enabled,
      });

      return {
        ok: true,
        service,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }
      if (e?.code === "STREAMER_SERVICE_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_SERVICE_NOT_FOUND",
          message: "Streamer service not found.",
        };
      }
      if (e?.code === "STREAMER_SERVICE_INVALID") {
        return {
          ok: false,
          error: "STREAMER_SERVICE_INVALID",
          message: e.message || "Invalid streamer service input.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_SERVICE_UPDATE_FAILED",
        "Failed to update streamer service.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.delete("/streamer-studio/:streamerId/services/:serviceId", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    const serviceId = parsePositiveInteger((request.params as { serviceId?: string }).serviceId);
    if (!streamerId || !serviceId) {
      return {
        ok: false,
        error: "STREAMER_SERVICE_INVALID",
        message: "streamerId and serviceId must be positive integers.",
      };
    }

    try {
      const result = await streamerServicesService.disableStreamerService({
        actorDiscordId: request.authUser!.discordId,
        streamerId,
        serviceId,
      });

      return {
        ok: true,
        serviceId: result.serviceId,
        disabled: result.disabled,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }
      if (e?.code === "STREAMER_SERVICE_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_SERVICE_NOT_FOUND",
          message: "Streamer service not found.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_SERVICE_DELETE_FAILED",
        "Failed to disable streamer service.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.patch("/streamer-studio/:streamerId/control/source/text", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_UPDATE_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const sceneItemId = parsePositiveInteger(body.sceneItemId);
    const sourceNameRaw = body.sourceName;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_UPDATE_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!sceneItemId) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_UPDATE_INVALID",
        message: "sceneItemId must be a positive integer.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_UPDATE_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_UPDATE_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    if (!text.length || text.length > 500) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_UPDATE_INVALID",
        message: "text must be a non-empty string up to 500 chars.",
      };
    }

    try {
      const data = await streamerStudioControlService.updateTextSource(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sceneItemId,
          sourceName: sourceName ?? null,
          text,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to update OBS text source.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.patch("/streamer-studio/:streamerId/control/source/browser", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const sceneItemId = parsePositiveInteger(body.sceneItemId);
    const sourceNameRaw = body.sourceName;
    const urlRaw = body.url;
    const widthRaw = body.width;
    const heightRaw = body.height;

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!sceneItemId) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "sceneItemId must be a positive integer.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    let url: string | undefined;
    if (urlRaw !== undefined) {
      if (urlRaw === null || typeof urlRaw !== "string") {
        return {
          ok: false,
          error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
          message: "url must be a string when provided.",
        };
      }
      const trimmed = urlRaw.trim();
      if (!trimmed.length || trimmed.length > 1000 || !/^https?:\/\//i.test(trimmed)) {
        return {
          ok: false,
          error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
          message: "url must be a valid http:// or https:// URL up to 1000 chars.",
        };
      }
      url = trimmed;
    }

    const width = widthRaw === undefined ? undefined : parseFiniteNumber(widthRaw);
    if (width === null) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "width must be a finite number.",
      };
    }

    const height = heightRaw === undefined ? undefined : parseFiniteNumber(heightRaw);
    if (height === null) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "height must be a finite number.",
      };
    }

    if (url === undefined && width === undefined && height === undefined) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_UPDATE_INVALID",
        message: "At least one of url, width, or height must be provided.",
      };
    }

    try {
      const data = await streamerStudioControlService.updateBrowserSource(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sceneItemId,
          sourceName: sourceName ?? null,
          url,
          width,
          height,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to update OBS browser source.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/control/source/settings", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_SOURCE_SETTINGS_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const sceneItemId = parsePositiveInteger(body.sceneItemId);
    const sourceNameRaw = body.sourceName;

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_SOURCE_SETTINGS_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!sceneItemId) {
      return {
        ok: false,
        error: "OBS_SOURCE_SETTINGS_INVALID",
        message: "sceneItemId must be a positive integer.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_SOURCE_SETTINGS_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_SOURCE_SETTINGS_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    try {
      const data = await streamerStudioControlService.getSourceSettings(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sceneItemId,
          sourceName: sourceName ?? null,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to load OBS source settings.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.patch("/streamer-studio/:streamerId/control/scene-item/visibility", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_VISIBILITY_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const sceneItemId = parsePositiveInteger(body.sceneItemId);
    const sourceNameRaw = body.sourceName;
    const enabledRaw = body.enabled;

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_VISIBILITY_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!sceneItemId) {
      return {
        ok: false,
        error: "OBS_VISIBILITY_INVALID",
        message: "sceneItemId must be a positive integer.",
      };
    }

    if (typeof enabledRaw !== "boolean") {
      return {
        ok: false,
        error: "OBS_VISIBILITY_INVALID",
        message: "enabled must be a boolean.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_VISIBILITY_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_VISIBILITY_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    try {
      const data = await streamerStudioControlService.setSceneItemVisibility(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sceneItemId,
          sourceName: sourceName ?? null,
          enabled: enabledRaw,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to set OBS scene item visibility.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.delete("/streamer-studio/:streamerId/control/scene-item", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_REMOVE_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const sceneItemId = parsePositiveInteger(body.sceneItemId);
    const sourceNameRaw = body.sourceName;

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_REMOVE_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!sceneItemId) {
      return {
        ok: false,
        error: "OBS_REMOVE_INVALID",
        message: "sceneItemId must be a positive integer.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_REMOVE_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_REMOVE_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    try {
      const data = await streamerStudioControlService.removeSceneItem(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sceneItemId,
          sourceName: sourceName ?? null,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to remove OBS scene item.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/streamer-studio/accessible", { preHandler: requireAuth }, async request => {
    try {
      const data = await streamerAccessService.listAccessibleStreamers(request.authUser!.discordId);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to load accessible streamers.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/streamer-studio/:streamerId/trusted-users", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_TRUSTED_USER_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    try {
      const data = await streamerAccessService.listTrustedUsers(request.authUser!.discordId, streamerId);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to load trusted users.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/trusted-users", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_TRUSTED_USER_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const discordId = typeof body.discordId === "string" ? body.discordId.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : undefined;

    if (!discordId || !/^\d{1,32}$/.test(discordId)) {
      return {
        ok: false,
        error: "STREAMER_TRUSTED_USER_INVALID",
        message: "discordId must contain digits only and be at most 32 characters.",
      };
    }

    if (role !== undefined && role !== "moderator" && role !== "manager") {
      return {
        ok: false,
        error: "STREAMER_TRUSTED_USER_INVALID",
        message: "role must be moderator or manager.",
      };
    }

    try {
      const data = await streamerAccessService.addTrustedUser({
        actorDiscordId: request.authUser!.discordId,
        streamerId,
        targetDiscordId: discordId,
        role: role as "moderator" | "manager" | undefined,
      });

      return {
        ok: true,
        data,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e?.code === "STREAMER_NOT_FOUND") {
        return {
          ok: false,
          error: "STREAMER_NOT_FOUND",
          message: "Streamer not found.",
        };
      }
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }
      if (e?.code === "STREAMER_TRUSTED_USER_INVALID") {
        return {
          ok: false,
          error: "STREAMER_TRUSTED_USER_INVALID",
          message: e.message || "Invalid trusted user input.",
        };
      }
      if (e?.code === "STREAMER_TRUSTED_USER_SAVE_FAILED") {
        return {
          ok: false,
          error: "STREAMER_TRUSTED_USER_SAVE_FAILED",
          message: "Failed to save trusted user.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_TRUSTED_USER_SAVE_FAILED",
        "Failed to save trusted user.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.delete("/streamer-studio/:streamerId/trusted-users/:memberId", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    const memberId = parsePositiveInteger((request.params as { memberId?: string }).memberId);
    if (!streamerId || !memberId) {
      return {
        ok: false,
        error: "STREAMER_TRUSTED_USER_INVALID",
        message: "streamerId and memberId must be positive integers.",
      };
    }

    try {
      await streamerAccessService.removeTrustedUser({
        actorDiscordId: request.authUser!.discordId,
        streamerId,
        memberId,
      });
      return { ok: true };
    } catch (error) {
      const e = error as { code?: string };
      if (e?.code === "STREAMER_STUDIO_FORBIDDEN") {
        return {
          ok: false,
          error: "STREAMER_STUDIO_FORBIDDEN",
          message: "You do not have access to manage this streamer.",
        };
      }
      if (e?.code === "STREAMER_TRUSTED_USER_DELETE_FAILED") {
        return {
          ok: false,
          error: "STREAMER_TRUSTED_USER_DELETE_FAILED",
          message: "Failed to delete trusted user.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_TRUSTED_USER_DELETE_FAILED",
        "Failed to delete trusted user.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/control/scenes/list", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    try {
      const data = await streamerStudioControlService.listScenes(request.authUser!.discordId, streamerId);
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to load OBS scenes.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/control/scene-items/list", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName : "";
    if (!sceneName.trim().length || sceneName.trim().length > 160) {
      return {
        ok: false,
        error: "OBS_SCENE_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    try {
      const data = await streamerStudioControlService.listSceneItems(request.authUser!.discordId, streamerId, sceneName);
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to load OBS scene items.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.patch("/streamer-studio/:streamerId/control/scene-item/index", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_INDEX_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const sceneItemId = parsePositiveInteger(body.sceneItemId);
    const sourceNameRaw = body.sourceName;
    const sceneItemIndex = parseInteger(body.sceneItemIndex);

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_INDEX_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!sceneItemId) {
      return {
        ok: false,
        error: "OBS_INDEX_INVALID",
        message: "sceneItemId must be a positive integer.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_INDEX_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_INDEX_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    if (sceneItemIndex === null || sceneItemIndex < 0) {
      return {
        ok: false,
        error: "OBS_INDEX_INVALID",
        message: "sceneItemIndex must be an integer greater than or equal to 0.",
      };
    }

    try {
      const data = await streamerStudioControlService.setSceneItemIndex(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sceneItemId,
          sourceName: sourceName ?? null,
          sceneItemIndex,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to apply OBS scene item index.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/control/source/text", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const sourceNameRaw = body.sourceName;

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!text.length || text.length > 500) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_INVALID",
        message: "text must be a non-empty string up to 500 chars.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    const positionX = body.positionX === undefined ? 100 : parseFiniteNumber(body.positionX);
    const positionY = body.positionY === undefined ? 100 : parseFiniteNumber(body.positionY);
    const scaleX = body.scaleX === undefined ? 1 : parseFiniteNumber(body.scaleX);
    const scaleY = body.scaleY === undefined ? 1 : parseFiniteNumber(body.scaleY);
    const rotation = body.rotation === undefined ? 0 : parseFiniteNumber(body.rotation);

    if (positionX === null || positionY === null || scaleX === null || scaleY === null || rotation === null) {
      return {
        ok: false,
        error: "OBS_TEXT_SOURCE_INVALID",
        message: "position, scale, and rotation fields must be finite numbers.",
      };
    }

    try {
      const data = await streamerStudioControlService.createTextSource(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sourceName: sourceName ?? null,
          text,
          positionX,
          positionY,
          scaleX,
          scaleY,
          rotation,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to create OBS text source.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-studio/:streamerId/control/source/browser", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const sourceNameRaw = body.sourceName;

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!url.length || url.length > 1000) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_INVALID",
        message: "url must be a non-empty string up to 1000 chars.",
      };
    }

    if (!/^https?:\/\//i.test(url)) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_INVALID",
        message: "url must be a valid http:// or https:// URL.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    const width = body.width === undefined ? 800 : parseFiniteNumber(body.width);
    const height = body.height === undefined ? 450 : parseFiniteNumber(body.height);
    const positionX = body.positionX === undefined ? 100 : parseFiniteNumber(body.positionX);
    const positionY = body.positionY === undefined ? 100 : parseFiniteNumber(body.positionY);
    const scaleX = body.scaleX === undefined ? 1 : parseFiniteNumber(body.scaleX);
    const scaleY = body.scaleY === undefined ? 1 : parseFiniteNumber(body.scaleY);
    const rotation = body.rotation === undefined ? 0 : parseFiniteNumber(body.rotation);

    if (width === null || height === null || positionX === null || positionY === null || scaleX === null || scaleY === null || rotation === null) {
      return {
        ok: false,
        error: "OBS_BROWSER_SOURCE_INVALID",
        message: "width, height, position, scale, and rotation fields must be finite numbers.",
      };
    }

    try {
      const data = await streamerStudioControlService.createBrowserSource(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sourceName: sourceName ?? null,
          url,
          width,
          height,
          positionX,
          positionY,
          scaleX,
          scaleY,
          rotation,
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to create OBS browser source.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.patch("/streamer-studio/:streamerId/control/scene-item/transform", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_TRANSFORM_INVALID",
        message: "streamerId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const sceneName = typeof body.sceneName === "string" ? body.sceneName.trim() : "";
    const sceneItemId = parsePositiveInteger(body.sceneItemId);
    const sourceNameRaw = body.sourceName;
    const transform = body.transform;

    if (!sceneName.length || sceneName.length > 160) {
      return {
        ok: false,
        error: "OBS_TRANSFORM_INVALID",
        message: "sceneName must be a non-empty string up to 160 chars.",
      };
    }

    if (!sceneItemId) {
      return {
        ok: false,
        error: "OBS_TRANSFORM_INVALID",
        message: "sceneItemId must be a positive integer.",
      };
    }

    if (sourceNameRaw !== undefined && sourceNameRaw !== null && typeof sourceNameRaw !== "string") {
      return {
        ok: false,
        error: "OBS_TRANSFORM_INVALID",
        message: "sourceName must be a string or null.",
      };
    }

    const sourceName = typeof sourceNameRaw === "string" ? sourceNameRaw.trim() : sourceNameRaw;
    if (typeof sourceName === "string" && sourceName.length > 160) {
      return {
        ok: false,
        error: "OBS_TRANSFORM_INVALID",
        message: "sourceName must be up to 160 chars.",
      };
    }

    if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
      return {
        ok: false,
        error: "OBS_TRANSFORM_INVALID",
        message: "transform must be an object.",
      };
    }

    const transformRecord = transform as Record<string, unknown>;
    const positionX = parseFiniteNumber(transformRecord.positionX);
    const positionY = parseFiniteNumber(transformRecord.positionY);
    const scaleX = parseFiniteNumber(transformRecord.scaleX);
    const scaleY = parseFiniteNumber(transformRecord.scaleY);
    const rotation = transformRecord.rotation === undefined ? 0 : parseFiniteNumber(transformRecord.rotation);

    if (positionX === null || positionY === null || scaleX === null || scaleY === null || rotation === null) {
      return {
        ok: false,
        error: "OBS_TRANSFORM_INVALID",
        message: "transform fields must be finite numbers.",
      };
    }

    try {
      const data = await streamerStudioControlService.applySceneItemTransform(
        request.authUser!.discordId,
        streamerId,
        {
          sceneName,
          sceneItemId,
          sourceName: sourceName ?? null,
          transform: {
            positionX,
            positionY,
            scaleX,
            scaleY,
            rotation,
          },
        },
      );
      return { ok: true, data };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (streamerStudioControlService.isControlError(error)) {
        return {
          ok: false,
          error: e.code!,
          message: e.message || "Streamer studio control error.",
        };
      }

      return serviceErrorResponse(
        "STREAMER_STUDIO_LOAD_FAILED",
        "Failed to apply OBS scene item transform.",
        error instanceof Error ? error : undefined,
      );
    }
  });
}
