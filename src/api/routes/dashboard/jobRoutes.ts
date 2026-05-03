import { FastifyInstance } from "fastify";
import { JobMutationInput, JobService } from "../../../core/JobService.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireBotAdmin } from "../../middleware/requireBotAdmin.js";

type ServiceError = {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
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

function baseErrorResponse(defaultCode: string, defaultMessage: string, error?: ServiceError) {
  return {
    ok: false,
    error: error?.code || defaultCode,
    message: error?.message || defaultMessage,
  };
}

function jobMutationErrorResponse(defaultCode: string, defaultMessage: string, error?: ServiceError) {
  if (!error?.code) {
    return baseErrorResponse(defaultCode, defaultMessage, error);
  }

  if (
    error.code === "JOB_INVALID"
    || error.code === "JOB_KEY_ALREADY_EXISTS"
    || error.code === "JOB_REWARD_INVALID"
    || error.code === "ITEM_NOT_FOUND"
  ) {
    return {
      ok: false,
      error: "ADMIN_JOB_INVALID",
      message: error.message || defaultMessage,
    };
  }

  if (error.code === "JOB_NOT_FOUND") {
    return {
      ok: false,
      error: "JOB_NOT_FOUND",
      message: error.message || defaultMessage,
    };
  }

  return {
    ok: false,
    error: defaultCode,
    message: error.message || defaultMessage,
  };
}

function jobRunErrorResponse(defaultMessage: string, error?: ServiceError) {
  if (!error?.code) {
    return {
      ok: false,
      error: "JOB_RUN_FAILED",
      message: defaultMessage,
    };
  }

  if (error.code === "JOB_NOT_FOUND") {
    return {
      ok: false,
      error: "JOB_NOT_FOUND",
      message: error.message || defaultMessage,
    };
  }

  if (error.code === "JOB_DISABLED") {
    return {
      ok: false,
      error: "JOB_DISABLED",
      message: error.message || defaultMessage,
    };
  }

  if (error.code === "JOB_COOLDOWN_ACTIVE") {
    return {
      ok: false,
      error: "JOB_COOLDOWN_ACTIVE",
      message: error.message || defaultMessage,
      ...(error.details ?? {}),
    };
  }

  return {
    ok: false,
    error: "JOB_RUN_FAILED",
    message: error.message || defaultMessage,
  };
}

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  const jobService = JobService.getInstance();

  function getServiceError(error: unknown): ServiceError | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }

    const code = jobService.getErrorCode(error) ?? undefined;
    const details = jobService.getErrorDetails(error);
    return {
      code,
      message: error.message,
      details,
    };
  }

  app.get("/jobs", { preHandler: requireAuth }, async () => {
    try {
      const jobs = await jobService.listJobs();
      return {
        ok: true,
        jobs,
      };
    } catch (error) {
      return baseErrorResponse(
        "JOB_LOAD_FAILED",
        "Failed to load jobs.",
        error instanceof Error ? { message: error.message } : undefined,
      );
    }
  });

  app.post("/jobs/:jobId/run", { preHandler: requireAuth }, async request => {
    const jobId = parsePositiveInteger((request.params as { jobId?: string }).jobId);
    if (!jobId) {
      return {
        ok: false,
        error: "INVALID_JOB_ID",
        message: "jobId must be a positive integer.",
      };
    }

    try {
      const data = await jobService.runJob(request.authUser!.discordId, jobId);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return jobRunErrorResponse("Failed to run job.", getServiceError(error));
    }
  });

  app.get("/admin/jobs", { preHandler: [requireAuth, requireBotAdmin] }, async () => {
    try {
      const data = await jobService.listAdminJobs();
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return baseErrorResponse(
        "ADMIN_JOBS_LOAD_FAILED",
        "Failed to load admin jobs.",
        error instanceof Error ? { message: error.message } : undefined,
      );
    }
  });

  app.post("/admin/jobs", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    try {
      const data = await jobService.createJob(request.authUser!.discordId, (request.body ?? {}) as JobMutationInput);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return jobMutationErrorResponse("ADMIN_JOB_CREATE_FAILED", "Failed to create job.", getServiceError(error));
    }
  });

  app.patch("/admin/jobs/:jobId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const jobId = parsePositiveInteger((request.params as { jobId?: string }).jobId);
    if (!jobId) {
      return {
        ok: false,
        error: "INVALID_JOB_ID",
        message: "jobId must be a positive integer.",
      };
    }

    try {
      const data = await jobService.updateJob(request.authUser!.discordId, jobId, (request.body ?? {}) as JobMutationInput);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return jobMutationErrorResponse("ADMIN_JOB_UPDATE_FAILED", "Failed to update job.", getServiceError(error));
    }
  });

  app.delete("/admin/jobs/:jobId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const jobId = parsePositiveInteger((request.params as { jobId?: string }).jobId);
    if (!jobId) {
      return {
        ok: false,
        error: "INVALID_JOB_ID",
        message: "jobId must be a positive integer.",
      };
    }

    try {
      const data = await jobService.disableJob(request.authUser!.discordId, jobId);
      return {
        ok: true,
        data,
      };
    } catch (error) {
      return jobMutationErrorResponse("ADMIN_JOB_DISABLE_FAILED", "Failed to disable job.", getServiceError(error));
    }
  });
}
