import { FastifyInstance } from "fastify";
import { EconomyService } from "../../../core/EconomyService.js";
import { ItemService } from "../../../core/ItemService.js";
import { UserProfileService } from "../../../core/UserProfileService.js";
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

  if (error.relatedTo === "members" && message === "Not enough ODM balance.") {
    return {
      ok: false,
      error: "NOT_ENOUGH_ODM",
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

export async function registerMarketRoutes(app: FastifyInstance): Promise<void> {
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
}