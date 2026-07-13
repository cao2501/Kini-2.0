import { Interaction, GuildMember, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder } from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { getModuleConfig } from '../../../database/helpers';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class VerifyInteractionEvent implements IEvent<'interactionCreate'> {
  name = 'interactionCreate' as const;

  // Store pending math captchas: userId -> { answer, expires }
  private mathChallenges = new Map<string, { answer: number; expires: number }>();

  async execute(kernel: Kernel, interaction: Interaction): Promise<void> {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    const customId = interaction.customId;

    // Handle verify start button
    if (interaction.isButton() && customId.startsWith('verify:start:')) {
      const type = customId.split(':')[2];
      const { config } = await getModuleConfig<any>(interaction.guildId!, 'verification');
      const member = interaction.member as GuildMember;

      if (config.roleId && member.roles.cache.has(config.roleId)) {
        const embed = UIBuilders.createSuccessEmbed('Xác Minh', '✅ Bạn đã được xác minh trước đó rồi!');
        const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const file = new AttachmentBuilder(buffer, { name: 'verify.png' });
        return void interaction.reply({
          files: [file],
          ephemeral: true
        });
      }

      if (type === 'BUTTON') {
        // Instant verify
        if (config.roleId) await member.roles.add(config.roleId).catch(() => {});
        await kernel.db.verificationAttempt.create({
          data: { guildId: interaction.guildId!, userId: interaction.user.id, type: 'BUTTON', verified: true },
        }).catch(() => {});
        
        const embed = UIBuilders.createSuccessEmbed('Xác Minh Thành Công', '✅ Xác minh thành công! Chào mừng bạn đến với server.');
        const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const file = new AttachmentBuilder(buffer, { name: 'verify_success.png' });

        await interaction.reply({
          files: [file],
          ephemeral: true
        });

      } else if (type === 'MATH') {
        // Generate math question
        const a = Math.floor(Math.random() * 20) + 1;
        const b = Math.floor(Math.random() * 20) + 1;
        const ops = ['+', '-', '*'];
        const op = ops[Math.floor(Math.random() * ops.length)]!;
        const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;

        this.mathChallenges.set(interaction.user.id, { answer, expires: Date.now() + 120000 });

        const modal = new ModalBuilder()
          .setCustomId('verify:math:submit')
          .setTitle('🔢 Xác Minh Math Captcha')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('verify:math:answer')
                .setLabel(`${a} ${op} ${b} = ?`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10)
            )
          );

        await interaction.showModal(modal);

      } else if (type === 'TIME') {
        // 5-second delay
        const embed = UIBuilders.createInfoEmbed('Đang Xác Minh', '⏱️ Đang xác minh... Vui lòng đợi 5 giây rồi nhấn lại.');
        const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const file = new AttachmentBuilder(buffer, { name: 'verifying.png' });

        await interaction.reply({
          files: [file],
          ephemeral: true
        });
        
        setTimeout(async () => {
          if (config.roleId) await member.roles.add(config.roleId!).catch(() => {});
          await kernel.db.verificationAttempt.create({
            data: { guildId: interaction.guildId!, userId: interaction.user.id, type: 'TIME', verified: true },
          }).catch(() => {});
          
          const successEmbed = UIBuilders.createSuccessEmbed('Xác Minh Thành Công', '✅ Xác minh thành công!');
          const successBuffer = await UIBuilders.convertToCanvasCard(successEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
          const successFile = new AttachmentBuilder(successBuffer, { name: 'verify_success.png' });

          await interaction.followUp({
            files: [successFile],
            ephemeral: true
          });
        }, 5000);
      }
    }

    // Handle math captcha modal submission
    if (interaction.isModalSubmit() && customId === 'verify:math:submit') {
      const challenge = this.mathChallenges.get(interaction.user.id);
      if (!challenge || Date.now() > challenge.expires) {
        const embed = UIBuilders.createErrorEmbed('Hết Hạn Captcha', '❌ Captcha đã hết hạn hoặc không tồn tại. Vui lòng bấm xác minh lại.');
        const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const file = new AttachmentBuilder(buffer, { name: 'error.png' });
        return void interaction.reply({
          files: [file],
          ephemeral: true
        });
      }

      const answer = parseInt(interaction.fields.getTextInputValue('verify:math:answer'));
      if (isNaN(answer) || answer !== challenge.answer) {
        const embed = UIBuilders.createErrorEmbed('Sai Đáp Án', `❌ Sai đáp án! Hãy thử lại một câu đố khác.`);
        const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const file = new AttachmentBuilder(buffer, { name: 'error.png' });
        return void interaction.reply({
          files: [file],
          ephemeral: true
        });
      }

      this.mathChallenges.delete(interaction.user.id);
      const { config } = await getModuleConfig<any>(interaction.guildId!, 'verification');
      const member = interaction.member as GuildMember;

      if (config.roleId) await member.roles.add(config.roleId).catch(() => {});
      await kernel.db.verificationAttempt.create({
        data: { guildId: interaction.guildId!, userId: interaction.user.id, type: 'MATH', verified: true },
      }).catch(() => {});

      const embed = UIBuilders.createSuccessEmbed('Xác Minh Thành Công', '✅ Xác minh thành công! Chào mừng bạn đến với server.');
      const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const file = new AttachmentBuilder(buffer, { name: 'verify_success.png' });

      await interaction.reply({
        files: [file],
        ephemeral: true
      });
    }
  }
}
