import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { parseAndValidateEmoji, sortCustomLast } from './shop';

export default class EditRingCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('editring')
    .setDescription('[Admin] Chỉnh sửa nhẫn cưới trong cửa hàng')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o => o.setName('id').setDescription('ID nhẫn (Số thứ tự hiển thị trong /shop)').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('name').setDescription('Tên mới cho nhẫn'))
    .addIntegerOption(o => o.setName('price').setDescription('Giá mới'))
    .addIntegerOption(o => o.setName('stock').setDescription('Số lượng mới (0 = không giới hạn)'))
    .addBooleanOption(o => o.setName('enabled').setDescription('Bật/Tắt'))
    .addStringOption(o => o.setName('image').setDescription('URL hình ảnh mới (hoặc "none" để xóa)'))
    .addAttachmentOption(o => o.setName('file').setDescription('Tải lên ảnh mới từ máy (tùy chọn)'))
    .addStringOption(o => o.setName('description').setDescription('Mô tả/Giới thiệu nhẫn mới (hoặc "none" để xóa)'))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji tùy chỉnh hiển thị bên trái tên (hoặc "none" để xóa)'));

  async execute(interaction: any, kernel: Kernel): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);

    const category = 'RING';
    const itemIndex = interaction.options.getInteger('id', true); // 1-based

    const itemsInCat = await kernel.db.shopItem.findMany({
      where: { guildId, category },
      orderBy: { price: 'asc' },
    });
    sortCustomLast(itemsInCat, category);

    const item = itemsInCat[itemIndex - 1];
    if (!item) {
      return void interaction.editReply({ content: `❌ Không tìm thấy nhẫn cưới số **#${String(itemIndex).padStart(2, '0')}**.` });
    }

    const newName = interaction.options.getString('name');
    const price = interaction.options.getInteger('price');
    const stockOpt = interaction.options.getInteger('stock');
    const enabled = interaction.options.getBoolean('enabled');
    const imageString = interaction.options.getString('image');
    const imageFile = interaction.options.getAttachment('file');
    const image = imageFile ? imageFile.url : imageString;
    const description = interaction.options.getString('description');
    const emoji = interaction.options.getString('emoji');

    const updates: any = {};
    if (newName) {
      const existing = await kernel.db.shopItem.findFirst({
        where: {
          guildId,
          name: newName,
          NOT: { id: item.id }
        }
      });
      if (existing) {
        return void interaction.editReply({ content: `❌ Tên nhẫn cưới **${newName}** đã tồn tại ở nhẫn khác.` });
      }
      updates.name = newName;
    }
    if (price !== null) updates.price = price;
    if (stockOpt !== null) updates.stock = stockOpt > 0 ? stockOpt : null;
    if (enabled !== null) updates.enabled = enabled;
    if (image !== null) updates.imageUrl = image === 'none' ? null : image;
    if (description !== null) updates.description = description === 'none' ? null : description;
    if (emoji !== null) {
      const validation = parseAndValidateEmoji(emoji, interaction, kernel);
      if (!validation.valid) {
        return void interaction.editReply({ content: `❌ ${validation.error}` });
      }
      updates.emoji = validation.emojiStr;
    }

    await kernel.db.shopItem.update({ where: { id: item.id }, data: updates });
    await interaction.editReply({ content: `✅ Đã cập nhật nhẫn cưới **${updates.name || item.name}** (ID: #${String(itemIndex).padStart(2, '0')}).` });
  }
}
