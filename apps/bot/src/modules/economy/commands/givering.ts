import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { getSafeEmoji, sortCustomLast } from './shop';

export default class GiveRingCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('givering')
    .setDescription('[Admin] Tặng nhẫn từ cửa hàng cho người dùng')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o => o.setName('id').setDescription('ID nhẫn (Số thứ tự hiển thị trong /shop)').setRequired(true).setMinValue(1))
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng muốn tặng (mặc định: 1)').setMinValue(1));

  async execute(interaction: any, kernel: Kernel): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);

    const category = 'RING';
    const itemIndex = interaction.options.getInteger('id', true); // 1-based
    const targetUser = interaction.options.getUser('user', true);
    const quantity = interaction.options.getInteger('quantity') ?? 1;

    if (targetUser.bot) {
      return void interaction.editReply({ content: '❌ Không thể tặng nhẫn cho bot.' });
    }
    if (quantity <= 0) {
      return void interaction.editReply({ content: '❌ Số lượng tặng phải lớn hơn 0.' });
    }

    const itemsInCat = await kernel.db.shopItem.findMany({
      where: { guildId, category, enabled: true },
      orderBy: { price: 'asc' },
    });
    sortCustomLast(itemsInCat, category);

    const item = itemsInCat[itemIndex - 1];
    if (!item) {
      return void interaction.editReply({ content: `❌ Không tìm thấy nhẫn cưới số **#${String(itemIndex).padStart(2, '0')}**.` });
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

    const itemEmoji = getSafeEmoji(item.emoji, '💍');

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎁 Tặng Nhẫn Cưới Từ Shop (Admin)')
      .setDescription(`Admin đã chuyển trực tiếp nhẫn cưới từ cửa hàng vào kho đồ của người dùng!`)
      .addFields(
        { name: '👤 Người nhận', value: `<@${targetUser.id}>`, inline: true },
        { name: '💍 Nhẫn cưới', value: `${itemEmoji} **${item.name}** (x${quantity})`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
