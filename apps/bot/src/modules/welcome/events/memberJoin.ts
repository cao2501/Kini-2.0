import { GuildMember, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { getModuleConfig, ensureGuild, ensureMember } from '../../../database/helpers';
import { CardRenderer } from '../../../core/ui/CardRenderer';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class WelcomeJoinEvent implements IEvent<'guildMemberAdd'> {
  name = 'guildMemberAdd' as const;

  async execute(kernel: Kernel, member: GuildMember): Promise<void> {
    const { enabled, config } = await getModuleConfig<any>(member.guild.id, 'welcome');
    if (!enabled) return;
    
    // Ensure DB records
    await ensureMember(member.guild.id, member.id).catch(() => {});

    const replaceVars = (str: string) => str
      .replace(/{user}/g, member.toString())
      .replace(/{username}/g, member.user.username)
      .replace(/{server}/g, member.guild.name)
      .replace(/{count}/g, String(member.guild.memberCount))
      .replace(/{tag}/g, member.user.tag);

    // Welcome channel message
    if (config.welcomeEnabled && config.welcomeChannelId) {
      const ch = kernel.client.channels.cache.get(config.welcomeChannelId);
      if (ch?.isTextBased()) {
        try {
          const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
          const buffer = await CardRenderer.drawWelcomeCard(
            avatarUrl,
            member.user.username,
            member.guild.name,
            member.guild.memberCount
          );
          const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });
          await (ch as any).send({
            content: replaceVars(config.welcomeMessage ?? '👋 Chào mừng {user} đến với **{server}**!'),
            files: [attachment]
          });
        } catch {
          // Fallback to text embed
          const embed = UIBuilders.createEmbed()
            .setDescription(replaceVars(config.welcomeMessage ?? '👋 Chào mừng {user} đến với **{server}**!'))
            .setThumbnail(member.user.displayAvatarURL());
          await (ch as any).send({ embeds: [embed] }).catch(() => {});
        }
      }
    }

    // DM welcome
    if (config.dmEnabled && config.dmMessage) {
      const embed = UIBuilders.createInfoEmbed('Chào mừng', replaceVars(config.dmMessage));
      await member.send({ embeds: [embed] }).catch(() => {});
    }

    // Auto-assign verify role if configured
    if (config.joinRoleId) {
      await member.roles.add(config.joinRoleId).catch(() => {});
    }
  }
}
