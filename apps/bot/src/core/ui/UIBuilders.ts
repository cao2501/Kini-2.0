import { EmbedBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { Theme } from './Theme';

export class UIBuilders {
  /**
   * Create a standardized Embed with Accent Gold color and custom timestamp footer
   */
  public static createEmbed(title?: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(Theme.colors.accentGold as any)
      .setTimestamp();
    
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    
    return embed;
  }

  /**
   * Create a standardized Success Embed (Green Accent)
   */
  public static createSuccessEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description)
      .setColor(Theme.colors.success as any);
  }

  /**
   * Create a standardized Error/Danger Embed (Red Accent)
   */
  public static createErrorEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description)
      .setColor(Theme.colors.danger as any);
  }

  /**
   * Create a standardized Info Embed (Blurple Accent)
   */
  public static createInfoEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description)
      .setColor(Theme.colors.info as any);
  }

  /**
   * Create a styled ButtonBuilder with automatic padding and styling
   */
  public static createButton(
    customId: string,
    label: string,
    style: ButtonStyle = ButtonStyle.Secondary,
    emoji?: string
  ): ButtonBuilder {
    const btn = new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(style);
    
    if (emoji) btn.setEmoji(emoji);
    return btn;
  }
}
