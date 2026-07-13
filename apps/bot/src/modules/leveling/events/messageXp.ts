import { Message, EmbedBuilder, TextChannel, AttachmentBuilder } from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { getModuleConfig, ensureMember } from '../../../database/helpers';
import { CardRenderer } from '../../../core/ui/CardRenderer';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class LevelingMessageEvent implements IEvent<'messageCreate'> {
  name = 'messageCreate' as const;

  private xpPerMessage = { min: 15, max: 25 };

  async execute(kernel: Kernel, message: Message): Promise<void> {
    if (!message.guild || message.author.bot || message.content.startsWith('/')) return;

    const { enabled, config } = await getModuleConfig<any>(message.guildId!, 'leveling');
    if (!enabled) return;

    // Cooldown check
    const cooldownSecs = config.cooldown ?? 60;
    const cooldownKey = `${message.guildId}:${message.author.id}`;
    const existing = await kernel.db.xpCooldown.findUnique({ where: { guildId_userId: { guildId: message.guildId!, userId: message.author.id } } });
    if (existing && existing.expiresAt > new Date()) return;

    // Set cooldown
    await kernel.db.xpCooldown.upsert({
      where: { guildId_userId: { guildId: message.guildId!, userId: message.author.id } },
      create: { guildId: message.guildId!, userId: message.author.id, expiresAt: new Date(Date.now() + cooldownSecs * 1000) },
      update: { expiresAt: new Date(Date.now() + cooldownSecs * 1000) },
    });

    await ensureMember(message.guildId!, message.author.id);

    const xpGain = Math.floor(Math.random() * (this.xpPerMessage.max - this.xpPerMessage.min + 1)) + this.xpPerMessage.min;

    const member = await kernel.db.guildMember.update({
      where: { guildId_userId: { guildId: message.guildId!, userId: message.author.id } },
      data: { xp: { increment: xpGain } },
    });

    kernel.eventBus.emit('leveling:xp_gain', { guildId: message.guildId!, userId: message.author.id, xp: xpGain, total: member.xp });

    // Check level up
    const newLevel = this.calculateLevel(member.xp);
    if (newLevel > member.level) {
      await kernel.db.guildMember.update({
        where: { guildId_userId: { guildId: message.guildId!, userId: message.author.id } },
        data: { level: newLevel },
      });

      kernel.eventBus.emit('leveling:level_up', { guildId: message.guildId!, userId: message.author.id, oldLevel: member.level, newLevel });

      // Send level up message
      const levelUpChannel = config.levelUpChannelId ? kernel.client.channels.cache.get(config.levelUpChannelId) : message.channel;
      if (levelUpChannel?.isTextBased()) {
        try {
          const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });
          const buffer = await CardRenderer.drawLevelUpCard(avatarUrl, member.level, newLevel);
          const attachment = new AttachmentBuilder(buffer, { name: 'levelup.png' });
          await (levelUpChannel as TextChannel).send({
            content: `🎉 Chúc mừng ${message.author} đã thăng cấp!`,
            files: [attachment]
          });
        } catch {
          // Fallback to text embed
          const embed = UIBuilders.createEmbed()
            .setDescription(`🎉 ${message.author} đã lên **Level ${newLevel}**!`);
          await (levelUpChannel as TextChannel).send({ embeds: [embed] }).catch(() => {});
        }
      }

      // Check role rewards
      const roleReward = await kernel.db.levelRole.findFirst({ where: { guildId: message.guildId!, level: newLevel, type: 'ADD' } });
      if (roleReward) {
        const discordMember = message.guild?.members.cache.get(message.author.id);
        await discordMember?.roles.add(roleReward.roleId).catch(() => {});
      }
    }
  }

  private calculateLevel(xp: number): number {
    // Level formula: level = floor(sqrt(xp / 100))
    return Math.floor(Math.sqrt(xp / 100));
  }
}
