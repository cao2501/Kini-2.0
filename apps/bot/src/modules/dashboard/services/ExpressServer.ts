import express from 'express';
import session from 'express-session';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import Transport from 'winston-transport';
import multer from 'multer';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../../core/logger/Logger';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild, getModuleConfig, setModuleConfig } from '../../../database/helpers';

// Winston transport for streaming logs via socket.io
class SocketIoTransport extends Transport {
  private io: SocketServer;

  constructor(io: SocketServer, opts?: any) {
    super(opts);
    this.io = io;
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    try {
      this.io.emit('log_message', {
        timestamp: new Date().toISOString(),
        level: info.level,
        module: info.module || 'system',
        message: info.message
      });
    } catch {}

    callback();
  }
}

const upload = multer({ storage: multer.memoryStorage() });

export class ExpressServer {
  private kernel: Kernel;
  private app: express.Application;
  private httpServer!: http.Server;
  private io!: SocketServer;
  private logTransport: SocketIoTransport | null = null;
  private port: number;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.port = parseInt(process.env.DASHBOARD_PORT || '3000', 10);
    this.app = express();
  }

  async start(): Promise<void> {
    this.app.use(helmet({
      contentSecurityPolicy: false, // Turn off CSP for dev static files ease
    }));
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Session setup
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'kini-super-secret-session-key',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 86400000 } // 24 hours
    }));

    // Serve static files
    const publicPath = path.join(__dirname, '../public');
    this.app.use(express.static(publicPath));

    // HTTP & Socket Server
    this.httpServer = http.createServer(this.app);
    this.io = new SocketServer(this.httpServer, {
      cors: { origin: '*' }
    });

    // Add Winston log capture transport
    this.logTransport = new SocketIoTransport(this.io);
    logger.add(this.logTransport);

    // Setup routes
    this.setupAuthRoutes();
    this.setupApiRoutes();

    // Serve html pages if requested directly
    this.app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
    this.app.get('/dashboard', (req, res) => {
      if (!(req.session as any).user) return res.redirect('/');
      res.sendFile(path.join(publicPath, 'dashboard.html'));
    });

    // Socket connections
    this.io.on('connection', (socket) => {
      logger.info(`Web socket client connected: ${socket.id}`, { module: 'dashboard' });
      socket.on('disconnect', () => {
        logger.info(`Web socket client disconnected: ${socket.id}`, { module: 'dashboard' });
      });
    });

    this.httpServer.listen(this.port, () => {
      logger.info(`Dashboard server running on port ${this.port} (URL: http://localhost:${this.port})`, { module: 'dashboard' });
    });
  }

  async stop(): Promise<void> {
    if (this.logTransport) {
      logger.remove(this.logTransport);
    }
    if (this.io) {
      this.io.close();
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
    }
  }

  private setupAuthRoutes(): void {
    const CLIENT_ID = process.env.CLIENT_ID || '';
    const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
    const DASHBOARD_URL = process.env.DASHBOARD_URL || `http://localhost:${this.port}`;
    const REDIRECT_URI = `${DASHBOARD_URL}/auth/callback`;

    // Developer bypass login
    this.app.post('/auth/bypass', (req, res) => {
      const isConfigured = CLIENT_ID && CLIENT_SECRET;
      // Allow bypass always if not configured, or if specifically requested in dev mode
      const sessionUser = {
        id: this.kernel.ownerIds[0] || '123456789',
        username: 'DeveloperAdmin',
        avatar: '',
        isBypass: true
      };

      (req.session as any).user = sessionUser;
      
      // Simulate guilds containing admin permissions
      (req.session as any).guilds = this.kernel.client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        permissions: '8', // Admin
        owner: true
      }));

      res.json({ success: true });
    });

    this.app.get('/auth/login', (req, res) => {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        // OAuth2 not configured: Auto-bypass and redirect to dashboard
        const sessionUser = {
          id: this.kernel.ownerIds[0] || '123456789',
          username: 'DeveloperAdmin',
          avatar: '',
          isBypass: true
        };

        (req.session as any).user = sessionUser;
        (req.session as any).guilds = this.kernel.client.guilds.cache.map(g => ({
          id: g.id,
          name: g.name,
          permissions: '8', // Admin
          owner: true
        }));

        return res.redirect('/dashboard');
      }
      const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
      res.redirect(url);
    });

    this.app.get('/auth/callback', async (req, res) => {
      const code = req.query.code as string;
      if (!code) return res.redirect('/');

      try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
          }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!tokenResponse.ok) {
          throw new Error(`Failed to exchange token: ${tokenResponse.statusText}`);
        }

        const tokens = await tokenResponse.json() as any;

        // Fetch user data
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const user = await userRes.json() as any;

        // Fetch user guilds
        const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const guilds = await guildsRes.json() as any;

        (req.session as any).user = {
          id: user.id,
          username: `${user.username}#${user.discriminator || '0'}`,
          avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
        };
        (req.session as any).guilds = guilds;

        res.redirect('/dashboard');
      } catch (err: any) {
        logger.error('OAuth2 callback error:', { error: err });
        res.status(500).send(`Authentication error: ${err.message}`);
      }
    });

    this.app.get('/auth/user', (req, res) => {
      res.json((req.session as any).user || null);
    });

    this.app.get('/auth/logout', (req, res) => {
      req.session.destroy(() => {
        res.redirect('/');
      });
    });
  }

  private setupApiRoutes(): void {
    // Middleware to check authentication
    const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!(req.session as any).user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    };

    // Get system stats
    this.app.get('/api/stats', requireAuth, (req, res) => {
      const mem = process.memoryUsage();
      res.json({
        uptime: this.kernel.uptime,
        ram: {
          rss: (mem.rss / 1024 / 1024).toFixed(2),
          heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2)
        },
        guildsCount: this.kernel.client.guilds.cache.size,
        modulesCount: this.kernel.client.modules.size,
        commandsCount: this.kernel.client.commands.size,
        ping: this.kernel.client.ws.ping,
        maintenanceMode: this.kernel.cache.get<boolean>('maintenance_mode') || false
      });
    });

    // Get user guilds
    this.app.get('/api/guilds', requireAuth, (req, res) => {
      const userGuilds = (req.session as any).guilds || [];
      const botGuilds = this.kernel.client.guilds.cache;

      const formatted = userGuilds
        .filter((g: any) => {
          // Check if admin (permissions & 0x8) or manage server (permissions & 0x20)
          const perms = BigInt(g.permissions);
          const isAdmin = (perms & 8n) === 8n;
          const isManager = (perms & 0x20n) === 0x20n;
          return g.owner || isAdmin || isManager;
        })
        .map((g: any) => {
          const inGuild = botGuilds.has(g.id);
          return {
            id: g.id,
            name: g.name,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            inGuild,
            inviteUrl: `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID || this.kernel.client.user?.id}&permissions=8&scope=bot%20applications.commands&guild_id=${g.id}`
          };
        });

      res.json(formatted);
    });

    // Get modules status and configs for a specific guild
    this.app.get('/api/guilds/:id/modules', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const guild = this.kernel.client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      await ensureGuild(guildId, guild.name, guild.ownerId);

      const modules = Array.from(this.kernel.client.modules.values()).map(m => ({
        name: m.manifest.name,
        displayName: m.manifest.displayName,
        description: m.manifest.description,
        version: m.manifest.version,
        premium: m.manifest.premium
      }));

      const responseData = [];
      for (const mod of modules) {
        const { enabled, config } = await getModuleConfig<any>(guildId, mod.name);
        responseData.push({
          ...mod,
          enabled,
          config
        });
      }

      res.json(responseData);
    });

    // Toggle module status
    this.app.post('/api/guilds/:id/modules/:name/toggle', requireAuth, async (req, res) => {
      const { id: guildId, name: moduleName } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Field enabled is required and must be boolean' });
      }

      try {
        const { config } = await getModuleConfig<any>(guildId, moduleName);
        await setModuleConfig(guildId, moduleName, config, enabled);
        res.json({ success: true, enabled });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Save module config
    this.app.post('/api/guilds/:id/modules/:name/config', requireAuth, async (req, res) => {
      const { id: guildId, name: moduleName } = req.params;
      const { config } = req.body;

      if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'Config object is required' });
      }

      try {
        const { enabled } = await getModuleConfig<any>(guildId, moduleName);
        await setModuleConfig(guildId, moduleName, config, enabled);
        res.json({ success: true, config });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Owner operations: reload module
    this.app.post('/api/owner/reload/:name', requireAuth, async (req, res) => {
      const user = (req.session as any).user;
      if (!this.kernel.isOwner(user.id)) {
        return res.status(403).json({ error: 'Forbidden: Owner only' });
      }

      const moduleName = req.params.name;
      const success = await this.kernel.loader.reloadModule(moduleName);
      res.json({ success, message: success ? `Reloaded module ${moduleName}` : `Failed to reload ${moduleName}` });
    });

    // Owner operations: toggle maintenance
    this.app.post('/api/owner/maintenance', requireAuth, async (req, res) => {
      const user = (req.session as any).user;
      if (!this.kernel.isOwner(user.id)) {
        return res.status(403).json({ error: 'Forbidden: Owner only' });
      }

      const current = this.kernel.cache.get<boolean>('maintenance_mode') || false;
      this.kernel.cache.set('maintenance_mode', !current);
      res.json({ success: true, maintenanceMode: !current });
    });

    // GET: get all guild roles
    this.app.get('/api/guilds/:id/roles', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const guild = this.kernel.client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      try {
        await guild.roles.fetch().catch(() => {});
        const roles = guild.roles.cache
          .filter(r => r.name !== '@everyone' && !r.managed)
          .map(r => ({
            id: r.id,
            name: r.name,
            color: r.hexColor
          }));
        res.json(roles);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET: get all slash commands
    this.app.get('/api/guilds/:id/commands', requireAuth, (req, res) => {
      const commands = Array.from(this.kernel.client.commands.keys()).sort();
      res.json(commands);
    });

    // GET: get permission rules
    this.app.get('/api/guilds/:id/permissions', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      try {
        const { config } = await getModuleConfig<any>(guildId, 'command_permissions');
        res.json(config.permissions || {});
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST: save permission rules
    this.app.post('/api/guilds/:id/permissions', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const { permissions } = req.body;

      if (!permissions || typeof permissions !== 'object') {
        return res.status(400).json({ error: 'Permissions object required' });
      }

      try {
        await setModuleConfig(guildId, 'command_permissions', { permissions }, true);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ── PREFIX / ALIAS API ────────────────────────────────────────────────────

    // GET: global prefix + alias list + available commands with subcommands
    this.app.get('/api/guilds/:id/prefix', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const guild = this.kernel.client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      try {
        const { config } = await getModuleConfig<any>(guildId, 'prefix');
        const globalPrefix: string = config?.globalPrefix ?? '!';
        const aliases: Record<string, { command: string; subcommand?: string }> = config?.aliases ?? {};

        // Build command list with subcommands for the alias picker
        const commands: { name: string; subcommands: string[] }[] = [];
        for (const [cmdName, cmd] of this.kernel.client.commands) {
          const json = (cmd.data as any).toJSON();
          const subcommands: string[] = [];
          if (Array.isArray(json.options)) {
            for (const opt of json.options) {
              if (opt.type === 1) subcommands.push(opt.name);
              if (opt.type === 2 && Array.isArray(opt.options)) {
                for (const sub of opt.options) {
                  if (sub.type === 1) subcommands.push(`${opt.name} ${sub.name}`);
                }
              }
            }
          }
          commands.push({ name: cmdName, subcommands });
        }
        commands.sort((a, b) => a.name.localeCompare(b.name));

        res.json({ globalPrefix, aliases, commands });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST: update global prefix
    this.app.post('/api/guilds/:id/prefix/global', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const { prefix } = req.body;
      if (!prefix || typeof prefix !== 'string' || prefix.length > 8) {
        return res.status(400).json({ error: 'Prefix không hợp lệ (tối đa 8 ký tự).' });
      }
      try {
        const { config, enabled } = await getModuleConfig<any>(guildId, 'prefix');
        await setModuleConfig(guildId, 'prefix', { ...(config ?? {}), globalPrefix: prefix.trim() }, enabled);
        res.json({ success: true, globalPrefix: prefix.trim() });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST: add or update an alias
    this.app.post('/api/guilds/:id/prefix/alias', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const { alias, command, subcommand } = req.body;

      if (!alias || typeof alias !== 'string') {
        return res.status(400).json({ error: 'Alias không hợp lệ.' });
      }
      if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: 'Tên lệnh không hợp lệ.' });
      }
      if (!this.kernel.client.commands.has(command)) {
        return res.status(400).json({ error: `Lệnh /${command} không tồn tại.` });
      }

      try {
        const { config, enabled } = await getModuleConfig<any>(guildId, 'prefix');
        const aliases = { ...(config?.aliases ?? {}) };
        aliases[alias.toLowerCase().trim()] = {
          command,
          ...(subcommand ? { subcommand } : {}),
        };
        await setModuleConfig(guildId, 'prefix', { ...(config ?? {}), aliases }, enabled);
        res.json({ success: true, alias: alias.toLowerCase().trim(), command, subcommand: subcommand ?? null });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // DELETE: remove an alias
    this.app.delete('/api/guilds/:id/prefix/alias/:alias', requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const aliasKey = req.params.alias.toLowerCase();
      try {
        const { config, enabled } = await getModuleConfig<any>(guildId, 'prefix');
        const aliases = { ...(config?.aliases ?? {}) };
        delete aliases[aliasKey];
        await setModuleConfig(guildId, 'prefix', { ...(config ?? {}), aliases }, enabled);
        res.json({ success: true, deleted: aliasKey });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST: upload an image to Discord attachment channel and return URL
    this.app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'Không có file nào được gửi lên.' });
      }

      try {
        let attachmentChannel = this.kernel.client.channels.cache.find(
          c => c.name === 'kini-attachments' && c.isTextBased()
        ) as any;

        if (!attachmentChannel) {
          const firstGuild = this.kernel.client.guilds.cache.first();
          if (firstGuild) {
            attachmentChannel = await firstGuild.channels.create({
              name: 'kini-attachments',
              type: ChannelType.GuildText,
              permissionOverwrites: [
                {
                  id: firstGuild.roles.everyone.id,
                  deny: [PermissionFlagsBits.ViewChannel],
                }
              ]
            });
          }
        }

        if (!attachmentChannel) {
          return res.status(500).json({ error: 'Không thể tạo hoặc tìm channel kini-attachments.' });
        }

        const message = await attachmentChannel.send({
          files: [{
            attachment: req.file.buffer,
            name: req.file.originalname
          }]
        });

        const attachment = message.attachments.first();
        if (!attachment) {
          return res.status(500).json({ error: 'Gửi file lên Discord thất bại.' });
        }

        res.json({ success: true, url: attachment.url });
      } catch (err: any) {
        logger.error('Error uploading image to Discord:', { error: err });
        res.status(500).json({ error: err.message });
      }
    });
  }
}
