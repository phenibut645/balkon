import { FastifyInstance } from "fastify";
import { ItemService } from "../../core/ItemService.js";
import { EconomyService } from "../../core/EconomyService.js";
import { NotificationService, NotificationSeverity } from "../../core/NotificationService.js";
import { ShopObsService } from "../../core/ShopObsService.js";
import { ObsMediaActionService, ObsMediaActionStatus } from "../../core/ObsMediaActionService.js";
import { OverviewService } from "../../core/OverviewService.js";
import { GuildDashboardService } from "../../core/GuildDashboardService.js";
import { UserProfileService } from "../../core/UserProfileService.js";
import { getBotAdminDashboardStats, isBotAdmin } from "../../core/BotAdmin.js";
import { StreamerAccessService } from "../../core/StreamerAccessService.js";
import { streamerService } from "../../core/StreamerService.js";
import { registerStreamerStudioRoutes } from "./dashboard/streamerStudioRoutes.js";
import { registerStreamerApplicationRoutes } from "./dashboard/streamerApplicationRoutes.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireBotContributor } from "../middleware/requireBotContributor.js";
import { requireBotAdmin } from "../middleware/requireBotAdmin.js";

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

function parseObsMediaActionStatus(value: unknown): ObsMediaActionStatus | null | undefined {
  const normalized = parseOptionalText(value);
  if (normalized === undefined || normalized === null) {
    return normalized;
  }

  if (normalized === "pending" || normalized === "sent" || normalized === "failed" || normalized === "refunded") {
    return normalized;
  }

  return null;
}

function parseOptionalHomeGuildId(value: unknown): string | null | undefined {
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
  if (!normalized) {
    return null;
  }

  if (!/^\d{1,32}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function parseGuildId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return /^\d{1,32}$/.test(normalized) ? normalized : null;
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

function parseOptionalUrl(value: unknown): string | null | undefined {
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
  if (!normalized.length) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function isNotificationSeverity(value: unknown): value is NotificationSeverity {
  return value === "info" || value === "success" || value === "warning" || value === "danger";
}

function isPositivePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function serviceErrorResponse(defaultCode: string, defaultMessage: string, error?: ServiceError) {
  return {
    ok: false,
    error: defaultCode,
    message: error?.message || defaultMessage,
  };
}

function parsePositivePrice(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }

  return parsed;
}

function itemMutationErrorResponse(
  defaultCode: string,
  defaultMessage: string,
  error?: { reason?: string; relatedTo?: string; message?: string },
) {
  const message = error?.message || defaultMessage;

  if (!error) {
    return {
      ok: false,
      error: defaultCode,
      message,
    };
  }

  if (error.reason === "record_not_found" && error.relatedTo === "item_public_market") {
    return {
      ok: false,
      error: "MARKET_LISTING_NOT_FOUND",
      message,
    };
  }

  if (error.reason === "record_not_found" && error.relatedTo === "member_items") {
    return {
      ok: false,
      error: "INVENTORY_ITEM_NOT_FOUND",
      message,
    };
  }

  if (error.relatedTo === "members" && message === "Not enough ODM balance.") {
    return {
      ok: false,
      error: "NOT_ENOUGH_ODM",
      message,
    };
  }

  if (error.relatedTo === "member_items" && message === "You do not own this item.") {
    return {
      ok: false,
      error: "INVENTORY_ITEM_NOT_OWNED",
      message,
    };
  }

  if (error.relatedTo === "member_items" && message === "You do not own this service item.") {
    return {
      ok: false,
      error: "INVENTORY_ITEM_NOT_OWNED",
      message,
    };
  }

  if (error.relatedTo === "items" && message === "This item is not tradeable.") {
    return {
      ok: false,
      error: "ITEM_NOT_TRADEABLE",
      message,
    };
  }

  if (error.relatedTo === "items" && message === "Selected inventory item is not a service item.") {
    return {
      ok: false,
      error: "ITEM_NOT_SERVICE",
      message,
    };
  }

  if (error.reason === "record_not_found" && error.relatedTo === "item_service_actions") {
    return {
      ok: false,
      error: "SERVICE_ACTION_NOT_CONFIGURED",
      message,
    };
  }

  if (error.reason === "record_not_found" && error.relatedTo === "bot_settings") {
    return {
      ok: false,
      error: "OBS_AGENT_NOT_CONFIGURED",
      message,
    };
  }

  if (message.includes(" is offline.")) {
    return {
      ok: false,
      error: "OBS_AGENT_OFFLINE",
      message,
    };
  }

  if (error.relatedTo === "item_public_market" && message === "This item is already listed.") {
    return {
      ok: false,
      error: "INVENTORY_ITEM_ALREADY_LISTED",
      message,
    };
  }

  if (error.relatedTo === "item_public_market" && message === "You cannot buy your own listing.") {
    return {
      ok: false,
      error: "CANNOT_BUY_OWN_LISTING",
      message,
    };
  }

  if (error.relatedTo === "item_public_market" && message === "You can only update your own listing.") {
    return {
      ok: false,
      error: "MARKET_LISTING_NOT_OWNED",
      message,
    };
  }

  if (error.relatedTo === "item_public_market" && message === "You can only cancel your own listing.") {
    return {
      ok: false,
      error: "MARKET_LISTING_NOT_OWNED",
      message,
    };
  }

  if (error.relatedTo === "items" && message === "This item cannot be sold to the bot.") {
    return {
      ok: false,
      error: "ITEM_NOT_SELLABLE_TO_BOT",
      message,
    };
  }

  return {
    ok: false,
    error: defaultCode,
    message,
  };
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  const notificationService = NotificationService.getInstance();
  const shopObsService = ShopObsService.getInstance();
  const obsMediaActionService = ObsMediaActionService.getInstance();
  const guildDashboardService = GuildDashboardService.getInstance();
  const streamerAccessService = StreamerAccessService.getInstance();

  await registerStreamerStudioRoutes(app);
  await registerStreamerApplicationRoutes(app);

  app.get("/me", { preHandler: requireAuth }, async request => ({
    ok: true,
    me: {
      discordId: request.authUser!.discordId,
      roles: request.authUser!.roles,
      username: request.authUser!.username ?? null,
      globalName: request.authUser!.globalName ?? null,
      avatar: request.authUser!.avatar ?? null,
      avatarUrl: request.authUser!.avatarUrl ?? null,
    },
  }));

  app.get("/overview/me", { preHandler: requireAuth }, async request => {
    try {
      const data = await OverviewService.getInstance().getCurrentUserOverview(request.authUser!.discordId);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return serviceErrorResponse(
        "OVERVIEW_LOAD_FAILED",
        "Failed to load overview.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/guilds/me", { preHandler: requireAuth }, async request => {
    try {
      const guilds = await guildDashboardService.listCurrentUserGuilds(request.authUser!.discordId);

      return {
        ok: true,
        guilds,
      };
    } catch (error) {
      return serviceErrorResponse(
        "GUILDS_LOAD_FAILED",
        "Failed to load guilds.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/guilds/:guildId/overview", { preHandler: requireAuth }, async request => {
    const guildId = parseGuildId((request.params as { guildId?: string }).guildId);
    if (!guildId) {
      return {
        ok: false,
        error: "GUILD_NOT_FOUND",
        message: "Guild not found.",
      };
    }

    try {
      const guild = await guildDashboardService.getGuildOverview(request.authUser!.discordId, guildId);
      if (!guild) {
        return {
          ok: false,
          error: "GUILD_NOT_FOUND",
          message: "Guild not found.",
        };
      }

      return {
        ok: true,
        guild,
      };
    } catch (error) {
      return serviceErrorResponse(
        "GUILDS_LOAD_FAILED",
        "Failed to load guild overview.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/inventory", { preHandler: requireAuth }, async request => {
    const response = await ItemService.getInstance().getInventory(request.authUser!.discordId);
    if (!response.success) {
      return {
        ok: false,
        error: "INVENTORY_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      items: response.data,
    };
  });

  app.post("/inventory/:inventoryItemId/market-listing", { preHandler: requireAuth }, async request => {
    const inventoryItemId = parsePositiveInteger((request.params as { inventoryItemId?: string }).inventoryItemId);
    if (!inventoryItemId) {
      return {
        ok: false,
        error: "INVALID_INVENTORY_ITEM_ID",
        message: "inventoryItemId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as { price?: unknown };
    const price = parsePositivePrice(body.price);
    if (price === null) {
      return {
        ok: false,
        error: "INVALID_MARKET_PRICE",
        message: "price must be a positive finite number.",
      };
    }

    const response = await ItemService.getInstance().createPublicListing(request.authUser!.discordId, inventoryItemId, price);
    if (!response.success) {
      return itemMutationErrorResponse("MARKET_LISTING_CREATE_FAILED", "Failed to create market listing.", response.error);
    }

    return {
      ok: true,
      data: {
        listingId: response.data.listingId,
        inventoryItemId,
        price,
      },
    };
  });

  app.post("/inventory/:inventoryItemId/sell-to-bot", { preHandler: requireAuth }, async request => {
    const inventoryItemId = parsePositiveInteger((request.params as { inventoryItemId?: string }).inventoryItemId);
    if (!inventoryItemId) {
      return {
        ok: false,
        error: "INVALID_INVENTORY_ITEM_ID",
        message: "inventoryItemId must be a positive integer.",
      };
    }

    const itemService = ItemService.getInstance();
    const response = await itemService.sellInventoryItemToBot(request.authUser!.discordId, inventoryItemId);
    if (!response.success) {
      return itemMutationErrorResponse("INVENTORY_SELL_TO_BOT_FAILED", "Failed to sell inventory item to bot.", response.error);
    }

    const member = await itemService.ensureMemberByDiscordId(request.authUser!.discordId);
    return {
      ok: true,
      data: {
        inventoryItemId,
        received: response.data.price,
        balance: Number(member.data.balance),
      },
    };
  });

  app.post("/inventory/:inventoryItemId/use-service", { preHandler: requireAuth }, async request => {
    const inventoryItemId = parsePositiveInteger((request.params as { inventoryItemId?: string }).inventoryItemId);
    if (!inventoryItemId) {
      return {
        ok: false,
        error: "INVALID_INVENTORY_ITEM_ID",
        message: "inventoryItemId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as { streamerId?: unknown };
    if (body.streamerId !== undefined && body.streamerId !== null && parsePositiveInteger(body.streamerId) === null) {
      return {
        ok: false,
        error: "INVALID_STREAMER_ID",
        message: "streamerId must be a positive integer when provided.",
      };
    }

    const streamerId = body.streamerId === undefined || body.streamerId === null
      ? null
      : parsePositiveInteger(body.streamerId);

    if (streamerId === null) {
      return {
        ok: false,
        error: "STREAMER_REQUIRED",
        message: "streamerId is required to use this service item from the dashboard.",
      };
    }

    try {
      await streamerService.ensureStreamerExistsById(streamerId);
      const canControl = await streamerAccessService.canControlStreamer(request.authUser!.discordId, streamerId);
      if (!canControl) {
        return {
          ok: false,
          error: "STREAMER_ACCESS_FORBIDDEN",
          message: "You do not have access to control this streamer.",
        };
      }

      const response = await streamerService.useServiceItemByStreamerId({
        discordUserId: request.authUser!.discordId,
        inventoryItemId,
        streamerId,
      });
      if (!response.success) {
        return itemMutationErrorResponse("INVENTORY_SERVICE_USE_FAILED", "Failed to use service item.", response.error);
      }

      return {
        ok: true,
        data: {
          inventoryItemId,
          consumed: response.data.consumed,
          actionType: response.data.actionType,
          streamerId: response.data.streamerId,
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

      return serviceErrorResponse(
        "INVENTORY_SERVICE_USE_FAILED",
        "Failed to use service item.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/market", { preHandler: requireAuth }, async () => {
    const response = await ItemService.getInstance().listPublicMarket();
    if (!response.success) {
      return {
        ok: false,
        error: "MARKET_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      listings: response.data,
    };
  });

  app.post("/market/:listingId/buy", { preHandler: requireAuth }, async request => {
    const listingId = parsePositiveInteger((request.params as { listingId?: string }).listingId);
    if (!listingId) {
      return {
        ok: false,
        error: "INVALID_LISTING_ID",
        message: "listingId must be a positive integer.",
      };
    }

    const itemService = ItemService.getInstance();
    const response = await itemService.buyPublicListing(request.authUser!.discordId, listingId);
    if (!response.success) {
      return itemMutationErrorResponse("MARKET_PURCHASE_FAILED", "Failed to buy market listing.", response.error);
    }

    const member = await itemService.ensureMemberByDiscordId(request.authUser!.discordId);
    return {
      ok: true,
      data: {
        listingId,
        inventoryItemId: response.data.inventoryItemId,
        balance: Number(member.data.balance),
      },
    };
  });

  app.patch("/market/:listingId", { preHandler: requireAuth }, async request => {
    const listingId = parsePositiveInteger((request.params as { listingId?: string }).listingId);
    if (!listingId) {
      return {
        ok: false,
        error: "INVALID_LISTING_ID",
        message: "listingId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as { price?: unknown };
    const price = parsePositivePrice(body.price);
    if (price === null) {
      return {
        ok: false,
        error: "INVALID_MARKET_PRICE",
        message: "price must be a positive finite number.",
      };
    }

    const response = await ItemService.getInstance().updatePublicListingPrice(request.authUser!.discordId, listingId, price);
    if (!response.success) {
      return itemMutationErrorResponse("MARKET_LISTING_UPDATE_FAILED", "Failed to update market listing.", response.error);
    }

    return {
      ok: true,
      data: {
        listingId: response.data.listingId,
        price: response.data.price,
      },
    };
  });

  app.delete("/market/:listingId", { preHandler: requireAuth }, async request => {
    const listingId = parsePositiveInteger((request.params as { listingId?: string }).listingId);
    if (!listingId) {
      return {
        ok: false,
        error: "INVALID_LISTING_ID",
        message: "listingId must be a positive integer.",
      };
    }

    const response = await ItemService.getInstance().cancelPublicListing(request.authUser!.discordId, listingId);
    if (!response.success) {
      return itemMutationErrorResponse("MARKET_LISTING_CANCEL_FAILED", "Failed to cancel market listing.", response.error);
    }

    return {
      ok: true,
      data: {
        listingId: response.data.listingId,
        inventoryItemId: response.data.inventoryItemId,
        cancelled: true,
      },
    };
  });

  app.get("/market/capitalization", { preHandler: requireAuth }, async request => {
    try {
      const rawDays = (request.query as { days?: unknown }).days;
      const parsedDays = parsePositiveInteger(rawDays);
      const days = parsedDays && parsedDays >= 2 && parsedDays <= 60 ? parsedDays : 15;

      const capitalization = await EconomyService.getInstance().getMarketCapitalization(days);

      return {
        ok: true,
        capitalization,
      };
    } catch {
      return {
        ok: false,
        error: "MARKET_CAPITALIZATION_LOAD_FAILED",
        message: "Failed to load market capitalization.",
      };
    }
  });

  app.get("/market/forbes", { preHandler: requireAuth }, async request => {
    try {
      const rawLimit = (request.query as { limit?: unknown }).limit;
      const parsedLimit = parsePositiveInteger(rawLimit);
      const limit = parsedLimit ? Math.min(50, Math.max(1, parsedLimit)) : 10;

      const leaderboard = await UserProfileService.getInstance().getMarketForbes(limit);

      return {
        ok: true,
        leaderboard,
      };
    } catch {
      return {
        ok: false,
        error: "MARKET_FORBES_LOAD_FAILED",
        message: "Failed to load market forbes leaderboard.",
      };
    }
  });

  app.get("/profile/me", { preHandler: requireAuth }, async request => {
    try {
      const profileService = UserProfileService.getInstance();
      const profile = await profileService.getCurrentUserProfile(request.authUser!.discordId);
      const availableGuilds = await profileService.listAvailableHomeGuilds(request.authUser!.discordId);

      return {
        ok: true,
        profile,
        availableGuilds,
      };
    } catch {
      return {
        ok: false,
        error: "PROFILE_LOAD_FAILED",
        message: "Failed to load profile.",
      };
    }
  });

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

  app.patch("/profile/me", { preHandler: requireAuth }, async request => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const profileService = UserProfileService.getInstance();

      const homeGuildId = parseOptionalHomeGuildId(body.homeGuildId);
      if (body.homeGuildId !== undefined && homeGuildId === null && body.homeGuildId !== null && String(body.homeGuildId).trim() !== "") {
        return {
          ok: false,
          error: "INVALID_HOME_GUILD",
          message: "homeGuildId must be digits only and max length 32.",
        };
      }

      if (homeGuildId) {
        const knownGuild = await profileService.isKnownGuild(homeGuildId);
        if (!knownGuild) {
          return {
            ok: false,
            error: "INVALID_HOME_GUILD",
            message: "Selected home guild is not known by the bot.",
          };
        }
      }

      let publicDescription = parseOptionalText(body.publicDescription);
      if (publicDescription !== undefined && publicDescription !== null && publicDescription.length > 500) {
        return {
          ok: false,
          error: "INVALID_DESCRIPTION",
          message: "publicDescription must be 500 characters or less.",
        };
      }

      if (publicDescription === "") {
        publicDescription = null;
      }

      const profile = await profileService.updateCurrentUserProfile(request.authUser!.discordId, {
        homeGuildId,
        publicDescription,
      });

      return {
        ok: true,
        profile,
      };
    } catch (error) {
      console.error("[profile/me PATCH] Failed to update profile", error);
      return {
        ok: false,
        error: "PROFILE_UPDATE_FAILED",
        message: "Failed to update profile.",
      };
    }
  });

  app.get("/botshop", { preHandler: requireAuth }, async () => {
    const response = await ItemService.getInstance().listBotShop();
    if (!response.success) {
      return {
        ok: false,
        error: "BOTSHOP_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      listings: response.data,
    };
  });

  app.get("/shop/obs/media/actions", { preHandler: requireAuth }, async request => {
    const query = (request.query ?? {}) as { page?: unknown; pageSize?: unknown };
    const page = parsePositiveInteger(query.page) ?? 1;
    const requestedPageSize = parsePositiveInteger(query.pageSize) ?? 10;
    const pageSize = Math.min(requestedPageSize, 50);

    try {
      const result = await obsMediaActionService.listForCurrentUser(request.authUser!.discordId, {
        page,
        pageSize,
      });

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      return serviceErrorResponse(
        "OBS_MEDIA_ACTIONS_LOAD_FAILED",
        "Failed to load OBS media action history.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/shop/obs/streamers", { preHandler: requireAuth }, async () => {
    try {
      const streamers = await shopObsService.listObsShopStreamers();
      return {
        ok: true,
        streamers,
      };
    } catch (error) {
      return serviceErrorResponse(
        "SHOP_OBS_STREAMERS_LOAD_FAILED",
        "Failed to load OBS shop streamers.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/shop/obs/streamers/:streamerId", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    if (!streamerId) {
      return {
        ok: false,
        error: "INVALID_STREAMER_ID",
        message: "streamerId must be a positive integer.",
      };
    }

    try {
      const streamer = await shopObsService.getObsShopStreamerDetails(streamerId);
      if (!streamer) {
        return {
          ok: false,
          error: "SHOP_OBS_STREAMER_NOT_FOUND",
          message: "Streamer was not found.",
        };
      }

      return {
        ok: true,
        streamer,
        mediaProducts: shopObsService.getObsMediaProducts(),
      };
    } catch (error) {
      return serviceErrorResponse(
        "SHOP_OBS_STREAMER_DETAILS_FAILED",
        "Failed to load OBS streamer details.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/shop/obs/streamers/:streamerId/media/:productId/purchase", { preHandler: requireAuth }, async request => {
    const streamerId = parsePositiveInteger((request.params as { streamerId?: string }).streamerId);
    const productId = parseOptionalText((request.params as { productId?: string }).productId);
    const body = (request.body ?? {}) as { amount?: unknown };
    const parsedAmount = body.amount === undefined ? 1 : parsePositiveInteger(body.amount);

    if (!streamerId) {
      return {
        ok: false,
        error: "OBS_MEDIA_PURCHASE_FAILED",
        message: "streamerId must be a positive integer.",
      };
    }

    if (!productId) {
      return {
        ok: false,
        error: "OBS_MEDIA_PRODUCT_NOT_FOUND",
        message: "productId is required.",
      };
    }

    if (parsedAmount !== 1) {
      return {
        ok: false,
        error: "OBS_MEDIA_PURCHASE_FAILED",
        message: "Only amount=1 is supported for OBS media purchases.",
      };
    }

    try {
      const data = await shopObsService.purchaseObsMedia({
        discordId: request.authUser!.discordId,
        streamerId,
        productId,
        amount: 1,
      });

      return {
        ok: true,
        data,
      };
    } catch (error) {
      if (shopObsService.isPurchaseError(error)) {
        return {
          ok: false,
          error: error.code,
          message: error.message,
        };
      }

      return serviceErrorResponse(
        "OBS_MEDIA_PURCHASE_FAILED",
        "Failed to complete OBS media purchase.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/craft/recipes", { preHandler: requireAuth }, async () => {
    const response = await ItemService.getInstance().listCraftRecipes();
    if (!response.success) {
      return {
        ok: false,
        error: "RECIPES_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      recipes: response.data,
    };
  });

  app.get("/admin/stats", { preHandler: [requireAuth, requireBotContributor] }, async () => {
    const stats = await getBotAdminDashboardStats();
    return {
      ok: true,
      stats,
    };
  });

  app.get("/admin/obs/media/actions", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const query = (request.query ?? {}) as { page?: unknown; pageSize?: unknown; status?: unknown };
    const page = parsePositiveInteger(query.page) ?? 1;
    const requestedPageSize = parsePositiveInteger(query.pageSize) ?? 20;
    const pageSize = Math.min(requestedPageSize, 50);
    const status = parseObsMediaActionStatus(query.status);

    if (status === null) {
      return {
        ok: false,
        error: "INVALID_OBS_MEDIA_ACTION_STATUS",
        message: "status must be pending, sent, failed, or refunded.",
      };
    }

    try {
      const result = await obsMediaActionService.listAdmin({
        page,
        pageSize,
        status,
      });

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      return serviceErrorResponse(
        "ADMIN_OBS_MEDIA_ACTIONS_LOAD_FAILED",
        "Failed to load OBS media action diagnostics.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/admin/notifications/broadcast", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title = parseOptionalText(body.title);
    const message = parseOptionalText(body.body);
    const imageUrl = parseOptionalUrl(body.imageUrl);
    const linkUrl = parseOptionalUrl(body.linkUrl);
    const severity = body.severity ?? "info";

    if (!title) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_TITLE",
        message: "title is required.",
      };
    }

    if (title.length > 160) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_TITLE",
        message: "title must be 160 characters or less.",
      };
    }

    if (!message) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_BODY",
        message: "body is required.",
      };
    }

    if (message.length > 2000) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_BODY",
        message: "body must be 2000 characters or less.",
      };
    }

    if (body.imageUrl !== undefined && body.imageUrl !== null && imageUrl === null) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_IMAGE_URL",
        message: "imageUrl must be a valid URL.",
      };
    }

    if (imageUrl && imageUrl.length > 1000) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_IMAGE_URL",
        message: "imageUrl must be 1000 characters or less.",
      };
    }

    if (body.linkUrl !== undefined && body.linkUrl !== null && linkUrl === null) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_LINK_URL",
        message: "linkUrl must be a valid URL.",
      };
    }

    if (linkUrl && linkUrl.length > 1000) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_LINK_URL",
        message: "linkUrl must be 1000 characters or less.",
      };
    }

    if (!isNotificationSeverity(severity)) {
      return {
        ok: false,
        error: "INVALID_NOTIFICATION_SEVERITY",
        message: "severity must be one of: info, success, warning, danger.",
      };
    }

    try {
      const inserted = await notificationService.broadcastToAllMembers(request.authUser!.discordId, {
        type: "admin_broadcast",
        severity,
        title,
        body: message,
        imageUrl,
        linkUrl,
      });

      return {
        ok: true,
        data: {
          inserted,
        },
      };
    } catch (error) {
      return serviceErrorResponse(
        "ADMIN_BROADCAST_NOTIFICATION_FAILED",
        "Failed to send broadcast notification.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.get("/admin/items", { preHandler: [requireAuth, requireBotAdmin] }, async () => {
    const response = await ItemService.getInstance().listItemTemplates();
    if (!response.success) {
      return serviceErrorResponse("ADMIN_ITEMS_LOAD_FAILED", "Failed to load admin items.", response.error);
    }

    const items = response.data.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      emoji: item.emoji,
      imageUrl: item.image_url,
      tradeable: Boolean(item.tradeable),
      sellable: Boolean(item.sellable),
      botSellPrice: item.bot_sell_price === null ? null : Number(item.bot_sell_price),
      itemType: item.item_type_name,
      rarityName: item.rarity_name,
      rarityColorHex: item.rarity_color_hex,
    }));

    return {
      ok: true,
      items,
    };
  });

  app.post("/admin/items", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.name !== "string" || !body.name.trim().length) {
      return {
        ok: false,
        error: "INVALID_NAME",
        message: "Name is required.",
      };
    }

    if (typeof body.description !== "string" || !body.description.trim().length) {
      return {
        ok: false,
        error: "INVALID_DESCRIPTION",
        message: "Description is required.",
      };
    }

    if (typeof body.rarityName !== "string" || !body.rarityName.trim().length) {
      return {
        ok: false,
        error: "INVALID_RARITY",
        message: "Rarity name is required.",
      };
    }

    if (typeof body.typeName !== "string" || !body.typeName.trim().length) {
      return {
        ok: false,
        error: "INVALID_TYPE",
        message: "Type name is required.",
      };
    }

    if (typeof body.tradeable !== "boolean") {
      return {
        ok: false,
        error: "INVALID_TRADEABLE",
        message: "Tradeable must be boolean.",
      };
    }

    if (body.botSellPrice !== undefined && body.botSellPrice !== null && typeof body.botSellPrice !== "number") {
      return {
        ok: false,
        error: "INVALID_BOT_SELL_PRICE",
        message: "Bot sell price must be a number or null.",
      };
    }

    const response = await ItemService.getInstance().createItemTemplate({
      name: body.name,
      description: body.description,
      emoji: parseOptionalText(body.emoji),
      imageUrl: parseOptionalText(body.imageUrl),
      rarityName: body.rarityName,
      typeName: body.typeName,
      tradeable: body.tradeable,
      botSellPrice: body.botSellPrice === undefined ? null : (body.botSellPrice as number | null),
      createdByDiscordId: request.authUser!.discordId,
    });

    if (!response.success) {
      return serviceErrorResponse("ADMIN_ITEM_CREATE_FAILED", "Failed to create item template.", response.error);
    }

    return {
      ok: true,
      data: {
        itemTemplateId: response.data.insertId,
      },
    };
  });

  app.patch("/admin/items/:itemTemplateId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const itemTemplateId = parsePositiveInteger((request.params as { itemTemplateId?: string }).itemTemplateId);
    if (!itemTemplateId) {
      return {
        ok: false,
        error: "INVALID_ITEM_TEMPLATE_ID",
        message: "Item template id must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.name !== "string" || !body.name.trim().length) {
      return {
        ok: false,
        error: "INVALID_NAME",
        message: "Name is required.",
      };
    }

    if (typeof body.description !== "string" || !body.description.trim().length) {
      return {
        ok: false,
        error: "INVALID_DESCRIPTION",
        message: "Description is required.",
      };
    }

    if (typeof body.rarityName !== "string" || !body.rarityName.trim().length) {
      return {
        ok: false,
        error: "INVALID_RARITY",
        message: "Rarity name is required.",
      };
    }

    if (typeof body.typeName !== "string" || !body.typeName.trim().length) {
      return {
        ok: false,
        error: "INVALID_TYPE",
        message: "Type name is required.",
      };
    }

    if (typeof body.tradeable !== "boolean") {
      return {
        ok: false,
        error: "INVALID_TRADEABLE",
        message: "Tradeable must be boolean.",
      };
    }

    if (body.botSellPrice !== undefined && body.botSellPrice !== null && typeof body.botSellPrice !== "number") {
      return {
        ok: false,
        error: "INVALID_BOT_SELL_PRICE",
        message: "Bot sell price must be a number or null.",
      };
    }

    const response = await ItemService.getInstance().updateItemTemplate(itemTemplateId, {
      name: body.name,
      description: body.description,
      emoji: parseOptionalText(body.emoji),
      imageUrl: parseOptionalText(body.imageUrl),
      rarityName: body.rarityName,
      typeName: body.typeName,
      tradeable: body.tradeable,
      botSellPrice: body.botSellPrice === undefined ? null : (body.botSellPrice as number | null),
    });

    if (!response.success) {
      return serviceErrorResponse("ADMIN_ITEM_UPDATE_FAILED", "Failed to update item template.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  app.delete("/admin/items/:itemTemplateId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const itemTemplateId = parsePositiveInteger((request.params as { itemTemplateId?: string }).itemTemplateId);
    if (!itemTemplateId) {
      return {
        ok: false,
        error: "INVALID_ITEM_TEMPLATE_ID",
        message: "Item template id must be a positive integer.",
      };
    }

    const response = await ItemService.getInstance().deleteItemTemplate(itemTemplateId);
    if (!response.success) {
      return serviceErrorResponse("ADMIN_ITEM_DELETE_FAILED", "Failed to delete item template.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  app.get("/admin/item-rarities", { preHandler: [requireAuth, requireBotAdmin] }, async () => {
    const response = await ItemService.getInstance().listRarities();
    if (!response.success) {
      return serviceErrorResponse("ADMIN_RARITIES_LOAD_FAILED", "Failed to load item rarities.", response.error);
    }

    return {
      ok: true,
      rarities: response.data,
    };
  });

  app.get("/admin/search/item-types", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const query = typeof (request.query as { q?: unknown }).q === "string" ? (request.query as { q?: string }).q! : "";
    const response = await ItemService.getInstance().searchItemTypes(query.trim());
    if (!response.success) {
      return serviceErrorResponse("ADMIN_ITEM_TYPES_SEARCH_FAILED", "Failed to search item types.", response.error);
    }

    return {
      ok: true,
      options: response.data,
    };
  });

  app.get("/admin/search/item-templates", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const query = typeof (request.query as { q?: unknown }).q === "string" ? (request.query as { q?: string }).q! : "";
    const response = await ItemService.getInstance().searchItemTemplates(query.trim());
    if (!response.success) {
      return serviceErrorResponse("ADMIN_ITEM_TEMPLATES_SEARCH_FAILED", "Failed to search item templates.", response.error);
    }

    return {
      ok: true,
      options: response.data,
    };
  });

  app.get("/admin/search/rarities", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const query = typeof (request.query as { q?: unknown }).q === "string" ? (request.query as { q?: string }).q! : "";
    const response = await ItemService.getInstance().searchRarities(query.trim());
    if (!response.success) {
      return serviceErrorResponse("ADMIN_RARITIES_SEARCH_FAILED", "Failed to search rarities.", response.error);
    }

    return {
      ok: true,
      options: response.data,
    };
  });

  app.get("/admin/botshop", { preHandler: [requireAuth, requireBotAdmin] }, async () => {
    const response = await ItemService.getInstance().listBotShop();
    if (!response.success) {
      return serviceErrorResponse("ADMIN_BOTSHOP_LOAD_FAILED", "Failed to load bot shop listings.", response.error);
    }

    return {
      ok: true,
      listings: response.data,
    };
  });

  app.post("/admin/botshop", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const itemTemplateId = parsePositiveInteger(body.itemTemplateId);
    if (!itemTemplateId) {
      return {
        ok: false,
        error: "INVALID_ITEM_TEMPLATE_ID",
        message: "itemTemplateId must be a positive integer.",
      };
    }

    if (!isPositivePrice(body.price)) {
      return {
        ok: false,
        error: "INVALID_PRICE",
        message: "Price must be greater than 0.",
      };
    }

    const response = await ItemService.getInstance().addOrUpdateBotShopListing(itemTemplateId, body.price);
    if (!response.success) {
      return serviceErrorResponse("ADMIN_BOTSHOP_UPSERT_FAILED", "Failed to add or update bot shop listing.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  app.delete("/admin/botshop/:listingId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const listingId = parsePositiveInteger((request.params as { listingId?: string }).listingId);
    if (!listingId) {
      return {
        ok: false,
        error: "INVALID_LISTING_ID",
        message: "listingId must be a positive integer.",
      };
    }

    const response = await ItemService.getInstance().deleteBotShopListing(listingId);
    if (!response.success) {
      return serviceErrorResponse("ADMIN_BOTSHOP_DELETE_FAILED", "Failed to delete bot shop listing.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  app.get("/admin/craft/recipes", { preHandler: [requireAuth, requireBotAdmin] }, async () => {
    const response = await ItemService.getInstance().listCraftRecipes();
    if (!response.success) {
      return serviceErrorResponse("ADMIN_CRAFT_RECIPES_LOAD_FAILED", "Failed to load craft recipes.", response.error);
    }

    return {
      ok: true,
      recipes: response.data,
    };
  });

  app.post("/admin/craft/recipes", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const resultItemTemplateId = parsePositiveInteger(body.resultItemTemplateId);
    const resultAmount = parsePositiveInteger(body.resultAmount);
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : null;

    if (typeof body.name !== "string" || !body.name.trim().length) {
      return {
        ok: false,
        error: "INVALID_NAME",
        message: "Recipe name is required.",
      };
    }

    if (!resultItemTemplateId) {
      return {
        ok: false,
        error: "INVALID_RESULT_ITEM_TEMPLATE_ID",
        message: "resultItemTemplateId must be a positive integer.",
      };
    }

    if (!resultAmount) {
      return {
        ok: false,
        error: "INVALID_RESULT_AMOUNT",
        message: "resultAmount must be a positive integer.",
      };
    }

    if (!ingredients || !ingredients.length) {
      return {
        ok: false,
        error: "INVALID_INGREDIENTS",
        message: "ingredients must contain at least one entry.",
      };
    }

    const normalizedIngredients = ingredients.map(ingredient => ({
      itemTemplateId: parsePositiveInteger((ingredient as Record<string, unknown>).itemTemplateId),
      amount: parsePositiveInteger((ingredient as Record<string, unknown>).amount),
    }));

    if (normalizedIngredients.some(ingredient => !ingredient.itemTemplateId || !ingredient.amount)) {
      return {
        ok: false,
        error: "INVALID_INGREDIENTS",
        message: "Each ingredient requires positive integer itemTemplateId and amount.",
      };
    }

    const response = await ItemService.getInstance().createCraftRecipe({
      name: body.name,
      description: parseOptionalText(body.description),
      resultItemTemplateId,
      resultAmount,
      ingredients: normalizedIngredients as Array<{ itemTemplateId: number; amount: number }>,
      createdByDiscordId: request.authUser!.discordId,
    });

    if (!response.success) {
      return serviceErrorResponse("ADMIN_CRAFT_RECIPE_CREATE_FAILED", "Failed to create craft recipe.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  app.patch("/admin/craft/recipes/:recipeId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const recipeId = parsePositiveInteger((request.params as { recipeId?: string }).recipeId);
    if (!recipeId) {
      return {
        ok: false,
        error: "INVALID_RECIPE_ID",
        message: "recipeId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const resultItemTemplateId = parsePositiveInteger(body.resultItemTemplateId);
    const resultAmount = parsePositiveInteger(body.resultAmount);
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : null;

    if (typeof body.name !== "string" || !body.name.trim().length) {
      return {
        ok: false,
        error: "INVALID_NAME",
        message: "Recipe name is required.",
      };
    }

    if (!resultItemTemplateId) {
      return {
        ok: false,
        error: "INVALID_RESULT_ITEM_TEMPLATE_ID",
        message: "resultItemTemplateId must be a positive integer.",
      };
    }

    if (!resultAmount) {
      return {
        ok: false,
        error: "INVALID_RESULT_AMOUNT",
        message: "resultAmount must be a positive integer.",
      };
    }

    if (!ingredients || !ingredients.length) {
      return {
        ok: false,
        error: "INVALID_INGREDIENTS",
        message: "ingredients must contain at least one entry.",
      };
    }

    const normalizedIngredients = ingredients.map(ingredient => ({
      itemTemplateId: parsePositiveInteger((ingredient as Record<string, unknown>).itemTemplateId),
      amount: parsePositiveInteger((ingredient as Record<string, unknown>).amount),
    }));

    if (normalizedIngredients.some(ingredient => !ingredient.itemTemplateId || !ingredient.amount)) {
      return {
        ok: false,
        error: "INVALID_INGREDIENTS",
        message: "Each ingredient requires positive integer itemTemplateId and amount.",
      };
    }

    const response = await ItemService.getInstance().updateCraftRecipe(recipeId, {
      name: body.name,
      description: parseOptionalText(body.description),
      resultItemTemplateId,
      resultAmount,
      ingredients: normalizedIngredients as Array<{ itemTemplateId: number; amount: number }>,
    });

    if (!response.success) {
      return serviceErrorResponse("ADMIN_CRAFT_RECIPE_UPDATE_FAILED", "Failed to update craft recipe.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  app.delete("/admin/craft/recipes/:recipeId", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const recipeId = parsePositiveInteger((request.params as { recipeId?: string }).recipeId);
    if (!recipeId) {
      return {
        ok: false,
        error: "INVALID_RECIPE_ID",
        message: "recipeId must be a positive integer.",
      };
    }

    const response = await ItemService.getInstance().deleteCraftRecipe(recipeId);
    if (!response.success) {
      return serviceErrorResponse("ADMIN_CRAFT_RECIPE_DELETE_FAILED", "Failed to delete craft recipe.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  // ── Economy ─────────────────────────────────────────────────────────────────

  app.get("/economy/me", { preHandler: requireAuth }, async request => {
    try {
      const member = await ItemService.getInstance().ensureMemberByDiscordId(request.authUser!.discordId);
      return {
        ok: true,
        balance: {
          odm: Number(member.data.balance),
          ldm: Number(member.data.ldm_balance),
        },
      };
    } catch (error) {
      return serviceErrorResponse(
        "ECONOMY_LOAD_FAILED",
        "Failed to load balance.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  app.post("/admin/economy/adjust", { preHandler: [requireAuth, requireBotAdmin] }, async request => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetDiscordId = parseOptionalText(body.targetDiscordId);
    const currency = parseOptionalText(body.currency);
    const amount = parseInteger(body.amount);
    const reason = parseOptionalText(body.reason);

    if (!targetDiscordId || !/^\d{1,32}$/.test(targetDiscordId)) {
      return {
        ok: false,
        error: "INVALID_TARGET_DISCORD_ID",
        message: "targetDiscordId must contain digits only and be at most 32 characters.",
      };
    }

    if (currency !== "ODM" && currency !== "LDM") {
      return {
        ok: false,
        error: "INVALID_CURRENCY",
        message: "currency must be ODM or LDM.",
      };
    }

    if (amount === null || amount === 0 || Math.abs(amount) > 1_000_000) {
      return {
        ok: false,
        error: "INVALID_AMOUNT",
        message: "amount must be a non-zero integer with absolute value up to 1000000.",
      };
    }

    if (!reason || reason.length < 3 || reason.length > 300) {
      return {
        ok: false,
        error: "INVALID_REASON",
        message: "reason must be between 3 and 300 characters.",
      };
    }

    try {
      const data = await EconomyService.getInstance().adjustMemberBalanceByAdmin({
        adminDiscordId: request.authUser!.discordId,
        targetDiscordId,
        currency,
        amount,
        reason,
      });

      return {
        ok: true,
        data,
      };
    } catch (error) {
      if (EconomyService.getInstance().isAdminAdjustmentError(error)) {
        return {
          ok: false,
          error: error.code,
          message: error.message,
        };
      }

      return serviceErrorResponse(
        "BALANCE_ADJUST_FAILED",
        "Failed to adjust balance.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  // ── Bot Shop purchase ────────────────────────────────────────────────────────

  app.post("/botshop/:listingId/buy", { preHandler: requireAuth }, async request => {
    const listingId = parsePositiveInteger((request.params as { listingId?: string }).listingId);
    if (!listingId) {
      return {
        ok: false,
        error: "INVALID_LISTING_ID",
        message: "listingId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawAmount = body.amount ?? 1;
    const amount = parsePositiveInteger(rawAmount);
    if (!amount) {
      return {
        ok: false,
        error: "INVALID_AMOUNT",
        message: "Amount must be a positive integer.",
      };
    }

    const response = await ItemService.getInstance().buyFromBotShop(request.authUser!.discordId, listingId, amount);
    if (!response.success) {
      return serviceErrorResponse("BOTSHOP_BUY_FAILED", "Purchase failed.", response.error);
    }

    return {
      ok: true,
      data: {
        inserted: response.data.inserted,
        listingId,
      },
    };
  });
}
