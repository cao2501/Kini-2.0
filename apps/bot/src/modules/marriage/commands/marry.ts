import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';

async function checkMarried(kernel: Kernel, guildId: string, userId: string): Promise<boolean> {
	const m = await kernel.db.marriage.findFirst({
		where: {
			guildId,
			OR: [{ user1Id: userId }, { user2Id: userId }],
		},
	});
	return !!m;
}

async function getMarriage(kernel: Kernel, guildId: string, userId: string) {
	return await kernel.db.marriage.findFirst({
		where: {
			guildId,
			OR: [{ user1Id: userId }, { user2Id: userId }],
		},
	});
}

async function checkRingOwnership(
	kernel: Kernel,
	guildId: string,
	userId: string,
	ringItemId: string,
): Promise<boolean> {
	const purchase = await kernel.db.itemPurchase.findFirst({
		where: { guildId, userId, itemId: ringItemId, quantity: { gt: 0 } },
	});
	return !!purchase;
}

async function consumeRing(kernel: Kernel, guildId: string, userId: string, ringItemId: string): Promise<void> {
	const purchase = await kernel.db.itemPurchase.findFirst({
		where: { guildId, userId, itemId: ringItemId },
	});
	if (purchase) {
		if (purchase.quantity <= 1) {
			await kernel.db.itemPurchase.delete({ where: { id: purchase.id } });
		} else {
			await kernel.db.itemPurchase.update({
				where: { id: purchase.id },
				data: { quantity: { decrement: 1 } },
			});
		}
	}
}

export default class MarryCommand implements ICommand {
	data = new SlashCommandBuilder()
		.setName('marry')
		.setDescription('💞 Hệ thống kết hôn')
		.addSubcommand((s) =>
			s
				.setName('proposal')
				.setDescription('💍 Gửi lời cầu hôn tới thành viên khác')
				.addUserOption((o) => o.setName('user').setDescription('Đối tượng cầu hôn').setRequired(true))
				.addStringOption((o) =>
					o.setName('ring').setDescription('ID/Tên Nhẫn đính hôn (Cần mua sẵn ở cửa hàng)').setRequired(true),
				),
		)
		.addSubcommand((s) =>
			s
				.setName('profile')
				.setDescription('📋 Xem thông tin cuộc hôn nhân của bạn')
				.addUserOption((o) => o.setName('user').setDescription('Thành viên khác')),
		)
		.addSubcommand((s) => s.setName('divorce').setDescription('💔 Đơn phương chia tay'))
		.addSubcommand((s) => s.setName('luv').setDescription('💖 Tương tác hằng ngày để farm điểm tình yêu và giữ streak'))
		.addSubcommand((s) =>
			s
				.setName('caption')
				.setDescription('✨ Đổi lời chú thích (caption)')
				.addStringOption((o) => o.setName('text').setDescription('Nội dung caption').setRequired(true)),
		)
		.addSubcommand((s) =>
			s
				.setName('thumbnail')
				.setDescription('🖼️ Cài đặt ảnh nhỏ cho embed profile')
				.addStringOption((o) => o.setName('url').setDescription('URL hình ảnh').setRequired(false))
				.addAttachmentOption((o) => o.setName('file').setDescription('Tải lên ảnh từ máy (tùy chọn)')),
		)
		.addSubcommand((s) =>
			s
				.setName('image')
				.setDescription('🖼️ Cài đặt ảnh lớn cho embed profile')
				.addStringOption((o) => o.setName('url').setDescription('URL hình ảnh').setRequired(false))
				.addAttachmentOption((o) => o.setName('file').setDescription('Tải lên ảnh từ máy (tùy chọn)')),
		)
		.addSubcommand((s) =>
			s
				.setName('color')
				.setDescription('🎨 Thay đổi màu viền embed')
				.addStringOption((o) => o.setName('color').setDescription('Mã màu hex (Ví dụ: 0xff7bb5)').setRequired(true)),
		);

	async execute(interaction: any, kernel: Kernel): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		const guildId = interaction.guildId!;
		const userId = interaction.user.id;

		// ─── 1. PROPOSAL SUBCOMMAND ──────────────────────────────────────────
		if (sub === 'proposal') {
			const target = interaction.options.getUser('user', true);
			let ringNameOrId = interaction.options.getString('ring', true).trim();

			// Clean up user mentions if prefix args got mixed
			if (ringNameOrId.startsWith('<@')) {
				ringNameOrId = ringNameOrId.replace(/<@!?\d+>/g, '').trim();
			}

			if (target.id === userId) {
				return void interaction.editReply('❌ Bạn không thể tự cầu hôn chính mình!');
			}

			if (target.bot) {
				return void interaction.editReply('❌ Bạn không thể cầu hôn bot!');
			}

			// Check if either is already married
			const proposerMarried = await checkMarried(kernel, guildId, userId);
			if (proposerMarried) {
				return void interaction.editReply('❌ Bạn đã kết hôn rồi! Vui lòng `/marry divorce` trước khi đi bước nữa.');
			}

			const targetMarried = await checkMarried(kernel, guildId, target.id);
			if (targetMarried) {
				return void interaction.editReply(`❌ **${target.username}** đã kết hôn với người khác rồi!`);
			}

			// Find the ring in the database shop list (matching index, database ID, or name)
			let ringItem: any = null;

			const parsedId = parseInt(ringNameOrId, 10);
			if (!isNaN(parsedId) && parsedId > 0) {
				const rings = await kernel.db.shopItem.findMany({
					where: { guildId, category: 'RING', enabled: true },
					orderBy: { price: 'asc' },
				});
				ringItem = rings[parsedId - 1];
			}

			if (!ringItem) {
				ringItem = await kernel.db.shopItem.findFirst({
					where: {
						guildId,
						category: 'RING',
						enabled: true,
						OR: [{ id: ringNameOrId }, { name: { contains: ringNameOrId } }],
					},
				});
			}

			if (!ringItem) {
				return void interaction.editReply(
					`❌ Không tìm thấy nhẫn có tên/ID là **"${ringNameOrId}"** trong cửa hàng nhẫn (\`/shop list category: RING\`).`,
				);
			}

			// Verify the proposer owns the ring
			const hasRing = await checkRingOwnership(kernel, guildId, userId, ringItem.id);
			if (!hasRing) {
				return void interaction.editReply(
					`❌ Bạn không sở hữu nhẫn **${ringItem.name}**! Vui lòng mua nhẫn trong \`/shop list\` trước.`,
				);
			}

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('marry:accept').setLabel('Đồng Ý 💞').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('marry:reject').setLabel('Từ Chối ❌').setStyle(ButtonStyle.Danger),
			);

			await interaction.editReply({
				content: `💍 **LỜI CẦU HÔN NGỌT NGÀO!**\n<@${userId}> cầu hôn <@${target.id}> sử dụng nhẫn đính hôn **${ringItem.name}**!\n\n🔔 <@${target.id}>, bạn có đồng ý kết hôn với <@${userId}> không? (Hạn phản hồi: 60s)`,
				components: [row],
			});

			const proposalMsg = await interaction.fetchReply();

			const collector = proposalMsg.createMessageComponentCollector({
				filter: (i: any) => i.user.id === target.id,
				time: 60000,
				max: 1,
			});

			collector.on('collect', async (i: any) => {
				if (i.customId === 'marry:accept') {
					// Double check conditions
					const pMarried = await checkMarried(kernel, guildId, userId);
					const tMarried = await checkMarried(kernel, guildId, target.id);
					if (pMarried || tMarried) {
						return void i.reply({
							content: 'Bắt cá 2 tay thì cũng cưới được 1 người thôi!!!',
							ephemeral: true,
						});
					}

					const stillHasRing = await checkRingOwnership(kernel, guildId, userId, ringItem.id);
					if (!stillHasRing) {
						return void i.reply({ content: 'Mua nhẫn này đéo đâu mà dùng!!!', ephemeral: true });
					}

					// Consume ring and create marriage
					await consumeRing(kernel, guildId, userId, ringItem.id);
					await kernel.db.marriage.create({
						data: {
							guildId,
							user1Id: userId,
							user2Id: target.id,
							ringId: ringItem.id,
							ringName: ringItem.name,
						},
					});

					await i.update({
						content: `🎉 **ĐÁM CƯỚI THÀNH CÔNG!** 🎉\n💞 Chúc mừng <@${userId}> và <@${target.id}> đã chính thức về chung một nhà với nhẫn đính hôn **${ringItem.name}**! Trăm năm hạnh phúc nhé! 💍🌹`,
						components: [],
					});
				} else {
					await i.update({
						content: `💔 **Rất tiếc!** <@${target.id}> đã từ chối lời cầu hôn của <@${userId}>.`,
						components: [],
					});
				}
			});

			collector.on('end', (collected: any) => {
				if (collected.size === 0) {
					interaction
						.editReply({
							content: `⏰ Lời cầu hôn từ <@${userId}> đến <@${target.id}> đã hết hạn mà không nhận được câu trả lời.`,
							components: [],
						})
						.catch(() => {});
				}
			});

			// ─── 2. PROFILE SUBCOMMAND ───────────────────────────────────────────
		} else if (sub === 'profile') {
			const targetUser = interaction.options.getUser('user') ?? interaction.user;
			const marriage = await getMarriage(kernel, guildId, targetUser.id);

			if (!marriage) {
				return void interaction.editReply(
					targetUser.id === userId ? 'Ế có vợ đéo đâu mà xem?' : ` **${targetUser.username}** đéo có vợ.`,
				);
			}

			const daysDiff = Math.floor((Date.now() - marriage.marriedAt.getTime()) / (24 * 3600 * 1000));
			const embedColor = parseInt(marriage.color, 16);

			const embed = new EmbedBuilder()
				.setColor(isNaN(embedColor) ? 0xff7bb5 : embedColor)
				.setTitle(`💞 Hôn Nhân Hạnh Phúc 💞`)
				.setDescription(marriage.caption || '🔒 Cuộc hôn nhân hạnh phúc ngọt ngào.')
				.addFields(
					{ name: '👩‍❤️‍👨 Bạn Đời', value: `<@${marriage.user1Id}> 💍 <@${marriage.user2Id}>`, inline: false },
					{ name: '🔥 Streak Luv', value: `${marriage.streak} ngày`, inline: true },
					{ name: '💖 Điểm Yêu Thương', value: `${marriage.lovePoints} điểm`, inline: true },
					{
						name: '📅 Kỷ Niệm',
						value: `${marriage.marriedAt.toLocaleDateString('vi-VN')} (${daysDiff} ngày)`,
						inline: true,
					},
					{ name: '💍 Nhẫn Cưới', value: marriage.ringName, inline: true },
				)
				.setTimestamp();

			if (marriage.thumbnail) embed.setThumbnail(marriage.thumbnail);
			if (marriage.image) embed.setImage(marriage.image);

			await interaction.editReply({ embeds: [embed] });

			// ─── 3. DIVORCE SUBCOMMAND ───────────────────────────────────────────
		} else if (sub === 'divorce') {
			const marriage = await getMarriage(kernel, guildId, userId);
			if (!marriage) {
				return void interaction.editReply('Đéo có vợ thì ly hôn cái đầu buồi à?');
			}

			const partnerId = marriage.user1Id === userId ? marriage.user2Id : marriage.user1Id;

			await kernel.db.marriage.delete({ where: { id: marriage.id } });

			await interaction.editReply(
				`💔 **Ly Hôn:** <@${userId}> và <@${partnerId}> đã ly hôn. Chúc cả hai tìm được hạnh phúc mới.`,
			);

			// ─── 4. LUV SUBCOMMAND ───────────────────────────────────────────────
		} else if (sub === 'luv') {
			const marriage = await getMarriage(kernel, guildId, userId);
			if (!marriage) {
				return void interaction.editReply('❌ Bạn cần kết hôn trước khi luv nhau.');
			}

			const now = new Date();
			const lastLuv = marriage.lastLuvAt ? new Date(marriage.lastLuvAt) : null;

			// Cooldown is 5 minutes and 20 seconds (320,000 ms)
			const COOLDOWN_MS = 320 * 1000;
			if (lastLuv && (now.getTime() - lastLuv.getTime()) < COOLDOWN_MS) {
				const remainingMs = COOLDOWN_MS - (now.getTime() - lastLuv.getTime());
				const remMin = Math.floor(remainingMs / 60000);
				const remSec = Math.floor((remainingMs % 60000) / 1000);
				return void interaction.editReply(
					`⏳ Bạn đã farm điểm gần đây rồi! Vui lòng quay lại sau **${remMin} phút ${remSec} giây**.`
				);
			}

			// Check if this is the first luv of the calendar day (Asia/Ho_Chi_Minh)
			const getGmt7DateString = (d) => d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
			const isFirstLuvToday = !lastLuv || getGmt7DateString(lastLuv) !== getGmt7DateString(now);

			let streakIncremented = false;
			let newStreak = marriage.streak;
			let streakMsg = '';

			if (isFirstLuvToday) {
				if (lastLuv) {
					const timeDiff = now.getTime() - lastLuv.getTime();
					if (timeDiff <= 48 * 3600 * 1000) {
						newStreak = marriage.streak + 1;
						streakIncremented = true;
						streakMsg = `${newStreak} ngày 📈`;
					} else {
						newStreak = 1;
						streakMsg = `1 ngày (Reset do quên) ⚠️`;
					}
				} else {
					newStreak = 1;
					streakIncremented = true;
					streakMsg = `1 ngày 📈`;
				}
			} else {
				streakMsg = `${newStreak} ngày (Giữ nguyên)`;
			}

			const gainedLovePoints = Math.floor(Math.random() * 21) + 10; // 10-30 points
			const updatedLovePoints = marriage.lovePoints + gainedLovePoints;

			await kernel.db.marriage.update({
				where: { id: marriage.id },
				data: {
					lovePoints: updatedLovePoints,
					streak: newStreak,
					lastLuvAt: now,
				},
			});

			const partnerId = marriage.user1Id === userId ? marriage.user2Id : marriage.user1Id;

			const embed = new EmbedBuilder()
				.setColor(0xff7bb5)
				.setTitle('💖 Điểm Yêu Thương!')
				.setDescription(`Bạn đã tương tác cùng <@${partnerId}>!`)
				.addFields(
					{ name: '✨ Điểm Nhận Được', value: `+${gainedLovePoints} love points`, inline: true },
					{
						name: '🔥 Chuỗi Liên Tục (Streak)',
						value: streakMsg,
						inline: true,
					},
					{ name: '💝 Tổng Điểm', value: `${updatedLovePoints} điểm`, inline: true },
				);

			await interaction.editReply({ embeds: [embed] });

			// ─── 5. CUSTOMIZATION SUBCOMMANDS ────────────────────────────────────
		} else if (sub === 'caption') {
			const marriage = await getMarriage(kernel, guildId, userId);
			if (!marriage) return void interaction.editReply('❌ Bạn cần kết hôn để thực hiện lệnh này.');

			const text = interaction.options.getString('text', true);
			await kernel.db.marriage.update({
				where: { id: marriage.id },
				data: { caption: text },
			});
			await interaction.editReply('✅ Đã cập nhật caption cuộc hôn nhân!');
		} else if (sub === 'thumbnail') {
			const marriage = await getMarriage(kernel, guildId, userId);
			if (!marriage) return void interaction.editReply('❌ Bạn cần kết hôn để thực hiện lệnh này.');

			const url = interaction.options.getString('url');
			const file = interaction.options.getAttachment('file');
			if (!url && !file) {
				return void interaction.editReply('❌ Bạn cần cung cấp URL hình ảnh hoặc tải lên tệp tin từ máy!');
			}
			const finalUrl = file ? file.url : url;

			if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
				return void interaction.editReply('❌ URL ảnh không hợp lệ!');
			}

			await kernel.db.marriage.update({
				where: { id: marriage.id },
				data: { thumbnail: finalUrl },
			});
			await interaction.editReply('✅ Đã cập nhật ảnh nhỏ (thumbnail) đám cưới!');
		} else if (sub === 'image') {
			const marriage = await getMarriage(kernel, guildId, userId);
			if (!marriage) return void interaction.editReply('❌ Bạn cần kết hôn để thực hiện lệnh này.');

			const url = interaction.options.getString('url');
			const file = interaction.options.getAttachment('file');
			if (!url && !file) {
				return void interaction.editReply('❌ Bạn cần cung cấp URL hình ảnh hoặc tải lên tệp tin từ máy!');
			}
			const finalUrl = file ? file.url : url;

			if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
				return void interaction.editReply('❌ URL ảnh không hợp lệ!');
			}

			await kernel.db.marriage.update({
				where: { id: marriage.id },
				data: { image: finalUrl },
			});
			await interaction.editReply('✅ Đã cập nhật ảnh lớn đám cưới!');
		} else if (sub === 'color') {
			const marriage = await getMarriage(kernel, guildId, userId);
			if (!marriage) return void interaction.editReply('❌ Bạn cần kết hôn để thực hiện lệnh này.');

			let colorArg = interaction.options.getString('color', true).toLowerCase().trim();
			colorArg = colorArg.replace(/^(0x|#)/, '');

			if (!/^[0-9a-f]{6}$/.test(colorArg)) {
				return void interaction.editReply(
					'❌ Mã màu không hợp lệ! Vui lòng nhập định dạng hex 6 ký tự (Ví dụ: `ff7bb5` hoặc `0xff7bb5`).',
				);
			}

			await kernel.db.marriage.update({
				where: { id: marriage.id },
				data: { color: `0x${colorArg}` },
			});
			await interaction.editReply(`✅ Đã thay đổi màu viền embed sang: \`0x${colorArg}\`!`);
		}
	}
}
