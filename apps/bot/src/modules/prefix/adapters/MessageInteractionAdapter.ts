import {
  Message, Guild, GuildMember, PermissionsBitField, TextChannel,
  APIInteractionGuildMember, MessageFlags,
} from 'discord.js';

/**
 * Wraps a Discord Message so it can be passed into existing slash command
 * execute(interaction, kernel) handlers with minimal changes.
 *
 * Supports:
 *  - options.getString / getInteger / getBoolean / getRole / getUser / getMember
 *  - options.getSubcommand
 *  - reply / deferReply / editReply (ephemeral = DM-fallback / same channel)
 */
export class MessageInteractionAdapter {
  // ── Discord-compatible properties ──────────────────────────────────────────
  public readonly guildId: string;
  public readonly guild: Guild;
  public readonly channel: import('discord.js').TextBasedChannel;
  public readonly user: { id: string; username: string; tag: string; displayAvatarURL: () => string };
  public readonly channelId: string;
  public readonly member: GuildMember | APIInteractionGuildMember | null;
  public readonly memberPermissions: PermissionsBitField | null;
  public readonly options: ReturnType<typeof this.buildOptions>;

  private readonly message: Message;
  private readonly subcommand: string | null;
  private readonly rawArgs: string[];

  // State
  private sentReply: import('discord.js').Message | null = null;
  private deferred = false;
  private argCursor = 0; // next positional arg index

  constructor(message: Message, subcommand: string | null, args: string[]) {
    this.message = message;
    this.subcommand = subcommand;
    this.rawArgs = args;

    this.guildId = message.guildId!;
    this.guild = message.guild!;
    this.channel = message.channel;
    this.channelId = message.channelId;
    this.member = message.member;
    this.memberPermissions = message.member?.permissions ?? null;

    this.user = {
      id: message.author.id,
      username: message.author.username,
      tag: message.author.tag,
      displayAvatarURL: () => message.author.displayAvatarURL(),
    };

    this.options = this.buildOptions();
  }

  // ── Options builder ────────────────────────────────────────────────────────
  private buildOptions() {
    const getPositional = () => this.rawArgs[this.argCursor++] ?? null;

    const findNamed = (name: string) => {
      const entry = this.rawArgs.find(a => a.toLowerCase().startsWith(`${name.toLowerCase()}:`));
      return entry ? entry.slice(name.length + 1) : null;
    };

    return {
      getSubcommand: (_required?: boolean): string => {
        return this.subcommand ?? '';
      },

      getString: (name: string, required = false): string | null => {
        const named = findNamed(name);
        if (named !== null) return named;
        // Join remaining args as one string if it's the last option
        const val = this.rawArgs.slice(this.argCursor).join(' ') || null;
        this.argCursor = this.rawArgs.length;
        if (!val && required) throw new Error(`❌ Thiếu tham số **${name}**. Dùng \`${name}:giá_trị\``);
        return val;
      },

      getInteger: (name: string, required = false): number | null => {
        const named = findNamed(name);
        const raw = named !== null ? named : getPositional();
        if (!raw) {
          if (required) throw new Error(`❌ Thiếu tham số số nguyên **${name}**`);
          return null;
        }
        const n = parseInt(raw, 10);
        if (isNaN(n)) {
          if (required) throw new Error(`❌ Tham số **${name}** phải là số nguyên`);
          return null;
        }
        return n;
      },

      getNumber: (name: string, required = false): number | null => {
        const named = findNamed(name);
        const raw = named !== null ? named : getPositional();
        if (!raw) { if (required) throw new Error(`❌ Thiếu tham số **${name}**`); return null; }
        const n = parseFloat(raw);
        return isNaN(n) ? null : n;
      },

      getBoolean: (name: string, _required = false): boolean | null => {
        const named = findNamed(name);
        const raw = named !== null ? named : getPositional();
        if (!raw) return null;
        return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase());
      },

      getRole: (name: string, required = false) => {
        const mention = this.rawArgs.find(a => a.match(/^<@&\d+>$/));
        const idArg = this.rawArgs.find(a => a.match(/^\d{17,19}$/) && !a.match(/^<@/));
        const id = mention
          ? mention.replace(/[<@&>]/g, '')
          : (idArg ?? null);
        if (!id) { if (required) throw new Error(`❌ Thiếu role **${name}**`); return null; }
        return this.message.guild?.roles.cache.get(id) ?? null;
      },

      getUser: (name: string, required = false) => {
        const mention = this.rawArgs.find(a => a.match(/^<@!?\d+>$/));
        if (!mention) { if (required) throw new Error(`❌ Thiếu user **${name}**`); return null; }
        const id = mention.replace(/[<@!>]/g, '');
        return this.message.client.users.cache.get(id) ?? null;
      },

      getMember: (name: string, required = false) => {
        const mention = this.rawArgs.find(a => a.match(/^<@!?\d+>$/));
        if (!mention) { if (required) throw new Error(`❌ Thiếu thành viên **${name}**`); return null; }
        const id = mention.replace(/[<@!>]/g, '');
        return this.message.guild?.members.cache.get(id) ?? null;
      },

      getChannel: (_name: string, _required = false) => null,
      getAttachment: (_name: string) => null,
    };
  }

  // ── Reply methods ──────────────────────────────────────────────────────────
  async reply(options: any): Promise<void> {
    const payload = this.buildPayload(options);
    this.sentReply = await this.message.reply(payload).catch(() => null);
  }

  async deferReply(_options?: { ephemeral?: boolean }): Promise<void> {
    this.deferred = true;
    await (this.message.channel as TextChannel).sendTyping().catch(() => {});
  }

  async editReply(options: any): Promise<void> {
    const payload = this.buildPayload(options);
    if (this.sentReply) {
      await this.sentReply.edit(payload).catch(() => {});
    } else {
      this.sentReply = await this.message.channel.send(payload).catch(() => null);
    }
  }

  async followUp(options: any): Promise<void> {
    const payload = this.buildPayload(options);
    await this.message.channel.send(payload).catch(() => {});
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private buildPayload(options: any): any {
    if (typeof options === 'string') return { content: options };
    const out: any = {};
    if (options.content) out.content = options.content;
    if (options.embeds?.length) out.embeds = options.embeds;
    if (options.components?.length) out.components = options.components;
    // Strip ephemeral flag — text messages have no ephemeral
    return out;
  }

  // Type guards expected by some command guard checks
  isChatInputCommand(): boolean { return true; }
  isButton(): boolean { return false; }
  isStringSelectMenu(): boolean { return false; }
  isAutocomplete(): boolean { return false; }
  isModalSubmit(): boolean { return false; }
  isRepliable(): boolean { return true; }
}
