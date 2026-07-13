import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { CardRenderer } from '../../../core/ui/CardRenderer';

// Item type emoji mapping
const TYPE_EMOJI: Record<string, string> = {
  ROLE: '🎭',
  CUSTOM: '🎁',
};

export default class ShopCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('shop')
    .setDescription('🏪 Cửa Hàng Server')
    .addSubcommand(s => s.setName('list').setDescription('📋 Xem sản phẩm trong cửa hàng'))
    .addSubcommand(s => s.setName('inventory').setDescription('🎒 Kho đồ cá nhân của bạn'))
    .addSubcommand(s => s.setName('buy').setDescription('💳 Mua sản phẩm — dùng /shop list để xem ID')
      .addIntegerOption(o => o.setName('id').setDescription('ID sản phẩm (số thứ tự hiển thị trong /shop list)').setRequired(true).setMinValue(1))
    )
    .addSubcommand(s => s.setName('add').setDescription('[Admin] Thêm sản phẩm')
      .addStringOption(o => o.setName('name').setDescription('Tên sản phẩm').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Giá (coins)').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true).addChoices(
        { name: '🎭 Role', value: 'ROLE' },
        { name: '🎁 Custom', value: 'CUSTOM' },
      ))
      .addRoleOption(o => o.setName('role').setDescription('Role thưởng (nếu type = Role)'))
      .addStringOption(o => o.setName('description').setDescription('Mô tả sản phẩm'))
      .addIntegerOption(o => o.setName('stock').setDescription('Số lượng (0 = không giới hạn)'))
      .addStringOption(o => o.setName('image').setDescription('URL hình ảnh sản phẩm'))
    )
    .addSubcommand(s => s.setName('remove').setDescription('[Admin] Xóa sản phẩm')
      .addStringOption(o => o.setName('name').setDescription('Tên sản phẩm').setRequired(true))
    )
    .addSubcommand(s => s.setName('edit').setDescription('[Admin] Chỉnh sửa sản phẩm')
      .addStringOption(o => o.setName('name').setDescription('Tên sản phẩm').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Giá mới'))
      .addIntegerOption(o => o.setName('stock').setDescription('Số lượng mới'))
      .addBooleanOption(o => o.setName('enabled').setDescription('Bật/Tắt'))
      .addStringOption(o => o.setName('image').setDescription('URL hình ảnh mới (hoặc "none" để xóa)'))
    );

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);

    // ─── LIST ────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      await interaction.deferReply();
      const items = await kernel.db.shopItem.findMany({
        where: { guildId, enabled: true },
        orderBy: { price: 'asc' },
      });

      if (!items.length) {
        return void interaction.editReply({
          content: '🏪 Cửa hàng đang trống. Admin dùng `/shop add` để thêm sản phẩm.',
        });
      }

      // Draw custom canvas card for Shop List
      const buffer = await CardRenderer.drawShopListCard(interaction.guild!.name, items);
      const attachment = new AttachmentBuilder(buffer, { name: 'shop.png' });

      // Select menu — each item is an option, value carries index for lookup
      const selectOptions = items.slice(0, 25).map((item, idx) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`#${idx + 1} ${item.name}`)
          .setDescription(`💰 ${item.price.toLocaleString()} coins`)
          .setEmoji(TYPE_EMOJI[item.type] ?? '🛒')
          .setValue(`shop_item:${item.id}`)
      );

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('shop:detail')
        .setPlaceholder('🔍 Chọn sản phẩm để xem chi tiết...')
        .addOptions(selectOptions);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await interaction.editReply({
        content: `🏪 **Cửa Hàng — ${interaction.guild!.name}**\nChọn sản phẩm dưới thanh menu để xem chi tiết và mua!`,
        files: [attachment],
        components: [row]
      });

    // ─── INVENTORY ───────────────────────────────────────────────────────────
    } else if (sub === 'inventory') {
      await interaction.deferReply();
      
      const purchases = await kernel.db.itemPurchase.findMany({
        where: { guildId, userId: interaction.user.id },
        include: { item: true }
      });

      const mappedPurchases = purchases.map(p => ({
        name: p.item.name,
        quantity: p.quantity,
        type: p.item.type,
        description: p.item.description
      }));

      const buffer = await CardRenderer.drawInventoryCard(
        interaction.user.username,
        interaction.user.displayAvatarURL({ extension: 'png' }),
        mappedPurchases
      );
      const attachment = new AttachmentBuilder(buffer, { name: 'inventory.png' });

      await interaction.editReply({
        content: `🎒 **Kho đồ cá nhân của** <@${interaction.user.id}>`,
        files: [attachment]
      });

    // ─── BUY ─────────────────────────────────────────────────────────────────
    } else if (sub === 'buy') {
      await interaction.deferReply({ ephemeral: true });
      const itemIndex = interaction.options.getInteger('id', true); // 1-based

      // Fetch all enabled items sorted same as /shop list to resolve index
      const allItems = await kernel.db.shopItem.findMany({
        where: { guildId, enabled: true },
        orderBy: { price: 'asc' },
      });

      const item = allItems[itemIndex - 1]; // convert to 0-based
      if (!item) {
        return void interaction.editReply(
          `❌ Không tìm thấy sản phẩm **#${itemIndex}**. Dùng \`/shop list\` để xem danh sách.`
        );
      }

      if (item.stock !== null && item.stock <= 0) {
        return void interaction.editReply('❌ Sản phẩm này đã hết hàng!');
      }

      const member = await kernel.db.guildMember.findUnique({
        where: { guildId_userId: { guildId, userId: interaction.user.id } },
      });

      if (!member || member.balance < item.price) {
        return void interaction.editReply(
          `❌ Không đủ tiền! Cần **${item.price.toLocaleString()} coins**, bạn có **${member?.balance.toLocaleString() ?? 0} coins**.`
        );
      }

      const newBalance = member.balance - item.price;

      // Deduct balance
      await kernel.db.guildMember.update({
        where: { guildId_userId: { guildId, userId: interaction.user.id } },
        data: { balance: { decrement: item.price } },
      });

      // Reduce stock and disable if out of stock
      if (item.stock !== null) {
        const nextStock = item.stock - 1;
        await kernel.db.shopItem.update({
          where: { id: item.id },
          data: {
            stock: nextStock,
            enabled: nextStock > 0 ? item.enabled : false, // Disable if out of stock
          },
        });
      }

      // Add to inventory (ItemPurchase)
      const existingPurchase = await kernel.db.itemPurchase.findFirst({
        where: { itemId: item.id, guildId, userId: interaction.user.id }
      });

      if (existingPurchase) {
        await kernel.db.itemPurchase.update({
          where: { id: existingPurchase.id },
          data: { quantity: { increment: 1 } }
        });
      } else {
        await kernel.db.itemPurchase.create({
          data: {
            itemId: item.id,
            guildId,
            userId: interaction.user.id,
            quantity: 1
          }
        });
      }

      let roleName = '';
      if (item.type === 'ROLE' && item.roleId) {
        const role = interaction.guild!.roles.cache.get(item.roleId);
        roleName = role ? role.name : 'Unknown Role';
        const discordMember = interaction.guild!.members.cache.get(interaction.user.id);
        await discordMember?.roles.add(item.roleId).catch(() => {});
      }

      // Draw custom canvas card for Shop Buy
      const buffer = await CardRenderer.drawShopBuyCard(
        interaction.user.username,
        interaction.user.displayAvatarURL({ extension: 'png' }),
        item.name,
        item.price,
        newBalance,
        item.type === 'ROLE',
        roleName
      );
      const attachment = new AttachmentBuilder(buffer, { name: 'buy_success.png' });

      await interaction.editReply({ files: [attachment] });
      kernel.eventBus.emit('economy:transaction', { guildId, userId: interaction.user.id, type: 'SHOP_BUY', amount: item.price });

    // ─── ADD ─────────────────────────────────────────────────────────────────
    } else if (sub === 'add') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return void interaction.reply({ content: '❌ Cần quyền Manage Server.', ephemeral: true });
      }
      const name = interaction.options.getString('name', true);
      const price = interaction.options.getInteger('price', true);
      const type = interaction.options.getString('type', true);
      const role = interaction.options.getRole('role');
      const description = interaction.options.getString('description');
      const stockOpt = interaction.options.getInteger('stock');
      const stock = (stockOpt && stockOpt > 0) ? stockOpt : null;
      const imageUrl = interaction.options.getString('image');

      const existing = await kernel.db.shopItem.findFirst({ where: { guildId, name } });
      if (existing) return void interaction.reply({ content: `❌ Sản phẩm **${name}** đã tồn tại.`, ephemeral: true });

      await kernel.db.shopItem.create({
        data: { guildId, name, price, type, roleId: role?.id ?? null, description: description ?? null, stock, imageUrl },
      });

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Thêm Sản Phẩm Thành Công')
        .addFields(
          { name: '🏷️ Tên', value: name, inline: true },
          { name: '💰 Giá', value: `${price.toLocaleString()} coins`, inline: true },
          { name: '📦 Kho hàng', value: stock ? `${stock}` : '∞ Không giới hạn', inline: true },
          { name: '🎁 Loại', value: type === 'ROLE' && role ? `Role ${role}` : 'Custom', inline: true },
        );

      if (imageUrl) embed.setImage(imageUrl);

      await interaction.reply({ embeds: [embed], ephemeral: true });

    // ─── REMOVE ──────────────────────────────────────────────────────────────
    } else if (sub === 'remove') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return void interaction.reply({ content: '❌ Cần quyền Manage Server.', ephemeral: true });
      }
      const name = interaction.options.getString('name', true);
      const item = await kernel.db.shopItem.findFirst({ where: { guildId, name } });
      if (!item) return void interaction.reply({ content: `❌ Sản phẩm **${name}** không tồn tại.`, ephemeral: true });
      await kernel.db.shopItem.delete({ where: { id: item.id } });
      await interaction.reply({ content: `✅ Đã xóa sản phẩm **${name}**.`, ephemeral: true });

    // ─── EDIT ────────────────────────────────────────────────────────────────
    } else if (sub === 'edit') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return void interaction.reply({ content: '❌ Cần quyền Manage Server.', ephemeral: true });
      }
      const name = interaction.options.getString('name', true);
      const item = await kernel.db.shopItem.findFirst({ where: { guildId, name } });
      if (!item) return void interaction.reply({ content: `❌ Sản phẩm **${name}** không tồn tại.`, ephemeral: true });

      const price = interaction.options.getInteger('price');
      const stockOpt = interaction.options.getInteger('stock');
      const enabled = interaction.options.getBoolean('enabled');
      const image = interaction.options.getString('image');

      const updates: any = {};
      if (price !== null) updates.price = price;
      if (stockOpt !== null) updates.stock = stockOpt > 0 ? stockOpt : null;
      if (enabled !== null) updates.enabled = enabled;
      if (image !== null) updates.imageUrl = image === 'none' ? null : image;

      await kernel.db.shopItem.update({ where: { id: item.id }, data: updates });
      await interaction.reply({ content: `✅ Đã cập nhật sản phẩm **${name}**.`, ephemeral: true });
    }
  }
}
