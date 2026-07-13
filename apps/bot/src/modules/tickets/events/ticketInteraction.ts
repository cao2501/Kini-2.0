import { Interaction, ButtonInteraction } from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { TicketService } from '../services/TicketService';

export default class TicketInteractionEvent implements IEvent<'interactionCreate'> {
  name = 'interactionCreate' as const;

  async execute(kernel: Kernel, interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    
    const parts = interaction.customId.split(':');
    const ns = parts[0];
    const action = parts[1];
    const id = parts[2];
    const type = parts[3]; // cleanType like booking, apply, support

    if (ns !== 'ticket') return;

    if (action === 'create') {
      await interaction.deferReply({ ephemeral: true });
      await TicketService.createTicket(kernel, interaction as ButtonInteraction, id, type);
      
    } else if (action === 'close') {
      await interaction.reply({ content: '🔄 Đang xử lý đóng ticket và sao lưu dữ liệu...', ephemeral: true });
      const channel = interaction.channel;
      if (channel && (channel.isTextBased() || channel.isThread())) {
        await TicketService.closeTicket(kernel, channel as any, interaction.user, 'Đóng bằng nút bấm');
      }
      
    } else if (action === 'claim') {
      await interaction.reply({ content: '🔄 Đang nhận hỗ trợ...', ephemeral: true });
      const channel = interaction.channel;
      if (channel && (channel.isTextBased() || channel.isThread())) {
        await TicketService.claimTicket(kernel, channel as any, interaction.user);
      }
    }
  }
}
