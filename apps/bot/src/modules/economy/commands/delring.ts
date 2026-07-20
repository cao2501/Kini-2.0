import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';

export default class DelRingCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('delring')
    .setDescription('[Admin] Xóa nhẫn khỏi shop')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('name').setDescription('Tên nhẫn').setRequired(true));

  async execute(interaction: any, kernel: Kernel): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);

    const name = interaction.options.getString('name', true);
    const item = await kernel.db.shopItem.findFirst({ where: { guildId, name } });
    if (!item) return void interaction.editReply({ content: `❌ Nhẫn cưới **${name}** không tồn tại.` });

    await kernel.db.shopItem.delete({ where: { id: item.id } });
    await interaction.editReply({ content: `✅ Đã xóa nhẫn cưới **${name}**.` });
  }
}
