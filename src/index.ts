import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { botConfig } from './config';
import { Logger } from './logger';
import { CommandHandler } from './command-handler';
import { AutoRegisterCommands } from './auto-register';

class DiscordBot {
  private client: Client;
  private commandHandler: CommandHandler;
  private autoRegister: AutoRegisterCommands;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.commandHandler = new CommandHandler();
    this.autoRegister = new AutoRegisterCommands();
  }

  async start(): Promise<void> {
    try {
      // Auto-register commands on startup
      await this.autoRegister.registerCommands();
      
      // Load commands for execution
      await this.commandHandler.loadCommands();
      this.setupEventHandlers();
      
      Logger.info('Starting Discord bot...');
      await this.client.login(botConfig.token);
    } catch (error) {
      Logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, (readyClient) => {
      Logger.info(`Logged in as ${readyClient.user.tag}`);
      Logger.info(`Bot is ready! Serving ${readyClient.guilds.cache.size} guild(s)`);
    });

    this.client.on(Events.GuildCreate, (guild) => {
      Logger.info(`Joined new guild: ${guild.name} (${guild.id})`);
    });

    this.client.on(Events.GuildDelete, (guild) => {
      Logger.info(`Left guild: ${guild.name} (${guild.id})`);
    });

    this.client.on(Events.Error, (error) => {
      Logger.error('Discord client error:', error);
    });

    this.client.on(Events.Warn, (warning) => {
      Logger.warn('Discord client warning:', warning);
    });

    this.commandHandler.setupEventHandlers(this.client);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  Logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  Logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the bot
const bot = new DiscordBot();
bot.start().catch((error) => {
  Logger.error('Unhandled error during startup:', error);
  process.exit(1);
});