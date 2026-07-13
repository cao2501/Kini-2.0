import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	PermissionFlagsBits,
	ChannelType,
	TextChannel,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { TicketService } from '../services/TicketService';
import { UIBuilders } from '../../../core/ui/UIBuilders';

export default class TicketCommand implements ICommand {
	data = new SlashCommandBuilder()
		.setName('ticket')
		.setDescription('🎫 Hệ thống Ticket')
		.addSubcommand((s) =>
			s
				.setName('panel')
				.setDescription('Tạo panel ticket tùy chỉnh')
				.addStringOption((o) =>
					o.setName('name').setDescription('Tiêu đề panel (Không có khoảng trắng)').setRequired(true),
				)
				.addChannelOption((o) => o.setName('channel').setDescription('Kênh đặt panel').setRequired(true))
				.addStringOption((o) =>
					o.setName('description').setDescription('Mô tả panel (chấp nhận \\n xuống dòng)').setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName('buttons')
						.setDescription('Danh sách nút bấm cách nhau bằng dấu phẩy (vd: 🎫 ticket1, 🎫 ticket2, 🎫 ticket3)')
						.setRequired(true),
				)
				.addStringOption((o) => o.setName('content').setDescription('Văn bản gửi kèm bên ngoài Embed')),
		)
		.addSubcommand((s) =>
			s
				.setName('close')
				.setDescription('Đóng ticket hiện tại')
				.addStringOption((o) => o.setName('reason').setDescription('Lý do đóng')),
		)
		.addSubcommand((s) => s.setName('claim').setDescription('Nhận ticket này'))
		.addSubcommand((s) =>
			s
				.setName('transfer')
				.setDescription('Chuyển ticket')
				.addUserOption((o) => o.setName('user').setDescription('Chuyển cho ai').setRequired(true)),
		)
		.addSubcommand((s) =>
			s
				.setName('priority')
				.setDescription('Đặt mức ưu tiên')
				.addStringOption((o) =>
					o
						.setName('level')
						.setDescription('Mức ưu tiên')
						.setRequired(true)
						.addChoices(
							{ name: 'Low', value: 'LOW' },
							{ name: 'Normal', value: 'NORMAL' },
							{ name: 'High', value: 'HIGH' },
							{ name: 'Urgent', value: 'URGENT' },
						),
				),
		)
		.addSubcommand((s) => s.setName('transcript').setDescription('Tạo transcript')) as any;

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

		// Replace literal "\n" in input with actual newline characters
		const rawDesc = interaction.options.getString('description', true);
		const description = rawDesc.replace(/\\n/g, '\n');

		const buttonsStr = interaction.options.getString('buttons', true);
		const buttons = buttonsStr
			.split(',')
			.map((b) => b.trim())
			.filter(Boolean);
		const content = interaction.options.getString('content');

		if (buttons.length === 0) {
			return void interaction.editReply('❌ Danh sách nút bấm không hợp lệ.');
		}
		if (buttons.length > 5) {
			return void interaction.editReply('❌ Một panel chỉ được cấu hình tối đa 5 nút bấm.');
		}

		await ensureGuild(interaction.guildId!, interaction.guild!.name);

		const config = {
			description,
			buttons,
			content,
		};

		const panel = await kernel.db.ticketPanel.create({
			data: {
				guildId: interaction.guildId!,
				name,
				channelId: channel.id,
				type: 'BUTTON',
				config: JSON.stringify(config),
			},
		});

		const embed = UIBuilders.createEmbed(name, description);

		const row = new ActionRowBuilder<ButtonBuilder>();
		buttons.forEach((label, index) => {
			const cleanType = label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || `type${index}`;
			row.addComponents(
				UIBuilders.createButton(
					`ticket:create:${panel.id}:${cleanType}`,
					label,
					ButtonStyle.Secondary
				)
			);
		});

		const msg = await channel.send({
			content: content || undefined,
			embeds: [embed],
			components: [row],
		});

		await kernel.db.ticketPanel.update({ where: { id: panel.id }, data: { messageId: msg.id } });

		await interaction.editReply(`✅ Panel ticket **${name}** đã được tạo tại <#${channel.id}>!`);
	}

	private async closeTicket(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
		const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
		if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });

		const reason = interaction.options.getString('reason') ?? 'Không có lý do';
		await interaction.reply({ content: '🔄 Đang xử lý đóng ticket và sao lưu dữ liệu...', ephemeral: true });

		const channel = interaction.channel;
		if (channel && channel.isTextBased()) {
			await TicketService.closeTicket(kernel, channel as any, interaction.user, reason);
		}
	}

	private async claimTicket(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
		const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
		if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });
		if (ticket.claimedBy)
			return void interaction.reply({ content: `❌ Ticket đã được nhận bởi <@${ticket.claimedBy}>.`, ephemeral: true });

		await interaction.reply({ content: '🔄 Đang xử lý nhận ticket...', ephemeral: true });

		const channel = interaction.channel;
		if (channel && channel.isTextBased()) {
			await TicketService.claimTicket(kernel, channel as any, interaction.user);
		}
	}

	private async transferTicket(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
		const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
		if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });
		const target = interaction.options.getUser('user', true);
		await kernel.db.ticket.update({ where: { id: ticket.id }, data: { claimedBy: target.id } });
		await interaction.reply({
			embeds: [UIBuilders.createSuccessEmbed('Chuyển Giao Ticket', `✅ Ticket đã chuyển cho ${target}.`)],
		});
	}

	private async setPriority(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
		const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
		if (!ticket) return void interaction.reply({ content: '❌ Đây không phải kênh ticket.', ephemeral: true });
		const priority = interaction.options.getString('level', true);
		await kernel.db.ticket.update({ where: { id: ticket.id }, data: { priority } });
		await interaction.reply({
			embeds: [
				UIBuilders.createSuccessEmbed('Mức Ưu Tiên', `✅ Đã đặt mức ưu tiên: **${priority}**`)
			],
		});
	}

	private async createTranscript(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
		await interaction.deferReply({ ephemeral: true });
		const ticket = await kernel.db.ticket.findUnique({ where: { channelId: interaction.channelId } });
		if (!ticket) return void interaction.editReply('❌ Đây không phải kênh ticket.');

		const messages = await (interaction.channel as any)?.messages.fetch({ limit: 100 });
		const transcript = Array.from(messages.values())
			.reverse()
			.map((m: any) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}`)
			.join('\n');

		await kernel.db.ticket.update({ where: { id: ticket.id }, data: { transcript: transcript.slice(0, 10000) } });
		await interaction.editReply('✅ Transcript đã được lưu.');
	}
}
