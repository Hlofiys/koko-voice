import { config } from 'dotenv';
import { BotConfig } from './types';

config();

const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'GEMINI_API_KEY'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const botConfig: BotConfig = {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.CLIENT_ID!,
  guildId: process.env.GUILD_ID,
  geminiApiKey: process.env.GEMINI_API_KEY!,
  logLevel: process.env.LOG_LEVEL || 'info',
};