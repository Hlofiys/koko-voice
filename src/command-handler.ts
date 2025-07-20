import { Client, Collection, Events } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Command } from './types';
import { Logger } from './logger';

export class CommandHandler {
  private commands: Collection<string, Command> = new Collection();

  async loadCommands(): Promise<void> {
    const commandsPath = join(__dirname, 'commands');
    
    try {
      const commandFiles = readdirSync(commandsPath).filter(
        (file) => file.endsWith('.js') && !file.endsWith('.d.ts')
      );

      for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(filePath);
        
        const commandModule = command.default || command;
        if ('data' in commandModule && 'execute' in commandModule) {
          this.commands.set(commandModule.data.name, commandModule);
          Logger.info(`Loaded command: ${commandModule.data.name}`);
        } else {
          Logger.warn(`Command at ${filePath} is missing required properties`);
        }
      }
    } catch (error) {
      Logger.error('Error loading commands:', error);
    }
  }

  setupEventHandlers(client: Client): void {
    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);

      if (!command) {
        Logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        Logger.debug(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction);
      } catch (error) {
        Logger.error(`Error executing command ${interaction.commandName}:`, error);
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error while executing this command!',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true,
          });
        }
      }
    });
  }

  getCommands(): Collection<string, Command> {
    return this.commands;
  }
}