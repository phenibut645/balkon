import { FastifyInstance } from "fastify";
import {
  CreateStreamerApplicationInput,
  RejectStreamerApplicationInput,
  StreamerApplicationListStatus,
  streamerApplicationService,
} from "../../../core/StreamerApplicationService.js";
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

function parseApplicationStatus(value: unknown): StreamerApplicationListStatus | null {
  if (value === undefined || value === null || value === "") {
    return "pending";
  }

  if (value === "pending" || value === "approved" || value === "rejected" || value === "all") {
    return value;
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

export async function registerStreamerApplicationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/streamer-applications/me", { preHandler: requireAuth }, async request => {
    try {
      const data = await streamerApplicationService.getMyApplications(request.authUser!.discordId);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return serviceErrorResponse(
        "STREAMER_APPLICATION_SUBMIT_FAILED",
        "Failed to load streamer applications.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/streamer-applications", { preHandler: requireAuth }, async request => {
    try {
      const data = await streamerApplicationService.submitApplication(
        request.authUser!.discordId,
        (request.body ?? {}) as CreateStreamerApplicationInput,
      );

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return serviceErrorResponse(
        "STREAMER_APPLICATION_SUBMIT_FAILED",
        "Failed to submit streamer application.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/admin/streamer-applications", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const status = parseApplicationStatus((request.query as { status?: string }).status);
    if (!status) {
      return {
        ok: false,
        error: "STREAMER_APPLICATION_INVALID",
        message: "status must be pending, approved, rejected, or all.",
      };
    }

    try {
      const data = await streamerApplicationService.listApplicationsForAdmin(status);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return serviceErrorResponse(
        "STREAMER_APPLICATION_SUBMIT_FAILED",
        "Failed to load streamer applications.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/admin/streamer-applications/:applicationId/approve", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const applicationId = parsePositiveInteger((request.params as { applicationId?: string }).applicationId);
    if (!applicationId) {
      return {
        ok: false,
        error: "STREAMER_APPLICATION_NOT_FOUND",
        message: "applicationId must be a positive integer.",
      };
    }

    try {
      const data = await streamerApplicationService.approveApplication(request.authUser!.discordId, applicationId);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return serviceErrorResponse(
        "STREAMER_APPLICATION_APPROVE_FAILED",
        "Failed to approve streamer application.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/admin/streamer-applications/:applicationId/reject", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const applicationId = parsePositiveInteger((request.params as { applicationId?: string }).applicationId);
    if (!applicationId) {
      return {
        ok: false,
        error: "STREAMER_APPLICATION_NOT_FOUND",
        message: "applicationId must be a positive integer.",
      };
    }

    try {
      const data = await streamerApplicationService.rejectApplication(
        request.authUser!.discordId,
        applicationId,
        (request.body ?? {}) as RejectStreamerApplicationInput,
      );

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return serviceErrorResponse(
        "STREAMER_APPLICATION_REJECT_FAILED",
        "Failed to reject streamer application.",
        error instanceof Error ? error : undefined,
      );
    }
  });
}
