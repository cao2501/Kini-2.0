import {
  Interaction, StringSelectMenuInteraction,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { CardRenderer } from '../../../core/ui/CardRenderer';
import { createModuleLogger } from '../../../core/logger/Logger';

const log = createModuleLogger('economy');

const TYPE_EMOJI: Record<string, string> = {
  ROLE: '🎭',
  CUSTOM: '🎁',
};

export default class ShopInteractionEvent implements IEvent<'interactionCreate'> {
  name = 'interactionCreate' as const;

  async execute(kernel: Kernel, interaction: Interaction): Promise<void> {
    // ─── Select Menu: shop detail ─────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'shop:detail') {
      await this.handleDetailSelect(kernel, interaction as StringSelectMenuInteraction);
      return;
    }

    // ─── Button: shop buy confirm ─────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('shop:buy:')) {
      await this.handleBuyConfirm(kernel, interaction);
      return;
    }

    // ─── Button: shop category filter ─────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('shop:category:')) {
      await this.handleCategorySelect(kernel, interaction);
      return;
    }
  }

  // ── Handle Category Select button ──────────────────────────────────────
  private async handleCategorySelect(kernel: Kernel, interaction: any): Promise<void> {
    await interaction.deferUpdate();
    const category = interaction.customId.replace('shop:category:', '');
    const guildId = interaction.guildId!;

    const items = await kernel.db.shopItem.findMany({
      where: { guildId, enabled: true, category },
      orderBy: { price: 'asc' },
    });

    if (!items.length) {
      return void interaction.followUp({
        content: `🏪 Cửa hàng danh mục **${category === 'RING' ? 'Nhẫn Cưới' : 'Vật Phẩm'}** đang trống.`,
        ephemeral: true
      });
    }

    const buffer = await CardRenderer.drawShopListCard(interaction.guild!.name, items);
    const attachment = new AttachmentBuilder(buffer, { name: 'shop.png' });

    const selectOptions = items.slice(0, 25).map((item, idx) => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`#${idx + 1} ${item.name}`)
        .setDescription(`💰 ${item.price.toLocaleString()} ${item.currency === 'VND' ? 'VNĐ' : 'coins'}`)
        .setValue(`shop_item:${item.id}`);

      const emojiVal = item.emoji || TYPE_EMOJI[item.type] || '🛒';
      try {
        option.setEmoji(emojiVal);
      } catch {
        option.setEmoji('🛒');
      }
      return option;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('shop:detail')
      .setPlaceholder('🔍 Chọn sản phẩm để xem chi tiết...')
      .addOptions(selectOptions);

    const rowMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const btnGeneral = new ButtonBuilder()
      .setCustomId('shop:category:GENERAL')
      .setLabel('📦 Vật Phẩm')
      .setStyle(category === 'GENERAL' ? ButtonStyle.Primary : ButtonStyle.Secondary);

    const btnRing = new ButtonBuilder()
      .setCustomId('shop:category:RING')
      .setLabel('💍 Nhẫn Cưới')
      .setStyle(category === 'RING' ? ButtonStyle.Primary : ButtonStyle.Secondary);

    const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(btnGeneral, btnRing);

    await interaction.editReply({
      files: [attachment],
      attachments: [],
      components: [rowMenu, rowButtons]
    });
  }

  // ── Show item detail card using Canvas ─────────────────────────────────
  private async handleDetailSelect(kernel: Kernel, interaction: StringSelectMenuInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // Value format: "shop_item:<id>"
    const itemId = interaction.values[0].replace('shop_item:', '');
    const item = await kernel.db.shopItem.findUnique({ where: { id: itemId } });

    if (!item || !item.enabled) {
      return void interaction.editReply('❌ Sản phẩm không tồn tại hoặc đã bị tắt.');
    }

    const stockText = item.stock !== null
      ? (item.stock > 0 ? `${item.stock} sản phẩm` : 'Hết hàng')
      : 'Vô hạn';

    const rewardText = item.type === 'ROLE' && item.roleId
      ? `Role: ${interaction.guild!.roles.cache.get(item.roleId)?.name || 'Unknown'}`
      : 'Custom — liên hệ Admin để nhận';

    // Draw detail card on Canvas
    const buffer = await CardRenderer.drawShopDetailCard(
      item.name,
      item.price,
      stockText,
      rewardText,
      item.description,
      item.imageUrl,
      item.currency
    );
    const attachment = new AttachmentBuilder(buffer, { name: 'detail.png' });

    // Buy button — disabled if out of stock
    const outOfStock = item.stock !== null && item.stock <= 0;
    const buyBtn = new ButtonBuilder()
      .setCustomId(`shop:buy:${item.id}`)
      .setLabel(outOfStock ? '❌ Hết Hàng' : '💳 Mua Ngay')
      .setStyle(outOfStock ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(outOfStock);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buyBtn);

    await interaction.editReply({ files: [attachment], components: [row] });
  }

  // ── Handle buy button confirm using Canvas success card ────────────────
  private async handleBuyConfirm(kernel: Kernel, interaction: any): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const itemId = interaction.customId.replace('shop:buy:', '');
    const guildId = interaction.guildId!;

    const item = await kernel.db.shopItem.findUnique({ where: { id: itemId } });
    if (!item || !item.enabled) {
      return void interaction.editReply('❌ Sản phẩm không còn khả dụng.');
    }

    if (item.stock !== null && item.stock <= 0) {
      return void interaction.editReply('❌ Sản phẩm này đã hết hàng!');
    }

    const member = await kernel.db.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: interaction.user.id } },
    });

    const isVnd = item.currency === 'VND';
    const balanceValue = isVnd ? (member?.vnd ?? 0) : (member?.balance ?? 0);

    if (!member || balanceValue < item.price) {
      const balanceStr = isVnd ? `${balanceValue.toLocaleString()} VNĐ` : `${balanceValue.toLocaleString()} coins`;
      const requiredStr = isVnd ? `${item.price.toLocaleString()} VNĐ` : `${item.price.toLocaleString()} coins`;
      return void interaction.editReply(
        `❌ Không đủ tiền! Cần **${requiredStr}**, bạn có **${balanceStr}**.`
      );
    }

    const newBalance = balanceValue - item.price;

    // Deduct balance (VND or Eco coins)
    await kernel.db.guildMember.update({
      where: { guildId_userId: { guildId, userId: interaction.user.id } },
      data: isVnd ? { vnd: { decrement: item.price } } : { balance: { decrement: item.price } },
    });

    log.info(`[SHOP_BUY] User ${interaction.user.id} (${interaction.user.username}) bought item ${item.name} (${item.id}) via button confirm in guild ${guildId}. Price: ${item.price} ${item.currency}. Pre-balance: ${balanceValue}, Post-balance: ${newBalance}`, { module: 'economy' });

    // Reduce stock and disable if out of stock
    if (item.stock !== null) {
      const nextStock = item.stock - 1;
      await kernel.db.shopItem.update({
        where: { id: item.id },
        data: {
          stock: nextStock,
          enabled: nextStock > 0 ? item.enabled : false,
        },
      });
    }

    // Give role
    if (item.type === 'ROLE' && item.roleId) {
      const discordMember = interaction.guild!.members.cache.get(interaction.user.id);
      await discordMember?.roles.add(item.roleId).catch(() => {});
    }

    // Log purchase / Update inventory
    const existingPurchase = await kernel.db.itemPurchase.findFirst({
      where: { itemId: item.id, guildId, userId: interaction.user.id }
    });

    if (existingPurchase) {
      await kernel.db.itemPurchase.update({
        where: { id: existingPurchase.id },
        data: { quantity: { increment: 1 } }
      });
    } else {
      await kernel.db.itemPurchase.create({
        data: { itemId: item.id, guildId, userId: interaction.user.id, quantity: 1 }
      });
    }

    let roleName = '';
    if (item.type === 'ROLE' && item.roleId) {
      const role = interaction.guild!.roles.cache.get(item.roleId);
      roleName = role ? role.name : 'Unknown Role';
    }

    const buffer = await CardRenderer.drawShopBuyCard(
      interaction.user.username,
      interaction.user.displayAvatarURL({ extension: 'png' }),
      item.name,
      item.price,
      newBalance,
      item.type === 'ROLE',
      roleName,
      item.currency
    );
    const attachment = new AttachmentBuilder(buffer, { name: 'buy_success.png' });

    await interaction.editReply({ files: [attachment], components: [] });

    kernel.eventBus.emit('economy:transaction', {
      guildId, userId: interaction.user.id, type: 'SHOP_BUY', amount: item.price,
    });
  }
}
