import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { parseAndValidateEmoji } from './shop';

export default class AddRingCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('addring')
    .setDescription('[Admin] Thêm nhẫn cưới mới vào cửa hàng')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('name').setDescription('Tên nhẫn').setRequired(true))
    .addIntegerOption(o => o.setName('price').setDescription('Giá bán').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('currency').setDescription('Loại tiền tệ (mặc định: ECO)').addChoices(
      { name: '💰 Coins (Eco)', value: 'ECO' },
      { name: '💳 VNĐ (Nạp)', value: 'VND' },
    ))
    .addRoleOption(o => o.setName('role').setDescription('Role thưởng (nếu loại = Role)'))
    .addStringOption(o => o.setName('description').setDescription('Mô tả nhẫn'))
    .addIntegerOption(o => o.setName('stock').setDescription('Số lượng (0 = không giới hạn)'))
    .addStringOption(o => o.setName('image').setDescription('URL hình ảnh nhẫn'))
    .addAttachmentOption(o => o.setName('file').setDescription('Tải lên ảnh từ máy (tùy chọn)'))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji hiển thị trước tên nhẫn (tùy chọn)'));

  async execute(interaction: any, kernel: Kernel): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);

    const name = interaction.options.getString('name', true);
    const price = interaction.options.getInteger('price', true);
    const category = 'RING';
    const currency = interaction.options.getString('currency') ?? 'ECO';
    const role = interaction.options.getRole('role');
    const type = role ? 'ROLE' : 'CUSTOM';
    const description = interaction.options.getString('description');
    const stockOpt = interaction.options.getInteger('stock');
    const stock = (stockOpt && stockOpt > 0) ? stockOpt : null;
    const imageString = interaction.options.getString('image');
    const imageFile = interaction.options.getAttachment('file');
    const imageUrl = imageFile ? imageFile.url : imageString;
    let emoji = interaction.options.getString('emoji');
    
    if (emoji) {
      const validation = parseAndValidateEmoji(emoji, interaction, kernel);
      if (!validation.valid) {
        return void interaction.editReply({ content: `❌ ${validation.error}` });
      }
      emoji = validation.emojiStr ?? null;
    }

    const existing = await kernel.db.shopItem.findFirst({ where: { guildId, name } });
    if (existing) return void interaction.editReply({ content: `❌ Nhẫn cưới **${name}** đã tồn tại.` });

    await kernel.db.shopItem.create({
      data: { guildId, name, price, type, category, currency, roleId: role?.id ?? null, description: description ?? null, stock, imageUrl, emoji },
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ Thêm Nhẫn Cưới Thành Công')
      .addFields(
        { name: '🏷️ Tên nhẫn', value: name, inline: true },
        { name: '💰 Giá', value: `${price.toLocaleString()} ${currency === 'VND' ? 'VNĐ' : 'coins'}`, inline: true },
        { name: '📦 Kho hàng', value: stock ? `${stock}` : '∞ Không giới hạn', inline: true },
      );

    if (imageUrl) embed.setImage(imageUrl);

    await interaction.editReply({ embeds: [embed] });
  }
}
