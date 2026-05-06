import { FastifyInstance } from "fastify";
import { ItemService } from "../../../core/ItemService.js";
import { StreamerAccessService } from "../../../core/StreamerAccessService.js";
import { streamerService } from "../../../core/StreamerService.js";
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

function serviceErrorResponse(defaultCode: string, defaultMessage: string, error?: ServiceError) {
  return {
    ok: false,
    error: defaultCode,
    message: error?.message || defaultMessage,
  };
}

export async function registerInventoryRoutes(app: FastifyInstance): Promise<void> {
  const streamerAccessService = StreamerAccessService.getInstance();

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
}