import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { botConfig } from './config';
import { Logger } from './logger';

const commands: any[] = [];

async function loadCommands() {
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
        commands.push(commandModule.data.toJSON());
        Logger.info(`Loaded command for registration: ${commandModule.data.name}`);
      } else {
        Logger.warn(`Command at ${filePath} is missing required properties`);
      }
    }
  } catch (error) {
    Logger.error('Error loading commands for registration:', error);
    process.exit(1);
  }
}

async function registerCommands() {
  await loadCommands();

  const rest = new REST({ version: '10' }).setToken(botConfig.token);

  try {
    Logger.info('Started refreshing application (/) commands.');
    
    let data: any;
    
    if (botConfig.guildId) {
      // Register commands for a specific guild (instant updates)
      Logger.info(`Registering commands for guild: ${botConfig.guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(botConfig.clientId, botConfig.guildId),
        { body: commands }
      );
    } else {
      // Register global commands (can take up to 1 hour to update)
      Logger.info('Registering global commands');
      data = await rest.put(
        Routes.applicationCommands(botConfig.clientId),
        { body: commands }
      );
    }

    Logger.info(`Successfully reloaded ${(data as any[]).length} application (/) commands.`);
  } catch (error) {
    Logger.error('Error registering commands:', error);
    process.exit(1);
  }
}

// Run the registration
registerCommands().catch((error) => {
  Logger.error('Unhandled error during command registration:', error);
  process.exit(1);
});