import {
  ChatInputCommandInteraction, SlashCommandBuilder, AttachmentBuilder,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { CardRenderer } from '../../../core/ui/CardRenderer';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class LeaderboardCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 Bảng xếp hạng server')
    .addStringOption(o => o.setName('type').setDescription('Loại bảng xếp hạng')
      .addChoices(
        { name: '⭐ XP', value: 'xp' },
        { name: '💰 Coins', value: 'coins' },
        { name: '🎙️ Voice XP', value: 'voice' },
      )
    );

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    await interaction.deferReply();
    const type = (interaction.options.getString('type') ?? 'xp') as 'xp' | 'coins' | 'voice';

    const orderBy = type === 'coins' ? { balance: 'desc' as const } :
                    type === 'voice' ? { voiceXp: 'desc' as const } : { xp: 'desc' as const };

    const members = await kernel.db.guildMember.findMany({
      where: { guildId: interaction.guildId! },
      orderBy,
      take: 10,
    });

    if (!members.length) {
      return void interaction.editReply({
        embeds: [UIBuilders.createErrorEmbed('Lỗi Bảng Xếp Hạng', 'Chưa có dữ liệu bảng xếp hạng.')]
      });
    }

    // Resolve user data (username & avatar)
    const resolvedMembers = await Promise.all(members.map(async (m) => {
      const user = await kernel.client.users.fetch(m.userId).catch(() => null);
      return {
        username: user?.username ?? `User_${m.userId.slice(-4)}`,
        avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 128 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png',
        value: type === 'coins' ? m.balance : type === 'voice' ? m.voiceXp : m.xp,
        level: type === 'xp' ? m.level : undefined,
      };
    }));

    // Resolve caller's rank
    const callerMember = await kernel.db.guildMember.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId!, userId: interaction.user.id } },
    });
    
    let callerRankData = null;
    if (callerMember) {
      const targetScore = type === 'coins' ? callerMember.balance : type === 'voice' ? callerMember.voiceXp : callerMember.xp;
      const rankCountField = type === 'coins' ? 'balance' : type === 'voice' ? 'voiceXp' : 'xp';
      
      const rankNum = await kernel.db.guildMember.count({
        where: {
          guildId: interaction.guildId!,
          [rankCountField]: { gt: targetScore },
        },
      }) + 1;

      callerRankData = {
        rank: rankNum,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
        value: targetScore,
        level: type === 'xp' ? callerMember.level : undefined,
      };
    }

    try {
      const buffer = await CardRenderer.drawLeaderboardCard(
        interaction.guild!.name,
        type,
        resolvedMembers,
        callerRankData
      );
      const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [UIBuilders.createErrorEmbed('Lỗi Tạo Bảng Xếp Hạng', err.message)]
      });
    }
  }
}
