import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { createModuleLogger } from '../../../core/logger/Logger';
import { SpecialLogger } from '../../../core/logger/SpecialLogger';
import { sortCustomLast } from './shop';

const log = createModuleLogger('economy');

export default class BuyRingCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('buyring')
    .setDescription('💳 Mua nhẫn cưới từ cửa hàng')
    .addIntegerOption(o => o.setName('id').setDescription('ID nhẫn (số thứ tự hiển thị trong /shop)').setRequired(true).setMinValue(1));

  async execute(interaction: any, kernel: Kernel): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);

    const category = 'RING';
    const itemIndex = interaction.options.getInteger('id', true); // 1-based

    const allItems = await kernel.db.shopItem.findMany({
      where: { guildId, enabled: true, category },
      orderBy: { price: 'asc' },
    });
    sortCustomLast(allItems, category);

    const item = allItems[itemIndex - 1];
    if (!item) {
      return void interaction.editReply(
        `❌ Không tìm thấy nhẫn cưới **#${String(itemIndex).padStart(2, '0')}**. Dùng \`/shop\` để xem danh sách.`
      );
    }

    if (item.stock !== null && item.stock <= 0) {
      return void interaction.editReply('❌ Nhẫn cưới này đã hết hàng!');
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
        `❌ Không đủ tiền! Cần **${requiredStr}**, bạn hiện có **${balanceStr}**.`
      );
    }

    const newBalance = balanceValue - item.price;

    // Deduct balance
    await kernel.db.guildMember.update({
      where: { guildId_userId: { guildId, userId: interaction.user.id } },
      data: isVnd ? { vnd: { decrement: item.price } } : { balance: { decrement: item.price } },
    });

    log.info(`[SHOP_BUY] User ${interaction.user.id} (${interaction.user.username}) bought item ${item.name} (${item.id}) in guild ${guildId}. Price: ${item.price} ${item.currency}. Pre-balance: ${balanceValue}, Post-balance: ${newBalance}`, { module: 'economy' });

    if (isVnd) {
      const txId = SpecialLogger.generateTxId('BUY');
      await SpecialLogger.logVnd(
        kernel,
        guildId,
        interaction.user.id,
        interaction.user.username,
        'SHOP_BUY',
        item.price,
        txId,
        `Mua nhẫn cưới "${item.name}" (ID: #${itemIndex}) từ Cửa Hàng. Số dư mới: ${newBalance.toLocaleString()} VNĐ.`
      );
    }

    // Reduce stock
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

    // Add to inventory
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
      const discordMember = interaction.guild!.members.cache.get(interaction.user.id);
      await discordMember?.roles.add(item.roleId).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ Mua Nhẫn Cưới Thành Công!')
      .setDescription(`<@${interaction.user.id}> đã mua thành công **${item.name}**!`)
      .addFields(
        { name: '💰 Giá thanh toán', value: `${item.price.toLocaleString()} ${item.currency === 'VND' ? 'VNĐ' : 'coins'}`, inline: true },
        { name: '💳 Số dư còn lại', value: `${newBalance.toLocaleString()} ${item.currency === 'VND' ? 'VNĐ' : 'coins'}`, inline: true }
      );

    if (roleName) {
      embed.addFields({ name: '🎁 Vai trò nhận được', value: roleName, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
    kernel.eventBus.emit('economy:transaction', { guildId, userId: interaction.user.id, type: 'SHOP_BUY', amount: item.price });
  }
}
