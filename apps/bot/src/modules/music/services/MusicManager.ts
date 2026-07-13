import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  AudioPlayer,
  VoiceConnection,
} from '@discordjs/voice';
import play from 'play-dl';
import { TextBasedChannel } from 'discord.js';
import { logger } from '../../../core/logger/Logger';

export interface Track {
  title: string;
  url: string;
  duration: string;
  requester: string;
  thumbnail?: string;
  playlist?: {
    name: string;
    count: number;
  };
}

export interface GuildQueue {
  guildId: string;
  voiceChannelId: string;
  textChannel: TextBasedChannel;
  connection: VoiceConnection | null;
  player: AudioPlayer | null;
  tracks: Track[];
  playing: boolean;
  loop: boolean;
  shuffle: boolean;
  volume: number;
  paused: boolean;
}

class MusicManager {
  private queues = new Map<string, GuildQueue>();
  private soundcloudAuthorized = false;
  private spotifyAuthorized = false;

  private async ensureSoundCloudAuth(): Promise<void> {
    if (this.soundcloudAuthorized) return;
    try {
      const client_id = await play.getFreeClientID();
      if (client_id) {
        await play.setToken({ soundcloud: { client_id } });
        this.soundcloudAuthorized = true;
        logger.info('SoundCloud client ID successfully initialized for fallback.');
      }
    } catch (err: any) {
      logger.error('Failed to initialize SoundCloud client ID:', err);
    }
  }

  private async ensureSpotifyAuth(): Promise<boolean> {
    if (this.spotifyAuthorized) return true;
    const client_id = process.env.SPOTIFY_CLIENT_ID;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!client_id || !client_secret) {
      return false;
    }

    try {
      await play.setToken({
        spotify: {
          client_id,
          client_secret
        }
      });
      this.spotifyAuthorized = true;
      logger.info('Spotify client credentials successfully initialized for playback.');
      return true;
    } catch (err: any) {
      logger.error('Failed to initialize Spotify credentials:', err);
      return false;
    }
  }

  getQueue(guildId: string): GuildQueue | undefined {
    return this.queues.get(guildId);
  }

  createQueue(guildId: string, voiceChannelId: string, textChannel: TextBasedChannel): GuildQueue {
    const queue: GuildQueue = {
      guildId,
      voiceChannelId,
      textChannel,
      connection: null,
      player: null,
      tracks: [],
      playing: false,
      loop: false,
      shuffle: false,
      volume: 80,
      paused: false
    };
    this.queues.set(guildId, queue);
    return queue;
  }

  async play(guildId: string, voiceChannelId: string, query: string, requester: string, textChannel: TextBasedChannel): Promise<Track | null> {
    let queue = this.getQueue(guildId);
    if (!queue) {
      queue = this.createQueue(guildId, voiceChannelId, textChannel);
    }

    let track: Track;
    
    try {
      // Validate query
      const spType = play.sp_validate(query);
      if (spType === 'track') {
        const authed = await this.ensureSpotifyAuth();
        if (!authed) {
          throw new Error('Spotify credentials are not configured. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the .env file.');
        }
        const info = await play.spotify(query) as any;
        track = {
          title: `${info.name} - ${info.artists.map((a: any) => a.name).join(', ')}`,
          url: info.url, // Store Spotify URL, search/resolve it when starting stream
          duration: '00:00', // Resolved lazily when streaming
          requester,
          thumbnail: info.thumbnail?.url
        };
      } else if (spType === 'album' || spType === 'playlist') {
        const authed = await this.ensureSpotifyAuth();
        if (!authed) {
          throw new Error('Spotify credentials are not configured. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the .env file.');
        }
        const info = await play.spotify(query) as any;
        const spotifyTracks = await info.all_tracks();
        if (!spotifyTracks || spotifyTracks.length === 0) {
          return null;
        }

        const firstTrack = spotifyTracks[0];
        track = {
          title: `${firstTrack.name} - ${firstTrack.artists.map((a: any) => a.name).join(', ')}`,
          url: firstTrack.url,
          duration: '00:00',
          requester,
          thumbnail: firstTrack.thumbnail?.url || info.thumbnail?.url,
          playlist: {
            name: info.name,
            count: spotifyTracks.length
          }
        };

        // Push the rest of the tracks asynchronously to the queue
        for (let i = 1; i < spotifyTracks.length; i++) {
          const t = spotifyTracks[i];
          queue.tracks.push({
            title: `${t.name} - ${t.artists.map((a: any) => a.name).join(', ')}`,
            url: t.url,
            duration: '00:00',
            requester,
            thumbnail: t.thumbnail?.url || info.thumbnail?.url
          });
        }
      } else if (query.includes('soundcloud.com')) {
        await this.ensureSoundCloudAuth();
        const info = await play.soundcloud(query) as any;
        const mins = Math.floor((info.durationInMs || 0) / 60000);
        const secs = Math.floor(((info.durationInMs || 0) % 60000) / 1000);
        const durationStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        track = {
          title: info.name || 'Unknown SoundCloud Track',
          url: info.url,
          duration: durationStr,
          requester,
          thumbnail: info.thumbnail || undefined
        };
      } else {
        const validation = await play.validate(query);
        if (validation === 'yt_video' || (query.startsWith('http') && !query.includes('soundcloud.com'))) {
          const info = await play.video_info(query);
          track = {
            title: info.video_details.title || 'Unknown Video',
            url: info.video_details.url,
            duration: info.video_details.durationRaw || '00:00',
            requester,
            thumbnail: info.video_details.thumbnails[0]?.url
          };
        } else {
          // Search YouTube
          const results = await play.search(query, { limit: 1 });
          if (!results || results.length === 0) {
            return null;
          }
          const video = results[0];
          track = {
            title: video.title || 'Unknown Video',
            url: video.url,
            duration: video.durationRaw || '00:00',
            requester,
            thumbnail: video.thumbnails[0]?.url
          };
        }
      }

      queue.tracks.push(track);

      if (!queue.playing) {
        queue.playing = true;
        await this.startStream(guildId);
      }

      return track;
    } catch (err: any) {
      logger.error(`Error during play resolution: ${err.message}`, { stack: err.stack });
      return null;
    }
  }

  private async startStream(guildId: string): Promise<void> {
    const queue = this.getQueue(guildId);
    if (!queue || queue.tracks.length === 0) {
      this.destroyQueue(guildId);
      return;
    }

    const track = queue.tracks[0];
    try {
      // 1. Join Voice Channel
      if (!queue.connection) {
        queue.connection = joinVoiceChannel({
          channelId: queue.voiceChannelId,
          guildId: queue.guildId,
          adapterCreator: queue.textChannel.guild.voiceAdapterCreator as any,
        });

        // Debug Connection State
        queue.connection.on('stateChange', (oldState, newState) => {
          logger.info(`Voice Connection for ${guildId} changed from ${oldState.status} to ${newState.status}`);
        });

        // Handle disconnects
        queue.connection.on(VoiceConnectionStatus.Disconnected, () => {
          this.destroyQueue(guildId);
        });
      }

      // 2. Create Player
      if (!queue.player) {
        queue.player = createAudioPlayer();
        queue.connection.subscribe(queue.player);

        // Debug Player State
        queue.player.on('stateChange', (oldState, newState) => {
          logger.info(`Audio Player for ${guildId} changed from ${oldState.status} to ${newState.status}`);
        });

        queue.player.on(AudioPlayerStatus.Idle, () => {
          this.handleNextTrack(guildId);
        });

        queue.player.on('error', (err) => {
          logger.error('Audio Player Error:', { error: err });
          this.handleNextTrack(guildId);
        });
      }

      // If it is a Spotify track, we resolve it to YouTube/SoundCloud before streaming
      if (track.url.includes('spotify.com')) {
        logger.info(`Resolving Spotify track: "${track.title}" ...`);
        
        let resolvedUrl = '';
        try {
          const searchResult = await play.search(track.title, { limit: 1 });
          if (searchResult && searchResult.length > 0) {
            resolvedUrl = searchResult[0].url;
            track.duration = searchResult[0].durationRaw || '00:00';
            if (!track.thumbnail) {
              track.thumbnail = searchResult[0].thumbnails[0]?.url;
            }
          }
        } catch (searchErr: any) {
          logger.warn(`YouTube search resolution failed for Spotify track "${track.title}": ${searchErr.message}`);
        }

        // Fallback to SoundCloud search if YouTube search failed or yielded nothing
        if (!resolvedUrl) {
          try {
            await this.ensureSoundCloudAuth();
            const scResult = await play.search(track.title, {
              source: { soundcloud: 'tracks' },
              limit: 1
            });
            if (scResult && scResult.length > 0) {
              resolvedUrl = scResult[0].url;
              track.title = `${scResult[0].name} (SoundCloud Fallback)`;
            }
          } catch (scSearchErr: any) {
            logger.error(`SoundCloud search resolution failed for Spotify track "${track.title}":`, scSearchErr);
          }
        }

        if (!resolvedUrl) {
          throw new Error('Could not resolve Spotify track on YouTube or SoundCloud.');
        }

        logger.info(`Resolved "${track.title}" to: ${resolvedUrl}`);
        track.url = resolvedUrl;
      }

      // 3. Get Audio Stream with robust fallback for YouTube signature cipher changes
      let resource: any;
      try {
        const stream = await play.stream(track.url);
        resource = createAudioResource(stream.stream, {
          inputType: stream.type,
          inlineVolume: true
        });
      } catch (err: any) {
        logger.warn(`Standard play-dl stream failed for ${track.title}: ${err.message}. Attempting format-18 fallback...`);
        let fallbackSucceeded = false;
        try {
          const info = await play.video_info(track.url);
          const fallbackFormat = info.format.find(f => f.itag === 18) || info.format.find(f => f.url);
          if (fallbackFormat && fallbackFormat.url) {
            logger.info(`Fallback stream succeeded using format ${fallbackFormat.itag} for ${track.title}`);
            resource = createAudioResource(fallbackFormat.url, {
              inlineVolume: true
            });
            fallbackSucceeded = true;
          }
        } catch (videoInfoErr: any) {
          logger.warn(`Failed to fetch video_info fallback for ${track.title}: ${videoInfoErr.message}`);
        }

        if (!fallbackSucceeded) {
          logger.warn(`YouTube stream totally blocked for "${track.title}". Attempting SoundCloud fallback...`);
          await this.ensureSoundCloudAuth();
          const results = await play.search(track.title, {
            source: { soundcloud: 'tracks' },
            limit: 1
          });
          if (results && results.length > 0) {
            const scTrack = results[0];
            logger.info(`Found SoundCloud fallback track: "${scTrack.name}" -> ${scTrack.url}`);
            const stream = await play.stream(scTrack.url);
            resource = createAudioResource(stream.stream, {
              inputType: stream.type,
              inlineVolume: true
            });
            // Update title to let user know we fell back to SoundCloud
            track.title = `${scTrack.name} (SoundCloud Fallback)`;
          } else {
            throw new Error('No deciphered formats available on YouTube, and no match found on SoundCloud.');
          }
        }
      }

      resource.volume?.setVolume(queue.volume / 100);
      queue.player.play(resource);
      queue.paused = false;

      // Send announcement
      const { EmbedBuilder } = await import('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('▶️ Đang Phát')
        .setDescription(`[**${track.title}**](${track.url})`)
        .setColor(0x1db954)
        .addFields(
          { name: '⏱️ Thời lượng', value: track.duration, inline: true },
          { name: '👤 Yêu cầu bởi', value: track.requester, inline: true }
        );
      if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
      }
      await queue.textChannel.send({ embeds: [embed] }).catch(() => {});

    } catch (err: any) {
      logger.error(`Error starting stream for ${track.title}: ${err.message}`, { stack: err.stack });
      queue.textChannel.send(`❌ Không thể phát bài **${track.title}** do lỗi hệ thống phát nhạc. Chi tiết: ${err.message}`).catch(() => {});
      this.handleNextTrack(guildId);
    }
  }

  private handleNextTrack(guildId: string): void {
    const queue = this.getQueue(guildId);
    if (!queue) return;

    const currentTrack = queue.tracks.shift();
    if (queue.loop && currentTrack) {
      queue.tracks.push(currentTrack);
    }

    if (queue.tracks.length > 0) {
      this.startStream(guildId);
    } else {
      this.destroyQueue(guildId);
    }
  }

  skip(guildId: string): boolean {
    const queue = this.getQueue(guildId);
    if (!queue || !queue.player) return false;
    queue.player.stop();
    return true;
  }

  stop(guildId: string): boolean {
    const queue = this.getQueue(guildId);
    if (!queue) return false;
    this.destroyQueue(guildId);
    return true;
  }

  pause(guildId: string): boolean {
    const queue = this.getQueue(guildId);
    if (!queue || !queue.player) return false;
    if (queue.paused) {
      queue.player.unpause();
      queue.paused = false;
    } else {
      queue.player.pause();
      queue.paused = true;
    }
    return true;
  }

  setVolume(guildId: string, volume: number): boolean {
    const queue = this.getQueue(guildId);
    if (!queue) return false;
    queue.volume = volume;
    if (queue.player) {
      const state = queue.player.state;
      if (state.status === AudioPlayerStatus.Playing && (state as any).resource?.volume) {
        (state as any).resource.volume.setVolume(volume / 100);
      }
    }
    return true;
  }

  shuffle(guildId: string): boolean {
    const queue = this.getQueue(guildId);
    if (!queue || queue.tracks.length <= 1) return false;
    
    const nowPlaying = queue.tracks.shift()!;
    for (let i = queue.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j]!, queue.tracks[i]!];
    }
    queue.tracks.unshift(nowPlaying);
    return true;
  }

  private destroyQueue(guildId: string): void {
    const queue = this.getQueue(guildId);
    if (!queue) return;

    try {
      if (queue.player) {
        queue.player.stop();
      }
      if (queue.connection) {
        queue.connection.destroy();
      }
    } catch {}

    this.queues.delete(guildId);
  }
}

export const musicManager = new MusicManager();
