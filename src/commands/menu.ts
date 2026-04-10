import {
    ActionRowBuilder,
    ButtonInteraction,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ModalSubmitInteraction,
    ModalBuilder,
    SlashCommandBuilder,
    StringSelectMenuInteraction,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuInteraction,
    UserSelectMenuBuilder,
} from "discord.js";
import { DEVELOPER_DISCORD_ID } from "../config.js";
import { canViewForeignInventory, getBotAdminDashboardStats, getBotContributorIds, getFounderDashboardStats, isBotAdmin, isBotContributor, isBotOwner, isGuildFounder, updateBotContributor } from "../core/BotAdmin.js";
import { dataBaseHandler, DataBaseHandler } from "../core/DataBaseHandler.js";
import { localeService } from "../core/LocaleService.js";
import { ObsMediaAction, obsService } from "../core/ObsService.js";
import { streamerService } from "../core/StreamerService.js";
import { BotShopListingView, CraftRecipeView, InventoryItemView, ItemRarityView, ItemTemplateView, itemService, PublicMarketListingView } from "../core/ItemService.js";
import { commandSessionHandler } from "../core/commands/CommandSessionHandler.js";
import { Command } from "../core/commands/Command.js";
import { CommandDTO } from "../dto/CommandDTO.js";
import { CommandAccessLevels, MembersDB } from "../types/database.types.js";
import { LocalesCodes, supportedLocales } from "../types/locales.type.js";
import { ButtonExecutionFunc, CommandName, ModalsExecutionFunc, StringSelectMenuExecutionFunc, UserSelectMenuExecutionFunc } from "../types/command.type.js";
import { t } from "../utils/i18n.js";

type MenuScreen = "home" | "economy" | "collection" | "profile" | "admin" | "contributors" | "founder" | "admin_items" | "admin_rarities" | "balance" | "inventory" | "craft" | "market" | "botshop" | "obs";
type MarketFilter = "all" | "own" | "foreign";
type MenuComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction;

interface MenuSessionState {
    screen: MenuScreen;
    inventoryPage: number;
    craftPage: number;
    marketPage: number;
    botshopPage: number;
    adminItemsPage: number;
    adminRaritiesPage: number;
    marketFilter: MarketFilter;
    guildId?: string;
    inventoryTargetUserId: string;
    selectedContributorUserId?: string;
    selectedObsSceneName?: string;
    selectedObsSourceName?: string;
    selectedAdminItemTemplateId?: number;
    selectedAdminRarityId?: number;
    selectedInventoryItemId?: number;
    selectedCraftRecipeId?: number;
    selectedMarketListingId?: number;
    selectedBotshopListingId?: number;
    selectedMarketInventoryItemId?: number;
}

const PAGE_SIZE = 6;

export default class MenuCommand extends Command {
    commandName: CommandName = "menu";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Open the main interaction menu.");

    buttons = new Map<string, ButtonExecutionFunc>();
    stringSelectMenu = new Map<string, StringSelectMenuExecutionFunc>();
    userSelectMenu = new Map<string, UserSelectMenuExecutionFunc>();
    modals = new Map<string, ModalsExecutionFunc>();

    private readonly homeButton = new CommandDTO(this.commandName, "home");
    private readonly economyButton = new CommandDTO(this.commandName, "economy");
    private readonly collectionButton = new CommandDTO(this.commandName, "collection");
    private readonly profileButton = new CommandDTO(this.commandName, "profile");
    private readonly adminCategoryButton = new CommandDTO(this.commandName, "admin_category");
    private readonly balanceButton = new CommandDTO(this.commandName, "balance");
    private readonly inventoryButton = new CommandDTO(this.commandName, "inventory");
    private readonly craftButton = new CommandDTO(this.commandName, "craft");
    private readonly marketButton = new CommandDTO(this.commandName, "market");
    private readonly botShopButton = new CommandDTO(this.commandName, "botshop");
    private readonly adminButton = new CommandDTO(this.commandName, "admin");
    private readonly contributorsButton = new CommandDTO(this.commandName, "contributors");
    private readonly founderButton = new CommandDTO(this.commandName, "founder");
    private readonly adminItemsButton = new CommandDTO(this.commandName, "admin_items");
    private readonly adminRaritiesButton = new CommandDTO(this.commandName, "admin_rarities");
    private readonly obsButton = new CommandDTO(this.commandName, "obs");
    private readonly obsStatusButton = new CommandDTO(this.commandName, "obs_status");
    private readonly obsScenesButton = new CommandDTO(this.commandName, "obs_scenes");
    private readonly obsReconnectButton = new CommandDTO(this.commandName, "obs_reconnect");
    private readonly obsConfigShowButton = new CommandDTO(this.commandName, "obs_config_show");
    private readonly obsConfigSetButton = new CommandDTO(this.commandName, "obs_config_set");
    private readonly obsConfigClearButton = new CommandDTO(this.commandName, "obs_config_clear");
    private readonly obsSwitchSceneButton = new CommandDTO(this.commandName, "obs_switch_scene");
    private readonly obsShowSourceButton = new CommandDTO(this.commandName, "obs_show_source");
    private readonly obsHideSourceButton = new CommandDTO(this.commandName, "obs_hide_source");
    private readonly obsSetTextButton = new CommandDTO(this.commandName, "obs_set_text");
    private readonly obsMediaActionButton = new CommandDTO(this.commandName, "obs_media_action");
    private readonly prevPageButton = new CommandDTO(this.commandName, "page_prev");
    private readonly nextPageButton = new CommandDTO(this.commandName, "page_next");
    private readonly refreshButton = new CommandDTO(this.commandName, "refresh");
    private readonly sellInventoryButton = new CommandDTO(this.commandName, "inventory_sell_bot");
    private readonly inventoryListMarketButton = new CommandDTO(this.commandName, "inventory_list_market");
    private readonly craftSelectedButton = new CommandDTO(this.commandName, "craft_execute");
    private readonly buyMarketButton = new CommandDTO(this.commandName, "market_buy_selected");
    private readonly listMarketButton = new CommandDTO(this.commandName, "market_list_selected");
    private readonly cancelMarketButton = new CommandDTO(this.commandName, "market_cancel_selected");
    private readonly editMarketPriceButton = new CommandDTO(this.commandName, "market_edit_price");
    private readonly cycleMarketFilterButton = new CommandDTO(this.commandName, "market_cycle_filter");
    private readonly buyBotshopButton = new CommandDTO(this.commandName, "botshop_buy_selected");
    private readonly contributorAddButton = new CommandDTO(this.commandName, "contributors_add");
    private readonly contributorRemoveButton = new CommandDTO(this.commandName, "contributors_remove");
    private readonly adminCreateItemButton = new CommandDTO(this.commandName, "admin_create_item");
    private readonly adminEditItemButton = new CommandDTO(this.commandName, "admin_edit_item");
    private readonly adminDeleteItemButton = new CommandDTO(this.commandName, "admin_delete_item");
    private readonly adminCreateRarityButton = new CommandDTO(this.commandName, "admin_create_rarity");
    private readonly adminEditRarityButton = new CommandDTO(this.commandName, "admin_edit_rarity");
    private readonly adminDeleteRarityButton = new CommandDTO(this.commandName, "admin_delete_rarity");
    private readonly localeSelect = new CommandDTO(this.commandName, "locale_select");
    private readonly inventoryUserSelect = new CommandDTO(this.commandName, "inventory_user_select");
    private readonly contributorUserSelect = new CommandDTO(this.commandName, "contributor_user_select");
    private readonly obsSceneSelect = new CommandDTO(this.commandName, "obs_scene_select");
    private readonly obsSourceSelect = new CommandDTO(this.commandName, "obs_source_select");
    private readonly inventorySelect = new CommandDTO(this.commandName, "inventory_select");
    private readonly adminItemSelect = new CommandDTO(this.commandName, "admin_item_select");
    private readonly adminRaritySelect = new CommandDTO(this.commandName, "admin_rarity_select");
    private readonly craftSelect = new CommandDTO(this.commandName, "craft_select");
    private readonly marketSelect = new CommandDTO(this.commandName, "market_select");
    private readonly ownMarketSelect = new CommandDTO(this.commandName, "market_own_select");
    private readonly marketInventorySelect = new CommandDTO(this.commandName, "market_inventory_select");
    private readonly botshopSelect = new CommandDTO(this.commandName, "botshop_select");
    private readonly marketPriceModal = new CommandDTO(this.commandName, "market_price_modal");
    private readonly marketEditPriceModal = new CommandDTO(this.commandName, "market_edit_price_modal");
    private readonly adminItemCreateModal = new CommandDTO(this.commandName, "admin_item_create_modal");
    private readonly adminItemEditModal = new CommandDTO(this.commandName, "admin_item_edit_modal");
    private readonly adminRarityCreateModal = new CommandDTO(this.commandName, "admin_rarity_create_modal");
    private readonly adminRarityEditModal = new CommandDTO(this.commandName, "admin_rarity_edit_modal");
    private readonly obsConfigModal = new CommandDTO(this.commandName, "obs_config_modal");
    private readonly obsTextModal = new CommandDTO(this.commandName, "obs_text_modal");
    private readonly obsMediaActionModal = new CommandDTO(this.commandName, "obs_media_action_modal");
    private readonly craftAmountModal = new CommandDTO(this.commandName, "craft_amount_modal");
    private readonly botshopAmountModal = new CommandDTO(this.commandName, "botshop_amount_modal");

    constructor() {
        super();
        this.buttons.set(this.homeButton.toString(), this.showHome);
        this.buttons.set(this.economyButton.toString(), this.showEconomy);
        this.buttons.set(this.collectionButton.toString(), this.showCollection);
        this.buttons.set(this.profileButton.toString(), this.showProfile);
        this.buttons.set(this.adminCategoryButton.toString(), this.showAdminCategory);
        this.buttons.set(this.balanceButton.toString(), this.showBalance);
        this.buttons.set(this.inventoryButton.toString(), this.showInventory);
        this.buttons.set(this.craftButton.toString(), this.showCraft);
        this.buttons.set(this.marketButton.toString(), this.showMarket);
        this.buttons.set(this.botShopButton.toString(), this.showBotShop);
        this.buttons.set(this.adminButton.toString(), this.showAdmin);
        this.buttons.set(this.contributorsButton.toString(), this.showContributors);
        this.buttons.set(this.founderButton.toString(), this.showFounder);
        this.buttons.set(this.adminItemsButton.toString(), this.showAdminItems);
        this.buttons.set(this.adminRaritiesButton.toString(), this.showAdminRarities);
        this.buttons.set(this.obsButton.toString(), this.showObs);
        this.buttons.set(this.obsStatusButton.toString(), this.refreshObsStatus);
        this.buttons.set(this.obsScenesButton.toString(), this.refreshObsScenes);
        this.buttons.set(this.obsReconnectButton.toString(), this.reconnectObs);
        this.buttons.set(this.obsConfigShowButton.toString(), this.showObsConfig);
        this.buttons.set(this.obsConfigSetButton.toString(), this.openObsConfigModal);
        this.buttons.set(this.obsConfigClearButton.toString(), this.clearObsConfig);
        this.buttons.set(this.obsSwitchSceneButton.toString(), this.switchObsScene);
        this.buttons.set(this.obsShowSourceButton.toString(), this.showObsSource);
        this.buttons.set(this.obsHideSourceButton.toString(), this.hideObsSource);
        this.buttons.set(this.obsSetTextButton.toString(), this.openObsTextModal);
        this.buttons.set(this.obsMediaActionButton.toString(), this.openObsMediaActionModal);
        this.buttons.set(this.prevPageButton.toString(), this.prevPage);
        this.buttons.set(this.nextPageButton.toString(), this.nextPage);
        this.buttons.set(this.refreshButton.toString(), this.refreshScreen);
        this.buttons.set(this.sellInventoryButton.toString(), this.sellSelectedInventoryItem);
        this.buttons.set(this.inventoryListMarketButton.toString(), this.openInventoryListMarketModal);
        this.buttons.set(this.craftSelectedButton.toString(), this.openCraftAmountModal);
        this.buttons.set(this.buyMarketButton.toString(), this.buySelectedMarketListing);
        this.buttons.set(this.listMarketButton.toString(), this.openListMarketModal);
        this.buttons.set(this.cancelMarketButton.toString(), this.cancelSelectedMarketListing);
        this.buttons.set(this.editMarketPriceButton.toString(), this.openEditMarketPriceModal);
        this.buttons.set(this.cycleMarketFilterButton.toString(), this.cycleMarketFilter);
        this.buttons.set(this.buyBotshopButton.toString(), this.openBotshopAmountModal);
        this.buttons.set(this.contributorAddButton.toString(), this.addContributor);
        this.buttons.set(this.contributorRemoveButton.toString(), this.removeContributor);
        this.buttons.set(this.adminCreateItemButton.toString(), this.openCreateItemModal);
        this.buttons.set(this.adminEditItemButton.toString(), this.openEditItemModal);
        this.buttons.set(this.adminDeleteItemButton.toString(), this.deleteSelectedItemTemplate);
        this.buttons.set(this.adminCreateRarityButton.toString(), this.openCreateRarityModal);
        this.buttons.set(this.adminEditRarityButton.toString(), this.openEditRarityModal);
        this.buttons.set(this.adminDeleteRarityButton.toString(), this.deleteSelectedRarity);
        this.stringSelectMenu.set(this.localeSelect.toString(), this.selectLocale);
        this.stringSelectMenu.set(this.obsSceneSelect.toString(), this.selectObsScene);
        this.stringSelectMenu.set(this.obsSourceSelect.toString(), this.selectObsSource);
        this.stringSelectMenu.set(this.inventorySelect.toString(), this.selectInventoryItem);
        this.stringSelectMenu.set(this.adminItemSelect.toString(), this.selectAdminItemTemplate);
        this.stringSelectMenu.set(this.adminRaritySelect.toString(), this.selectAdminRarity);
        this.stringSelectMenu.set(this.craftSelect.toString(), this.selectCraftRecipe);
        this.stringSelectMenu.set(this.marketSelect.toString(), this.selectMarketListing);
        this.stringSelectMenu.set(this.ownMarketSelect.toString(), this.selectOwnMarketListing);
        this.stringSelectMenu.set(this.marketInventorySelect.toString(), this.selectMarketInventoryItem);
        this.stringSelectMenu.set(this.botshopSelect.toString(), this.selectBotshopListing);
        this.userSelectMenu.set(this.inventoryUserSelect.toString(), this.selectInventoryUser);
        this.userSelectMenu.set(this.contributorUserSelect.toString(), this.selectContributorUser);
        this.modals.set(this.marketPriceModal.toString(), this.submitListMarketModal);
        this.modals.set(this.marketEditPriceModal.toString(), this.submitEditMarketPriceModal);
        this.modals.set(this.adminItemCreateModal.toString(), this.submitCreateItemModal);
        this.modals.set(this.adminItemEditModal.toString(), this.submitEditItemModal);
        this.modals.set(this.adminRarityCreateModal.toString(), this.submitCreateRarityModal);
        this.modals.set(this.adminRarityEditModal.toString(), this.submitEditRarityModal);
        this.modals.set(this.obsConfigModal.toString(), this.submitObsConfigModal);
        this.modals.set(this.obsTextModal.toString(), this.submitObsTextModal);
        this.modals.set(this.obsMediaActionModal.toString(), this.submitObsMediaActionModal);
        this.modals.set(this.craftAmountModal.toString(), this.submitCraftAmountModal);
        this.modals.set(this.botshopAmountModal.toString(), this.submitBotshopAmountModal);
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.createDefaultSession(interaction.user.id, interaction.guildId ?? undefined);
        this.persistSession(interaction.user.id, state);
        await interaction.reply({
            ...(await this.renderState(interaction.user.id, locale, state)),
            flags: ["Ephemeral"],
        });
    }

    private showHome: ButtonExecutionFunc = async (interaction) => {
        await this.setScreenAndRender(interaction.user.id, interaction, "home");
    };

    private showEconomy: ButtonExecutionFunc = async (interaction) => {
        await this.setScreenAndRender(interaction.user.id, interaction, "economy");
    };

    private showCollection: ButtonExecutionFunc = async (interaction) => {
        await this.setScreenAndRender(interaction.user.id, interaction, "collection");
    };

    private showProfile: ButtonExecutionFunc = async (interaction) => {
        await this.setScreenAndRender(interaction.user.id, interaction, "profile");
    };

    private showAdminCategory: ButtonExecutionFunc = async (interaction) => {
        if (!await isBotContributor(interaction.user.id)) {
            const locale = await this.getLocale(interaction.user.id);
            await interaction.reply({ content: t(locale, "menu.messages.admin_only"), flags: ["Ephemeral"] });
            return;
        }

        await this.setScreenAndRender(interaction.user.id, interaction, "admin");
    };

    private showBalance: ButtonExecutionFunc = async (interaction) => {
        await this.setScreenAndRender(interaction.user.id, interaction, "balance");
    };

    private showInventory: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.screen = "inventory";
        state.inventoryPage = 0;
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private showCraft: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.screen = "craft";
        state.craftPage = 0;
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private showMarket: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.screen = "market";
        state.marketPage = 0;
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private cycleMarketFilter: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.marketFilter = state.marketFilter === "all"
            ? "own"
            : state.marketFilter === "own"
                ? "foreign"
                : "all";
        state.marketPage = 0;
        state.selectedMarketListingId = undefined;
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private showBotShop: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.screen = "botshop";
        state.botshopPage = 0;
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private showAdmin: ButtonExecutionFunc = async (interaction) => {
        if (!await isBotContributor(interaction.user.id)) {
            const locale = await this.getLocale(interaction.user.id);
            await interaction.reply({ content: t(locale, "menu.messages.admin_only"), flags: ["Ephemeral"] });
            return;
        }

        await this.setScreenAndRender(interaction.user.id, interaction, "admin");
    };

    private showContributors: ButtonExecutionFunc = async (interaction) => {
        if (!await isBotContributor(interaction.user.id)) {
            const locale = await this.getLocale(interaction.user.id);
            await interaction.reply({ content: t(locale, "menu.messages.admin_only"), flags: ["Ephemeral"] });
            return;
        }

        await this.setScreenAndRender(interaction.user.id, interaction, "contributors");
    };

    private showFounder: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!await isGuildFounder(interaction.user.id, state.guildId)) {
            await interaction.reply({ content: t(locale, "menu.messages.founder_only"), flags: ["Ephemeral"] });
            return;
        }

        await this.setScreenAndRender(interaction.user.id, interaction, "founder");
    };

    private showAdminItems: ButtonExecutionFunc = async (interaction) => {
        if (!await isBotContributor(interaction.user.id)) {
            const locale = await this.getLocale(interaction.user.id);
            await interaction.reply({ content: t(locale, "menu.messages.admin_only"), flags: ["Ephemeral"] });
            return;
        }

        const state = this.readSession(interaction.user.id);
        state.screen = "admin_items";
        state.adminItemsPage = 0;
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private showAdminRarities: ButtonExecutionFunc = async (interaction) => {
        if (!await isBotContributor(interaction.user.id)) {
            const locale = await this.getLocale(interaction.user.id);
            await interaction.reply({ content: t(locale, "menu.messages.admin_only"), flags: ["Ephemeral"] });
            return;
        }

        const state = this.readSession(interaction.user.id);
        state.screen = "admin_rarities";
        state.adminRaritiesPage = 0;
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private showObs: ButtonExecutionFunc = async (interaction) => {
        if (!await isBotContributor(interaction.user.id)) {
            const locale = await this.getLocale(interaction.user.id);
            await interaction.reply({ content: t(locale, "menu.messages.obs_only"), flags: ["Ephemeral"] });
            return;
        }

        await this.setScreenAndRender(interaction.user.id, interaction, "obs");
    };

    private prevPage: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        this.shiftPage(state, -1);
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private nextPage: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        this.shiftPage(state, 1);
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private refreshScreen: ButtonExecutionFunc = async (interaction) => {
        await this.updateRendered(interaction.user.id, interaction, this.readSession(interaction.user.id));
    };

    private selectLocale: StringSelectMenuExecutionFunc = async (interaction) => {
        const nextLocale = interaction.values[0];
        const response = await localeService.setMemberLocale(interaction.user.id, nextLocale);
        const locale = response.success ? response.data : await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "menu.messages.locale_updated", {
            locale: t(locale, `menu.locale_names.${locale}`),
        })));
    };

    private selectInventoryUser: UserSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const selectedUserId = interaction.values[0];
        const locale = await this.getLocale(interaction.user.id);

        if (!canViewForeignInventory(interaction.user.id, interaction.users.first() ?? interaction.user)) {
            await interaction.reply({ content: t(locale, "menu.messages.inventory_user_forbidden"), flags: ["Ephemeral"] });
            return;
        }

        state.inventoryTargetUserId = selectedUserId;
        state.inventoryPage = 0;
        state.screen = "inventory";
        state.selectedInventoryItemId = undefined;
        this.persistSession(interaction.user.id, state);
        await this.updateComponentReply(interaction, () => this.renderInventory(interaction.user.id, locale, state));
    };

    private selectContributorUser: UserSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedContributorUserId = interaction.values[0];
        state.screen = "contributors";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectObsScene: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedObsSceneName = interaction.values[0];
        state.selectedObsSourceName = undefined;
        state.screen = "obs";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectObsSource: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedObsSourceName = interaction.values[0];
        state.screen = "obs";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectInventoryItem: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedInventoryItemId = Number(interaction.values[0]);
        state.screen = "inventory";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectAdminItemTemplate: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedAdminItemTemplateId = Number(interaction.values[0]);
        state.screen = "admin_items";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectAdminRarity: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedAdminRarityId = Number(interaction.values[0]);
        state.screen = "admin_rarities";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectCraftRecipe: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedCraftRecipeId = Number(interaction.values[0]);
        state.screen = "craft";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectMarketListing: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedMarketListingId = Number(interaction.values[0]);
        state.selectedMarketInventoryItemId = undefined;
        state.screen = "market";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectMarketInventoryItem: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedMarketInventoryItemId = Number(interaction.values[0]);
        state.selectedMarketListingId = undefined;
        state.screen = "market";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectOwnMarketListing: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedMarketListingId = Number(interaction.values[0]);
        state.selectedMarketInventoryItemId = undefined;
        state.screen = "market";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private selectBotshopListing: StringSelectMenuExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        state.selectedBotshopListingId = Number(interaction.values[0]);
        state.screen = "botshop";
        this.persistSession(interaction.user.id, state);
        await this.updateRendered(interaction.user.id, interaction, state);
    };

    private sellSelectedInventoryItem: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedInventoryItemId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_inventory_first"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.sellInventoryItemToBot(interaction.user.id, state.selectedInventoryItemId);
        const notice = response.success
            ? t(locale, "commands.botshop.sell_success", {
                inventoryItemId: String(state.selectedInventoryItemId),
                price: String(response.data.price),
            })
            : response.error.message ?? t(locale, "commands.botshop.sell_failed");

        state.selectedInventoryItemId = undefined;
        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private openInventoryListMarketModal: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedInventoryItemId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_inventory_first"), flags: ["Ephemeral"] });
            return;
        }

        const inventoryItemResponse = await itemService.getInventoryItemById(state.selectedInventoryItemId);
        if (!inventoryItemResponse.success) {
            await interaction.reply({ content: inventoryItemResponse.error.message ?? t(locale, "commands.inventory.load_failed"), flags: ["Ephemeral"] });
            return;
        }

        const inventoryItem = inventoryItemResponse.data;
        if (!inventoryItem) {
            await interaction.reply({ content: t(locale, "commands.inventory.load_failed"), flags: ["Ephemeral"] });
            return;
        }

        if (inventoryItem.ownerDiscordId !== interaction.user.id) {
            await interaction.reply({ content: t(locale, "menu.messages.inventory_market_own_only"), flags: ["Ephemeral"] });
            return;
        }

        if (!inventoryItem.tradeable) {
            await interaction.reply({ content: t(locale, "menu.messages.inventory_market_tradeable_only"), flags: ["Ephemeral"] });
            return;
        }

        const marketResponse = await itemService.listPublicMarket();
        if (!marketResponse.success) {
            await interaction.reply({ content: marketResponse.error.message ?? t(locale, "commands.market.load_failed"), flags: ["Ephemeral"] });
            return;
        }

        const existingListing = marketResponse.data.find(item => item.inventoryItemId === state.selectedInventoryItemId);
        if (existingListing) {
            state.screen = "market";
            state.marketFilter = "own";
            state.marketPage = 0;
            state.selectedMarketInventoryItemId = undefined;
            state.selectedMarketListingId = existingListing.listingId;
            this.persistSession(interaction.user.id, state);
            await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "menu.messages.market_item_already_listed", {
                listingId: String(existingListing.listingId),
                price: String(existingListing.price),
            })));
            return;
        }

        state.selectedMarketInventoryItemId = state.selectedInventoryItemId;
        this.persistSession(interaction.user.id, state);
        await this.showMarketPriceModal(interaction, locale);
    };

    private addContributor: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!isBotOwner(interaction.user.id)) {
            await interaction.reply({ content: t(locale, "menu.messages.contributor_manage_owner_only"), flags: ["Ephemeral"] });
            return;
        }

        if (!state.selectedContributorUserId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_contributor_first"), flags: ["Ephemeral"] });
            return;
        }

        const response = await updateBotContributor(interaction.user.id, state.selectedContributorUserId, true);
        const notice = response.success
            ? t(locale, "menu.messages.contributor_added", { user: `<@${state.selectedContributorUserId}>` })
            : response.message ?? t(locale, "menu.messages.contributor_manage_failed");

        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private removeContributor: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!isBotOwner(interaction.user.id)) {
            await interaction.reply({ content: t(locale, "menu.messages.contributor_manage_owner_only"), flags: ["Ephemeral"] });
            return;
        }

        if (!state.selectedContributorUserId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_contributor_first"), flags: ["Ephemeral"] });
            return;
        }

        const response = await updateBotContributor(interaction.user.id, state.selectedContributorUserId, false);
        const notice = response.success
            ? t(locale, "menu.messages.contributor_removed", { user: `<@${state.selectedContributorUserId}>` })
            : response.message ?? t(locale, "menu.messages.contributor_manage_failed");

        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private openCreateItemModal: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        await this.showAdminItemModal(interaction, locale, this.adminItemCreateModal);
    };

    private openEditItemModal: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedAdminItemTemplateId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_admin_item_first"), flags: ["Ephemeral"] });
            return;
        }

        const itemResponse = await itemService.getItemTemplateById(state.selectedAdminItemTemplateId);
        if (!itemResponse.success || !itemResponse.data) {
            await interaction.reply({ content: itemResponse.success ? t(locale, "menu.messages.select_admin_item_first") : itemResponse.error.message ?? t(locale, "menu.messages.admin_item_load_failed"), flags: ["Ephemeral"] });
            return;
        }

        await this.showAdminItemModal(interaction, locale, this.adminItemEditModal, itemResponse.data);
    };

    private deleteSelectedItemTemplate: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedAdminItemTemplateId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_admin_item_first"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.deleteItemTemplate(state.selectedAdminItemTemplateId);
        const notice = response.success
            ? t(locale, "menu.messages.admin_item_deleted", { id: String(state.selectedAdminItemTemplateId) })
            : response.error.message ?? t(locale, "menu.messages.admin_item_delete_failed");

        if (response.success) {
            state.selectedAdminItemTemplateId = undefined;
        }

        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private openCreateRarityModal: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        await this.showAdminRarityModal(interaction, locale, this.adminRarityCreateModal);
    };

    private openEditRarityModal: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedAdminRarityId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_admin_rarity_first"), flags: ["Ephemeral"] });
            return;
        }

        const rarityResponse = await itemService.listRarities();
        if (!rarityResponse.success) {
            await interaction.reply({ content: rarityResponse.error.message ?? t(locale, "menu.messages.admin_rarity_load_failed"), flags: ["Ephemeral"] });
            return;
        }

        const rarity = rarityResponse.data.find(item => item.id === state.selectedAdminRarityId);
        if (!rarity) {
            await interaction.reply({ content: t(locale, "menu.messages.select_admin_rarity_first"), flags: ["Ephemeral"] });
            return;
        }

        await this.showAdminRarityModal(interaction, locale, this.adminRarityEditModal, rarity);
    };

    private deleteSelectedRarity: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedAdminRarityId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_admin_rarity_first"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.deleteRarity(state.selectedAdminRarityId);
        const notice = response.success
            ? t(locale, "menu.messages.admin_rarity_deleted", { id: String(state.selectedAdminRarityId) })
            : response.error.message ?? t(locale, "menu.messages.admin_rarity_delete_failed");

        if (response.success) {
            state.selectedAdminRarityId = undefined;
        }

        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private submitCreateItemModal: ModalsExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        const parsed = this.parseAdminItemModal(interaction);
        if (!parsed.success) {
            await interaction.reply({ content: parsed.message, flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.createItemTemplate({
            ...parsed.data,
            createdByDiscordId: interaction.user.id,
        });
        const notice = response.success
            ? t(locale, "menu.messages.admin_item_created", { id: String(response.data.insertId), name: parsed.data.name })
            : response.error.message ?? t(locale, "menu.messages.admin_item_create_failed");

        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private submitEditItemModal: ModalsExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedAdminItemTemplateId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_admin_item_first"), flags: ["Ephemeral"] });
            return;
        }

        const parsed = this.parseAdminItemModal(interaction);
        if (!parsed.success) {
            await interaction.reply({ content: parsed.message, flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.updateItemTemplate(state.selectedAdminItemTemplateId, parsed.data);
        const notice = response.success
            ? t(locale, "menu.messages.admin_item_updated", { id: String(state.selectedAdminItemTemplateId), name: parsed.data.name })
            : response.error.message ?? t(locale, "menu.messages.admin_item_update_failed");

        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private submitCreateRarityModal: ModalsExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        const name = interaction.fields.getTextInputValue("name");
        const color = interaction.fields.getTextInputValue("color").trim() || undefined;
        const response = await itemService.createRarity(name, color);
        const notice = response.success
            ? t(locale, "menu.messages.admin_rarity_created", { id: String(response.data.insertId), name })
            : response.error.message ?? t(locale, "menu.messages.admin_rarity_create_failed");

        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private submitEditRarityModal: ModalsExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedAdminRarityId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_admin_rarity_first"), flags: ["Ephemeral"] });
            return;
        }

        const name = interaction.fields.getTextInputValue("name");
        const color = interaction.fields.getTextInputValue("color").trim() || undefined;
        const response = await itemService.updateRarity(state.selectedAdminRarityId, { name, colorHex: color });
        const notice = response.success
            ? t(locale, "menu.messages.admin_rarity_updated", { id: String(state.selectedAdminRarityId), name })
            : response.error.message ?? t(locale, "menu.messages.admin_rarity_update_failed");

        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private refreshObsStatus: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "menu.messages.obs_status_refreshed")));
    };

    private refreshObsScenes: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "menu.messages.obs_scenes_refreshed")));
    };

    private reconnectObs: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        try {
            const status = await obsService.reconnect();
            await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "commands.obs.reconnect_done", {
                connected: t(locale, `menu.common.${status.connected ? "yes" : "no"}`),
                scene: status.currentSceneName ?? t(locale, "menu.common.unknown"),
            })));
        } catch (error) {
            await this.replyToComponentInteraction(interaction, error instanceof Error ? error.message : t(locale, "commands.obs.failed"));
        }
    };

    private showObsConfig: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        const config = await obsService.getMaskedConnectionConfig();
        const notice = t(locale, "menu.messages.obs_config_current", {
            source: config.source,
            url: config.url ?? t(locale, "menu.common.not_available"),
        });
        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private openObsConfigModal: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const config = await obsService.getMaskedConnectionConfig();
        const modal = new ModalBuilder()
            .setCustomId(this.obsConfigModal.toString())
            .setTitle(t(locale, "menu.modals.obs_config_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("url")
                        .setLabel(t(locale, "menu.modals.obs_config_url_label"))
                        .setPlaceholder(t(locale, "menu.modals.obs_config_url_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(config.url ?? "")
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("password")
                        .setLabel(t(locale, "menu.modals.obs_config_password_label"))
                        .setPlaceholder(t(locale, "menu.modals.obs_config_password_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );

        await interaction.showModal(modal);
    };

    private clearObsConfig: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        try {
            await obsService.clearConnectionConfig(interaction.user.id);
            state.selectedObsSceneName = undefined;
            state.selectedObsSourceName = undefined;
            await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "commands.obs.config_cleared")));
        } catch (error) {
            await this.replyToComponentInteraction(interaction, error instanceof Error ? error.message : t(locale, "commands.obs.failed"));
        }
    };

    private switchObsScene: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedObsSceneName) {
            await interaction.reply({ content: t(locale, "menu.messages.select_obs_scene_first"), flags: ["Ephemeral"] });
            return;
        }

        try {
            await obsService.switchScene(state.selectedObsSceneName);
            await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "commands.obs.switched", { scene: state.selectedObsSceneName! })));
        } catch (error) {
            await this.replyToComponentInteraction(interaction, error instanceof Error ? error.message : t(locale, "commands.obs.failed"));
        }
    };

    private showObsSource: ButtonExecutionFunc = async (interaction) => {
        await this.setObsSourceVisibility(interaction, true);
    };

    private hideObsSource: ButtonExecutionFunc = async (interaction) => {
        await this.setObsSourceVisibility(interaction, false);
    };

    private openObsTextModal: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedObsSourceName) {
            await interaction.reply({ content: t(locale, "menu.messages.select_obs_source_first"), flags: ["Ephemeral"] });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(this.obsTextModal.toString())
            .setTitle(t(locale, "menu.modals.obs_text_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("text")
                        .setLabel(t(locale, "menu.modals.obs_text_label"))
                        .setPlaceholder(t(locale, "menu.modals.obs_text_placeholder"))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);
    };

    private openObsMediaActionModal: ButtonExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedObsSourceName) {
            await interaction.reply({ content: t(locale, "menu.messages.select_obs_source_first"), flags: ["Ephemeral"] });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(this.obsMediaActionModal.toString())
            .setTitle(t(locale, "menu.modals.obs_media_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("action")
                        .setLabel(t(locale, "menu.modals.obs_media_action_label"))
                        .setPlaceholder(t(locale, "menu.modals.obs_media_action_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);
    };

    private submitObsConfigModal: ModalsExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        try {
            await obsService.setConnectionConfig({
                url: interaction.fields.getTextInputValue("url"),
                password: interaction.fields.getTextInputValue("password") || null,
                updatedByDiscordId: interaction.user.id,
            });
            state.selectedObsSceneName = undefined;
            state.selectedObsSourceName = undefined;
            await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "commands.obs.config_saved")));
        } catch (error) {
            await interaction.reply({ content: error instanceof Error ? error.message : t(locale, "commands.obs.failed"), flags: ["Ephemeral"] });
        }
    };

    private submitObsTextModal: ModalsExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedObsSourceName) {
            await interaction.reply({ content: t(locale, "menu.messages.select_obs_source_first"), flags: ["Ephemeral"] });
            return;
        }

        try {
            await obsService.setTextInputText(state.selectedObsSourceName, interaction.fields.getTextInputValue("text"));
            await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "commands.obs.text_updated", { source: state.selectedObsSourceName! })));
        } catch (error) {
            await interaction.reply({ content: error instanceof Error ? error.message : t(locale, "commands.obs.failed"), flags: ["Ephemeral"] });
        }
    };

    private submitObsMediaActionModal: ModalsExecutionFunc = async (interaction) => {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedObsSourceName) {
            await interaction.reply({ content: t(locale, "menu.messages.select_obs_source_first"), flags: ["Ephemeral"] });
            return;
        }

        const mediaAction = this.normalizeObsMediaAction(interaction.fields.getTextInputValue("action"));
        if (!mediaAction) {
            await interaction.reply({ content: t(locale, "menu.messages.obs_media_action_invalid"), flags: ["Ephemeral"] });
            return;
        }

        try {
            await obsService.triggerMediaInputAction(state.selectedObsSourceName, mediaAction);
            await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "commands.obs.media_sent", { action: mediaAction, source: state.selectedObsSourceName! })));
        } catch (error) {
            await interaction.reply({ content: error instanceof Error ? error.message : t(locale, "commands.obs.failed"), flags: ["Ephemeral"] });
        }
    };

    private openCraftAmountModal: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedCraftRecipeId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_recipe_first"), flags: ["Ephemeral"] });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(this.craftAmountModal.toString())
            .setTitle(t(locale, "menu.modals.craft_amount_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("amount")
                        .setLabel(t(locale, "menu.modals.craft_amount_label"))
                        .setPlaceholder(t(locale, "menu.modals.craft_amount_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);
    };

    private submitCraftAmountModal: ModalsExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedCraftRecipeId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_recipe_first"), flags: ["Ephemeral"] });
            return;
        }

        const amount = Number(interaction.fields.getTextInputValue("amount").trim());
        if (!Number.isInteger(amount) || amount <= 0) {
            await interaction.reply({ content: t(locale, "commands.botshop.amount_positive"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.craftForMember(interaction.user.id, state.selectedCraftRecipeId, amount);
        const notice = response.success
            ? t(locale, "commands.craft.success", {
                crafted: String(response.data.crafted),
                resultAmount: String(response.data.resultAmount),
                templateId: String(response.data.resultItemTemplateId),
            })
            : response.error.message ?? t(locale, "commands.craft.load_failed");

        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private buySelectedMarketListing: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedMarketListingId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_market_first"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.buyPublicListing(interaction.user.id, state.selectedMarketListingId);
        const notice = response.success
            ? t(locale, "commands.market.buy_success", {
                listingId: String(state.selectedMarketListingId),
                inventoryItemId: String(response.data.inventoryItemId),
            })
            : response.error.message ?? t(locale, "commands.market.buy_failed");

        state.selectedMarketListingId = undefined;
        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private cancelSelectedMarketListing: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedMarketListingId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_market_first"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.cancelPublicListing(interaction.user.id, state.selectedMarketListingId);
        const notice = response.success
            ? t(locale, "commands.market.cancel_success", {
                listingId: String(response.data.listingId),
                inventoryItemId: String(response.data.inventoryItemId),
            })
            : response.error.message ?? t(locale, "commands.market.cancel_failed");

        state.selectedMarketListingId = undefined;
        await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private openEditMarketPriceModal: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedMarketListingId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_market_first"), flags: ["Ephemeral"] });
            return;
        }

        const marketResponse = await itemService.listPublicMarket();
        if (!marketResponse.success) {
            await interaction.reply({ content: marketResponse.error.message ?? t(locale, "commands.market.load_failed"), flags: ["Ephemeral"] });
            return;
        }

        const listing = marketResponse.data.find(item => item.listingId === state.selectedMarketListingId);
        if (!listing || listing.sellerDiscordId !== interaction.user.id) {
            await interaction.reply({ content: t(locale, "menu.messages.market_edit_own_only"), flags: ["Ephemeral"] });
            return;
        }

        await this.showMarketPriceModal(interaction, locale, this.marketEditPriceModal, String(listing.price));
    };

    private openBotshopAmountModal: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedBotshopListingId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_botshop_first"), flags: ["Ephemeral"] });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(this.botshopAmountModal.toString())
            .setTitle(t(locale, "menu.modals.botshop_amount_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("amount")
                        .setLabel(t(locale, "menu.modals.botshop_amount_label"))
                        .setPlaceholder(t(locale, "menu.modals.botshop_amount_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);
    };

    private submitBotshopAmountModal: ModalsExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedBotshopListingId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_botshop_first"), flags: ["Ephemeral"] });
            return;
        }

        const amount = Number(interaction.fields.getTextInputValue("amount").trim());
        if (!Number.isInteger(amount) || amount <= 0) {
            await interaction.reply({ content: t(locale, "commands.botshop.amount_positive"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.buyFromBotShop(interaction.user.id, state.selectedBotshopListingId, amount);
        const notice = response.success
            ? t(locale, "commands.botshop.buy_success", {
                inserted: String(response.data.inserted),
                listingId: String(state.selectedBotshopListingId),
            })
            : response.error.message ?? t(locale, "commands.botshop.buy_failed");

        state.selectedBotshopListingId = undefined;
        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private openListMarketModal: ButtonExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedMarketInventoryItemId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_market_inventory_first"), flags: ["Ephemeral"] });
            return;
        }

        await this.showMarketPriceModal(interaction, locale);
    };

    private submitListMarketModal: ModalsExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedMarketInventoryItemId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_market_inventory_first"), flags: ["Ephemeral"] });
            return;
        }

        const rawPrice = interaction.fields.getTextInputValue("price").trim();
        const price = Number(rawPrice.replace(",", "."));
        if (!Number.isFinite(price) || price <= 0) {
            await interaction.reply({ content: t(locale, "commands.market.price_positive"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.createPublicListing(interaction.user.id, state.selectedMarketInventoryItemId, price);
        const notice = response.success
            ? t(locale, "commands.market.sell_created", {
                listingId: String(response.data.listingId),
                inventoryItemId: String(state.selectedMarketInventoryItemId),
                price: String(Number(price.toFixed(2))),
            })
            : response.error.message ?? t(locale, "commands.market.create_failed");

        state.selectedMarketInventoryItemId = undefined;
        this.persistSession(interaction.user.id, state);
        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private submitEditMarketPriceModal: ModalsExecutionFunc = async (interaction) => {
        const state = this.readSession(interaction.user.id);
        const locale = await this.getLocale(interaction.user.id);
        if (!state.selectedMarketListingId) {
            await interaction.reply({ content: t(locale, "menu.messages.select_market_first"), flags: ["Ephemeral"] });
            return;
        }

        const rawPrice = interaction.fields.getTextInputValue("price").trim();
        const price = Number(rawPrice.replace(",", "."));
        if (!Number.isFinite(price) || price <= 0) {
            await interaction.reply({ content: t(locale, "commands.market.price_positive"), flags: ["Ephemeral"] });
            return;
        }

        const response = await itemService.updatePublicListingPrice(interaction.user.id, state.selectedMarketListingId, price);
        const notice = response.success
            ? t(locale, "commands.market.update_success", {
                listingId: String(response.data.listingId),
                price: String(Number(response.data.price.toFixed(2))),
            })
            : response.error.message ?? t(locale, "commands.market.update_failed");

        if (response.success) {
            state.selectedMarketListingId = undefined;
        }

        await this.respondAfterModal(interaction, () => this.renderState(interaction.user.id, locale, state, notice));
    };

    private async setScreenAndRender(userId: string, interaction: MenuComponentInteraction, screen: MenuScreen) {
        const state = this.readSession(userId);
        state.screen = screen;
        this.persistSession(userId, state);
        await this.updateRendered(userId, interaction, state);
    }

    private async updateRendered(userId: string, interaction: MenuComponentInteraction, state: MenuSessionState) {
        const locale = await this.getLocale(userId);
        await this.updateComponentReply(interaction, () => this.renderState(userId, locale, state));
    }

    private async renderState(userId: string, locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        switch (state.screen) {
            case "economy":
                return this.renderEconomy(userId, locale);
            case "collection":
                return this.renderCollection(userId, locale);
            case "profile":
                return this.renderProfile(locale, notice);
            case "contributors":
                return this.renderContributors(userId, locale, state, notice);
            case "founder":
                return this.renderFounder(userId, locale, state, notice);
            case "admin_items":
                return this.renderAdminItems(userId, locale, state, notice);
            case "admin_rarities":
                return this.renderAdminRarities(userId, locale, state, notice);
            case "balance":
                return this.renderBalance(userId, locale);
            case "inventory":
                return this.renderInventory(userId, locale, state, notice);
            case "craft":
                return this.renderCraft(locale, state, notice);
            case "market":
                return this.renderMarket(userId, locale, state, notice);
            case "botshop":
                return this.renderBotShop(locale, state, notice);
            case "admin":
                return this.renderAdmin(locale, userId);
            case "obs":
                return this.renderObs(locale, userId);
            case "home":
            default:
                return this.renderHome(userId, locale, notice);
        }
    }

    private async renderHome(userId: string, locale: LocalesCodes, notice?: string) {
        const adminAccess = await isBotContributor(userId);
        const founderAccess = await isGuildFounder(userId, this.readSession(userId).guildId);
        const counts = await this.getMenuOverviewCounts(userId, locale);
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xf5edd9)
                    .setTitle(`🏠 ${t(locale, "menu.home_title")}`)
                    .setDescription([
                        notice ? `> ${notice}` : null,
                        `✨ ${t(locale, "menu.home_description")}`,
                        "",
                        `💼 **${t(locale, "menu.home_balance_chip")}** ${await this.getBalanceSummary(userId, locale)}`,
                        "",
                        `**${t(locale, "menu.home_overview_title")}**`,
                        `• ${t(locale, "menu.home_overview_inventory", { count: counts.inventory })}`,
                        `• ${t(locale, "menu.home_overview_recipes", { count: counts.craft })}`,
                        `• ${t(locale, "menu.home_overview_market", { count: counts.market })}`,
                        `• ${t(locale, "menu.home_overview_botshop", { count: counts.botshop })}`,
                    ].filter(Boolean).join("\n")),
                new EmbedBuilder()
                    .setColor(0xe8dcc0)
                    .setTitle(t(locale, "menu.home_routes_title"))
                    .setDescription([
                        `🎒 **${t(locale, "menu.categories.collection_title")}**`,
                        t(locale, "menu.categories.collection_body"),
                        t(locale, "menu.home_route_collection"),
                        "",
                        `🪙 **${t(locale, "menu.categories.economy_title")}**`,
                        t(locale, "menu.categories.economy_body"),
                        t(locale, "menu.home_route_economy"),
                        "",
                        `👤 **${t(locale, "menu.categories.profile_title")}**`,
                        t(locale, "menu.categories.profile_body"),
                        adminAccess ? "" : null,
                        adminAccess ? `🧰 **${t(locale, "menu.categories.admin_title")}**` : null,
                        adminAccess ? t(locale, "menu.categories.admin_body") : null,
                        founderAccess ? "" : null,
                        founderAccess ? `🏰 **${t(locale, "menu.categories.founder_title")}**` : null,
                        founderAccess ? t(locale, "menu.categories.founder_body") : null,
                    ].filter(Boolean).join("\n")),
            ],
            components: this.buildHomeComponents(locale, adminAccess, founderAccess),
        };
    }

    private async renderEconomy(userId: string, locale: LocalesCodes) {
        const counts = await this.getMenuOverviewCounts(userId, locale);
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xd6bf62)
                    .setTitle(`🪙 ${t(locale, "menu.categories.economy_title")}`)
                    .setDescription([
                        t(locale, "menu.categories.economy_body"),
                        "",
                        `• ${t(locale, "menu.panels.economy_wallet_summary", { balance: await this.getBalanceSummary(userId, locale) })}`,
                        `• ${t(locale, "menu.panels.economy_market_summary", { count: counts.market })}`,
                        `• ${t(locale, "menu.panels.economy_botshop_summary", { count: counts.botshop })}`,
                        "",
                        t(locale, "menu.panels.economy_hint"),
                    ].join("\n")),
                new EmbedBuilder()
                    .setColor(0xc7aa43)
                    .setTitle(t(locale, "menu.panels.economy_actions_title"))
                    .setDescription([
                        `💰 ${t(locale, "menu.home_balance")}`,
                        `🛒 ${t(locale, "menu.home_market")}`,
                        `🏪 ${t(locale, "menu.home_botshop")}`,
                    ].join("\n")),
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    this.createButton(this.balanceButton, t(locale, "menu.buttons.balance"), ButtonStyle.Secondary, "💰"),
                    this.createButton(this.marketButton, t(locale, "menu.buttons.market"), ButtonStyle.Primary, "🛒"),
                    this.createButton(this.botShopButton, t(locale, "menu.buttons.botshop"), ButtonStyle.Secondary, "🏪"),
                ),
                this.buildBackHomeRow(locale),
            ],
        };
    }

    private async renderCollection(userId: string, locale: LocalesCodes) {
        const counts = await this.getMenuOverviewCounts(userId, locale);
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xb9d7c4)
                    .setTitle(`🎒 ${t(locale, "menu.categories.collection_title")}`)
                    .setDescription([
                        t(locale, "menu.categories.collection_body"),
                        "",
                        `• ${t(locale, "menu.panels.collection_inventory_summary", { count: counts.inventory })}`,
                        `• ${t(locale, "menu.panels.collection_craft_summary", { count: counts.craft })}`,
                        "",
                        t(locale, "menu.panels.collection_hint"),
                    ].join("\n")),
                new EmbedBuilder()
                    .setColor(0x9ac3ae)
                    .setTitle(t(locale, "menu.panels.collection_actions_title"))
                    .setDescription([
                        `🎁 ${t(locale, "menu.home_inventory")}`,
                        `🛠️ ${t(locale, "menu.home_craft")}`,
                    ].join("\n")),
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    this.createButton(this.inventoryButton, t(locale, "menu.buttons.inventory"), ButtonStyle.Primary, "🎒"),
                    this.createButton(this.craftButton, t(locale, "menu.buttons.craft"), ButtonStyle.Secondary, "🛠️"),
                ),
                this.buildBackHomeRow(locale),
            ],
        };
    }

    private async renderBalance(userId: string, locale: LocalesCodes) {
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xd6bf62)
                    .setTitle(`💰 ${t(locale, "menu.panels.balance_title")}`)
                    .setDescription([
                        `**${await this.getBalanceSummary(userId, locale)}**`,
                        "",
                        t(locale, "menu.panels.balance_body_1"),
                        t(locale, "menu.panels.balance_body_2"),
                        t(locale, "menu.panels.balance_body_3"),
                    ].join("\n")),
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
                ),
                this.buildBackCategoryRow(locale, this.economyButton),
            ],
        };
    }

    private async renderInventory(userId: string, locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        const targetUserId = state.inventoryTargetUserId || userId;
        const response = await itemService.getInventory(targetUserId);
        if (!response.success) {
            return this.simplePanel(t(locale, "menu.panels.inventory_title"), response.error.message ?? t(locale, "commands.inventory.load_failed"), locale, [this.buildBackCategoryRow(locale, this.collectionButton)]);
        }

        const totalPages = this.getTotalPages(response.data.length);
        state.inventoryPage = this.clampPage(state.inventoryPage, totalPages);
        this.persistSession(userId, state);
        const pageItems = this.slicePage(response.data, state.inventoryPage);
        const selectedItem = this.resolveSelectedEntity(pageItems, state.selectedInventoryItemId, item => item.inventoryItemId);
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xb9d7c4)
                    .setTitle(t(locale, "menu.panels.inventory_title"))
                    .setDescription(this.buildInventoryDescription(locale, pageItems, state.inventoryPage, totalPages, userId, targetUserId, notice)),
                ...(selectedItem ? [this.buildInventoryDetailEmbed(locale, selectedItem)] : []),
            ],
            components: this.buildInventoryComponents(locale, pageItems, state.inventoryPage > 0, state.inventoryPage + 1 < totalPages, isBotAdmin(userId), targetUserId === userId, Boolean(selectedItem), Boolean(selectedItem?.tradeable)),
        };
    }

    private async renderCraft(locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        const response = await itemService.listCraftRecipes();
        if (!response.success) {
            return this.simplePanel(t(locale, "menu.panels.craft_title"), response.error.message ?? t(locale, "commands.craftrecipes.load_failed"), locale, [this.buildBackCategoryRow(locale, this.collectionButton)]);
        }

        const totalPages = this.getTotalPages(response.data.length);
        state.craftPage = this.clampPage(state.craftPage, totalPages);
        const items = this.slicePage(response.data, state.craftPage);
        const selectedRecipe = this.resolveSelectedEntity(items, state.selectedCraftRecipeId, item => item.recipeId);
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xb9d7c4)
                    .setTitle(t(locale, "menu.panels.craft_title"))
                    .setDescription(this.buildCraftDescription(locale, items, state.craftPage, totalPages, notice)),
                ...(selectedRecipe ? [this.buildCraftDetailEmbed(locale, selectedRecipe)] : []),
            ],
            components: this.buildCraftComponents(locale, items, state.craftPage > 0, state.craftPage + 1 < totalPages, Boolean(selectedRecipe)),
        };
    }

    private async renderMarket(userId: string, locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        const response = await itemService.listPublicMarket();
        if (!response.success) {
            return this.simplePanel(t(locale, "menu.panels.market_title"), response.error.message ?? t(locale, "commands.market.load_failed"), locale, [this.buildBackCategoryRow(locale, this.economyButton)]);
        }

        const filteredMarket = this.applyMarketFilter(response.data, userId, state.marketFilter);
        const totalPages = this.getTotalPages(filteredMarket.length);
        state.marketPage = this.clampPage(state.marketPage, totalPages);
        const items = this.slicePage(filteredMarket, state.marketPage);
        const inventoryResponse = await itemService.getInventory(userId);
        const marketInventoryItems = inventoryResponse.success
            ? inventoryResponse.data.filter(item => item.tradeable).slice(0, 25)
            : [];
        const ownListings = response.data.filter(item => item.sellerDiscordId === userId).slice(0, 25);
        const selectedListing = this.resolveSelectedEntity(response.data, state.selectedMarketListingId, item => item.listingId);
        const selectedInventoryItem = this.resolveSelectedEntity(marketInventoryItems, state.selectedMarketInventoryItemId, item => item.inventoryItemId);
        const selectedOwnListing = Boolean(selectedListing && selectedListing.sellerDiscordId === userId);
        const selectedForeignListing = Boolean(selectedListing && selectedListing.sellerDiscordId !== userId);
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xd6bf62)
                    .setTitle(`🛒 ${t(locale, "menu.panels.market_title")}`)
                    .setDescription(this.buildMarketDescription(locale, items, state.marketPage, totalPages, notice, selectedListing, selectedInventoryItem, userId, state.marketFilter)),
                new EmbedBuilder()
                    .setColor(0xc0a44a)
                    .setTitle(t(locale, "menu.panels.market_own_title"))
                    .setDescription(this.buildOwnMarketListingsDescription(locale, ownListings)),
                ...(selectedListing ? [this.buildMarketDetailEmbed(locale, selectedListing)] : []),
                ...(selectedInventoryItem ? [this.buildInventoryDetailEmbed(locale, selectedInventoryItem).setColor(0xb0812c).setTitle(`📤 ${selectedInventoryItem.emoji ?? "📦"} ${selectedInventoryItem.name}`)] : []),
            ],
            components: this.buildMarketComponents(locale, items, ownListings, marketInventoryItems, state.marketPage > 0, state.marketPage + 1 < totalPages, Boolean(selectedInventoryItem), selectedOwnListing, selectedForeignListing, state.marketFilter),
        };
    }

    private async renderBotShop(locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        const response = await itemService.listBotShop();
        if (!response.success) {
            return this.simplePanel(t(locale, "menu.panels.botshop_title"), response.error.message ?? t(locale, "commands.botshop.load_failed"), locale, [this.buildBackCategoryRow(locale, this.economyButton)]);
        }

        const totalPages = this.getTotalPages(response.data.length);
        state.botshopPage = this.clampPage(state.botshopPage, totalPages);
        const items = this.slicePage(response.data, state.botshopPage);
        const selectedListing = this.resolveSelectedEntity(items, state.selectedBotshopListingId, item => item.listingId);
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xd6bf62)
                    .setTitle(`🏪 ${t(locale, "menu.panels.botshop_title")}`)
                    .setDescription(this.buildBotShopDescription(locale, items, state.botshopPage, totalPages, notice)),
                ...(selectedListing ? [this.buildBotShopDetailEmbed(locale, selectedListing)] : []),
            ],
            components: this.buildBotShopComponents(locale, items, state.botshopPage > 0, state.botshopPage + 1 < totalPages, Boolean(selectedListing)),
        };
    }

    private renderProfile(locale: LocalesCodes, notice?: string) {
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xc7c2e8)
                    .setTitle(`👤 ${t(locale, "menu.panels.profile_title")}`)
                    .setDescription([
                        notice ? `> ${notice}` : null,
                        t(locale, "menu.panels.profile_description"),
                        "",
                        t(locale, "menu.panels.profile_current_locale", {
                            locale: t(locale, `menu.locale_names.${locale}`),
                        }),
                        t(locale, "menu.panels.profile_hint"),
                    ].filter(Boolean).join("\n")),
            ],
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(this.localeSelect.toString())
                        .setPlaceholder(t(locale, "menu.selects.locale"))
                        .addOptions(supportedLocales.map(code => ({
                            label: t(locale, `menu.locale_names.${code}`),
                            value: code,
                            default: code === locale,
                        })))
                ),
                this.buildBackHomeRow(locale),
            ],
        };
    }

    private async renderAdmin(locale: LocalesCodes, userId: string) {
        if (!await isBotContributor(userId)) {
            return this.simplePanel(t(locale, "menu.panels.admin_title"), t(locale, "menu.messages.admin_only"), locale, [this.buildBackHomeRow(locale)]);
        }

        const stats = await getBotAdminDashboardStats();
        const founderAccess = await isGuildFounder(userId, this.readSession(userId).guildId);

        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xdfb39f)
                    .setTitle(`🧰 ${t(locale, "menu.panels.admin_title")}`)
                    .setDescription([
                        t(locale, "menu.panels.admin_description"),
                        "",
                        `**${t(locale, "menu.panels.admin_stats_title")}**`,
                        t(locale, "menu.panels.admin_stats_value", {
                            guilds: String(stats.counts.guilds_count),
                            members: String(stats.counts.members_count),
                            items: String(stats.counts.items_count),
                            inventory: String(stats.counts.inventory_count),
                            market: String(stats.counts.market_count),
                            recipes: String(stats.counts.recipes_count),
                            streamers: String(stats.counts.streamers_count),
                            settings: String(stats.counts.settings_count),
                            actions: String(stats.counts.actions_count),
                        }),
                        "",
                        `**${t(locale, "menu.panels.admin_contributors_title")}**`,
                        stats.contributors.length ? stats.contributors.map(id => `<@${id}>`).join("\n") : t(locale, "menu.panels.admin_contributors_empty"),
                        "",
                        `**${t(locale, "menu.panels.admin_obs_settings_title")}**`,
                        stats.obsSettings.length ? stats.obsSettings.map(setting => `${setting.setting_key}: ${setting.setting_value ? "set" : "empty"}`).join("\n") : t(locale, "menu.panels.admin_obs_settings_empty"),
                    ].join("\n")),
                new EmbedBuilder()
                    .setColor(0xe7c9b6)
                    .setTitle(t(locale, "menu.panels.admin_groups_title"))
                    .setDescription([
                        `📦 ${t(locale, "menu.panels.admin_groups_content")}`,
                        `🤝 ${t(locale, "menu.panels.admin_groups_access")}`,
                        `📺 ${t(locale, "menu.panels.admin_groups_system")}`,
                    ].join("\n")),
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    this.createButton(this.adminItemsButton, t(locale, "menu.buttons.manage_items"), ButtonStyle.Primary, "📦"),
                    this.createButton(this.adminRaritiesButton, t(locale, "menu.buttons.manage_rarities"), ButtonStyle.Secondary, "💎"),
                    this.createButton(this.obsButton, t(locale, "menu.buttons.obs"), ButtonStyle.Secondary, "📺"),
                ),
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    this.createButton(this.contributorsButton, t(locale, "menu.buttons.contributors"), ButtonStyle.Primary, "🤝"),
                    this.createButton(this.founderButton, t(locale, "menu.buttons.founder"), ButtonStyle.Secondary, "🏰", !founderAccess),
                    this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
                ),
                this.buildBackHomeRow(locale),
            ],
        };
    }

    private async renderObs(locale: LocalesCodes, userId: string) {
        if (!await isBotContributor(userId)) {
            return this.simplePanel(t(locale, "menu.panels.obs_title"), t(locale, "menu.messages.obs_only"), locale, [this.buildBackHomeRow(locale)]);
        }

        const state = this.readSession(userId);
        const status = await obsService.getStatus();
        const config = await obsService.getMaskedConnectionConfig();

        let scenes: string[] = [];
        let sources: Array<{ sourceName: string; enabled: boolean }> = [];
        let scenesError: string | null = null;
        let sourcesError: string | null = null;

        try {
            scenes = (await obsService.listScenes()).map(scene => scene.sceneName);
        } catch (error) {
            scenesError = error instanceof Error ? error.message : t(locale, "commands.obs.failed");
        }

        const resolvedScene = state.selectedObsSceneName && scenes.includes(state.selectedObsSceneName)
            ? state.selectedObsSceneName
            : status.currentSceneName && scenes.includes(status.currentSceneName)
                ? status.currentSceneName
                : scenes[0];

        state.selectedObsSceneName = resolvedScene;

        if (resolvedScene) {
            try {
                const sceneItems = await obsService.listSceneItems(resolvedScene);
                sources = sceneItems.map(item => ({ sourceName: item.sourceName, enabled: item.enabled }));
            } catch (error) {
                sourcesError = error instanceof Error ? error.message : t(locale, "commands.obs.failed");
            }
        }

        state.selectedObsSourceName = state.selectedObsSourceName && sources.some(item => item.sourceName === state.selectedObsSourceName)
            ? state.selectedObsSourceName
            : sources[0]?.sourceName;
        this.persistSession(userId, state);

        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xdfb39f)
                    .setTitle(`📺 ${t(locale, "menu.panels.obs_title")}`)
                    .setDescription([
                        t(locale, "menu.panels.obs_intro"),
                        "",
                        `• ${t(locale, "menu.panels.obs_connected")}: ${t(locale, `menu.common.${status.connected ? "yes" : "no"}`)}`,
                        `• ${t(locale, "menu.panels.obs_source")}: ${config.source}`,
                        `• ${t(locale, "menu.panels.obs_endpoint")}: ${status.endpoint ?? t(locale, "menu.common.not_available")}`,
                        `• ${t(locale, "menu.panels.obs_scene")}: ${status.currentSceneName ?? t(locale, "menu.common.not_available")}`,
                        `• ${t(locale, "menu.panels.obs_selected_scene")}: ${state.selectedObsSceneName ?? t(locale, "menu.common.not_available")}`,
                        `• ${t(locale, "menu.panels.obs_selected_source")}: ${state.selectedObsSourceName ?? t(locale, "menu.common.not_available")}`,
                    ].join("\n")),
                new EmbedBuilder()
                    .setColor(0xcba38a)
                    .setTitle(t(locale, "menu.panels.obs_workspace_title"))
                    .setDescription([
                        scenesError ? `> ${scenesError}` : null,
                        sourcesError ? `> ${sourcesError}` : null,
                        `**${t(locale, "menu.panels.obs_scenes_block_title")}**`,
                        scenes.length
                            ? scenes.slice(0, 8).map(scene => `${scene === status.currentSceneName ? "🎬" : "▫️"} ${scene === state.selectedObsSceneName ? `**${scene}**` : scene}`).join("\n")
                            : t(locale, "commands.obs.no_scenes"),
                        "",
                        `**${t(locale, "menu.panels.obs_sources_block_title")}**`,
                        sources.length
                            ? sources.slice(0, 8).map(source => `${source.enabled ? "🟢" : "⚫"} ${source.sourceName === state.selectedObsSourceName ? `**${source.sourceName}**` : source.sourceName}`).join("\n")
                            : t(locale, "menu.panels.obs_sources_empty"),
                    ].filter(Boolean).join("\n")),
            ],
            components: this.buildObsComponents(locale, scenes, sources, Boolean(state.selectedObsSceneName), Boolean(state.selectedObsSourceName)),
        };
    }

    private async renderContributors(userId: string, locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        if (!await isBotContributor(userId)) {
            return this.simplePanel(t(locale, "menu.panels.contributors_title"), t(locale, "menu.messages.admin_only"), locale, [this.buildBackHomeRow(locale)]);
        }

        const contributors = await getBotContributorIds();
        const selectedUserId = state.selectedContributorUserId;
        const isOwner = isBotOwner(userId);
        const isSelectedContributor = Boolean(selectedUserId && contributors.includes(selectedUserId));

        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xdfb39f)
                    .setTitle(`🤝 ${t(locale, "menu.panels.contributors_title")}`)
                    .setDescription([
                        notice ? `> ${notice}` : null,
                        t(locale, "menu.panels.contributors_description"),
                        "",
                        t(locale, "menu.panels.contributors_owner", { owner: DEVELOPER_DISCORD_ID ? `<@${DEVELOPER_DISCORD_ID}>` : t(locale, "menu.common.unknown") }),
                        `**${t(locale, "menu.panels.contributors_list_title")}**`,
                        contributors.length ? contributors.map(id => `<@${id}>`).join("\n") : t(locale, "menu.panels.admin_contributors_empty"),
                        "",
                        t(locale, "menu.panels.contributors_selected", { user: selectedUserId ? `<@${selectedUserId}>` : t(locale, "menu.common.not_available") }),
                    ].filter(Boolean).join("\n")),
            ],
            components: [
                new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId(this.contributorUserSelect.toString())
                        .setPlaceholder(t(locale, "menu.selects.contributor_user"))
                        .setMinValues(1)
                        .setMaxValues(1)
                ),
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    this.createButton(this.contributorAddButton, t(locale, "menu.buttons.add_contributor"), ButtonStyle.Success, "➕", !isOwner || !selectedUserId),
                    this.createButton(this.contributorRemoveButton, t(locale, "menu.buttons.remove_contributor"), ButtonStyle.Danger, "➖", !isOwner || !selectedUserId || !isSelectedContributor),
                    this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
                ),
                this.buildBackCategoryRow(locale, this.adminButton),
            ],
        };
    }

    private async renderFounder(userId: string, locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        if (!await isGuildFounder(userId, state.guildId)) {
            return this.simplePanel(t(locale, "menu.panels.founder_title"), t(locale, "menu.messages.founder_only"), locale, [this.buildBackHomeRow(locale)]);
        }

        const stats = state.guildId
            ? await getFounderDashboardStats(state.guildId)
            : { guild_members_count: 0, channels_count: 0, streamers_count: 0, muted_count: 0, banned_count: 0 };
        const streamersResponse = state.guildId
            ? await streamerService.listGuildStreamers(state.guildId)
            : { success: true as const, data: [] };
        const streamerLines = streamersResponse.success
            ? streamersResponse.data.slice(0, 6).map(streamer => t(locale, "menu.panels.founder_streamer_line", {
                nickname: streamer.nickname,
                url: streamer.twitchUrl,
                primary: t(locale, `menu.common.${streamer.isPrimary ? "yes" : "no"}`),
                agent: streamer.obsAgentId
                    ? t(locale, `menu.common.${streamer.obsAgentOnline ? "online" : "offline"}`)
                    : t(locale, "menu.common.unbound"),
            }))
            : [];

        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xd98c5f)
                    .setTitle(`🏰 ${t(locale, "menu.panels.founder_title")}`)
                    .setDescription([
                        notice ? `> ${notice}` : null,
                        t(locale, "menu.panels.founder_description"),
                        "",
                        t(locale, "menu.panels.founder_stats", {
                            members: String(stats.guild_members_count),
                            channels: String(stats.channels_count),
                            streamers: String(stats.streamers_count),
                            muted: String(stats.muted_count),
                            banned: String(stats.banned_count),
                        }),
                        "",
                        t(locale, "menu.panels.founder_future"),
                    ].filter(Boolean).join("\n")),
                new EmbedBuilder()
                    .setColor(0xe2a980)
                    .setTitle(t(locale, "menu.panels.founder_streamers_title"))
                    .setDescription([
                        !streamersResponse.success ? `> ${streamersResponse.error.message ?? t(locale, "menu.panels.founder_streamers_empty")}` : null,
                        streamersResponse.success && streamerLines.length
                            ? streamerLines.join("\n")
                            : t(locale, "menu.panels.founder_streamers_empty"),
                    ].filter(Boolean).join("\n")),
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    this.createButton(new CommandDTO(this.commandName, "founder_ban_placeholder"), t(locale, "menu.buttons.founder_ban"), ButtonStyle.Secondary, "🔨", true),
                    this.createButton(new CommandDTO(this.commandName, "founder_moderation_placeholder"), t(locale, "menu.buttons.founder_moderation"), ButtonStyle.Secondary, "🛡️", true),
                    this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
                ),
                this.buildBackCategoryRow(locale, this.adminButton),
            ],
        };
    }

    private async renderAdminItems(userId: string, locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        if (!await isBotContributor(userId)) {
            return this.simplePanel(t(locale, "menu.panels.admin_items_title"), t(locale, "menu.messages.admin_only"), locale, [this.buildBackHomeRow(locale)]);
        }

        const response = await itemService.listItemTemplates();
        if (!response.success) {
            return this.simplePanel(t(locale, "menu.panels.admin_items_title"), response.error.message ?? t(locale, "menu.messages.admin_item_load_failed"), locale, [this.buildBackCategoryRow(locale, this.adminButton)]);
        }

        const allItems: ItemTemplateView[] = response.data.map(item => ({
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

        const totalPages = this.getTotalPages(allItems.length);
        state.adminItemsPage = this.clampPage(state.adminItemsPage, totalPages);
        const items = this.slicePage(allItems, state.adminItemsPage);
        const selectedItem = await this.resolveSelectedAdminItem(allItems, state.selectedAdminItemTemplateId);

        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xdfb39f)
                    .setTitle(`📦 ${t(locale, "menu.panels.admin_items_title")}`)
                    .setDescription(this.buildAdminItemsDescription(locale, items, state.adminItemsPage, totalPages, notice)),
                ...(selectedItem ? [this.buildAdminItemDetailEmbed(locale, selectedItem)] : []),
            ],
            components: this.buildAdminItemsComponents(locale, items, state.adminItemsPage > 0, state.adminItemsPage + 1 < totalPages, Boolean(selectedItem)),
        };
    }

    private async renderAdminRarities(userId: string, locale: LocalesCodes, state: MenuSessionState, notice?: string) {
        if (!await isBotContributor(userId)) {
            return this.simplePanel(t(locale, "menu.panels.admin_rarities_title"), t(locale, "menu.messages.admin_only"), locale, [this.buildBackHomeRow(locale)]);
        }

        const response = await itemService.listRarities();
        if (!response.success) {
            return this.simplePanel(t(locale, "menu.panels.admin_rarities_title"), response.error.message ?? t(locale, "menu.messages.admin_rarity_load_failed"), locale, [this.buildBackCategoryRow(locale, this.adminButton)]);
        }

        const totalPages = this.getTotalPages(response.data.length);
        state.adminRaritiesPage = this.clampPage(state.adminRaritiesPage, totalPages);
        const items = this.slicePage(response.data, state.adminRaritiesPage);
        const selectedRarity = state.selectedAdminRarityId ? response.data.find(item => item.id === state.selectedAdminRarityId) : undefined;

        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(0xdfb39f)
                    .setTitle(`💎 ${t(locale, "menu.panels.admin_rarities_title")}`)
                    .setDescription(this.buildAdminRaritiesDescription(locale, items, state.adminRaritiesPage, totalPages, notice)),
                ...(selectedRarity ? [this.buildAdminRarityDetailEmbed(locale, selectedRarity)] : []),
            ],
            components: this.buildAdminRaritiesComponents(locale, items, state.adminRaritiesPage > 0, state.adminRaritiesPage + 1 < totalPages, Boolean(selectedRarity)),
        };
    }

    private buildHomeComponents(locale: LocalesCodes, admin: boolean, founder: boolean) {
        return [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.collectionButton, t(locale, "menu.buttons.collection"), ButtonStyle.Primary, "🎒"),
                this.createButton(this.economyButton, t(locale, "menu.buttons.economy"), ButtonStyle.Secondary, "🪙"),
                this.createButton(this.profileButton, t(locale, "menu.buttons.profile"), ButtonStyle.Success, "👤"),
                this.createButton(this.adminCategoryButton, t(locale, "menu.buttons.admin_tools"), ButtonStyle.Secondary, "🧰", !admin),
                this.createButton(this.founderButton, t(locale, "menu.buttons.founder"), ButtonStyle.Secondary, "🏰", !founder),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.inventoryButton, t(locale, "menu.buttons.inventory"), ButtonStyle.Secondary, "🎁"),
                this.createButton(this.balanceButton, t(locale, "menu.buttons.balance"), ButtonStyle.Secondary, "💰"),
                this.createButton(this.marketButton, t(locale, "menu.buttons.market"), ButtonStyle.Primary, "🛒"),
                this.createButton(this.botShopButton, t(locale, "menu.buttons.botshop"), ButtonStyle.Secondary, "🏪"),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
            ),
        ];
    }

    private buildAdminItemsComponents(locale: LocalesCodes, items: ItemTemplateView[], hasPrev: boolean, hasNext: boolean, hasSelection: boolean) {
        return [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.adminItemSelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.admin_item"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(items.length
                        ? items.map(item => ({
                            label: `${item.emoji ?? "📦"} ${item.name}`.slice(0, 100),
                            description: `#${item.id} · ${item.rarityName}`.slice(0, 100),
                            value: String(item.id),
                        }))
                        : [{ label: t(locale, "menu.panels.admin_items_empty"), value: "0", default: true }])
                    .setDisabled(!items.length)
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.adminCreateItemButton, t(locale, "menu.buttons.create_item"), ButtonStyle.Success, "➕"),
                this.createButton(this.adminEditItemButton, t(locale, "menu.buttons.edit_item"), ButtonStyle.Secondary, "✏️", !hasSelection),
                this.createButton(this.adminDeleteItemButton, t(locale, "menu.buttons.delete_item"), ButtonStyle.Danger, "🗑️", !hasSelection),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.prevPageButton, t(locale, "menu.buttons.prev_page"), ButtonStyle.Secondary, "◀️", !hasPrev),
                this.createButton(this.nextPageButton, t(locale, "menu.buttons.next_page"), ButtonStyle.Secondary, "▶️", !hasNext),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
            ),
            this.buildBackCategoryRow(locale, this.adminButton),
        ];
    }

    private buildAdminRaritiesComponents(locale: LocalesCodes, items: ItemRarityView[], hasPrev: boolean, hasNext: boolean, hasSelection: boolean) {
        return [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.adminRaritySelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.admin_rarity"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(items.length
                        ? items.map(item => ({
                            label: item.name.slice(0, 100),
                            description: `#${item.id} · ${item.colorHex ?? t(locale, "menu.common.not_available")}`.slice(0, 100),
                            value: String(item.id),
                        }))
                        : [{ label: t(locale, "menu.panels.admin_rarities_empty"), value: "0", default: true }])
                    .setDisabled(!items.length)
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.adminCreateRarityButton, t(locale, "menu.buttons.create_rarity"), ButtonStyle.Success, "➕"),
                this.createButton(this.adminEditRarityButton, t(locale, "menu.buttons.edit_rarity"), ButtonStyle.Secondary, "✏️", !hasSelection),
                this.createButton(this.adminDeleteRarityButton, t(locale, "menu.buttons.delete_rarity"), ButtonStyle.Danger, "🗑️", !hasSelection),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.prevPageButton, t(locale, "menu.buttons.prev_page"), ButtonStyle.Secondary, "◀️", !hasPrev),
                this.createButton(this.nextPageButton, t(locale, "menu.buttons.next_page"), ButtonStyle.Secondary, "▶️", !hasNext),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
            ),
            this.buildBackCategoryRow(locale, this.adminButton),
        ];
    }

    private buildObsComponents(locale: LocalesCodes, scenes: string[], sources: Array<{ sourceName: string; enabled: boolean }>, hasSceneSelection: boolean, hasSourceSelection: boolean) {
        return [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.obsSceneSelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.obs_scene"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(scenes.length
                        ? scenes.slice(0, 25).map(scene => ({ label: scene.slice(0, 100), value: scene }))
                        : [{ label: t(locale, "commands.obs.no_scenes"), value: "none", default: true }])
                    .setDisabled(!scenes.length)
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.obsSourceSelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.obs_source"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(sources.length
                        ? sources.slice(0, 25).map(source => ({
                            label: source.sourceName.slice(0, 100),
                            description: (source.enabled ? t(locale, "menu.common.visible") : t(locale, "menu.common.hidden")).slice(0, 100),
                            value: source.sourceName,
                        }))
                        : [{ label: t(locale, "menu.panels.obs_sources_empty"), value: "none", default: true }])
                    .setDisabled(!sources.length)
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.obsStatusButton, t(locale, "menu.buttons.obs_status"), ButtonStyle.Secondary, "🛰️"),
                this.createButton(this.obsScenesButton, t(locale, "menu.buttons.obs_scenes"), ButtonStyle.Secondary, "🎬"),
                this.createButton(this.obsReconnectButton, t(locale, "menu.buttons.obs_reconnect"), ButtonStyle.Secondary, "🔌"),
                this.createButton(this.obsConfigShowButton, t(locale, "menu.buttons.obs_config_show"), ButtonStyle.Secondary, "👁️"),
                this.createButton(this.obsConfigSetButton, t(locale, "menu.buttons.obs_config_set"), ButtonStyle.Primary, "⚙️"),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.obsConfigClearButton, t(locale, "menu.buttons.obs_config_clear"), ButtonStyle.Danger, "🧹"),
                this.createButton(this.obsSwitchSceneButton, t(locale, "menu.buttons.obs_switch_scene"), ButtonStyle.Success, "🎞️", !hasSceneSelection),
                this.createButton(this.obsShowSourceButton, t(locale, "menu.buttons.obs_show_source"), ButtonStyle.Success, "🟢", !hasSceneSelection || !hasSourceSelection),
                this.createButton(this.obsHideSourceButton, t(locale, "menu.buttons.obs_hide_source"), ButtonStyle.Secondary, "⚫", !hasSceneSelection || !hasSourceSelection),
                this.createButton(this.obsSetTextButton, t(locale, "menu.buttons.obs_set_text"), ButtonStyle.Primary, "✍️", !hasSourceSelection),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.obsMediaActionButton, t(locale, "menu.buttons.obs_media_action"), ButtonStyle.Secondary, "🎵", !hasSourceSelection),
                this.createButton(this.adminButton, t(locale, "menu.buttons.admin"), ButtonStyle.Secondary, "🧰"),
                this.createButton(this.homeButton, t(locale, "menu.buttons.home"), ButtonStyle.Secondary, "🏠"),
            ),
        ];
    }

    private buildInventoryComponents(locale: LocalesCodes, items: InventoryItemView[], hasPrev: boolean, hasNext: boolean, allowUserPick: boolean, ownInventory: boolean, hasSelection: boolean, selectedTradeable: boolean) {
        const rows: any[] = [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.inventorySelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.inventory"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(items.length
                        ? items.map(item => ({
                            label: `${item.emoji ?? "📦"} ${item.name}`.slice(0, 100),
                            description: `#${item.inventoryItemId} · ${item.rarityName}`.slice(0, 100),
                            value: String(item.inventoryItemId),
                        }))
                        : [{ label: t(locale, "menu.panels.inventory_empty"), value: "0", default: true }])
                    .setDisabled(!items.length)
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.sellInventoryButton, t(locale, "menu.buttons.sell_bot"), ButtonStyle.Danger, "💸", !ownInventory || !hasSelection),
                this.createButton(this.inventoryListMarketButton, t(locale, "menu.buttons.list_market"), ButtonStyle.Primary, "📤", !ownInventory || !hasSelection || !selectedTradeable),
                this.createButton(this.prevPageButton, t(locale, "menu.buttons.prev_page"), ButtonStyle.Secondary, "◀️", !hasPrev),
                this.createButton(this.nextPageButton, t(locale, "menu.buttons.next_page"), ButtonStyle.Secondary, "▶️", !hasNext),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
            ),
        ];

        if (allowUserPick) {
            rows.push(
                new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId(this.inventoryUserSelect.toString())
                        .setPlaceholder(t(locale, "menu.selects.inventory_user"))
                        .setMinValues(1)
                        .setMaxValues(1)
                )
            );
        }

        rows.push(this.buildBackCategoryRow(locale, this.collectionButton));
        return rows;
    }

    private buildCraftComponents(locale: LocalesCodes, items: CraftRecipeView[], hasPrev: boolean, hasNext: boolean, hasSelection: boolean) {
        return [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.craftSelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.craft"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(items.length
                        ? items.map(item => ({
                            label: `${item.resultEmoji ?? "📦"} ${item.resultName}`.slice(0, 100),
                            description: `#${item.recipeId} · x${item.resultAmount}`.slice(0, 100),
                            value: String(item.recipeId),
                        }))
                        : [{ label: t(locale, "menu.panels.craft_empty"), value: "0", default: true }])
                    .setDisabled(!items.length)
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.craftSelectedButton, t(locale, "menu.buttons.craft"), ButtonStyle.Success, "🛠️", !hasSelection),
                this.createButton(this.prevPageButton, t(locale, "menu.buttons.prev_page"), ButtonStyle.Secondary, "◀️", !hasPrev),
                this.createButton(this.nextPageButton, t(locale, "menu.buttons.next_page"), ButtonStyle.Secondary, "▶️", !hasNext),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
            ),
            this.buildBackCategoryRow(locale, this.collectionButton),
        ];
    }

    private buildMarketComponents(locale: LocalesCodes, items: PublicMarketListingView[], ownListings: PublicMarketListingView[], inventoryItems: InventoryItemView[], hasPrev: boolean, hasNext: boolean, hasInventorySelection: boolean, selectedOwnListing: boolean, selectedForeignListing: boolean, marketFilter: MarketFilter) {
        const actionButtons: ButtonBuilder[] = [];

        if (selectedForeignListing) {
            actionButtons.push(
                this.createButton(this.buyMarketButton, t(locale, "menu.buttons.buy_selected"), ButtonStyle.Success, "🛒")
            );
        }

        if (selectedOwnListing) {
            actionButtons.push(
                this.createButton(this.editMarketPriceButton, t(locale, "menu.buttons.edit_price"), ButtonStyle.Secondary, "💱"),
                this.createButton(this.cancelMarketButton, t(locale, "menu.buttons.cancel_listing"), ButtonStyle.Danger, "🧾")
            );
        }

        if (!selectedForeignListing && hasInventorySelection) {
            actionButtons.push(
                this.createButton(this.listMarketButton, t(locale, "menu.buttons.list_market"), ButtonStyle.Primary, "📤")
            );
        }

        actionButtons.push(
            this.createButton(this.prevPageButton, t(locale, "menu.buttons.prev_page"), ButtonStyle.Secondary, "◀️", !hasPrev),
            this.createButton(this.nextPageButton, t(locale, "menu.buttons.next_page"), ButtonStyle.Secondary, "▶️", !hasNext)
        );

        return [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.marketSelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.market"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(items.length
                        ? items.map(item => ({
                            label: `${item.emoji ?? "📦"} ${item.name}`.slice(0, 100),
                            description: `#${item.listingId} · ${item.price} ODM`.slice(0, 100),
                            value: String(item.listingId),
                        }))
                        : [{ label: t(locale, "menu.panels.market_empty"), value: "0", default: true }])
                    .setDisabled(!items.length)
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.ownMarketSelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.market_own"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(ownListings.length
                        ? ownListings.map(item => ({
                            label: `${item.emoji ?? "📦"} ${item.name}`.slice(0, 100),
                            description: `#${item.listingId} · ${item.price} ODM`.slice(0, 100),
                            value: String(item.listingId),
                        }))
                        : [{ label: t(locale, "menu.panels.market_own_empty"), value: "0", default: true }])
                    .setDisabled(!ownListings.length)
            ),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.marketInventorySelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.market_inventory"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(inventoryItems.length
                        ? inventoryItems.map(item => ({
                            label: `${item.emoji ?? "📦"} ${item.name}`.slice(0, 100),
                            description: `#${item.inventoryItemId} · ${item.rarityName}`.slice(0, 100),
                            value: String(item.inventoryItemId),
                        }))
                        : [{ label: t(locale, "menu.messages.no_tradeable_items"), value: "0", default: true }])
                    .setDisabled(!inventoryItems.length)
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(...actionButtons),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.cycleMarketFilterButton, t(locale, `menu.market_filter_button.${marketFilter}`), ButtonStyle.Secondary, "🧭"),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
                this.createButton(this.economyButton, t(locale, "menu.buttons.back_category"), ButtonStyle.Secondary, "↩️"),
                this.createButton(this.homeButton, t(locale, "menu.buttons.home"), ButtonStyle.Secondary, "🏠"),
            ),
        ];
    }

    private buildBotShopComponents(locale: LocalesCodes, items: BotShopListingView[], hasPrev: boolean, hasNext: boolean, hasSelection: boolean) {
        return [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(this.botshopSelect.toString())
                    .setPlaceholder(t(locale, "menu.selects.botshop"))
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setOptions(items.length
                        ? items.map(item => ({
                            label: `${item.emoji ?? "📦"} ${item.name}`.slice(0, 100),
                            description: `#${item.listingId} · ${item.price} ODM`.slice(0, 100),
                            value: String(item.listingId),
                        }))
                        : [{ label: t(locale, "menu.panels.botshop_empty"), value: "0", default: true }])
                    .setDisabled(!items.length)
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.buyBotshopButton, t(locale, "menu.buttons.buy_selected"), ButtonStyle.Success, "🛍️", !hasSelection),
                this.createButton(this.prevPageButton, t(locale, "menu.buttons.prev_page"), ButtonStyle.Secondary, "◀️", !hasPrev),
                this.createButton(this.nextPageButton, t(locale, "menu.buttons.next_page"), ButtonStyle.Secondary, "▶️", !hasNext),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
            ),
            this.buildBackCategoryRow(locale, this.economyButton),
        ];
    }

    private buildPagedComponents(locale: LocalesCodes, backTarget: CommandDTO, hasPrev: boolean, hasNext: boolean) {
        return [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                this.createButton(this.prevPageButton, t(locale, "menu.buttons.prev_page"), ButtonStyle.Secondary, "◀️", !hasPrev),
                this.createButton(this.nextPageButton, t(locale, "menu.buttons.next_page"), ButtonStyle.Secondary, "▶️", !hasNext),
                this.createButton(this.refreshButton, t(locale, "menu.buttons.refresh"), ButtonStyle.Secondary, "🔄"),
            ),
            this.buildBackCategoryRow(locale, backTarget),
        ];
    }

    private buildBackCategoryRow(locale: LocalesCodes, target: CommandDTO) {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            this.createButton(target, t(locale, "menu.buttons.back_category"), ButtonStyle.Secondary, "↩️"),
            this.createButton(this.homeButton, t(locale, "menu.buttons.home"), ButtonStyle.Secondary, "🏠"),
        );
    }

    private buildBackHomeRow(locale: LocalesCodes) {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            this.createButton(this.homeButton, t(locale, "menu.buttons.home"), ButtonStyle.Secondary, "🏠"),
        );
    }

    private buildInventoryDescription(locale: LocalesCodes, items: InventoryItemView[], page: number, totalPages: number, viewerId: string, targetUserId: string, notice?: string) {
        return [
            notice ? `> ${notice}` : null,
            t(locale, "menu.inventory_owner.label", {
                owner: viewerId === targetUserId ? t(locale, "menu.inventory_owner.self") : `<@${targetUserId}>`,
            }),
            t(locale, "menu.page_status", { current: String(page + 1), total: String(totalPages) }),
            "",
            ...(items.length
                ? items.map(item => `${item.emoji ?? "📦"}  **${item.name}**  ·  #${item.inventoryItemId}\n${t(locale, "menu.inventory_line_meta", { rarity: item.rarityName, type: item.itemType })}`)
                : [t(locale, "menu.panels.inventory_empty")]),
        ].filter(Boolean).join("\n\n");
    }

    private buildCraftDescription(locale: LocalesCodes, items: CraftRecipeView[], page: number, totalPages: number, notice?: string) {
        return [
            notice ? `> ${notice}` : null,
            t(locale, "menu.page_status", { current: String(page + 1), total: String(totalPages) }),
            "",
            ...(items.length
                ? items.map(recipe => `${recipe.resultEmoji ?? "📦"}  **${recipe.resultName}** x${recipe.resultAmount}\n#${recipe.recipeId} · ${recipe.ingredients.map(ingredient => `${ingredient.emoji ?? "📦"}${ingredient.name} x${ingredient.amount}`).join(", ")}`)
                : [t(locale, "menu.panels.craft_empty")]),
        ].filter(Boolean).join("\n\n");
    }

    private buildMarketDescription(locale: LocalesCodes, items: PublicMarketListingView[], page: number, totalPages: number, notice?: string, selectedListing?: PublicMarketListingView, selectedInventoryItem?: InventoryItemView, userId?: string, marketFilter: MarketFilter = "all") {
        const selectionStatus = selectedInventoryItem
            ? t(locale, "menu.market_selection.inventory", {
                name: selectedInventoryItem.name,
                id: String(selectedInventoryItem.inventoryItemId),
            })
            : selectedListing
                ? selectedListing.sellerDiscordId === userId
                    ? t(locale, "menu.market_selection.own_listing", {
                        name: selectedListing.name,
                        id: String(selectedListing.listingId),
                        price: String(selectedListing.price),
                    })
                    : t(locale, "menu.market_selection.foreign_listing", {
                        name: selectedListing.name,
                        id: String(selectedListing.listingId),
                        price: String(selectedListing.price),
                    })
                : t(locale, "menu.market_selection.none");

        return [
            notice ? `> ${notice}` : null,
            t(locale, "menu.page_status", { current: String(page + 1), total: String(totalPages) }),
            `• ${t(locale, `menu.market_filter_state.${marketFilter}`)}`,
            `• ${selectionStatus}`,
            "",
            ...(items.length
                ? items.map(item => `${item.emoji ?? "📦"}  **${item.name}**  ·  ${item.price} ODM\n#${item.listingId} · ${t(locale, "menu.market_seller_short", { seller: `<@${item.sellerDiscordId}>` })}`)
                : [t(locale, "menu.panels.market_empty")]),
        ].filter(Boolean).join("\n\n");
    }

    private buildOwnMarketListingsDescription(locale: LocalesCodes, ownListings: PublicMarketListingView[]) {
        if (!ownListings.length) {
            return t(locale, "menu.panels.market_own_empty");
        }

        const preview = ownListings.slice(0, 3).map(item => `${item.emoji ?? "📦"} **${item.name}** · #${item.listingId} · ${item.price} ODM`);
        const remaining = ownListings.length - preview.length;

        return [
            t(locale, "menu.panels.market_own_summary", { count: String(ownListings.length) }),
            "",
            ...preview,
            remaining > 0 ? t(locale, "menu.panels.market_own_more", { count: String(remaining) }) : null,
        ].filter(Boolean).join("\n");
    }

    private buildBotShopDescription(locale: LocalesCodes, items: BotShopListingView[], page: number, totalPages: number, notice?: string) {
        return [
            notice ? `> ${notice}` : null,
            t(locale, "menu.page_status", { current: String(page + 1), total: String(totalPages) }),
            "",
            ...(items.length
                ? items.map(item => `${item.emoji ?? "📦"}  **${item.name}**  ·  ${item.price} ODM\n#${item.listingId} · ${item.rarityName}`)
                : [t(locale, "menu.panels.botshop_empty")]),
        ].filter(Boolean).join("\n\n");
    }

    private buildAdminItemsDescription(locale: LocalesCodes, items: ItemTemplateView[], page: number, totalPages: number, notice?: string) {
        return [
            notice ? `> ${notice}` : null,
            t(locale, "menu.panels.admin_items_description"),
            t(locale, "menu.page_status", { current: String(page + 1), total: String(totalPages) }),
            "",
            ...(items.length
                ? items.map(item => `${item.emoji ?? "📦"}  **${item.name}**  ·  #${item.id}\n${t(locale, "menu.admin_item_line_meta", { rarity: item.rarityName, type: item.itemType })}`)
                : [t(locale, "menu.panels.admin_items_empty")]),
        ].filter(Boolean).join("\n\n");
    }

    private buildAdminRaritiesDescription(locale: LocalesCodes, items: ItemRarityView[], page: number, totalPages: number, notice?: string) {
        return [
            notice ? `> ${notice}` : null,
            t(locale, "menu.panels.admin_rarities_description"),
            t(locale, "menu.page_status", { current: String(page + 1), total: String(totalPages) }),
            "",
            ...(items.length
                ? items.map(item => `**${item.name}**  ·  #${item.id}\n${t(locale, "menu.admin_rarity_line_meta", { color: item.colorHex ?? t(locale, "menu.common.not_available") })}`)
                : [t(locale, "menu.panels.admin_rarities_empty")]),
        ].filter(Boolean).join("\n\n");
    }

    private buildAdminItemDetailEmbed(locale: LocalesCodes, item: ItemTemplateView) {
        const embed = new EmbedBuilder()
            .setColor(this.resolveHexColor(item.rarityColorHex, 0xa9785b))
            .setTitle(`${item.emoji ?? "📦"} ${item.name}`)
            .setDescription(item.description)
            .addFields(
                { name: t(locale, "menu.detail_fields.id"), value: `#${item.id}`, inline: true },
                { name: t(locale, "menu.detail_fields.rarity"), value: item.rarityName, inline: true },
                { name: t(locale, "menu.detail_fields.type"), value: item.itemType, inline: true },
                { name: t(locale, "menu.detail_fields.tradeable"), value: t(locale, `menu.common.${item.tradeable ? "yes" : "no"}`), inline: true },
                { name: t(locale, "menu.detail_fields.sellable"), value: t(locale, `menu.common.${item.sellable ? "yes" : "no"}`), inline: true },
                { name: t(locale, "menu.detail_fields.price"), value: item.botSellPrice === null ? t(locale, "menu.common.not_available") : `${item.botSellPrice} ODM`, inline: true },
            );

        if (item.imageUrl) {
            embed.setImage(item.imageUrl);
        }

        return embed;
    }

    private buildAdminRarityDetailEmbed(locale: LocalesCodes, rarity: ItemRarityView) {
        return new EmbedBuilder()
            .setColor(this.resolveHexColor(rarity.colorHex, 0xa9785b))
            .setTitle(`💎 ${rarity.name}`)
            .setDescription(t(locale, "menu.panels.admin_rarity_detail", {
                id: String(rarity.id),
                color: rarity.colorHex ?? t(locale, "menu.common.not_available"),
            }))
            .addFields(
                { name: t(locale, "menu.detail_fields.id"), value: `#${rarity.id}`, inline: true },
                { name: t(locale, "menu.detail_fields.color"), value: rarity.colorHex ?? t(locale, "menu.common.not_available"), inline: true },
            );
    }

    private async resolveSelectedAdminItem(items: ItemTemplateView[], selectedId?: number) {
        if (!selectedId) {
            return undefined;
        }

        return items.find(item => item.id === selectedId);
    }

    private async showAdminItemModal(interaction: { showModal(modal: ModalBuilder): Promise<void> }, locale: LocalesCodes, modalId: CommandDTO, item?: ItemTemplateView) {
        const modal = new ModalBuilder()
            .setCustomId(modalId.toString())
            .setTitle(t(locale, modalId.toString() === this.adminItemEditModal.toString() ? "menu.modals.admin_item_edit_title" : "menu.modals.admin_item_create_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("name")
                        .setLabel(t(locale, "menu.modals.admin_item_name_label"))
                        .setPlaceholder(t(locale, "menu.modals.admin_item_name_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(item?.name ?? "")
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("description")
                        .setLabel(t(locale, "menu.modals.admin_item_description_label"))
                        .setPlaceholder(t(locale, "menu.modals.admin_item_description_placeholder"))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setValue(item?.description ?? "")
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("rarity")
                        .setLabel(t(locale, "menu.modals.admin_item_rarity_label"))
                        .setPlaceholder(t(locale, "menu.modals.admin_item_rarity_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(item?.rarityName ?? "")
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("type")
                        .setLabel(t(locale, "menu.modals.admin_item_type_label"))
                        .setPlaceholder(t(locale, "menu.modals.admin_item_type_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(item?.itemType ?? "")
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("config")
                        .setLabel(t(locale, "menu.modals.admin_item_config_label"))
                        .setPlaceholder(t(locale, "menu.modals.admin_item_config_placeholder"))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setValue(this.buildAdminItemConfigValue(item))
                ),
            );

        await interaction.showModal(modal);
    }

    private async showAdminRarityModal(interaction: { showModal(modal: ModalBuilder): Promise<void> }, locale: LocalesCodes, modalId: CommandDTO, rarity?: ItemRarityView) {
        const modal = new ModalBuilder()
            .setCustomId(modalId.toString())
            .setTitle(t(locale, modalId.toString() === this.adminRarityEditModal.toString() ? "menu.modals.admin_rarity_edit_title" : "menu.modals.admin_rarity_create_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("name")
                        .setLabel(t(locale, "menu.modals.admin_rarity_name_label"))
                        .setPlaceholder(t(locale, "menu.modals.admin_rarity_name_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(rarity?.name ?? "")
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("color")
                        .setLabel(t(locale, "menu.modals.admin_rarity_color_label"))
                        .setPlaceholder(t(locale, "menu.modals.admin_rarity_color_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                        .setValue(rarity?.colorHex ?? "")
                ),
            );

        await interaction.showModal(modal);
    }

    private buildAdminItemConfigValue(item?: ItemTemplateView) {
        if (!item) {
            return "";
        }

        return [
            `emoji=${item.emoji ?? ""}`,
            `imageUrl=${item.imageUrl ?? ""}`,
            `tradeable=${item.tradeable ? "yes" : "no"}`,
            `botSellPrice=${item.botSellPrice ?? ""}`,
        ].join("\n");
    }

    private parseAdminItemModal(interaction: ModalSubmitInteraction): { success: true; data: { name: string; description: string; emoji?: string | null; imageUrl?: string | null; rarityName: string; typeName: string; tradeable: boolean; botSellPrice?: number | null } } | { success: false; message: string } {
        const locale = interaction.locale as LocalesCodes;

        try {
            const configValue = interaction.fields.getTextInputValue("config");
            const configEntries = Object.fromEntries(
                configValue
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(Boolean)
                    .map(line => {
                        const separatorIndex = line.indexOf("=");
                        if (separatorIndex === -1) {
                            throw new Error(t(locale, "menu.messages.admin_item_config_invalid"));
                        }

                        const key = line.slice(0, separatorIndex).trim().toLowerCase();
                        const value = line.slice(separatorIndex + 1).trim();
                        return [key, value];
                    })
            );

            const tradeableRaw = (configEntries.tradeable ?? "yes").toLowerCase();
            if (!["yes", "no", "true", "false", "1", "0", "да", "нет", "jah", "ei"].includes(tradeableRaw)) {
                return { success: false, message: t(locale, "menu.messages.admin_item_tradeable_invalid") };
            }

            const botSellPriceRaw = configEntries.botsellprice ?? configEntries.sellprice ?? "";
            const parsedBotSellPrice = botSellPriceRaw === "" ? undefined : Number(botSellPriceRaw);
            if (botSellPriceRaw !== "" && (typeof parsedBotSellPrice !== "number" || !Number.isFinite(parsedBotSellPrice) || parsedBotSellPrice < 0)) {
                return { success: false, message: t(locale, "menu.messages.admin_item_price_invalid") };
            }

            return {
                success: true,
                data: {
                    name: interaction.fields.getTextInputValue("name"),
                    description: interaction.fields.getTextInputValue("description"),
                    rarityName: interaction.fields.getTextInputValue("rarity"),
                    typeName: interaction.fields.getTextInputValue("type"),
                    emoji: configEntries.emoji || null,
                    imageUrl: configEntries.imageurl || configEntries.image || null,
                    tradeable: ["yes", "true", "1", "да", "jah"].includes(tradeableRaw),
                    botSellPrice: parsedBotSellPrice ?? null,
                },
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : t(locale, "menu.messages.admin_item_config_invalid"),
            };
        }
    }

    private resolveHexColor(colorHex: string | null | undefined, fallback: number) {
        if (!colorHex) {
            return fallback;
        }

        const normalized = colorHex.replace(/^#/, "");
        const parsed = Number.parseInt(normalized, 16);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    private buildInventoryDetailEmbed(locale: LocalesCodes, item: InventoryItemView) {
        const embed = new EmbedBuilder()
            .setColor(0x6d9f86)
            .setTitle(`${item.emoji ?? "📦"} ${item.name}`)
            .setDescription([
                item.description,
                `• ${item.tradeable ? "📤" : "🔒"} ${t(locale, `menu.common.${item.tradeable ? "yes" : "no"}`)} · ${item.sellable ? "💸" : "🪵"} ${item.botSellPrice ?? t(locale, "menu.common.not_available")}`,
            ].join("\n\n"))
            .addFields(
                { name: t(locale, "menu.detail_fields.id"), value: `#${item.inventoryItemId}`, inline: true },
                { name: t(locale, "menu.detail_fields.rarity"), value: item.rarityName, inline: true },
                { name: t(locale, "menu.detail_fields.type"), value: item.itemType, inline: true },
            );

        if (item.imageUrl) {
            embed.setImage(item.imageUrl);
        }

        return embed;
    }

    private buildCraftDetailEmbed(locale: LocalesCodes, recipe: CraftRecipeView) {
        return new EmbedBuilder()
            .setColor(0x6d9f86)
            .setTitle(`${recipe.resultEmoji ?? "📦"} ${recipe.resultName}`)
            .setDescription(recipe.description ?? t(locale, "commands.craftinfo.no_description"))
            .addFields(
                { name: t(locale, "menu.detail_fields.id"), value: `#${recipe.recipeId}`, inline: true },
                { name: t(locale, "menu.detail_fields.result"), value: `x${recipe.resultAmount}`, inline: true },
                { name: t(locale, "menu.detail_fields.ingredients"), value: recipe.ingredients.map(ingredient => `${ingredient.emoji ?? "📦"} ${ingredient.name} x${ingredient.amount}`).join("\n") || "-" },
            );
    }

    private buildMarketDetailEmbed(locale: LocalesCodes, item: PublicMarketListingView) {
        const embed = new EmbedBuilder()
            .setColor(0x9d8a3d)
            .setTitle(`${item.emoji ?? "📦"} ${item.name}`)
            .setDescription([
                item.description,
                `• ${item.tradeable ? "📤" : "🔒"} ${t(locale, `menu.common.${item.tradeable ? "yes" : "no"}`)} · ${item.sellable ? "💸" : "🪵"} ${item.botSellPrice ?? t(locale, "menu.common.not_available")}`,
            ].join("\n\n"))
            .addFields(
                { name: t(locale, "menu.detail_fields.id"), value: `#${item.listingId}`, inline: true },
                { name: t(locale, "menu.detail_fields.price"), value: `${item.price} ODM`, inline: true },
                { name: t(locale, "menu.detail_fields.seller"), value: `<@${item.sellerDiscordId}>`, inline: true },
            );

        if (item.imageUrl) {
            embed.setImage(item.imageUrl);
        }

        return embed;
    }

    private buildBotShopDetailEmbed(locale: LocalesCodes, item: BotShopListingView) {
        const embed = new EmbedBuilder()
            .setColor(0x9d8a3d)
            .setTitle(`${item.emoji ?? "📦"} ${item.name}`)
            .setDescription([
                item.description,
                `• ${item.tradeable ? "📤" : "🔒"} ${t(locale, `menu.common.${item.tradeable ? "yes" : "no"}`)} · ${item.sellable ? "💸" : "🪵"} ${item.botSellPrice ?? t(locale, "menu.common.not_available")}`,
            ].join("\n\n"))
            .addFields(
                { name: t(locale, "menu.detail_fields.id"), value: `#${item.listingId}`, inline: true },
                { name: t(locale, "menu.detail_fields.price"), value: `${item.price} ODM`, inline: true },
                { name: t(locale, "menu.detail_fields.rarity"), value: item.rarityName, inline: true },
            );

        if (item.imageUrl) {
            embed.setImage(item.imageUrl);
        }

        return embed;
    }

    private resolveSelectedEntity<T>(items: T[], selectedId: number | undefined, getId: (item: T) => number): T | undefined {
        return selectedId ? items.find(item => getId(item) === selectedId) : undefined;
    }

    private simplePanel(title: string, description: string, locale: LocalesCodes, components: any[]) {
        return {
            embeds: [new EmbedBuilder().setColor(0xf5edd9).setTitle(title).setDescription(description)],
            components,
        };
    }

    private createButton(customId: CommandDTO, label: string, style: ButtonStyle, emoji?: string, disabled = false) {
        const button = new ButtonBuilder()
            .setCustomId(customId.toString())
            .setLabel(label)
            .setStyle(style)
            .setDisabled(disabled);

        if (emoji) {
            button.setEmoji(emoji);
        }

        return button;
    }

    private createDefaultSession(userId: string, guildId?: string): MenuSessionState {
        return {
            screen: "home",
            inventoryPage: 0,
            craftPage: 0,
            marketPage: 0,
            botshopPage: 0,
            adminItemsPage: 0,
            adminRaritiesPage: 0,
            marketFilter: "all",
            guildId,
            inventoryTargetUserId: userId,
            selectedContributorUserId: undefined,
            selectedObsSceneName: undefined,
            selectedObsSourceName: undefined,
            selectedAdminItemTemplateId: undefined,
            selectedAdminRarityId: undefined,
            selectedInventoryItemId: undefined,
            selectedCraftRecipeId: undefined,
            selectedMarketListingId: undefined,
            selectedBotshopListingId: undefined,
            selectedMarketInventoryItemId: undefined,
        };
    }

    private readSession(userId: string): MenuSessionState {
        const existing = commandSessionHandler.getSession(userId, this.commandName) as Partial<MenuSessionState> | undefined;
        return {
            ...this.createDefaultSession(userId),
            ...(existing ?? {}),
        };
    }

    private persistSession(userId: string, state: MenuSessionState) {
        const existing = commandSessionHandler.getSession(userId, this.commandName);
        if (existing) {
            commandSessionHandler.updateSession(userId, this.commandName, state);
            return;
        }

        commandSessionHandler.createSession(userId, this.commandName, state);
    }

    private shiftPage(state: MenuSessionState, delta: number) {
        switch (state.screen) {
            case "inventory":
                state.inventoryPage += delta;
                break;
            case "craft":
                state.craftPage += delta;
                break;
            case "market":
                state.marketPage += delta;
                break;
            case "botshop":
                state.botshopPage += delta;
                break;
            case "admin_items":
                state.adminItemsPage += delta;
                break;
            case "admin_rarities":
                state.adminRaritiesPage += delta;
                break;
            default:
                break;
        }
    }

    private getTotalPages(totalItems: number) {
        return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    }

    private clampPage(page: number, totalPages: number) {
        return Math.min(Math.max(page, 0), Math.max(totalPages - 1, 0));
    }

    private slicePage<T>(items: T[], page: number) {
        return items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    }

    private applyMarketFilter(items: PublicMarketListingView[], userId: string, marketFilter: MarketFilter) {
        switch (marketFilter) {
            case "own":
                return items.filter(item => item.sellerDiscordId === userId);
            case "foreign":
                return items.filter(item => item.sellerDiscordId !== userId);
            case "all":
            default:
                return items;
        }
    }

    private async showMarketPriceModal(interaction: { showModal(modal: ModalBuilder): Promise<void> }, locale: LocalesCodes, modalId: CommandDTO = this.marketPriceModal, initialValue?: string) {
        const modal = new ModalBuilder()
            .setCustomId(modalId.toString())
            .setTitle(t(locale, modalId.toString() === this.marketEditPriceModal.toString() ? "menu.modals.market_edit_price_title" : "menu.modals.market_price_title"))
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("price")
                        .setLabel(t(locale, modalId.toString() === this.marketEditPriceModal.toString() ? "menu.modals.market_edit_price_label" : "menu.modals.market_price_label"))
                        .setPlaceholder(t(locale, modalId.toString() === this.marketEditPriceModal.toString() ? "menu.modals.market_edit_price_placeholder" : "menu.modals.market_price_placeholder"))
                        .setStyle(TextInputStyle.Short)
                        .setValue(initialValue ?? "")
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);
    }

    private async setObsSourceVisibility(interaction: Parameters<ButtonExecutionFunc>[0], visible: boolean) {
        const locale = await this.getLocale(interaction.user.id);
        const state = this.readSession(interaction.user.id);
        if (!state.selectedObsSceneName) {
            await interaction.reply({ content: t(locale, "menu.messages.select_obs_scene_first"), flags: ["Ephemeral"] });
            return;
        }

        if (!state.selectedObsSourceName) {
            await interaction.reply({ content: t(locale, "menu.messages.select_obs_source_first"), flags: ["Ephemeral"] });
            return;
        }

        try {
            await obsService.setSourceVisibility(state.selectedObsSceneName, state.selectedObsSourceName, visible);
            await this.updateComponentReply(interaction, () => this.renderState(interaction.user.id, locale, state, t(locale, "commands.obs.visibility", {
                source: state.selectedObsSourceName!,
                scene: state.selectedObsSceneName!,
                state: t(locale, `menu.common.${visible ? "visible" : "hidden"}`),
            })));
        } catch (error) {
            await this.replyToComponentInteraction(interaction, error instanceof Error ? error.message : t(locale, "commands.obs.failed"));
        }
    }

    private normalizeObsMediaAction(input: string): ObsMediaAction | null {
        const normalizedInput = input.trim().toLowerCase();
        const aliases: Record<string, ObsMediaAction> = {
            play: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
            pause: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE",
            stop: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
            restart: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
            next: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT",
            previous: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS",
            prev: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS",
            "obs_websocket_media_input_action_play": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
            "obs_websocket_media_input_action_pause": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE",
            "obs_websocket_media_input_action_stop": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
            "obs_websocket_media_input_action_restart": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
            "obs_websocket_media_input_action_next": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT",
            "obs_websocket_media_input_action_previous": "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS",
        };

        return aliases[normalizedInput] ?? null;
    }

    private async updateComponentReply(interaction: MenuComponentInteraction, payloadFactory: () => Promise<{ embeds?: EmbedBuilder[]; components?: any[] }>) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }

        await interaction.editReply(await payloadFactory());
    }

    private async replyToComponentInteraction(interaction: MenuComponentInteraction, content: string) {
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content, flags: ["Ephemeral"] });
            return;
        }

        await interaction.reply({ content, flags: ["Ephemeral"] });
    }

    private async respondAfterModal(interaction: ModalSubmitInteraction, payloadFactory: () => Promise<{ embeds?: EmbedBuilder[]; components?: any[] }>) {
        if (interaction.isFromMessage()) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            await interaction.editReply(await payloadFactory());
            return;
        }

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: ["Ephemeral"] });
        }

        await interaction.editReply(await payloadFactory());
    }

    private async getLocale(discordUserId: string): Promise<LocalesCodes> {
        const response = await localeService.getMemberLocale(discordUserId);
        return response.data;
    }

    private async getBalanceSummary(userId: string, locale: LocalesCodes): Promise<string> {
        const response = await dataBaseHandler.getFromTable<MembersDB>("members", { ds_member_id: userId }, ["balance", "ldm_balance"]);
        if (DataBaseHandler.isFail(response) || !response.data.length) {
            return t(locale, "menu.balance_unavailable");
        }

        const member = response.data[0];
        return `${member.balance} ODM · ${member.ldm_balance ?? 0} LDM`;
    }

    private async getMenuOverviewCounts(userId: string, locale: LocalesCodes) {
        const [inventoryResponse, craftResponse, marketResponse, botshopResponse] = await Promise.all([
            itemService.getInventory(userId),
            itemService.listCraftRecipes(),
            itemService.listPublicMarket(),
            itemService.listBotShop(),
        ]);

        return {
            inventory: inventoryResponse.success ? String(inventoryResponse.data.length) : t(locale, "menu.common.not_available"),
            craft: craftResponse.success ? String(craftResponse.data.length) : t(locale, "menu.common.not_available"),
            market: marketResponse.success ? String(marketResponse.data.length) : t(locale, "menu.common.not_available"),
            botshop: botshopResponse.success ? String(botshopResponse.data.length) : t(locale, "menu.common.not_available"),
        };
    }
}
