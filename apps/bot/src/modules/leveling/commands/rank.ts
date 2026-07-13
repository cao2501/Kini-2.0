import {
  ChatInputCommandInteraction, SlashCommandBuilder, AttachmentBuilder,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { CardRenderer } from '../../../core/ui/CardRenderer';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class RankCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('rank')
    .setDescription('⭐ Xem rank card của bạn')
    .addUserOption(o => o.setName('user').setDescription('Người dùng khác'));

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') ?? interaction.user;

    const member = await kernel.db.guildMember.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId!, userId: target.id } },
    });

    if (!member) {
      return void interaction.editReply({
        embeds: [UIBuilders.createErrorEmbed('Lỗi Rank', `${target.username} chưa có dữ liệu XP.`)]
      });
    }

    const level = Math.floor(Math.sqrt(member.xp / 100));
    const currentLevelXp = level * level * 100;
    const nextLevelXp = (level + 1) * (level + 1) * 100;
    const progressXp = member.xp - currentLevelXp;
    const neededXp = nextLevelXp - currentLevelXp;

    // Rank position
    const rank = await kernel.db.guildMember.count({
      where: { guildId: interaction.guildId!, xp: { gt: member.xp } },
    });

    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 128 });
    
    try {
      const buffer = await CardRenderer.drawRankCard(
        avatarUrl,
        target.username,
        level,
        rank + 1,
        progressXp,
        neededXp
      );
      const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [UIBuilders.createErrorEmbed('Lỗi Tạo Thẻ Rank', err.message)]
      });
    }
  }
}
