import process from 'node:process';
import { Client, Events, GatewayIntentBits, type Snowflake } from 'discord.js';
import { interactionHandlers, handleLiveCommand } from './util/interactions.js';
import { ensureRecordingsDirectory } from './util/fileUtils.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Ensure recordings directory exists
ensureRecordingsDirectory();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
	],
});

client.once(Events.ClientReady, (readyClient) => {
	console.log(`🤖 Ready! Logged in as ${readyClient.user.tag}`);
});


client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.inCachedGuild() || !interaction.isChatInputCommand()) return;

	const handleInteraction = interactionHandlers.get(interaction.commandName) ?? (interaction.commandName === 'live' ? handleLiveCommand : undefined);

	try {
		if (!handleInteraction) {
			await interaction.reply({ content: 'Unknown command', ephemeral: true });
			return;
		}

		await handleInteraction(interaction);
	} catch (error) {
		console.error('Error handling interaction:', error);
		
		const errorMessage = 'There was an error while executing this command!';
		
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: errorMessage, ephemeral: true });
		} else {
			await interaction.reply({ content: errorMessage, ephemeral: true });
		}
	}
});

client.on(Events.Error, (error) => {
	console.error('Discord client error:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
	// Don't crash on stream errors - they're expected with Discord voice
	if (error.message.includes('stream.push() after EOF') || 
		error.message.includes('ERR_STREAM_PUSH_AFTER_EOF')) {
		console.warn('⚠️  Stream EOF error (expected, ignoring):', error.message);
		return;
	}
	
	console.error('Uncaught Exception:', error);
	// Don't exit on stream errors
});

// Graceful shutdown
process.on('SIGINT', () => {
	console.log('🛑 Received SIGINT, shutting down gracefully...');
	client.destroy();
	process.exit(0);
});

process.on('SIGTERM', () => {
	console.log('🛑 Received SIGTERM, shutting down gracefully...');
	client.destroy();
	process.exit(0);
});

// Login to Discord
const token = process.env.DISCORD_TOKEN;
if (!token) {
	console.error('❌ DISCORD_TOKEN is not set in environment variables');
	process.exit(1);
}

await client.login(token);