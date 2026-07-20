import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';

const TYPE_EMOJI: Record<string, string> = {
  ROLE: '🎭',
  CUSTOM: '🎁',
};

function sortCustomLast(items: any[], category: string): void {
  if (category === 'RING') {
    const idx = items.findIndex(x => x.name.toLowerCase() === 'custom');
    if (idx !== -1) {
      const [customItem] = items.splice(idx, 1);
      items.push(customItem);
    }
  }
}

export default class InventoryCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('🎒 Quản lý kho đồ nhẫn cưới cá nhân')
    .addSubcommand(s => s
      .setName('view')
      .setDescription('🎒 Xem kho đồ nhẫn cưới của bạn')
    )
    .addSubcommand(s => s
      .setName('give')
      .setDescription('🎁 Tặng/Chuyển nhẫn cưới trong kho đồ cho người khác')
      .addIntegerOption(o => o.setName('id').setDescription('ID nhẫn (Số thứ tự hiển thị trong /inventory)').setRequired(true).setMinValue(1))
      .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
      .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng muốn tặng (mặc định: 1)').setMinValue(1))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('❌ [Admin/Special Role] Xóa nhẫn cưới khỏi kho đồ của người dùng')
      .addUserOption(o => o.setName('user').setDescription('Thành viên muốn xóa đồ').setRequired(true))
      .addIntegerOption(o => o.setName('id').setDescription('ID nhẫn (Số thứ tự hiển thị trong /shop)').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng muốn xóa (mặc định: 1)').setMinValue(1))
    );

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);
    
    // Defer immediately!
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const category = 'RING';
      const purchases = await kernel.db.itemPurchase.findMany({
        where: { guildId, userId: interaction.user.id, item: { category } },
        include: { item: true }
      });

      const ringShopItems = await kernel.db.shopItem.findMany({
        where: { guildId, category, enabled: true },
        orderBy: { price: 'asc' },
      });
      sortCustomLast(ringShopItems, category);

      const formatLine = (p: any, shopItems: any[]) => {
        const idx = shopItems.findIndex(x => x.id === p.item.id);
        const displayId = idx !== -1 ? String(idx + 1).padStart(2, '0') : 'N/A';
        const emoji = p.item.emoji || TYPE_EMOJI[p.item.type] || '💍';
        return `${emoji} **${p.item.name}** (x${p.quantity}) - ID nhẫn: \`#${displayId}\``;
      };

      const embed = new EmbedBuilder()
        .setColor(0xff7bb5)
        .setTitle(`🎒 Kho Đồ Nhẫn Cưới — ${interaction.user.username}`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      const ringLines = purchases.map(p => formatLine(p, ringShopItems)).join('\n');
      embed.setDescription(ringLines || '*Kho đồ trống trơn. Hãy dùng `/shop` để mua nhẫn cưới!*');

      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'give') {
      const category = 'RING';
      const displayId = interaction.options.getInteger('id', true);
      const targetUser = interaction.options.getUser('user', true);
      const quantity = interaction.options.getInteger('quantity') ?? 1;

      if (targetUser.id === interaction.user.id) {
        return void interaction.editReply('❌ Bạn không thể tự chuyển đồ cho chính mình.');
      }
      if (targetUser.bot) {
        return void interaction.editReply('❌ Bạn không thể chuyển đồ cho bot.');
      }
      if (quantity <= 0) {
        return void interaction.editReply('❌ Số lượng chuyển phải lớn hơn 0.');
      }

      // Find shop items in this category
      const shopItems = await kernel.db.shopItem.findMany({
        where: { guildId, category, enabled: true },
        orderBy: { price: 'asc' },
      });
      sortCustomLast(shopItems, category);

      const item = shopItems[displayId - 1];
      if (!item) {
        return void interaction.editReply(`❌ Không tìm thấy nhẫn số **#${String(displayId).padStart(2, '0')}** trong shop.`);
      }

      // Check if sender has the item
      const purchase = await kernel.db.itemPurchase.findFirst({
        where: { guildId, userId: interaction.user.id, itemId: item.id },
      });

      if (!purchase || purchase.quantity < quantity) {
        return void interaction.editReply(`❌ Bạn không đủ số lượng nhẫn **${item.name}** trong kho đồ để tặng (Hiện có: ${purchase?.quantity ?? 0}).`);
      }

      // Deduct from sender
      if (purchase.quantity === quantity) {
        await kernel.db.itemPurchase.delete({ where: { id: purchase.id } });
      } else {
        await kernel.db.itemPurchase.update({
          where: { id: purchase.id },
          data: { quantity: purchase.quantity - quantity },
        });
      }

      // Add to receiver
      const targetPurchase = await kernel.db.itemPurchase.findFirst({
        where: { guildId, userId: targetUser.id, itemId: item.id },
      });

      if (targetPurchase) {
        await kernel.db.itemPurchase.update({
          where: { id: targetPurchase.id },
          data: { quantity: targetPurchase.quantity + quantity },
        });
      } else {
        await kernel.db.itemPurchase.create({
          data: {
            guildId,
            userId: targetUser.id,
            itemId: item.id,
            quantity,
          },
        });
      }

      const itemEmoji = item.emoji || TYPE_EMOJI[item.type] || '💍';

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🎁 Tặng Quà Thành Công')
        .setDescription(`Bạn đã tặng nhẫn cưới từ kho đồ cho người khác!`)
        .addFields(
          { name: '👤 Người gửi', value: `<@${interaction.user.id}>`, inline: true },
          { name: '👤 Người nhận', value: `<@${targetUser.id}>`, inline: true },
          { name: '💍 Nhẫn cưới', value: `${itemEmoji} **${item.name}** (x${quantity})`, inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'remove') {
      const isOwner = kernel.ownerIds.includes(interaction.user.id);
      const isManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      const memberRoles = (interaction.member as any)?.roles?.cache;
      const hasSpecialRole = memberRoles?.some((role: any) => {
        const name = role.name.toLowerCase();
        return name.includes('admin') || name.includes('mod') || name.includes('staff') || name.includes('quyền lực');
      });

      if (!isOwner && !isManageGuild && !hasSpecialRole) {
        return void interaction.editReply('❌ Bạn không có quyền thực hiện hành động này (Yêu cầu quyền Manage Server hoặc có Role đặc biệt).');
      }

      const targetUser = interaction.options.getUser('user', true);
      const displayId = interaction.options.getInteger('id', true);
      const quantity = interaction.options.getInteger('quantity') ?? 1;

      if (quantity <= 0) {
        return void interaction.editReply('❌ Số lượng xóa phải lớn hơn 0.');
      }

      const category = 'RING';
      const shopItems = await kernel.db.shopItem.findMany({
        where: { guildId, category, enabled: true },
        orderBy: { price: 'asc' },
      });
      sortCustomLast(shopItems, category);

      const item = shopItems[displayId - 1];
      if (!item) {
        return void interaction.editReply(`❌ Không tìm thấy nhẫn cưới số **#${String(displayId).padStart(2, '0')}** trong shop.`);
      }

      const purchase = await kernel.db.itemPurchase.findFirst({
        where: { guildId, userId: targetUser.id, itemId: item.id },
      });

      if (!purchase || purchase.quantity < quantity) {
        return void interaction.editReply(`❌ Người dùng này không sở hữu đủ số lượng nhẫn cưới **${item.name}** để xóa (Hiện có: ${purchase?.quantity ?? 0}).`);
      }

      if (purchase.quantity === quantity) {
        await kernel.db.itemPurchase.delete({ where: { id: purchase.id } });
      } else {
        await kernel.db.itemPurchase.update({
          where: { id: purchase.id },
          data: { quantity: purchase.quantity - quantity },
        });
      }

      const itemEmoji = item.emoji || TYPE_EMOJI[item.type] || '💍';

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('❌ Xóa Vật Phẩm Khỏi Kho Đồ (Admin)')
        .setDescription(`Đã xóa thành công nhẫn cưới khỏi kho đồ của người dùng!`)
        .addFields(
          { name: '👤 Người bị xóa', value: `<@${targetUser.id}>`, inline: true },
          { name: '💍 Nhẫn cưới', value: `${itemEmoji} **${item.name}** (x${quantity})`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  }
}
