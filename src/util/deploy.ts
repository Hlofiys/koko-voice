import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import process from 'node:process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const commands = [
	new SlashCommandBuilder()
		.setName('join')
		.setDescription('Make the bot join your voice channel and start listening'),
	
	new SlashCommandBuilder()
		.setName('leave')
		.setDescription('Make the bot leave the voice channel and stop all recordings'),
	
	new SlashCommandBuilder()
		.setName('record')
		.setDescription('Start recording a specific user\'s voice')
		.addUserOption(option =>
			option
				.setName('speaker')
				.setDescription('The user to record')
				.setRequired(true)
		),
	
	new SlashCommandBuilder()
		.setName('stop')
		.setDescription('Stop recording a user or all users')
		.addUserOption(option =>
			option
				.setName('speaker')
				.setDescription('The user to stop recording (leave empty to stop all)')
				.setRequired(false)
		),
	
	new SlashCommandBuilder()
		.setName('status')
		.setDescription('Show the bot\'s current status and who is being recorded'),
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