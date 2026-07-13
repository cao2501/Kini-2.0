import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, AttachmentBuilder,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class SuggestionCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('💡 Hệ thống góp ý')
    .addSubcommand(s => s.setName('add').setDescription('Gửi đề xuất')
      .addStringOption(o => o.setName('content').setDescription('Nội dung đề xuất').setRequired(true))
      .addBooleanOption(o => o.setName('anonymous').setDescription('Ẩn danh?'))
    )
    .addSubcommand(s => s.setName('approve').setDescription('Chấp nhận đề xuất').addStringOption(o => o.setName('id').setDescription('ID đề xuất').setRequired(true)).addStringOption(o => o.setName('note').setDescription('Ghi chú')))
    .addSubcommand(s => s.setName('reject').setDescription('Từ chối đề xuất').addStringOption(o => o.setName('id').setDescription('ID đề xuất').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Lý do')))
    .addSubcommand(s => s.setName('consider').setDescription('Đang xem xét').addStringOption(o => o.setName('id').setDescription('ID đề xuất').setRequired(true)))
    .addSubcommand(s => s.setName('setup').setDescription('Cấu hình kênh đề xuất').addChannelOption(o => o.setName('channel').setDescription('Kênh').setRequired(true)));

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    
    if (sub === 'add') {
      await interaction.deferReply({ ephemeral: true });
      const content = interaction.options.getString('content', true);
      const anonymous = interaction.options.getBoolean('anonymous') ?? false;

      const { config } = await import('../../../database/helpers').then(m => m.getModuleConfig(guildId, 'suggestions'));
      const cfg = config as any;
      if (!cfg.channelId) {
        const errorEmbed = UIBuilders.createErrorEmbed('Chưa Cấu Hình', '❌ Admin chưa cấu hình kênh đề xuất. Dùng `/suggest setup`.');
        const errBuf = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const errFile = new AttachmentBuilder(errBuf, { name: 'error.png' });
        return void interaction.editReply({ files: [errFile] });
      }

      await ensureGuild(guildId, interaction.guild!.name);

      const embed = UIBuilders.createEmbed('💡 Đề Xuất Mới', content)
        .setColor(0xf39c12)
        .addFields({ name: '👤 Người đề xuất', value: anonymous ? '🔒 Ẩn danh' : interaction.user.tag });

      const avatarUrl = anonymous ? undefined : interaction.user.displayAvatarURL({ extension: 'png' });
      const buffer = await UIBuilders.convertToCanvasCard(embed, avatarUrl, anonymous ? 'Ẩn danh' : interaction.user.username, interaction.guild?.name);
      const file = new AttachmentBuilder(buffer, { name: 'suggestion.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('suggest:upvote:PLACEHOLDER').setLabel('👍 0').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('suggest:downvote:PLACEHOLDER').setLabel('👎 0').setStyle(ButtonStyle.Danger),
      );

      const ch = kernel.client.channels.cache.get(cfg.channelId);
      if (!ch?.isTextBased()) {
        const errorEmbed = UIBuilders.createErrorEmbed('Kênh Không Hợp Lệ', '❌ Kênh đề xuất không hợp lệ.');
        const errBuf = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const errFile = new AttachmentBuilder(errBuf, { name: 'error.png' });
        return void interaction.editReply({ files: [errFile] });
      }

      const msg = await (ch as any).send({ files: [file], components: [row] });

      const sug = await kernel.db.suggestion.create({
        data: { guildId, channelId: cfg.channelId, messageId: msg.id, authorId: anonymous ? 'anonymous' : interaction.user.id, content, anonymous }
      });

      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`suggest:upvote:${sug.id}`).setLabel('👍 0').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`suggest:downvote:${sug.id}`).setLabel('👎 0').setStyle(ButtonStyle.Danger),
      );
      await msg.edit({ components: [updatedRow] });

      const successEmbed = UIBuilders.createSuccessEmbed('Gửi Đề Xuất Thành Công', '✅ Đề xuất của bạn đã được gửi!');
      const successBuf = await UIBuilders.convertToCanvasCard(successEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const successFile = new AttachmentBuilder(successBuf, { name: 'success.png' });

      await interaction.editReply({ files: [successFile] });

    } else if (sub === 'approve' || sub === 'reject' || sub === 'consider') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        const errorEmbed = UIBuilders.createErrorEmbed('Từ Chối Quyền Hạn', '❌ Bạn cần quyền Manage Server.');
        const errBuf = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const errFile = new AttachmentBuilder(errBuf, { name: 'error.png' });
        return void interaction.reply({ files: [errFile], ephemeral: true });
      }

      const id = interaction.options.getString('id', true);
      const note = interaction.options.getString('note') ?? interaction.options.getString('reason') ?? undefined;
      const status = sub === 'approve' ? 'APPROVED' : sub === 'reject' ? 'REJECTED' : 'CONSIDERED';

      const sug = await kernel.db.suggestion.findFirst({ where: { guildId, id: { endsWith: id } } });
      if (!sug) {
        const errorEmbed = UIBuilders.createErrorEmbed('Lỗi Giao Dịch', '❌ Không tìm thấy đề xuất.');
        const errBuf = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const errFile = new AttachmentBuilder(errBuf, { name: 'error.png' });
        return void interaction.reply({ files: [errFile], ephemeral: true });
      }

      await kernel.db.suggestion.update({ where: { id: sug.id }, data: { status, reviewNote: note, reviewedBy: interaction.user.id } });
      
      const colors: Record<string, number> = { APPROVED: 0x2ecc71, REJECTED: 0xe74c3c, CONSIDERED: 0xf39c12 };
      const icons: Record<string, string> = { APPROVED: '✅', REJECTED: '❌', CONSIDERED: '🤔' };
      
      const ch = kernel.client.channels.cache.get(sug.channelId);
      if (sug.messageId && ch?.isTextBased()) {
        const msg = await (ch as any).messages.fetch(sug.messageId).catch(() => null);
        if (msg) {
          const author = sug.anonymous ? null : await kernel.client.users.fetch(sug.authorId).catch(() => null);
          const authorTag = author ? author.tag : '🔒 Ẩn danh';
          const authorName = author ? author.username : 'Ẩn danh';
          const authorAvatar = author ? author.displayAvatarURL({ extension: 'png' }) : undefined;

          const embed = UIBuilders.createEmbed('💡 Đề Xuất Mới', sug.content)
            .setColor(colors[status] ?? 0xf39c12)
            .addFields(
              { name: '👤 Người đề xuất', value: authorTag },
              { name: `${icons[status]} Trạng thái`, value: `${status}${note ? ` — ${note}` : ''}` }
            );

          const buffer = await UIBuilders.convertToCanvasCard(embed, authorAvatar, authorName, interaction.guild?.name);
          const file = new AttachmentBuilder(buffer, { name: 'suggestion.png' });
          await msg.edit({ files: [file], attachments: [], components: [] });
        }
      }

      const successEmbed = UIBuilders.createSuccessEmbed('Cập Nhật Thành Công', `✅ Đề xuất đã được cập nhật thành **${status}**`);
      const successBuf = await UIBuilders.convertToCanvasCard(successEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const successFile = new AttachmentBuilder(successBuf, { name: 'success.png' });

      await interaction.reply({ files: [successFile], ephemeral: true });

    } else if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      await import('../../../database/helpers').then(m => m.setModuleConfig(guildId, 'suggestions', { channelId: channel.id }));

      const successEmbed = UIBuilders.createSuccessEmbed('Thiết Lập Thành Công', `✅ Kênh đề xuất đã được cấu hình sang <#${channel.id}>`);
      const successBuf = await UIBuilders.convertToCanvasCard(successEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const successFile = new AttachmentBuilder(successBuf, { name: 'success.png' });

      await interaction.reply({ files: [successFile], ephemeral: true });
    }
  }
}
