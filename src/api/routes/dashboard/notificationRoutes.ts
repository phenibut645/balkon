import { FastifyInstance } from "fastify";
import { NotificationService } from "../../../core/NotificationService.js";
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

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function parseOptionalText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function serviceErrorResponse(defaultCode: string, defaultMessage: string, error?: ServiceError) {
  return {
    ok: false,
    error: defaultCode,
    message: error?.message || defaultMessage,
  };
}

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  const notificationService = NotificationService.getInstance();

  app.get("/notifications", { preHandler: requireAuth }, async request => {
    try {
      const query = request.query as {
        page?: unknown;
        pageSize?: unknown;
        unreadOnly?: unknown;
        type?: unknown;
      };

      const parsedPage = parsePositiveInteger(query.page);
      const parsedPageSize = parsePositiveInteger(query.pageSize);
      const unreadOnly = parseOptionalBoolean(query.unreadOnly);
      const type = parseOptionalText(query.type);

      const page = parsedPage ?? 1;
      const pageSize = Math.min(50, Math.max(1, parsedPageSize ?? 10));

      const result = await notificationService.listForUser(request.authUser!.discordId, {
        page,
        pageSize,
        unreadOnly,
        type: type ?? null,
      });

      return {
        ok: true,
        notifications: result.items,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        unreadCount: result.unreadCount,
      };
    } catch (error) {
      return serviceErrorResponse(
        "NOTIFICATIONS_LOAD_FAILED",
        "Failed to load notifications.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/notifications/summary", { preHandler: requireAuth }, async request => {
    try {
      const [unreadCount, latest] = await Promise.all([
        notificationService.getUnreadCount(request.authUser!.discordId),
        notificationService.listLatest(request.authUser!.discordId, 3),
      ]);

      return {
        ok: true,
        unreadCount,
        latest,
      };
    } catch (error) {
      return serviceErrorResponse(
        "NOTIFICATIONS_SUMMARY_FAILED",
        "Failed to load notifications summary.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/notifications/:notificationId/read", { preHandler: requireAuth }, async request => {
    try {
      const notificationId = parsePositiveInteger((request.params as { notificationId?: string }).notificationId);
      if (!notificationId) {
        return {
          ok: false,
          error: "INVALID_NOTIFICATION_ID",
          message: "notificationId must be a positive integer.",
        };
      }

      await notificationService.markRead(request.authUser!.discordId, notificationId);
      return { ok: true };
    } catch (error) {
      return serviceErrorResponse(
        "NOTIFICATION_MARK_READ_FAILED",
        "Failed to mark notification as read.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/notifications/read-all", { preHandler: requireAuth }, async request => {
    try {
      const updated = await notificationService.markAllRead(request.authUser!.discordId);
      return {
        ok: true,
        updated,
      };
    } catch (error) {
      return serviceErrorResponse(
        "NOTIFICATIONS_MARK_ALL_READ_FAILED",
        "Failed to mark all notifications as read.",
        error instanceof Error ? error : undefined,
      );
    }
  });
}