import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  GuildMember,
} from 'discord.js';
import { ICommand } from '../../../core/interfaces/ICommand';
import { Kernel } from '../../../core/Kernel';
import { musicManager } from '../services/MusicManager';
import play from 'play-dl';
import { logger } from '../../../core/logger/Logger';

export default class MusicCommand implements ICommand {
  data = new SlashCommandBuilder()
    .setName('music')
    .setDescription('🎵 Hệ thống phát nhạc')
    .addSubcommand(s => s.setName('play').setDescription('▶️ Phát nhạc')
      .addStringOption(o => o.setName('query').setDescription('Tên bài hát / URL YouTube').setRequired(true))
    )
    .addSubcommand(s => s.setName('skip').setDescription('⏭️ Bỏ qua bài hiện tại'))
    .addSubcommand(s => s.setName('stop').setDescription('⏹️ Dừng phát và xóa queue'))
    .addSubcommand(s => s.setName('pause').setDescription('⏸️ Tạm dừng / Tiếp tục'))
    .addSubcommand(s => s.setName('queue').setDescription('📋 Xem danh sách phát'))
    .addSubcommand(s => s.setName('shuffle').setDescription('🔀 Bật/Tắt shuffle'))
    .addSubcommand(s => s.setName('loop').setDescription('🔁 Bật/Tắt loop'))
    .addSubcommand(s => s.setName('volume').setDescription('🔊 Chỉnh âm lượng')
      .addIntegerOption(o => o.setName('level').setDescription('Âm lượng (0-200)').setMinValue(0).setMaxValue(200).setRequired(true))
    )
    .addSubcommand(s => s.setName('nowplaying').setDescription('🎵 Bài đang phát'))
    .addSubcommand(s => s.setName('remove').setDescription('🗑️ Xóa bài khỏi queue')
      .addIntegerOption(o => o.setName('position').setDescription('Vị trí trong queue (1-based)').setRequired(true).setMinValue(1))
    )
    .addSubcommand(s => s.setName('clear').setDescription('🗑️ Xóa toàn bộ queue'))
    .addSubcommand(s => s.setName('search').setDescription('🔍 Tìm kiếm bài hát và chọn từ menu')
      .addStringOption(o => o.setName('query').setDescription('Từ khóa tìm kiếm').setRequired(true))
    ) as any;

  async execute(interaction: ChatInputCommandInteraction, kernel: Kernel): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember;

    if (sub === 'play') {
      const query = interaction.options.getString('query', true);
      
      if (!member.voice.channelId) {
        return void interaction.reply({ content: '❌ Bạn cần tham gia kênh voice trước!', ephemeral: true });
      }

      await interaction.deferReply();

      const track = await musicManager.play(
        guildId,
        member.voice.channelId,
        query,
        interaction.user.tag,
        interaction.channel as any
      );

      if (!track) {
        return void interaction.editReply('❌ Không thể tìm thấy hoặc phát bài hát này. Hãy thử lại với từ khóa khác.');
      }

      const queue = musicManager.getQueue(guildId);

      if (track.playlist) {
        const embed = new EmbedBuilder()
          .setTitle('✅ Đã thêm Playlist/Album')
          .setColor(0x1db954)
          .setDescription(`Đã thêm **${track.playlist.count}** bài hát từ playlist/album **${track.playlist.name}** vào hàng đợi.`)
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` })
          .setTimestamp();
        if (track.thumbnail) {
          embed.setThumbnail(track.thumbnail);
        }
        await interaction.editReply({ embeds: [embed] });
      } else {
        const isQueueing = queue && queue.tracks.length > 1;
        if (isQueueing) {
          const embed = new EmbedBuilder()
            .setTitle('✅ Thêm vào Queue')
            .setColor(0x1db954)
            .setDescription(`[**${track.title}**](${track.url})`)
            .addFields(
              { name: '📋 Vị trí', value: `#${queue.tracks.length}`, inline: true },
              { name: '⏱️ Độ dài', value: track.duration, inline: true }
            );
          if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
          }
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply(`🎶 Đang chuẩn bị phát: **${track.title}**`);
        }
      }

    } else if (sub === 'queue') {
      const queue = musicManager.getQueue(guildId);
      if (!queue || !queue.tracks.length) {
        return void interaction.reply({ content: '📋 Hàng đợi đang trống.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Hàng Đợi Nhạc')
        .setColor(0x1db954)
        .setDescription(
          queue.tracks.slice(0, 10).map((t, i) =>
            `**${i + 1}.** [${t.title}](${t.url}) — *${t.requester}*`
          ).join('\n') + (queue.tracks.length > 10 ? `\n...và ${queue.tracks.length - 10} bài nữa` : '')
        )
        .addFields(
          { name: '🔀 Shuffle', value: queue.shuffle ? '✅' : '❌', inline: true },
          { name: '🔁 Loop', value: queue.loop ? '✅' : '❌', inline: true },
          { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
        );
      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'skip') {
      const queue = musicManager.getQueue(guildId);
      if (!queue || !queue.tracks.length) {
        return void interaction.reply({ content: '❌ Hàng đợi trống.', ephemeral: true });
      }

      const current = queue.tracks[0];
      musicManager.skip(guildId);
      await interaction.reply(`⏭️ Đã bỏ qua bài hát: **${current.title}**`);

    } else if (sub === 'stop') {
      const success = musicManager.stop(guildId);
      if (success) {
        await interaction.reply('⏹️ Đã dừng phát nhạc, xóa hàng đợi và rời khỏi kênh voice.');
      } else {
        await interaction.reply({ content: '❌ Hiện không phát nhạc.', ephemeral: true });
      }

    } else if (sub === 'pause') {
      const queue = musicManager.getQueue(guildId);
      if (!queue) {
        return void interaction.reply({ content: '❌ Không có nhạc đang phát.', ephemeral: true });
      }
      
      musicManager.pause(guildId);
      await interaction.reply(queue.paused ? '⏸️ Đã tạm dừng nhạc.' : '▶️ Tiếp tục phát nhạc.');

    } else if (sub === 'shuffle') {
      const success = musicManager.shuffle(guildId);
      if (success) {
        const queue = musicManager.getQueue(guildId)!;
        queue.shuffle = !queue.shuffle;
        await interaction.reply(`🔀 Shuffle: **${queue.shuffle ? 'BẬT' : 'TẮT'}** (Đã trộn danh sách)`);
      } else {
        await interaction.reply({ content: '❌ Danh sách phát quá ngắn để trộn.', ephemeral: true });
      }

    } else if (sub === 'loop') {
      const queue = musicManager.getQueue(guildId);
      if (!queue) {
        return void interaction.reply({ content: '❌ Không có hàng đợi hoạt động.', ephemeral: true });
      }
      queue.loop = !queue.loop;
      await interaction.reply(`🔁 Lặp lại (Loop): **${queue.loop ? 'BẬT' : 'TẮT'}**`);

    } else if (sub === 'volume') {
      const level = interaction.options.getInteger('level', true);
      const success = musicManager.setVolume(guildId, level);
      if (success) {
        await interaction.reply(`🔊 Đã chỉnh âm lượng thành: **${level}%**`);
      } else {
        await interaction.reply({ content: '❌ Không có hàng đợi hoạt động.', ephemeral: true });
      }

    } else if (sub === 'nowplaying') {
      const queue = musicManager.getQueue(guildId);
      const current = queue?.tracks[0];
      if (!current) {
        return void interaction.reply({ content: '❌ Không có nhạc đang phát.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎵 Đang Phát')
        .setDescription(`[**${current.title}**](${current.url})`)
        .setColor(0x1db954)
        .addFields(
          { name: '👤 Yêu cầu bởi', value: current.requester, inline: true },
          { name: '🔊 Âm lượng', value: `${queue.volume}%`, inline: true }
        );
      if (current.thumbnail) {
        embed.setThumbnail(current.thumbnail);
      }
      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'remove') {
      const queue = musicManager.getQueue(guildId);
      if (!queue) {
        return void interaction.reply({ content: '❌ Không có hàng đợi hoạt động.', ephemeral: true });
      }

      const pos = interaction.options.getInteger('position', true) - 1;
      if (pos < 0 || pos >= queue.tracks.length) {
        return void interaction.reply({ content: '❌ Vị trí không hợp lệ.', ephemeral: true });
      }

      if (pos === 0) {
        return void interaction.reply({ content: '❌ Không thể xóa bài đang phát. Dùng `/music skip` để bỏ qua.', ephemeral: true });
      }

      const [removed] = queue.tracks.splice(pos, 1);
      await interaction.reply(`🗑️ Đã xóa bài hát khỏi hàng đợi: **${removed!.title}**`);

    } else if (sub === 'clear') {
      const queue = musicManager.getQueue(guildId);
      if (!queue || queue.tracks.length <= 1) {
        return void interaction.reply({ content: '❌ Hàng đợi không có bài hát nào khác để xóa.', ephemeral: true });
      }

      const count = queue.tracks.length - 1;
      queue.tracks = [queue.tracks[0]!]; // Keep only the playing one
      await interaction.reply(`🗑️ Đã xóa **${count}** bài hát khỏi hàng đợi.`);

    } else if (sub === 'search') {
      const query = interaction.options.getString('query', true);

      if (!member.voice.channelId) {
        return void interaction.reply({ content: '❌ Bạn cần tham gia kênh voice trước!', ephemeral: true });
      }

      await interaction.deferReply();

      let results: any[] = [];
      try {
        results = await play.search(query, { limit: 5 });
      } catch (err: any) {
        logger.warn(`YouTube search failed during command: ${err.message}. Trying SoundCloud search...`);
      }

      // Fallback search to SoundCloud if YouTube yields nothing
      if (!results || results.length === 0) {
        try {
          const client_id = await play.getFreeClientID();
          await play.setToken({ soundcloud: { client_id } });
          results = await play.search(query, {
            source: { soundcloud: 'tracks' },
            limit: 5
          });
        } catch (scErr: any) {
          logger.error('SoundCloud search failed during command:', scErr);
        }
      }

      if (!results || results.length === 0) {
        return void interaction.editReply('❌ Không tìm thấy kết quả tìm kiếm nào phù hợp. Hãy thử lại với từ khóa khác.');
      }

      const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`music:search:select:${interaction.user.id}`)
        .setPlaceholder('Chọn bài hát muốn phát...')
        .addOptions(
          results.map((item: any) => {
            const title = item.title || item.name || 'Unknown Track';
            const url = item.url || '';
            const duration = item.durationRaw || (item.durationInMs ? `${Math.floor(item.durationInMs / 60000)}:${Math.floor((item.durationInMs % 60000) / 1000).toString().padStart(2, '0')}` : '00:00');
            const author = item.channel?.name || item.user?.username || 'Unknown Author';

            return {
              label: title.slice(0, 100),
              description: `Thời lượng: ${duration} | Tác giả: ${author}`.slice(0, 100),
              value: url
            };
          })
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle('🔍 Kết Quả Tìm Kiếm')
        .setColor(0x1db954)
        .setDescription(
          results.map((item: any, i: number) => {
            const title = item.title || item.name || 'Unknown Track';
            const duration = item.durationRaw || (item.durationInMs ? `${Math.floor(item.durationInMs / 60000)}:${Math.floor((item.durationInMs % 60000) / 1000).toString().padStart(2, '0')}` : '00:00');
            return `**${i + 1}.** [${title}](${item.url}) — *${duration}*`;
          }).join('\n')
        )
        .setFooter({ text: 'Hãy chọn 1 bài hát từ danh sách dưới đây để phát!' })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    }
  }
}
