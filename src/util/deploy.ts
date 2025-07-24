import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import process from 'node:process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const commands = [
	new SlashCommandBuilder()
		.setName('monitor')
		.setDescription('Start monitoring ALL users in your voice channel for loud volume'),
	
	new SlashCommandBuilder()
		.setName('stop')
		.setDescription('Stop monitoring and leave the voice channel'),
	
	new SlashCommandBuilder()
		.setName('threshold')
		.setDescription('Set the volume threshold for auto-muting (0.0 to 1.0)')
		.addNumberOption(option =>
			option
				.setName('value')
				.setDescription('Volume threshold (0.0 = very quiet, 1.0 = very loud)')
				.setRequired(true)
				.setMinValue(0.0)
				.setMaxValue(1.0)
		),
	
	new SlashCommandBuilder()
		.setName('unmute')
		.setDescription('Manually unmute users who were auto-muted')
		.addUserOption(option =>
			option
				.setName('user')
				.setDescription('The user to unmute (leave empty to unmute all)')
				.setRequired(false)
		),
	
	new SlashCommandBuilder()
		.setName('status')
		.setDescription('Show the bot\'s current monitoring status'),
].map(command => command.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);


try {
	console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

	const data = await rest.put(
		Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
		{ body: commands },
	) as any[];

	console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
	console.error('❌ Error deploying commands:', error);
}