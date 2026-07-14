import { ChatInputCommandInteraction, SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureMember } from '../../../database/helpers';
import { CardRenderer } from '../../../core/ui/CardRenderer';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class VndCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('vnd')
    .setDescription('💳 Hệ thống tiền tệ VND liên kết ngân hàng')
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription('📊 Kiểm tra số dư VND của bạn hoặc thành viên khác')
        .addUserOption(opt => opt.setName('member').setDescription('Chọn thành viên cần xem').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('pay')
        .setDescription('💸 Chuyển khoản tiền VND cho thành viên khác')
        .addUserOption(opt => opt.setName('member').setDescription('Thành viên nhận chuyển khoản').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Số tiền VND muốn chuyển (tối thiểu 1.000 ₫)').setRequired(true).setMinValue(1000))
    )
    .addSubcommandGroup(group =>
      group
        .setName('admin')
        .setDescription('🛡️ Lệnh quản trị số dư VND (Chỉ dành cho Admin)')
        .addSubcommand(sub =>
          sub
            .setName('add')
            .setDescription('🟢 Nạp (cộng) tiền VND cho thành viên')
            .addUserOption(opt => opt.setName('member').setDescription('Thành viên được nạp').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Số tiền VND muốn nạp').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
          sub
            .setName('remove')
            .setDescription('🔴 Rút (trừ) tiền VND của thành viên')
            .addUserOption(opt => opt.setName('member').setDescription('Thành viên bị trừ').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Số tiền VND muốn rút').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('⚙️ Đặt (set) lại số dư VND cho thành viên')
            .addUserOption(opt => opt.setName('member').setDescription('Thành viên cần thiết lập').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Số tiền VND muốn đặt').setRequired(true).setMinValue(0))
        )
    );

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);

    await interaction.deferReply();

    // 1. Check permissions for Admin commands
    if (group === 'admin') {
      const isOwner = kernel.ownerIds.includes(interaction.user.id);
      const isManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      
      if (!isOwner && !isManageGuild) {
        const errorEmbed = UIBuilders.createErrorEmbed('Từ Chối Quyền Hạn', '❌ Bạn cần có quyền `Quản Lý Máy Chủ` (Manage Server) để sử dụng lệnh Admin này.');
        const buffer = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const attachment = new AttachmentBuilder(buffer, { name: 'error.png' });
        await interaction.editReply({ files: [attachment] });
        return;
      }

      const targetUser = interaction.options.getUser('member', true);
      const amount = interaction.options.getInteger('amount', true);

      await ensureMember(guildId, targetUser.id);

      if (subcommand === 'add') {
        const memberData = await kernel.db.guildMember.update({
          where: { guildId_userId: { guildId, userId: targetUser.id } },
          data: { vnd: { increment: amount } }
        });

        const successEmbed = UIBuilders.createSuccessEmbed(
          'Nạp Tiền Thành Công',
          `✅ Đã cộng **${amount.toLocaleString('vi-VN')} ₫** cho <@${targetUser.id}>.\nSố dư mới: **${memberData.vnd.toLocaleString('vi-VN')} ₫**`
        );
        const buffer = await UIBuilders.convertToCanvasCard(successEmbed, targetUser.displayAvatarURL({ extension: 'png' }), targetUser.username, interaction.guild?.name);
        const attachment = new AttachmentBuilder(buffer, { name: 'success.png' });
        await interaction.editReply({ content: `💳 Nạp tiền VND thành công cho <@${targetUser.id}>`, files: [attachment] });
        return;
      }

      if (subcommand === 'remove') {
        const currentMember = await kernel.db.guildMember.findUnique({
          where: { guildId_userId: { guildId, userId: targetUser.id } }
        });

        const currentVnd = currentMember?.vnd ?? 0;
        const finalAmount = Math.min(amount, currentVnd);

        const memberData = await kernel.db.guildMember.update({
          where: { guildId_userId: { guildId, userId: targetUser.id } },
          data: { vnd: { decrement: finalAmount } }
        });

        const successEmbed = UIBuilders.createSuccessEmbed(
          'Rút Tiền Thành Công',
          `✅ Đã trừ **${finalAmount.toLocaleString('vi-VN')} ₫** từ tài khoản <@${targetUser.id}>.\nSố dư mới: **${memberData.vnd.toLocaleString('vi-VN')} ₫**`
        );
        const buffer = await UIBuilders.convertToCanvasCard(successEmbed, targetUser.displayAvatarURL({ extension: 'png' }), targetUser.username, interaction.guild?.name);
        const attachment = new AttachmentBuilder(buffer, { name: 'success.png' });
        await interaction.editReply({ content: `💳 Rút tiền VND thành công của <@${targetUser.id}>`, files: [attachment] });
        return;
      }

      if (subcommand === 'set') {
        const memberData = await kernel.db.guildMember.update({
          where: { guildId_userId: { guildId, userId: targetUser.id } },
          data: { vnd: amount }
        });

        const successEmbed = UIBuilders.createSuccessEmbed(
          'Đặt Lại Số Dư',
          `✅ Đã thiết lập số dư VND của <@${targetUser.id}> thành **${amount.toLocaleString('vi-VN')} ₫**.`
        );
        const buffer = await UIBuilders.convertToCanvasCard(successEmbed, targetUser.displayAvatarURL({ extension: 'png' }), targetUser.username, interaction.guild?.name);
        const attachment = new AttachmentBuilder(buffer, { name: 'success.png' });
        await interaction.editReply({ content: `💳 Thiết lập số dư VND thành công cho <@${targetUser.id}>`, files: [attachment] });
        return;
      }
    }

    // 2. /vnd balance
    if (subcommand === 'balance') {
      const targetUser = interaction.options.getUser('member') ?? interaction.user;
      await ensureMember(guildId, targetUser.id);

      const memberData = await kernel.db.guildMember.findUnique({
        where: { guildId_userId: { guildId, userId: targetUser.id } }
      });

      const vndBalance = memberData?.vnd ?? 0;

      const buffer = await CardRenderer.drawVndCard(
        targetUser.displayAvatarURL({ extension: 'png' }),
        targetUser.username,
        vndBalance,
        interaction.guild!.name
      );
      const attachment = new AttachmentBuilder(buffer, { name: 'vnd-balance.png' });

      await interaction.editReply({
        content: `💳 **Thẻ VND của** <@${targetUser.id}>`,
        files: [attachment]
      });
      return;
    }

    // 3. /vnd pay
    if (subcommand === 'pay') {
      const receiver = interaction.options.getUser('member', true);
      const amount = interaction.options.getInteger('amount', true);

      if (receiver.id === interaction.user.id) {
        const errorEmbed = UIBuilders.createErrorEmbed('Lỗi Chuyển Khoản', '❌ Bạn không thể tự chuyển khoản cho chính mình.');
        const buffer = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const attachment = new AttachmentBuilder(buffer, { name: 'error.png' });
        await interaction.editReply({ files: [attachment] });
        return;
      }

      if (receiver.bot) {
        const errorEmbed = UIBuilders.createErrorEmbed('Lỗi Chuyển Khoản', '❌ Bạn không thể chuyển khoản cho bot.');
        const buffer = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const attachment = new AttachmentBuilder(buffer, { name: 'error.png' });
        await interaction.editReply({ files: [attachment] });
        return;
      }

      await ensureMember(guildId, interaction.user.id);
      await ensureMember(guildId, receiver.id);

      const senderData = await kernel.db.guildMember.findUnique({
        where: { guildId_userId: { guildId, userId: interaction.user.id } }
      });

      const senderVnd = senderData?.vnd ?? 0;
      if (senderVnd < amount) {
        const errorEmbed = UIBuilders.createErrorEmbed(
          'Giao Dịch Bị Từ Chối',
          `❌ Số dư VND của bạn không đủ để thực hiện giao dịch.\n\nYêu cầu: **${amount.toLocaleString('vi-VN')} ₫**\nSố dư hiện tại: **${senderVnd.toLocaleString('vi-VN')} ₫**`
        );
        const buffer = await UIBuilders.convertToCanvasCard(errorEmbed, interaction.user.displayAvatarURL({ extension: 'png' }), interaction.user.username, interaction.guild?.name);
        const attachment = new AttachmentBuilder(buffer, { name: 'error.png' });
        await interaction.editReply({ files: [attachment] });
        return;
      }

      // Perform transaction atomic updates
      await kernel.db.$transaction([
        kernel.db.guildMember.update({
          where: { guildId_userId: { guildId, userId: interaction.user.id } },
          data: { vnd: { decrement: amount } }
        }),
        kernel.db.guildMember.update({
          where: { guildId_userId: { guildId, userId: receiver.id } },
          data: { vnd: { increment: amount } }
        })
      ]);

      const successEmbed = UIBuilders.createSuccessEmbed(
        'Giao Dịch Thành Công',
        `💸 Bạn đã chuyển **${amount.toLocaleString('vi-VN')} ₫** cho <@${receiver.id}> thành công!`
      );
      const buffer = await UIBuilders.convertToCanvasCard(
        successEmbed,
        interaction.user.displayAvatarURL({ extension: 'png' }),
        interaction.user.username,
        interaction.guild?.name
      );
      const attachment = new AttachmentBuilder(buffer, { name: 'success.png' });

      await interaction.editReply({
        content: `💸 **Chuyển khoản thành công!** <@${interaction.user.id}> ➔ <@${receiver.id}>`,
        files: [attachment]
      });
    }
  }
}
