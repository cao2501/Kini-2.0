import {
  Interaction, StringSelectMenuInteraction,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { CardRenderer } from '../../../core/ui/CardRenderer';

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
      item.imageUrl
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

    if (!member || member.balance < item.price) {
      return void interaction.editReply(
        `❌ Không đủ tiền! Cần **${item.price.toLocaleString()} coins**, bạn có **${member?.balance.toLocaleString() ?? 0} coins**.`
      );
    }

    const newBalance = member.balance - item.price;

    // Deduct balance
    await kernel.db.guildMember.update({
      where: { guildId_userId: { guildId, userId: interaction.user.id } },
      data: { balance: { decrement: item.price } },
    });

    // Reduce stock and disable if out of stock
    if (item.stock !== null) {
      const nextStock = item.stock - 1;
      await kernel.db.shopItem.update({
        where: { id: item.id },
        data: {
          stock: nextStock,
          enabled: nextStock > 0 ? item.enabled : false, // Disable if out of stock
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
      roleName
    );
    const attachment = new AttachmentBuilder(buffer, { name: 'buy_success.png' });

    await interaction.editReply({ files: [attachment], components: [] });

    kernel.eventBus.emit('economy:transaction', {
      guildId, userId: interaction.user.id, type: 'SHOP_BUY', amount: item.price,
    });
  }
}
