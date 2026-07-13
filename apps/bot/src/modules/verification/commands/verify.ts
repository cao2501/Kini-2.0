import {
  ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
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
      return void interaction.reply({
        embeds: [UIBuilders.createErrorEmbed('Từ Chối Quyền Hạn', '❌ Cần quyền Manage Server để sử dụng lệnh này.')],
        ephemeral: true
      });
    }

    if (sub === 'setup') {
      const type = interaction.options.getString('type', true);
      const role = interaction.options.getRole('role', true);
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;

      await setModuleConfig(guildId, 'verification', {
        type, roleId: role.id, channelId: channel?.id, enabled: true,
      });

      await interaction.reply({
        embeds: [UIBuilders.createSuccessEmbed('Cấu Hình Hoàn Tất', `✅ Xác minh **${type}** đã cấu hình!\nRole: ${role}\nDùng \`/verify panel\` để gửi panel.`)],
        ephemeral: true,
      });

    } else if (sub === 'panel') {
      const { enabled, config } = await getModuleConfig<any>(guildId, 'verification');
      if (!enabled || !config.type) {
        return void interaction.reply({
          embeds: [UIBuilders.createErrorEmbed('Chưa Cấu Hình', '❌ Chưa cấu hình verify. Dùng `/verify setup`.')],
          ephemeral: true
        });
      }

      const channelId = config.channelId ?? interaction.channelId;
      const ch = kernel.client.channels.cache.get(channelId);
      if (!ch?.isTextBased()) {
        return void interaction.reply({
          embeds: [UIBuilders.createErrorEmbed('Kênh Không Hợp Lệ', '❌ Kênh verify không hợp lệ.')],
          ephemeral: true
        });
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

      await (ch as any).send({ embeds: [embed], components: [row] });
      await interaction.reply({
        embeds: [UIBuilders.createSuccessEmbed('Gửi Panel Thành Công', `✅ Panel verify đã gửi vào <#${channelId}>.`)],
        ephemeral: true
      });

    } else if (sub === 'autokick') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const hours = interaction.options.getInteger('hours') ?? 24;
      await setModuleConfig(guildId, 'verification', { autoKick: { enabled, hours } });
      
      await interaction.reply({
        embeds: [UIBuilders.createSuccessEmbed('Cấu Hình Tự Kick', `✅ Auto-kick ${enabled ? `bật — kick sau **${hours}h** chưa verify` : 'đã tắt'}.`)],
        ephemeral: true,
      });

    } else if (sub === 'info') {
      const { enabled, config } = await getModuleConfig<any>(guildId, 'verification');
      const embed = UIBuilders.createEmbed('✅ Cấu Hình Xác Minh')
        .addFields(
          { name: '🔘 Trạng thái', value: enabled ? '🟢 Bật' : '🔴 Tắt', inline: true },
          { name: '📋 Loại', value: config.type ?? 'Chưa cấu hình', inline: true },
          { name: '🎭 Role', value: config.roleId ? `<@&${config.roleId}>` : 'Chưa đặt', inline: true },
          { name: '📝 Kênh', value: config.channelId ? `<#${config.channelId}>` : 'Chưa đặt', inline: true },
          { name: '🚫 Auto-kick', value: config.autoKick?.enabled ? `Sau ${config.autoKick.hours}h` : 'Tắt', inline: true },
        );
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
