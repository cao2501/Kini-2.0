import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  parseEmoji,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { createModuleLogger } from '../../../core/logger/Logger';
import { SpecialLogger } from '../../../core/logger/SpecialLogger';
import { BotClient } from '../../../core/Client';

const log = createModuleLogger('economy');

const TYPE_EMOJI: Record<string, string> = {
  ROLE: '🎭',
  CUSTOM: '🎁',
};

export async function seedDefaultRings(kernel: Kernel, guildId: string): Promise<void> {
  const defaultRings = [
    { name: 'Stardust', price: 500000, type: 'CUSTOM', category: 'RING', currency: 'VND', description: 'Nhẫn cưới Stardust tinh tú lấp lánh' },
    { name: 'Illusion', price: 700000, type: 'CUSTOM', category: 'RING', currency: 'VND', description: 'Nhẫn cưới Illusion ảo ảnh lung linh' },
    { name: 'Nebula Core', price: 900000, type: 'CUSTOM', category: 'RING', currency: 'VND', description: 'Nhẫn cưới Nebula Core lõi tinh vân' },
    { name: 'Constellation', price: 1200000, type: 'CUSTOM', category: 'RING', currency: 'VND', description: 'Nhẫn cưới Constellation chòm sao lãng mạn' },
    { name: 'Horizon', price: 1500000, type: 'CUSTOM', category: 'RING', currency: 'VND', description: 'Nhẫn cưới Horizon chân trời vĩnh cửu' },
    { name: 'Singularity', price: 2000000, type: 'CUSTOM', category: 'RING', currency: 'VND', description: 'Nhẫn cưới Singularity điểm kỳ dị tối thượng' },
    { name: 'Custom', price: 2500000, type: 'CUSTOM', category: 'RING', currency: 'VND', description: 'Nhẫn cưới Custom thiết kế riêng biệt' },
  ];

  for (const ring of defaultRings) {
    const existing = await kernel.db.shopItem.findFirst({
      where: { guildId, name: ring.name, category: 'RING' }
    });
    if (!existing) {
      await kernel.db.shopItem.create({
        data: {
          guildId,
          name: ring.name,
          price: ring.price,
          type: ring.type,
          category: ring.category,
          currency: ring.currency,
          description: ring.description,
        }
      });
    }
  }
}

export function sortCustomLast(items: any[], category: string): void {
  if (category === 'RING') {
    const idx = items.findIndex(x => x.name.toLowerCase() === 'custom');
    if (idx !== -1) {
      const [customItem] = items.splice(idx, 1);
      items.push(customItem);
    }
  }
}

export function getSafeEmoji(emojiVal: string | null | undefined, defaultEmoji: string = '🛒'): string {
  if (!emojiVal) return defaultEmoji;
  const parsed = parseEmoji(emojiVal);
  if (!parsed) return defaultEmoji;

  if (parsed.id) {
    const client = BotClient.instance;
    if (client && client.emojis.cache.has(parsed.id)) {
      return emojiVal;
    }
    return defaultEmoji;
  }

  // Unicode emoji check
  const isUnicodeEmoji = /^[\p{Emoji}\u200d\uFE0F]+$/u.test(parsed.name);
  if (isUnicodeEmoji) {
    return parsed.name;
  }

  return defaultEmoji;
}

export function parseAndValidateEmoji(emojiInput: string, interaction: any, kernel: Kernel): { valid: boolean; emojiStr?: string | null; error?: string } {
  if (emojiInput.toLowerCase() === 'none') {
    return { valid: true, emojiStr: null };
  }

  const cleanEmojiName = emojiInput.replace(/:/g, '').trim().toLowerCase();
  const foundEmoji = interaction.guild?.emojis.cache.find((e: any) => e.name?.toLowerCase() === cleanEmojiName)
                  || kernel.client.emojis.cache.find((e: any) => e.name?.toLowerCase() === cleanEmojiName);

  let targetEmoji = foundEmoji ? foundEmoji.toString() : emojiInput;

  const parsed = parseEmoji(targetEmoji);
  if (!parsed) {
    return { valid: false, error: `Emoji **"${emojiInput}"** không hợp lệ. Vui lòng sử dụng một emoji Unicode hợp lệ (ví dụ: 💍) hoặc emoji tùy chỉnh của server.` };
  }

  if (parsed.id) {
    if (kernel.client.emojis.cache.has(parsed.id)) {
      return { valid: true, emojiStr: targetEmoji };
    } else {
      return { valid: false, error: `Emoji tùy chỉnh **"${emojiInput}"** không thuộc về server nào mà bot tham gia. Bot không thể hiển thị emoji này.` };
    }
  } else {
    const isUnicodeEmoji = /^[\p{Emoji}\u200d\uFE0F]+$/u.test(parsed.name);
    if (isUnicodeEmoji) {
      return { valid: true, emojiStr: parsed.name };
    }
  }

  return { valid: false, error: `Emoji **"${emojiInput}"** không hợp lệ. Vui lòng sử dụng một emoji Unicode hợp lệ (ví dụ: 💍) hoặc emoji tùy chỉnh của server.` };
}

export default class ShopCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('shop')
    .setDescription('🏪 Xem cửa hàng nhẫn cưới');

  async execute(interaction: any, kernel: Kernel): Promise<void> {
    const isEphemeral = false;
    await interaction.deferReply({ ephemeral: isEphemeral });

    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);
    await seedDefaultRings(kernel, guildId);

    const category = 'RING';

    const items = await kernel.db.shopItem.findMany({
      where: { guildId, enabled: true, category },
      orderBy: { price: 'asc' },
    });
    sortCustomLast(items, category);

    if (!items.length) {
      return void interaction.editReply({
        content: '🏪 Cửa hàng Nhẫn Cưới hiện đang trống.',
      });
    }

    const categoryTitle = '💍 Cửa Hàng Nhẫn Cưới';
    const embed = new EmbedBuilder()
      .setColor(0xff7bb5)
      .setTitle(`${categoryTitle} — ${interaction.guild!.name}`)
      .setDescription('Chọn nhẫn cưới dưới thanh menu để xem chi tiết và mua hoặc dùng `/buyring <id>`!');

    const listLines = items.map((item, idx) => {
      const idStr = String(idx + 1).padStart(2, '0');
      const emoji = getSafeEmoji(item.emoji, TYPE_EMOJI[item.type] || '🛒');
      const priceStr = `${item.price.toLocaleString()} ${item.currency === 'VND' ? 'VNĐ' : 'coins'}`;
      const stockStr = item.stock !== null ? `${item.stock}` : 'Vô hạn';
      return `**#${idStr}** ${emoji} **${item.name}**\n` +
             `• Giá: **${priceStr}** | Kho: *${stockStr}*\n` +
             `• Giới thiệu: *${item.description || 'Không có mô tả.'}*\n`;
    });

    const chunks = [];
    let currentChunk = '';
    for (const line of listLines) {
      if (currentChunk.length + line.length > 1000) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += line + '\n';
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    chunks.forEach((chunk, i) => {
      embed.addFields({ name: i === 0 ? 'Danh Sách Sản Phẩm' : 'Tiếp theo', value: chunk });
    });

    // Select menu
    const selectOptions = items.slice(0, 25).map((item, idx) => {
      const idStr = String(idx + 1).padStart(2, '0');
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`#${idStr} ${item.name}`)
        .setDescription(`💰 ${item.price.toLocaleString()} ${item.currency === 'VND' ? 'VNĐ' : 'coins'}`)
        .setValue(`shop_item:${item.id}`);

      const emojiVal = getSafeEmoji(item.emoji, TYPE_EMOJI[item.type] || '🛒');
      try {
        option.setEmoji(emojiVal);
      } catch {
        option.setEmoji('🛒');
      }
      return option;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('shop:detail')
      .setPlaceholder('🔍 Chọn nhẫn cưới để xem chi tiết...')
      .addOptions(selectOptions);

    const rowMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.editReply({
      embeds: [embed],
      components: [rowMenu]
    });
  }
}
