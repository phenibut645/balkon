import { FastifyInstance } from "fastify";
import { streamerService } from "../../../core/StreamerService.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireBotAdmin } from "../../middleware/requireBotAdmin.js";

type ServiceError = {
  code?: string;
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

function serviceErrorResponse(defaultCode: string, defaultMessage: string, error?: ServiceError) {
  return {
    ok: false,
    error: error?.code || defaultCode,
    message: error?.message || defaultMessage,
  };
}

export async function registerAdminStreamerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/streamers", { preHandler: [requireAuth, requireBotAdmin] }, async () => {
    try {
      const streamers = await streamerService.listAdminStreamers();
      return {
        ok: true,
        data: streamers,
        streamers,
      };
    } catch (error) {
      return serviceErrorResponse(
        "ADMIN_STREAMERS_LOAD_FAILED",
        "Failed to load streamers.",
        error instanceof Error ? { code: (error as Error & { code?: string }).code, message: error.message } : undefined,
      );
    }
  });

  app.delete("/admin/streamers/:streamerId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "STREAMER_NOT_FOUND",
        message: "streamerId must be a positive integer.",
      };
    }

    const response = await streamerService.archiveStreamerById({
      streamerId,
      archivedByDiscordId: request.authUser!.discordId,
    });

    if (response.success === false) {
      const errorCode = response.error.code;
      if (errorCode === "STREAMER_NOT_FOUND") {
        return serviceErrorResponse("STREAMER_NOT_FOUND", "Streamer not found.", response.error);
      }

      if (errorCode === "STREAMER_DELETE_FORBIDDEN") {
        return serviceErrorResponse("STREAMER_DELETE_FORBIDDEN", "Streamer cannot be archived.", response.error);
      }

      return serviceErrorResponse("STREAMER_DELETE_FAILED", "Failed to archive streamer.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });
}
