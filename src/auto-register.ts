import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { botConfig } from './config';
import { Logger } from './logger';

export class AutoRegisterCommands {
  private commands: any[] = [];
  private rest: REST;

  constructor() {
    this.rest = new REST({ version: '10' }).setToken(botConfig.token);
  }

  async registerCommands(): Promise<void> {
    await this.loadCommands();
    
    if (this.commands.length === 0) {
      Logger.warn('No commands found to register');
      return;
    }

    try {
      Logger.info(`Registering ${this.commands.length} commands...`);
      
      let data: any;
      const startTime = Date.now();
      
      if (botConfig.guildId) {
        Logger.info(`Registering commands for guild: ${botConfig.guildId}`);
        data = await this.rest.put(
          Routes.applicationGuildCommands(botConfig.clientId, botConfig.guildId),
          { body: this.commands }
        );
      } else {
        Logger.info('Registering global commands');
        data = await this.rest.put(
          Routes.applicationCommands(botConfig.clientId),
          { body: this.commands }
        );
      }

      const duration = Date.now() - startTime;
      Logger.info(`Successfully registered ${(data as any[]).length} commands in ${duration}ms`);
    } catch (error) {
      Logger.error('Failed to register commands:', error);
      
      // Provide helpful error messages
      if ((error as any).code === 50001) {
        Logger.error('Bot missing permissions. Ensure the bot has "Use Slash Commands" permission and is properly invited to the server.');
      } else if ((error as any).code === 401) {
        Logger.error('Invalid bot token. Please check your DISCORD_TOKEN in .env file.');
      } else {
        Logger.error('Unknown registration error:', (error as any).message);
      }
      
      // Don't throw - allow bot to start even if registration fails
      Logger.warn('Bot will continue to start, but commands may not be available');
    }
  }

  private async loadCommands(): Promise<void> {
    const commandsPath = join(__dirname, 'commands');
    
    try {
      const commandFiles = readdirSync(commandsPath).filter(
        (file) => file.endsWith('.js') && !file.endsWith('.d.ts')
      );

      this.commands = [];
      
      for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(filePath);
        
        const commandModule = command.default || command;
        if ('data' in commandModule && 'execute' in commandModule) {
          this.commands.push(commandModule.data.toJSON());
          Logger.debug(`Loaded command for registration: ${commandModule.data.name}`);
        }
      }
    } catch (error) {
      Logger.error('Error loading commands for auto-registration:', error);
    }
  }
}