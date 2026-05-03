import { FastifyInstance } from "fastify";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { ItemService } from "../../core/ItemService.js";
import { JobService } from "../../core/JobService.js";
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
import pool from "../../db.js";
import { registerStreamerStudioRoutes } from "./dashboard/streamerStudioRoutes.js";
import { registerStreamerApplicationRoutes } from "./dashboard/streamerApplicationRoutes.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireBotContributor } from "../middleware/requireBotContributor.js";
import { requireBotAdmin } from "../middleware/requireBotAdmin.js";

type ServiceError = {
  message?: string;
};

// ... (rest of the code remains the same)

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  const notificationService = NotificationService.getInstance();
  const shopObsService = ShopObsService.getInstance();
  const obsMediaActionService = ObsMediaActionService.getInstance();
  const jobService = JobService.getInstance();
  const guildDashboardService = GuildDashboardService.getInstance();
  const streamerAccessService = StreamerAccessService.getInstance();

  await registerStreamerStudioRoutes(app);
  await registerStreamerApplicationRoutes(app);

  // ... (rest of the code remains the same)

  app.post("/craft/:recipeId/craft", { preHandler: requireAuth }, async request => {
    const recipeId = parsePositiveInteger((request.params as { recipeId?: string }).recipeId);
    if (!recipeId) {
      return {
        ok: false,
        error: "INVALID_RECIPE_ID",
        message: "recipeId must be a positive integer.",
      };
    }

    const itemService = ItemService.getInstance() as ItemService & {
      executeCraft: (discordUserId: string, recipeId: number, craftCount: number) => Promise<{
        success: boolean;
        data?: { crafted: number; resultItemTemplateId: number; resultAmount: number };
        error?: { reason?: string; relatedTo?: string; message?: string };
      }>;
    };

    const response = await itemService.executeCraft(request.authUser!.discordId, recipeId, 1);
    if (!response.success) {
      return itemMutationErrorResponse("CRAFT_EXECUTION_FAILED", "Failed to craft recipe.", response.error);
    }

    return {
      ok: true,
      data: response.data,
    };
  });

  app.get("/jobs", { preHandler: requireAuth }, async () => {
    try {
      const jobs = await jobService.listJobs();
      return {
        ok: true,
        jobs,
      };
    } catch (error) {
      return serviceErrorResponse(
        "JOBS_LOAD_FAILED",
        "Failed to load jobs.",
        error instanceof Error ? error : undefined,
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
      if (jobService.isJobServiceError(error)) {
        return {
          ok: false,
          error: error.code,
          message: error.message,
          details: error.details ?? null,
        };
      }

      return serviceErrorResponse(
        "JOB_RUN_FAILED",
        "Failed to run job.",
        error instanceof Error ? error : undefined,
      );
    }
  });

  // ... (rest of the code remains the same)
}
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
