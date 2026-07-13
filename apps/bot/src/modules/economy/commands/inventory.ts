import { ChatInputCommandInteraction, SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild } from '../../../database/helpers';
import { CardRenderer } from '../../../core/ui/CardRenderer';

export default class InventoryCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('🎒 Kho đồ cá nhân của bạn');

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const guildId = interaction.guildId!;
    await ensureGuild(guildId, interaction.guild!.name);
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
  }
}
