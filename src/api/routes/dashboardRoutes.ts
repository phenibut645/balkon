import { FastifyInstance } from "fastify";
import { ItemService } from "../../core/ItemService.js";
import { EconomyService } from "../../core/EconomyService.js";
import { UserProfileService } from "../../core/UserProfileService.js";
import { getBotAdminDashboardStats } from "../../core/BotAdmin.js";
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

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
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
    } catch {
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
