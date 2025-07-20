import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: any) => Promise<void>;
}

export interface BotConfig {
  token: string;
  clientId: string;
  guildId?: string | undefined;
  geminiApiKey: string;
  logLevel: string;
}