import { IModule, ModuleManifest } from '../../core/interfaces/IModule';
import { Kernel } from '../../core/Kernel';
import { createModuleLogger } from '../../core/logger/Logger';
const log = createModuleLogger('analytics');
export default class AnalyticsModule implements IModule {
  readonly manifest: ModuleManifest = { name: 'analytics', displayName: 'Analytics', version: '1.0.0', description: 'Growth tracking, active users, message count, voice activity, top members, command usage', dependencies: [], requiredPermissions: [], defaultEnabled: true, premium: false };
  async onLoad(kernel: Kernel): Promise<void> {
    log.info('Analytics module loaded');
    // Track message events
    kernel.client.on('messageCreate', async (message) => {
      if (!message.guild || message.author.bot) return;
      await kernel.db.analyticsEvent.create({
        data: {
          guildId: message.guildId!,
          type: 'MESSAGE',
          userId: message.author.id,
          data: JSON.stringify({ channelId: message.channelId })
        }
      }).catch(() => {});
    });

    // Track voice join events
    kernel.client.on('voiceStateUpdate', async (oldState, newState) => {
      if (!newState.guild || newState.member?.user.bot) return;
      if (newState.channelId && oldState.channelId !== newState.channelId) {
        await kernel.db.analyticsEvent.create({
          data: {
            guildId: newState.guild.id,
            type: 'VOICE_JOIN',
            userId: newState.member.id,
            data: JSON.stringify({ channelId: newState.channelId })
          }
        }).catch(() => {});
      }
    });

    // Cleanup old events (keep 30 days)
    kernel.scheduler.schedule('analytics:cleanup', 'Cleanup analytics', '0 0 * * *', async () => {
      const cutoff = new Date(Date.now() - 30 * 86400000);
      await kernel.db.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    }, 'analytics');
  }
  async onUnload(): Promise<void> { log.info('Analytics module unloaded'); }
  async onReload(kernel: Kernel): Promise<void> { await this.onUnload(); await this.onLoad(kernel); }
}
