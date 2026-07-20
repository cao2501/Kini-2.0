import { Interaction, Message } from 'discord.js';
import { IEvent } from '../../../core/interfaces/IEvent';
import { Kernel } from '../../../core/Kernel';
import { getModuleConfig } from '../../../database/helpers';
import { MessageInteractionAdapter } from '../adapters/MessageInteractionAdapter';
import { createModuleLogger } from '../../../core/logger/Logger';

const log = createModuleLogger('prefix');

interface AliasMapping {
  command: string;
  subcommand?: string;
}

export default class PrefixHandlerEvent implements IEvent<'messageCreate'> {
  name = 'messageCreate' as const;

  async execute(kernel: Kernel, message: Message): Promise<void> {
    // Ignore bots & DMs
    if (message.author.bot || !message.guildId || !message.content) return;

    const guildId = message.guildId;

    try {
      const { config } = await getModuleConfig<any>(guildId, 'prefix');
      const globalPrefix: string = config?.globalPrefix ?? '!';
      const aliases: Record<string, AliasMapping> = config?.aliases ?? {};

      if (!message.content.startsWith(globalPrefix)) return;

      // Parse: prefix + alias + args
      const withoutPrefix = message.content.slice(globalPrefix.length).trim();
      if (!withoutPrefix) return;

      const tokens = withoutPrefix.split(/\s+/);
      const aliasKey = tokens[0].toLowerCase();
      const args = tokens.slice(1);

      let mapping = aliases[aliasKey];
      if (!mapping) {
        const fallbacks: Record<string, AliasMapping> = {
          marry: args.length > 0 ? { command: 'marry', subcommand: 'proposal' } : { command: 'marry', subcommand: 'profile' },
          mry: args.length > 0 ? { command: 'marry', subcommand: 'proposal' } : { command: 'marry', subcommand: 'profile' },
          divorce: { command: 'marry', subcommand: 'divorce' },
          thumbnail: { command: 'marry', subcommand: 'thumbnail' },
          image: { command: 'marry', subcommand: 'image' },
          caption: { command: 'marry', subcommand: 'caption' },
          color: { command: 'marry', subcommand: 'color' },
          luv: { command: 'marry', subcommand: 'luv' },
          inventory: { command: 'inventory', subcommand: 'view' },
          inv: { command: 'inventory', subcommand: 'view' },
          give: { command: 'inventory', subcommand: 'give' },
          xoado: { command: 'inventory', subcommand: 'remove' },
          takering: { command: 'inventory', subcommand: 'remove' },
          removering: { command: 'inventory', subcommand: 'remove' },
          shop: { command: 'shop' },
          muanhan: { command: 'buyring' },
          buyring: { command: 'buyring' },
          tangnhan: { command: 'givering' },
          givering: { command: 'givering' },
          addnhan: { command: 'addring' },
          addring: { command: 'addring' },
          delnhan: { command: 'delring' },
          delring: { command: 'delring' },
          editnhan: { command: 'editring' },
          editring: { command: 'editring' },
        };
        mapping = fallbacks[aliasKey];
      }

      if (mapping && mapping.command === 'shop' && args.length > 0) {
        const firstArg = args[0].toLowerCase();
        const legacyMap: Record<string, string> = {
          buy: 'buyring',
          add: 'addring',
          remove: 'delring',
          edit: 'editring',
          give: 'givering',
        };
        if (legacyMap[firstArg]) {
          mapping = { command: legacyMap[firstArg] };
          args.shift();
        } else if (firstArg === 'list') {
          mapping = { command: 'shop' };
          args.shift();
        }
      } else if (mapping && mapping.command === 'inventory' && args.length > 0) {
        const firstArg = args[0].toLowerCase();
        const subs = ['view', 'give', 'remove'];
        if (subs.includes(firstArg)) {
          mapping = { command: 'inventory', subcommand: firstArg };
          args.shift();
        }
      }

      if (!mapping) return; // Unknown alias — silently ignore

      const command = kernel.client.commands.get(mapping.command);
      if (!command) {
        await message.reply(`❌ Lệnh \`/${mapping.command}\` không tồn tại hoặc chưa được tải.`);
        return;
      }

      log.info(`Text prefix command: ${globalPrefix}${aliasKey} → /${mapping.command}${mapping.subcommand ? ' ' + mapping.subcommand : ''} [${message.author.tag}]`);

      const adapter = new MessageInteractionAdapter(
        message,
        mapping.subcommand ?? null,
        args,
      );

      // Execute the slash command handler with the adapter
      await (command as any).execute(adapter as any, kernel);

    } catch (err: any) {
      log.error(`Prefix handler error: ${err.message}`);
      await message.reply(`❌ Lỗi xử lý lệnh: ${err.message}`).catch(() => {});
    }
  }
}
