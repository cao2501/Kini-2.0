import { GuildMember, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { getModuleConfig } from '../../../database/helpers';
import { CardRenderer } from '../../../core/ui/CardRenderer';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class WelcomeLeaveEvent implements IEvent<'guildMemberRemove'> {
  name = 'guildMemberRemove' as const;

  async execute(kernel: Kernel, member: GuildMember): Promise<void> {
    const { enabled, config } = await getModuleConfig<any>(member.guild.id, 'welcome');
    if (!enabled || !config.leaveEnabled || !config.leaveChannelId) return;

    const replaceVars = (str: string) => str
      .replace(/{user}/g, member.user.tag)
      .replace(/{username}/g, member.user.username)
      .replace(/{server}/g, member.guild.name)
      .replace(/{count}/g, String(member.guild.memberCount));

    const ch = kernel.client.channels.cache.get(config.leaveChannelId);
    if (ch?.isTextBased()) {
      const joinedAt = member.joinedAt;
      const timeSpentMs = joinedAt ? Date.now() - joinedAt.getTime() : 0;
      const days = Math.floor(timeSpentMs / (1000 * 60 * 60 * 24));
      const hrs = Math.floor((timeSpentMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const timeSpentStr = days > 0 ? `${days} ngày, ${hrs} giờ` : `${hrs} giờ`;

      try {
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const buffer = await CardRenderer.drawGoodbyeCard(
          avatarUrl,
          member.user.username,
          joinedAt,
          timeSpentStr
        );
        const attachment = new AttachmentBuilder(buffer, { name: 'goodbye.png' });
        await (ch as any).send({
          content: replaceVars(config.leaveMessage ?? '👋 **{user}** đã rời khỏi server. Còn **{count}** thành viên.'),
          files: [attachment]
        });
      } catch {
        // Fallback to text embed
        const embed = UIBuilders.createErrorEmbed(
          'Tạm biệt',
          replaceVars(config.leaveMessage ?? '👋 **{user}** đã rời khỏi server. Còn **{count}** thành viên.')
        ).setThumbnail(member.user.displayAvatarURL());
        await (ch as any).send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
}
