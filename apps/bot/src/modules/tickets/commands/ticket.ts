import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, TextChannel,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { TicketService } from '../services/TicketService';

export default class TicketCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('🎫 Hệ thống Ticket')
    .addSubcommand(s => s.setName('panel').setDescription('Tạo panel ticket')
      .addStringOption(o => o.setName('name').setDescription('Tên panel').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Kênh đặt panel').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Mô tả cho panel'))
    )
    .addSubcommand(s => s.setName('close').setDescription('Đóng ticket hiện tại')
      .addStringOption(o => o.setName('reason').setDescription('Lý do đóng'))
    )
    .addSubcommand(s => s.setName('claim').setDescription('Nhận ticket này'))
    .addSubcommand(s => s.setName('transfer').setDescription('Chuyển ticket')
      .addUserOption(o => o.setName('user').setDescription('Chuyển cho ai').setRequired(true))
    )
    .addSubcommand(s => s.setName('priority').setDescription('Đặt mức ưu tiên')
      .addStringOption(o => o.setName('level').setDescription('Mức ưu tiên').setRequired(true)
        .addChoices({ name: 'Low', value: 'LOW' }, { name: 'Normal', value: 'NORMAL' }, { name: 'High', value: 'HIGH' }, { name: 'Urgent', value: 'URGENT' })
      )
    )
    .addSubcommand(s => s.setName('transcript').setDescription('Tạo transcript'));

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      await this.createPanel(interaction, kernel);
    } else if (sub === 'close') {
      await this.closeTicket(interaction, kernel);
    } else if (sub === 'claim') {
      await this.claimTicket(interaction, kernel);
    } else if (sub === 'transfer') {
      await this.transferTicket(interaction, kernel);
    } else if (sub === 'priority') {
      await this.setPriority(interaction, kernel);
    } else if (sub === 'transcript') {
      await this.createTranscript(interaction, kernel);
    }
  }

  private async createPanel(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return void interaction.editReply('❌ Bạn cần quyền Manage Server.');
    }

    const name = interaction.options.getString('name', true);
    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const description = interaction.options.getString('description') ?? 'Nhấn nút bên dưới để mở ticket hỗ trợ.';

    await ensureGuild(interaction.guildId!, interaction.guild!.name);

    const panel = await kernel.db.ticketPanel.create({
      data: { guildId: interaction.guildId!, name, channelId: channel.id, type: 'BUTTON', config: JSON.stringify({ description }) },
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 ${name}`)
      .setDescription(description)
      .setColor(0x5865f2)
      .setFooter({ text: 'Nhấn nút bên dưới để mở ticket' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:create:${panel.id}`)
        .setLabel('🎫 Tạo Ticket')
        .setStyle(ButtonStyle.Primary),
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    await kernel.db.ticketPanel.update({ where: { id: panel.id }, data: { messageId: msg.id } });

    await interaction.editReply(`✅ Panel ticket **${name}** đã được tạo tại <#${channel.id}>!`);
  }

  private async closeTicket(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
    if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });

    const reason = interaction.options.getString('reason') ?? 'Không có lý do';
    await interaction.reply({ content: '🔄 Đang xử lý đóng ticket và sao lưu dữ liệu...', ephemeral: true });
    
    const channel = interaction.channel;
    if (channel && (channel.isTextBased() || channel.isThread())) {
      await TicketService.closeTicket(kernel, channel as any, interaction.user, reason);
    }
  }

  private async claimTicket(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
    if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });
    if (ticket.claimedBy) return void interaction.reply({ content: `❌ Ticket đã được nhận bởi <@${ticket.claimedBy}>.`, ephemeral: true });

    await interaction.reply({ content: '🔄 Đang xử lý nhận ticket...', ephemeral: true });
    
    const channel = interaction.channel;
    if (channel && (channel.isTextBased() || channel.isThread())) {
      await TicketService.claimTicket(kernel, channel as any, interaction.user);
    }
  }

  private async transferTicket(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
    if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });
    const target = interaction.options.getUser('user', true);
    await kernel.db.ticket.update({ where: { id: ticket.id }, data: { claimedBy: target.id } });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription(`✅ Ticket đã chuyển cho ${target}.`)] });
  }

  private async setPriority(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
    if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });
    const priority = interaction.options.getString('level', true);
    await kernel.db.ticket.update({ where: { id: ticket.id }, data: { priority } });
    const colors: Record<string, number> = { LOW: 0x2ecc71, NORMAL: 0x3498db, HIGH: 0xf39c12, URGENT: 0xe74c3c };
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors[priority] ?? 0x5865f2).setDescription(`✅ Đã đặt mức ưu tiên: **${priority}**`)] });
  }

  private async createTranscript(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
    if (!ticket) return void interaction.editReply('❌ Đây không phải kênh ticket.');

    const messages = await (interaction.channel as any)?.messages.fetch({ limit: 100 });
    const transcript = Array.from(messages.values()).reverse()
      .map((m: any) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');

    await kernel.db.ticket.update({ where: { id: ticket.id }, data: { transcript: transcript.slice(0, 10000) } });
    await interaction.editReply('✅ Transcript đã được lưu.');
  }
}
