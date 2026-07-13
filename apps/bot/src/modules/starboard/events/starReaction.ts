import { MessageReaction, User, AttachmentBuilder } from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { getModuleConfig } from '../../../database/helpers';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class StarboardReactionEvent implements IEvent<'messageReactionAdd'> {
  name = 'messageReactionAdd' as const;

  async execute(kernel: Kernel, reaction: MessageReaction, user: User): Promise<void> {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});

    const guild = reaction.message.guild;
    if (!guild) return;

    const { enabled, config } = await getModuleConfig<any>(guild.id, 'starboard');
    if (!enabled || !config.channelId) return;

    const emoji = config.emoji ?? '⭐';
    const threshold = config.threshold ?? 3;
    const ignoredChannels: string[] = config.ignoredChannels ?? [];

    // Check emoji matches
    const reactionEmoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    if (reactionEmoji !== emoji && reaction.emoji.name !== emoji) return;

    // Check ignored channels
    if (ignoredChannels.includes(reaction.message.channelId)) return;

    const count = reaction.count ?? 0;
    if (count < threshold) return;

    // Check or create starboard entry
    const existing = await kernel.db.starboardEntry.findUnique({ where: { guildId_messageId: { guildId: guild.id, messageId: reaction.message.id } } });
    const sbChannel = kernel.client.channels.cache.get(config.channelId);
    if (!sbChannel?.isTextBased()) return;

    const message = reaction.message;
    const channelName = message.guild!.channels.cache.get(message.channelId)?.name ?? 'unknown-channel';

    const embed = UIBuilders.createEmbed('⭐ Starboard', message.content?.slice(0, 2000) || undefined)
      .setColor(0xf1c40f)
      .addFields(
        { name: '📌 Original', value: `[Jump to message](${message.url})`, inline: true },
        { name: '📝 Channel', value: `#${channelName}`, inline: true },
      );

    const authorAvatar = message.author?.displayAvatarURL({ extension: 'png' });
    const buffer = await UIBuilders.convertToCanvasCard(
      embed,
      authorAvatar,
      message.author?.username,
      guild.name
    );
    const file = new AttachmentBuilder(buffer, { name: 'starboard.png' });

    if (!existing) {
      const sbMsg = await (sbChannel as any).send({
        content: `${emoji} **${count}** | <#${message.channelId}>`,
        files: [file],
      });
      await kernel.db.starboardEntry.create({
        data: { guildId: guild.id, messageId: message.id, starboardMessageId: sbMsg.id, channelId: message.channelId, authorId: message.author?.id ?? 'unknown', starCount: count },
      });
    } else {
      // Update star count
      await kernel.db.starboardEntry.update({ where: { guildId_messageId: { guildId: guild.id, messageId: message.id } }, data: { starCount: count } });
      const sbMsg = await (sbChannel as any).messages.fetch(existing.starboardMessageId).catch(() => null);
      if (sbMsg) {
        await sbMsg.edit({
          content: `${emoji} **${count}** | <#${message.channelId}>`,
          files: [file],
          attachments: []
        });
      }
    }
  }
}
