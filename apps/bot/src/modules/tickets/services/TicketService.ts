import {
  TextChannel, ThreadChannel, ButtonInteraction, ChatInputCommandInteraction,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  PermissionFlagsBits, AttachmentBuilder, User, Guild
} from 'discord.js';
import { Kernel } from '../../../core/Kernel';
import { logger } from '../../../core/logger/Logger';
import { ensureGuild } from '../../../database/helpers';

export class TicketService {
  /**
   * Automatically create or get the hidden log channel 'kini-ticket-logs'
   */
  private static async getOrCreateLogChannel(guild: Guild, kernel: Kernel): Promise<TextChannel> {
    let logChannel = guild.channels.cache.find(
      c => c.name === 'kini-ticket-logs' && c.type === ChannelType.GuildText
    ) as TextChannel | undefined;

    if (!logChannel) {
      logChannel = await guild.channels.create({
        name: 'kini-ticket-logs',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel] // Hide from @everyone
          },
          {
            id: kernel.client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] // Allow Bot
          }
        ]
      });
      logger.info(`Automatically created hidden logs channel 'kini-ticket-logs' in guild ${guild.name}`);
    }

    return logChannel;
  }

  /**
   * Create a new ticket as a sub-thread on the panel's channel
   */
  static async createTicket(kernel: Kernel, interaction: ButtonInteraction, panelId: string, type?: string): Promise<void> {
    const panel = await kernel.db.ticketPanel.findUnique({ where: { id: panelId } });
    if (!panel) return void interaction.editReply('❌ Panel không tồn tại.');

    // Check if user already has an open ticket in this guild
    const existing = await kernel.db.ticket.findFirst({
      where: { guildId: interaction.guildId!, userId: interaction.user.id, status: 'OPEN' },
    });

    if (existing) {
      const channelExists = interaction.guild!.channels.cache.has(existing.channelId);
      if (channelExists) {
        return void interaction.editReply(`❌ Bạn đã có ticket đang mở: <#${existing.channelId}>`);
      } else {
        // Clean up stale ticket record in db if the channel was deleted manually
        await kernel.db.ticket.update({ where: { id: existing.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      }
    }

    await ensureGuild(interaction.guildId!, interaction.guild!.name);

    const parentChannel = interaction.channel;
    if (!parentChannel || !parentChannel.isTextBased()) {
      return void interaction.editReply('❌ Kênh không hợp lệ để tạo ticket.');
    }

    // Parse button configs
    let buttonLabel = type || 'ticket';
    let welcomeTemplate = 'Xin chào {user}! Vui lòng mô tả vấn đề của bạn và staff sẽ hỗ trợ sớm.';

    if (config.buttons && Array.isArray(config.buttons)) {
      const foundBtn = config.buttons.find((b: any) => typeof b === 'object' && b.id === type);
      if (foundBtn) {
        buttonLabel = foundBtn.id || type || 'ticket';
        if (foundBtn.welcomeMessage) {
          welcomeTemplate = foundBtn.welcomeMessage;
        }
      }
    }

    // 1. Create a temporary ticket in the database first to obtain a unique ID suffix
    const tempTicket = await kernel.db.ticket.create({
      data: {
        guildId: interaction.guildId!,
        panelId,
        channelId: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: interaction.user.id,
        status: 'OPEN'
      },
    });

    const ticketSuffix = tempTicket.id.slice(-4).toUpperCase();
    const threadName = `🎫-${buttonLabel}-${interaction.user.username}-${ticketSuffix}`;
    let thread: ThreadChannel;

    try {
      thread = await (parentChannel as TextChannel).threads.create({
        name: threadName,
        autoArchiveDuration: 1440, // 24 hours
        type: ChannelType.PrivateThread,
        reason: `Ticket opened by ${interaction.user.tag}`
      });
    } catch (err: any) {
      logger.warn(`Private thread creation failed, falling back to public thread: ${err.message}`);
      thread = await (parentChannel as TextChannel).threads.create({
        name: threadName,
        autoArchiveDuration: 1440,
        type: ChannelType.PublicThread,
        reason: `Ticket opened by ${interaction.user.tag}`
      });
    }

    // 2. Update database ticket record with the real thread channel ID
    await kernel.db.ticket.update({
      where: { id: tempTicket.id },
      data: { channelId: thread.id }
    });

    // Add ticket owner to thread
    await thread.members.add(interaction.user.id).catch(() => {});

    kernel.eventBus.emit('ticket:create', {
      guildId: interaction.guildId!,
      ticketId: tempTicket.id,
      userId: interaction.user.id,
      channelId: thread.id
    });

    // 3. Format custom welcome message
    const welcomeMsg = welcomeTemplate.replace(/{user}/g, `${interaction.user}`);

    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket Mới')
      .setColor(0x5865f2)
      .setDescription(welcomeMsg)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:close:${tempTicket.id}`).setLabel('🔒 Đóng Ticket').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket:claim:${tempTicket.id}`).setLabel('✋ Nhận Ticket').setStyle(ButtonStyle.Secondary),
    );

    await thread.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
    await interaction.editReply(`✅ Ticket đã được tạo: <#${thread.id}>`);
  }

  /**
   * Close a ticket: generate transcript, save all attachments, post to logs, and delete thread
   */
  static async closeTicket(
    kernel: Kernel,
    channel: TextChannel | ThreadChannel,
    closer: User,
    reason: string
  ): Promise<void> {
    const ticket = await kernel.db.ticket.findUnique({ where: { channelId: channel.id } });
    if (!ticket) {
      if (channel.isThread()) {
        await channel.send('❌ Không tìm thấy thông tin ticket trong cơ sở dữ liệu.');
      }
      return;
    }

    // Update status in Database
    await kernel.db.ticket.update({
      where: { id: ticket.id },
      data: { status: 'CLOSED', closedAt: new Date() }
    });

    kernel.eventBus.emit('ticket:close', {
      guildId: ticket.guildId,
      ticketId: ticket.id,
      userId: closer.id
    });

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🎫 Ticket Đóng')
          .setColor(0xe74c3c)
          .setDescription(`Ticket này sẽ bị xóa sau 5 giây.\n\n**Lý do:** ${reason}\n**Đóng bởi:** ${closer.tag}`)
      ]
    }).catch(() => {});

    // Fetch messages to generate logs and extract files
    let messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const sortedMessages = messages ? Array.from(messages.values()).reverse() : [];

    // 1. Build Text Transcript
    let transcriptText = `==================================================\n`;
    transcriptText += `TICKET LOG TRANSCRIPT: ${channel.name}\n`;
    transcriptText += `Guild: ${channel.guild.name} (${channel.guild.id})\n`;
    transcriptText += `Chủ ticket: ID ${ticket.userId}\n`;
    transcriptText += `Đóng bởi: ${closer.tag} (ID ${closer.id})\n`;
    transcriptText += `Lý do: ${reason}\n`;
    transcriptText += `Thời gian đóng: ${new Date().toISOString()}\n`;
    transcriptText += `==================================================\n\n`;

    for (const m of sortedMessages) {
      const time = new Date(m.createdTimestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      transcriptText += `[${time}] ${m.author.tag} (${m.author.id}):\n`;
      if (m.content) {
        transcriptText += `${m.content}\n`;
      }
      if (m.attachments.size > 0) {
        transcriptText += `[Đính kèm: ${Array.from(m.attachments.values()).map(a => a.name).join(', ')}]\n`;
      }
      transcriptText += `\n`;
    }

    // 2. Fetch and Prepare Files/Attachments
    const files: AttachmentBuilder[] = [];
    
    // Add transcript text file
    const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');
    files.push(new AttachmentBuilder(transcriptBuffer, { name: `transcript-${channel.name}.txt` }));

    // Re-download files/images to save them permanently in the logs channel
    for (const m of sortedMessages) {
      for (const att of m.attachments.values()) {
        try {
          const fileRes = await fetch(att.url);
          if (fileRes.ok) {
            const buffer = Buffer.from(await fileRes.arrayBuffer());
            files.push(new AttachmentBuilder(buffer, { name: att.name }));
          } else {
            files.push(new AttachmentBuilder(att.url, { name: att.name }));
          }
        } catch {
          // Fallback to URL directly
          files.push(new AttachmentBuilder(att.url, { name: att.name }));
        }
      }
    }

    // 3. Post to Hidden Logs Channel
    try {
      const logChannel = await this.getOrCreateLogChannel(channel.guild, kernel);
      
      const logEmbed = new EmbedBuilder()
        .setTitle(`🔒 Ticket Closed: ${channel.name}`)
        .setColor(0xe74c3c)
        .addFields(
          { name: '👤 Chủ Ticket', value: `<@${ticket.userId}> (ID: ${ticket.userId})`, inline: true },
          { name: '🔒 Đóng bởi', value: `${closer} (${closer.tag})`, inline: true },
          { name: '📋 Lý do', value: reason, inline: false }
        )
        .setFooter({ text: `Kini Ticket Logs` })
        .setTimestamp();

      // Send files in chunks of 5 to avoid hitting API limitations
      const chunkSize = 5;
      for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        if (i === 0) {
          await logChannel.send({ embeds: [logEmbed], files: chunk });
        } else {
          await logChannel.send({
            content: `📎 Tệp tin bổ sung từ ticket **${channel.name}**:`,
            files: chunk
          });
        }
      }
    } catch (err: any) {
      logger.error(`Failed to post ticket transcript logs:`, { error: err });
    }

    // 4. Delete the Channel/Thread
    setTimeout(async () => {
      await channel.delete().catch(() => {});
    }, 5000);
  }

  /**
   * Claim ticket logic
   */
  static async claimTicket(
    kernel: Kernel,
    channel: TextChannel | ThreadChannel,
    moderator: User
  ): Promise<void> {
    const ticket = await kernel.db.ticket.findUnique({ where: { channelId: channel.id } });
    if (!ticket) {
      if (channel.isThread()) {
        await channel.send('❌ Kênh này không khớp với bất kỳ ticket nào.');
      }
      return;
    }

    if (ticket.claimedBy) {
      await channel.send(`❌ Ticket này đã được nhận bởi <@${ticket.claimedBy}>.`);
      return;
    }

    await kernel.db.ticket.update({
      where: { id: ticket.id },
      data: { claimedBy: moderator.id }
    });

    kernel.eventBus.emit('ticket:claim', {
      guildId: ticket.guildId,
      ticketId: ticket.id,
      moderatorId: moderator.id
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(`✅ ${moderator} đã nhận hỗ trợ cho ticket này.`);

    await channel.send({ embeds: [embed] });
  }
}
