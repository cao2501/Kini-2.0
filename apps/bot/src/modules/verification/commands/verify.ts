import {
  ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { setModuleConfig, getModuleConfig } from '../../../database/helpers';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class VerifyCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('verify')
    .setDescription('✅ Hệ thống Xác minh')
    .addSubcommand(s => s.setName('setup').setDescription('Thiết lập xác minh')
      .addStringOption(o => o.setName('type').setDescription('Loại xác minh').setRequired(true)
        .addChoices(
          { name: '🔘 Button (1-click)', value: 'BUTTON' },
          { name: '🔢 Math Captcha', value: 'MATH' },
          { name: '⏱️ Time Delay', value: 'TIME' },
        )
      )
      .addRoleOption(o => o.setName('role').setDescription('Role sau khi verify').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Kênh verify'))
    )
    .addSubcommand(s => s.setName('panel').setDescription('Gửi panel verify vào kênh đã cấu hình'))
    .addSubcommand(s => s.setName('autokick').setDescription('Cấu hình tự kick chưa verify')
      .addBooleanOption(o => o.setName('enabled').setDescription('Bật?').setRequired(true))
      .addIntegerOption(o => o.setName('hours').setDescription('Giờ chờ (mặc định 24)').setMinValue(1).setMaxValue(168))
    )
    .addSubcommand(s => s.setName('info').setDescription('Xem cấu hình verify hiện tại'));

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && sub !== 'panel') {
      const embed = UIBuilders.createErrorEmbed('Từ Chối Quyền Hạn', '❌ Cần quyền Manage Server để sử dụng lệnh này.');
      const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const file = new AttachmentBuilder(buffer, { name: 'error.png' });
      return void interaction.reply({ files: [file], ephemeral: true });
    }

    if (sub === 'setup') {
      const type = interaction.options.getString('type', true);
      const role = interaction.options.getRole('role', true);
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;

      await setModuleConfig(guildId, 'verification', {
        type, roleId: role.id, channelId: channel?.id, enabled: true,
      });

      const embed = UIBuilders.createSuccessEmbed('Cấu Hình Hoàn Tất', `✅ Xác minh **${type}** đã cấu hình!\nRole: ${role.name}\nDùng \`/verify panel\` để gửi panel.`);
      const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const file = new AttachmentBuilder(buffer, { name: 'setup_success.png' });

      await interaction.reply({
        files: [file],
        ephemeral: true,
      });

    } else if (sub === 'panel') {
      const { enabled, config } = await getModuleConfig<any>(guildId, 'verification');
      if (!enabled || !config.type) {
        const embed = UIBuilders.createErrorEmbed('Chưa Cấu Hình', '❌ Chưa cấu hình verify. Dùng `/verify setup`.');
        const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const file = new AttachmentBuilder(buffer, { name: 'error.png' });
        return void interaction.reply({ files: [file], ephemeral: true });
      }

      const channelId = config.channelId ?? interaction.channelId;
      const ch = kernel.client.channels.cache.get(channelId);
      if (!ch?.isTextBased()) {
        const embed = UIBuilders.createErrorEmbed('Kênh Không Hợp Lệ', '❌ Kênh verify không hợp lệ.');
        const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const file = new AttachmentBuilder(buffer, { name: 'error.png' });
        return void interaction.reply({ files: [file], ephemeral: true });
      }

      const description = config.type === 'BUTTON' ? '👋 Nhấn nút bên dưới để xác minh và truy cập server.' :
                          config.type === 'MATH' ? '🔢 Nhấn nút để nhận câu hỏi toán học và xác minh.' :
                          '⏱️ Nhấn nút để bắt đầu quá trình xác minh.';

      const embed = UIBuilders.createSuccessEmbed('✅ Xác Minh Thành Viên', description)
        .setFooter({ text: `Loại xác minh: ${config.type}` });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        UIBuilders.createButton(
          `verify:start:${config.type}`,
          '✅ Xác Minh Ngay',
          ButtonStyle.Success
        )
      );

      const panelBuffer = await UIBuilders.convertToCanvasCard(embed, undefined, undefined, interaction.guild?.name);
      const panelFile = new AttachmentBuilder(panelBuffer, { name: 'verify_panel.png' });

      await (ch as any).send({ files: [panelFile], components: [row] });

      const successEmbed = UIBuilders.createSuccessEmbed('Gửi Panel Thành Công', `✅ Panel verify đã gửi vào <#${channelId}>.`);
      const successBuffer = await UIBuilders.convertToCanvasCard(successEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const successFile = new AttachmentBuilder(successBuffer, { name: 'success.png' });

      await interaction.reply({
        files: [successFile],
        ephemeral: true
      });

    } else if (sub === 'autokick') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const hours = interaction.options.getInteger('hours') ?? 24;
      await setModuleConfig(guildId, 'verification', { autoKick: { enabled, hours } });
      
      const embed = UIBuilders.createSuccessEmbed('Cấu Hình Tự Kick', `✅ Auto-kick ${enabled ? `bật — kick sau **${hours}h** chưa verify` : 'đã tắt'}.`);
      const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const file = new AttachmentBuilder(buffer, { name: 'autokick.png' });

      await interaction.reply({
        files: [file],
        ephemeral: true,
      });

    } else if (sub === 'info') {
      const { enabled, config } = await getModuleConfig<any>(guildId, 'verification');
      const roleName = config.roleId ? (interaction.guild!.roles.cache.get(config.roleId)?.name ?? 'Unknown') : 'Chưa đặt';
      const channelName = config.channelId ? (interaction.guild!.channels.cache.get(config.channelId)?.name ?? 'Unknown') : 'Chưa đặt';

      const embed = UIBuilders.createEmbed('✅ Cấu Hình Xác Minh')
        .addFields(
          { name: '🔘 Trạng thái', value: enabled ? '🟢 Bật' : '🔴 Tắt', inline: true },
          { name: '📋 Loại', value: config.type ?? 'Chưa cấu hình', inline: true },
          { name: '🎭 Role', value: roleName, inline: true },
          { name: '📝 Kênh', value: channelName, inline: true },
          { name: '🚫 Auto-kick', value: config.autoKick?.enabled ? `Sau ${config.autoKick.hours}h` : 'Tắt', inline: true },
        );
      
      const buffer = await UIBuilders.convertToCanvasCard(embed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
      const file = new AttachmentBuilder(buffer, { name: 'info.png' });

      await interaction.reply({ files: [file], ephemeral: true });
    }
  }
}
