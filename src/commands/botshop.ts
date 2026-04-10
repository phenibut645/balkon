import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class BotShopCommand extends Command {
    commandName: CommandName = "botshop";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Bot shop operations.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Show bot shop listings.")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add or update a bot shop listing.")
                .addIntegerOption(option =>
                    option.setName("item_id")
                        .setDescription("Item template id")
                        .setAutocomplete(true)
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option.setName("price")
                        .setDescription("ODM price")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("buy")
                .setDescription("Buy an item from the bot shop.")
                .addIntegerOption(option =>
                    option.setName("listing_id")
                        .setDescription("Bot shop listing id")
                        .setAutocomplete(true)
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName("amount")
                        .setDescription("How many copies to buy")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("sell")
                .setDescription("Sell one inventory item to the bot.")
                .addIntegerOption(option =>
                    option.setName("inventory_item_id")
                        .setDescription("Inventory item id")
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "list") {
            const response = await itemService.listBotShop();
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.botshop.load_failed"), flags: ["Ephemeral"] });
                return;
            }

            if (!response.data.length) {
                await interaction.reply({ content: t(locale, "commands.botshop.empty"), flags: ["Ephemeral"] });
                return;
            }

            const text = response.data.slice(0, 20).map(listing =>
                t(locale, "commands.botshop.line", {
                    id: String(listing.listingId),
                    emoji: listing.emoji ?? "📦",
                    name: listing.name,
                    rarity: listing.rarityName,
                    price: String(listing.price),
                })
            ).join("\n");

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(t(locale, "commands.botshop.title"))
                        .setDescription(text)
                        .addFields(
                            { name: t(locale, "commands.botshop.summary_label"), value: t(locale, "commands.botshop.summary_value", { count: String(response.data.length) }) },
                            { name: t(locale, "commands.botshop.actions_label"), value: t(locale, "commands.botshop.actions_value") },
                        )
                ],
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "add") {
            if (!await ensureBotAdmin(interaction)) return;

            const itemId = interaction.options.getInteger("item_id", true);
            const price = interaction.options.getNumber("price", true);

            if (price <= 0) {
                await interaction.reply({ content: t(locale, "commands.botshop.price_positive"), flags: ["Ephemeral"] });
                return;
            }

            const response = await itemService.addOrUpdateBotShopListing(itemId, price);
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.botshop.update_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                content: t(locale, "commands.botshop.update_success", {
                    listingId: String(response.data.listingId),
                    price: String(Number(price.toFixed(2))),
                }),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "buy") {
            const listingId = interaction.options.getInteger("listing_id", true);
            const amount = interaction.options.getInteger("amount") ?? 1;

            if (amount <= 0) {
                await interaction.reply({ content: t(locale, "commands.botshop.amount_positive"), flags: ["Ephemeral"] });
                return;
            }

            const response = await itemService.buyFromBotShop(interaction.user.id, listingId, amount);
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.botshop.buy_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                content: t(locale, "commands.botshop.buy_success", {
                    inserted: String(response.data.inserted),
                    listingId: String(listingId),
                }),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "sell") {
            const inventoryItemId = interaction.options.getInteger("inventory_item_id", true);
            const response = await itemService.sellInventoryItemToBot(interaction.user.id, inventoryItemId);

            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.botshop.sell_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                content: t(locale, "commands.botshop.sell_success", {
                    inventoryItemId: String(inventoryItemId),
                    price: String(response.data.price),
                }),
                flags: ["Ephemeral"],
            });
        }
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "item_id") {
            const response = await itemService.searchItemTemplates(String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        if (focused.name === "listing_id") {
            const response = await itemService.searchBotShopListings(String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        if (focused.name === "inventory_item_id") {
            const response = await itemService.searchUserInventory(interaction.user.id, String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        await interaction.respond([]);
    };
}
