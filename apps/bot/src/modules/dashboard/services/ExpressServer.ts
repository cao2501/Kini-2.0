import express from 'express';
import session from 'express-session';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import Transport from 'winston-transport';
import multer from 'multer';
import { ChannelType, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { logger } from '../../../core/logger/Logger';
import { Kernel } from '../../../core/Kernel';
import { ensureGuild, getModuleConfig, setModuleConfig } from '../../../database/helpers';
import { UIBuilders } from '../../../core/ui/UIBuilders';
import { SpecialLogger } from '../../../core/logger/SpecialLogger';

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
				message: info.message,
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
		this.app.use(
			helmet({
				contentSecurityPolicy: false, // Turn off CSP for dev static files ease
			}),
		);
		this.app.use(cors());
		this.app.use(express.json());
		this.app.use(express.urlencoded({ extended: true }));

		// Session setup
		this.app.use(
			session({
				secret: process.env.SESSION_SECRET || 'kini-super-secret-session-key',
				resave: false,
				saveUninitialized: false,
				cookie: { maxAge: 86400000 }, // 24 hours
			}),
		);

		// Serve static files
		const publicPath = path.join(__dirname, '../public');
		this.app.use(express.static(publicPath));

		// HTTP & Socket Server
		this.httpServer = http.createServer(this.app);
		this.io = new SocketServer(this.httpServer, {
			cors: { origin: '*' },
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

		this.httpServer.on('error', (err: any) => {
			logger.error('Dashboard ExpressServer error:', { error: err });
			process.exit(1);
		});

		this.httpServer.listen(this.port, () => {
			logger.info(`Dashboard server running on port ${this.port} (URL: http://localhost:${this.port})`, {
				module: 'dashboard',
			});
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

		this.app.get('/auth/login', (req, res) => {
			if (!CLIENT_ID || !CLIENT_SECRET) {
				return res.status(500).send('OAuth2 credentials are not configured in the bot .env file. Please specify CLIENT_ID and CLIENT_SECRET.');
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
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				});

				if (!tokenResponse.ok) {
					throw new Error(`Failed to exchange token: ${tokenResponse.statusText}`);
				}

				const tokens = (await tokenResponse.json()) as any;

				// Fetch user data
				const userRes = await fetch('https://discord.com/api/users/@me', {
					headers: { Authorization: `Bearer ${tokens.access_token}` },
				});
				const user = (await userRes.json()) as any;

				// Fetch user guilds
				const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
					headers: { Authorization: `Bearer ${tokens.access_token}` },
				});
				const guilds = (await guildsRes.json()) as any;

				(req.session as any).user = {
					id: user.id,
					username: `${user.username}#${user.discriminator || '0'}`,
					avatar: user.avatar
						? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
						: 'https://cdn.discordapp.com/embed/avatars/0.png',
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

		// Middleware to check guild management permissions
		const checkGuildAccess = (req: express.Request, res: express.Response, next: express.NextFunction) => {
			const guildId = req.params.id;
			const userGuilds = (req.session as any).guilds || [];
			const matchingGuild = userGuilds.find((g: any) => g.id === guildId);

			if (!matchingGuild) {
				return res.status(403).json({ error: 'Forbidden: Bạn không có quyền truy cập máy chủ này.' });
			}

			// Verify permissions in matching guild
			const perms = BigInt(matchingGuild.permissions);
			const isAdmin = (perms & 8n) === 8n;
			const isManager = (perms & 0x20n) === 0x20n;
			const isOwner = matchingGuild.owner;

			if (!isOwner && !isAdmin && !isManager) {
				return res.status(403).json({ error: 'Forbidden: Cần quyền Quản lý máy chủ.' });
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
					heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
				},
				guildsCount: this.kernel.client.guilds.cache.size,
				modulesCount: this.kernel.client.modules.size,
				commandsCount: this.kernel.client.commands.size,
				ping: this.kernel.client.ws.ping,
				maintenanceMode: this.kernel.cache.get<boolean>('maintenance_mode') || false,
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
						inviteUrl: `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID || this.kernel.client.user?.id}&permissions=8&scope=bot%20applications.commands&guild_id=${g.id}`,
					};
				});

			res.json(formatted);
		});

		// Get modules status and configs for a specific guild
		this.app.get('/api/guilds/:id/modules', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const guild = this.kernel.client.guilds.cache.get(guildId);
			if (!guild) return res.status(404).json({ error: 'Guild not found' });

			await ensureGuild(guildId, guild.name, guild.ownerId);

			const modules = Array.from(this.kernel.client.modules.values()).map((m) => ({
				name: m.manifest.name,
				displayName: m.manifest.displayName,
				description: m.manifest.description,
				version: m.manifest.version,
				premium: m.manifest.premium,
			}));

			const responseData = [];
			for (const mod of modules) {
				const { enabled, config } = await getModuleConfig<any>(guildId, mod.name);
				responseData.push({
					...mod,
					enabled,
					config,
				});
			}

			res.json(responseData);
		});

		// Toggle module status
		this.app.post('/api/guilds/:id/modules/:name/toggle', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const moduleName = req.params.name as string;
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
		this.app.post('/api/guilds/:id/modules/:name/config', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const moduleName = req.params.name as string;
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

			const moduleName = req.params.name as string;
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
		this.app.get('/api/guilds/:id/roles', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const guild = this.kernel.client.guilds.cache.get(guildId);
			if (!guild) return res.status(404).json({ error: 'Guild not found' });

			try {
				await guild.roles.fetch().catch(() => {});
				const roles = guild.roles.cache
					.filter((r) => r.name !== '@everyone' && !r.managed)
					.map((r) => ({
						id: r.id,
						name: r.name,
						color: r.hexColor,
					}));
				res.json(roles);
			} catch (err: any) {
				res.status(500).json({ error: err.message });
			}
		});

		// GET: get all slash commands mapped by their module ownership
		this.app.get('/api/guilds/:id/commands', requireAuth, checkGuildAccess, (req, res) => {
			const map: Record<string, string[]> = {};
			
			for (const [cmdName, cmd] of this.kernel.client.commands) {
				const moduleName = this.kernel.client.commandModuleMap.get(cmdName) ?? 'system';
				if (!map[moduleName]) {
					map[moduleName] = [];
				}
				
				map[moduleName].push(cmdName);
				
				try {
					const json = (cmd.data as any).toJSON();
					if (Array.isArray(json.options)) {
						for (const opt of json.options) {
							if (opt.type === 1) {
								map[moduleName].push(`${cmdName} ${opt.name}`);
							}
							if (opt.type === 2 && Array.isArray(opt.options)) {
								for (const sub of opt.options) {
									if (sub.type === 1) {
										map[moduleName].push(`${cmdName} ${opt.name} ${sub.name}`);
									}
								}
							}
						}
					}
				} catch {}
			}
			
			// Sort the lists
			for (const mName of Object.keys(map)) {
				map[mName].sort();
			}
			
			res.json(map);
		});

		// GET: get permission rules
		this.app.get('/api/guilds/:id/permissions', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			try {
				const { config } = await getModuleConfig<any>(guildId, 'command_permissions');
				res.json(config.permissions || {});
			} catch (err: any) {
				res.status(500).json({ error: err.message });
			}
		});

		// POST: save permission rules
		this.app.post('/api/guilds/:id/permissions', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
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

		// POST: SePay automated banking webhook endpoint
		this.app.post('/api/sepay/webhook', async (req, res) => {
			// 1. Authentication Check (optional API Key verification)
			const authHeader = req.headers.authorization;
			const apiKey = process.env.SEPAY_API_KEY;
			if (apiKey && authHeader !== `Apikey ${apiKey}`) {
				logger.warn('[SePay Webhook] Unauthorized attempt with invalid API Key');
				return res.status(401).json({ error: 'Unauthorized' });
			}

			const { id, transferType, transferAmount, content, gateway, transactionDate, referenceCode } = req.body;

			// SePay requires a JSON body {"success": true} response to acknowledge receipt
			if (transferType !== 'in') {
				return res.json({ success: true });
			}

			// Safe parse variables
			const txId = String(id);
			const amount = Number(transferAmount);

			try {
				// 2. Anti-replay/double spending check
				const existingTx = await this.kernel.db.vndTransaction.findUnique({
					where: { id: txId },
				});

				if (existingTx) {
					logger.info(`[SePay Webhook] Transaction ID ${txId} already processed, skipping.`);
					return res.json({ success: true });
				}

				// 3. Match transfer content/memo for deposit code (e.g. KN1024 or KN 1024)
				const cleanContent = String(content).toUpperCase().replace(/\s/g, '');
				const match = cleanContent.match(/KN\d{4}/);

				if (!match) {
					logger.warn(`[SePay Webhook] No valid deposit code found in content: "${content}"`);
					return res.json({ success: true }); // Still return success: true to avoid retries
				}

				const depositCode = match[0]; // e.g. "KN1024"

				// Find deposit request in database
				const depositRequest = await this.kernel.db.vndDepositRequest.findUnique({
					where: { code: depositCode },
				});

				if (!depositRequest) {
					logger.warn(`[SePay Webhook] Deposit request not found or expired for code: "${depositCode}"`);
					return res.json({ success: true });
				}

				const { guildId, userId } = depositRequest;

				// 4. Update user's VND balance atomically inside a transaction
				const transactionDateParsed = transactionDate ? new Date(transactionDate) : new Date();

				await this.kernel.db.$transaction([
					// Increment member balance
					this.kernel.db.guildMember.update({
						where: { guildId_userId: { guildId, userId } },
						data: { vnd: { increment: amount } },
					}),
					// Save transaction log
					this.kernel.db.vndTransaction.create({
						data: {
							id: txId,
							guildId,
							userId,
							amount,
							code: depositCode,
							referenceCode: referenceCode ? String(referenceCode) : null,
							content: String(content),
							gateway: String(gateway),
							transactionDate: transactionDateParsed,
						},
					}),
					// Delete processed deposit request
					this.kernel.db.vndDepositRequest.delete({
						where: { code: depositCode },
					}),
				]);

				logger.info(
					`[SePay Webhook] Successfully processed deposit of ${amount.toLocaleString('vi-VN')} VND for User ${userId} in Guild ${guildId}`,
				);

				// Log to SpecialLogger
				let targetUsername = userId;
				try {
					const user = await this.kernel.client.users.fetch(userId);
					if (user) targetUsername = user.username;
				} catch {}
				await SpecialLogger.logVnd(
					this.kernel,
					guildId,
					userId,
					targetUsername,
					'DEPOSIT',
					amount,
					txId,
					`Nạp tiền tự động qua VietQR (SePay). Mã nạp: ${depositCode}, Cổng thanh toán: ${gateway}, Nội dung chuyển: ${content}.`
				);

				// 5. Send confirmation Direct Message (DM) to the user
				try {
					const user = await this.kernel.client.users.fetch(userId);
					if (user) {
						const embed = UIBuilders.createSuccessEmbed(
							'Giao Dịch Nạp Tiền Thành Công',
							`💳 Hệ thống đã ghi nhận khoản nạp **${amount.toLocaleString('vi-VN')} ₫** thành công qua cổng **SePay (${gateway})**.\n\nMã giao dịch: \`${txId}\`\nNội dung chuyển: \`${content}\`\nSố dư đã được cập nhật!`,
						);
						const buffer = await UIBuilders.convertToCanvasCard(
							embed,
							user.displayAvatarURL({ extension: 'png' }),
							user.username,
							'KINI BANKING',
						);
						const file = new AttachmentBuilder(buffer, { name: 'deposit-success.png' });
						await user.send({ content: `🔔 **Thông báo nạp tiền thành công!**`, files: [file] }).catch(() => {});
					}
				} catch (dmErr) {
					logger.error(`[SePay Webhook] Failed to send DM notification to User ${userId}:`, dmErr);
				}

				// 6. Send public notification to the channel where the request was generated
				const channelId = depositRequest.channelId;
				if (channelId) {
					try {
						const channel = await this.kernel.client.channels.fetch(channelId).catch(() => null);
						if (channel && channel.isTextBased()) {
							const user = await this.kernel.client.users.fetch(userId).catch(() => null);
							const username = user ? user.username : 'Thành viên';
							const avatar = user ? user.displayAvatarURL({ extension: 'png' }) : '';

							const publicEmbed = UIBuilders.createSuccessEmbed(
								'Giao Dịch Nạp Tiền Thành Công',
								`🎉 Chúc mừng **@${username}** đã nạp **${amount.toLocaleString('vi-VN')} ₫** thành công qua cổng **${gateway}**!\n\nMã giao dịch: \`${txId}\`\nSố dư VND của bạn đã được cập nhật.`,
							);
							const buffer = await UIBuilders.convertToCanvasCard(publicEmbed, avatar, username, 'KINI BANKING');
							const file = new AttachmentBuilder(buffer, { name: 'deposit-success.png' });
							await (channel as any)
								.send({ content: `🎉 **Nạp tiền thành công!** **<@${userId}>**`, files: [file] })
								.catch(() => {});
						}
					} catch (chErr) {
						logger.error(`[SePay Webhook] Failed to send public channel notification to Channel ${channelId}:`, chErr);
					}
				}

				res.json({ success: true });
			} catch (err: any) {
				logger.error('[SePay Webhook] Failed to process webhook transaction:', err);
				res.status(500).json({ error: err.message });
			}
		});

		// ── PREFIX / ALIAS API ────────────────────────────────────────────────────

		// GET: global prefix + alias list + available commands with subcommands
		this.app.get('/api/guilds/:id/prefix', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
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
		this.app.post('/api/guilds/:id/prefix/global', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
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
		this.app.post('/api/guilds/:id/prefix/alias', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
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
		this.app.delete('/api/guilds/:id/prefix/alias/:alias', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const aliasKey = (req.params.alias as string).toLowerCase();
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

		// GET: get all staff for a specific guild
		this.app.get('/api/guilds/:id/staff', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			try {
				const staffs = await this.kernel.db.staff.findMany({
					where: { guildId },
					orderBy: { subKey: 'asc' }
				});
				res.json(staffs);
			} catch (err: any) {
				res.status(500).json({ error: err.message });
			}
		});

		// POST: add or update a staff profile
		this.app.post('/api/guilds/:id/staff', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const { subKey, name, type, title, userId, priceDay, priceNight, avatarUrl, borderColor, description, fields, images } = req.body;

			if (!subKey || !name || !type) {
				return res.status(400).json({ error: 'Mã phụ, Tên và Phân loại nhân viên là bắt buộc.' });
			}

			try {
				const existing = await this.kernel.db.staff.findUnique({
					where: { guildId_subKey: { guildId, subKey: subKey.toLowerCase().trim() } }
				});

				const data = {
					name,
					type,
					title: title || null,
					userId: userId || null,
					priceDay: priceDay ? parseFloat(priceDay) : 0,
					priceNight: priceNight ? parseFloat(priceNight) : 0,
					avatarUrl: avatarUrl || null,
					borderColor: borderColor || '#ffc0cb',
					description: description || null,
					fields: typeof fields === 'string' ? fields : JSON.stringify(fields || []),
					images: typeof images === 'string' ? images : JSON.stringify(images || [])
				};

				let staff;
				if (existing) {
					staff = await this.kernel.db.staff.update({
						where: { id: existing.id },
						data
					});
				} else {
					staff = await this.kernel.db.staff.create({
						data: {
							guildId,
							subKey: subKey.toLowerCase().trim(),
							...data
						}
					});
				}

				res.json({ success: true, staff });
			} catch (err: any) {
				res.status(500).json({ error: err.message });
			}
		});

		// DELETE: remove a staff profile
		this.app.delete('/api/guilds/:id/staff/:subKey', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const subKey = (req.params.subKey as string).toLowerCase().trim();

			try {
				const staff = await this.kernel.db.staff.findUnique({
					where: { guildId_subKey: { guildId, subKey } }
				});

				if (!staff) {
					return res.status(404).json({ error: 'Không tìm thấy nhân viên cần xóa.' });
				}

				await this.kernel.db.staff.delete({
					where: { id: staff.id }
				});

				res.json({ success: true, deleted: subKey });
			} catch (err: any) {
				res.status(500).json({ error: err.message });
			}
		});

		// GET: get booking configuration
		this.app.get('/api/guilds/:id/booking/config', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			try {
				const { config } = await getModuleConfig<any>(guildId, 'staff');
				res.json({
					serverCommission: config?.serverCommission ?? 10,
					extraPersonFee: config?.extraPersonFee ?? 50000,
					minPeopleForExtraFee: config?.minPeopleForExtraFee ?? 2,
					priceDay: config?.priceDay ?? 100000,
					priceNight: config?.priceNight ?? 120000
				});
			} catch (err: any) {
				res.status(500).json({ error: err.message });
			}
		});

		// POST: save booking configuration
		this.app.post('/api/guilds/:id/booking/config', requireAuth, checkGuildAccess, async (req, res) => {
			const guildId = req.params.id as string;
			const { serverCommission, extraPersonFee, minPeopleForExtraFee, priceDay, priceNight } = req.body;

			try {
				const { config, enabled } = await getModuleConfig<any>(guildId, 'staff');
				const newConfig = {
					...(config || {}),
					serverCommission: serverCommission !== undefined ? parseFloat(serverCommission) : 10,
					extraPersonFee: extraPersonFee !== undefined ? parseFloat(extraPersonFee) : 50000,
					minPeopleForExtraFee: minPeopleForExtraFee !== undefined ? parseInt(minPeopleForExtraFee, 10) : 2,
					priceDay: priceDay !== undefined ? parseFloat(priceDay) : 100000,
					priceNight: priceNight !== undefined ? parseFloat(priceNight) : 120000
				};
				await setModuleConfig(guildId, 'staff', newConfig, enabled);
				res.json({ success: true, config: newConfig });
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
					(c) => 'name' in c && c.name === 'kini-attachments' && c.isTextBased(),
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
								},
							],
						});
					}
				}

				if (!attachmentChannel) {
					return res.status(500).json({ error: 'Không thể tạo hoặc tìm channel kini-attachments.' });
				}

				const message = await attachmentChannel.send({
					files: [
						{
							attachment: req.file.buffer,
							name: req.file.originalname,
						},
					],
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
