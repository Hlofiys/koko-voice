import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import type { ChatInputCommandInteraction, Snowflake } from 'discord.js';
import { createListeningStream } from './createListeningStream.js';

async function join(
	interaction: ChatInputCommandInteraction<'cached'>,
	recordable: Set<Snowflake>,
	activeRecordings: Map<Snowflake, boolean>
) {
	await interaction.deferReply();

	let connection = getVoiceConnection(interaction.guildId);

	if (!connection) {
		if (!interaction.member?.voice.channel) {
			await interaction.followUp('❌ Join a voice channel and then try that again!');
			return;
		}

		connection = joinVoiceChannel({
			adapterCreator: interaction.guild.voiceAdapterCreator as any,
			channelId: interaction.member.voice.channel.id,
			guildId: interaction.guild.id,
			selfDeaf: false,
			selfMute: true,
		});
	}

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
		
		const receiver = connection.receiver;

		receiver.speaking.on('start', async (userId) => {
			if (recordable.has(userId) && !activeRecordings.get(userId)) {
				try {
					const user = await interaction.client.users.fetch(userId);
					activeRecordings.set(userId, true);
					await createListeningStream(receiver, user, activeRecordings);
				} catch (error) {
					console.error(`Error starting recording for user ${userId}:`, error);
					activeRecordings.set(userId, false);
				}
			}
		});

		await interaction.followUp(`✅ Ready! Joined **${interaction.member?.voice.channel?.name}** and listening for speech.`);
	} catch (error) {
		console.warn('Failed to join voice channel:', error);
		await interaction.followUp('❌ Failed to join voice channel within 20 seconds, please try again later!');
	}
}

async function record(
	interaction: ChatInputCommandInteraction<'cached'>,
	recordable: Set<Snowflake>,
	activeRecordings: Map<Snowflake, boolean>
) {
	const connection = getVoiceConnection(interaction.guildId);
	
	if (!connection) {
		await interaction.reply({
			content: '❌ I need to be in a voice channel first! Use `/join` to make me join your voice channel.',
			ephemeral: true,
		});
		return;
	}

	const user = interaction.options.getUser('speaker', true);
	
	if (recordable.has(user.id)) {
		await interaction.reply({
			content: `🎤 Already recording **${user.displayName}**!`,
			ephemeral: true,
		});
		return;
	}

	recordable.add(user.id);

	// If the user is currently speaking, start recording immediately
	if (connection.receiver.speaking.users.has(user.id) && !activeRecordings.get(user.id)) {
		try {
			activeRecordings.set(user.id, true);
			await createListeningStream(connection.receiver, user, activeRecordings);
		} catch (error) {
			console.error(`Error starting immediate recording for user ${user.id}:`, error);
			activeRecordings.set(user.id, false);
		}
	}

	await interaction.reply({
		content: `🎤 Now listening for **${user.displayName}**'s voice! I'll automatically record when they speak.`,
		ephemeral: true,
	});
}

async function stop(
	interaction: ChatInputCommandInteraction<'cached'>,
	recordable: Set<Snowflake>,
	activeRecordings: Map<Snowflake, boolean>
) {
	const user = interaction.options.getUser('speaker');
	
	if (user) {
		if (!recordable.has(user.id)) {
			await interaction.reply({
				content: `❌ I'm not recording **${user.displayName}**.`,
				ephemeral: true,
			});
			return;
		}
		
		recordable.delete(user.id);
		activeRecordings.delete(user.id);
		
		await interaction.reply({
			content: `🛑 Stopped recording **${user.displayName}**.`,
			ephemeral: true,
		});
	} else {
		// Stop recording all users
		const recordedCount = recordable.size;
		recordable.clear();
		activeRecordings.clear();
		
		await interaction.reply({
			content: `🛑 Stopped recording all users (${recordedCount} users were being recorded).`,
			ephemeral: true,
		});
	}
}

async function leave(
	interaction: ChatInputCommandInteraction<'cached'>,
	recordable: Set<Snowflake>,
	activeRecordings: Map<Snowflake, boolean>
) {
	const connection = getVoiceConnection(interaction.guildId);
	
	if (!connection) {
		await interaction.reply({
			content: '❌ I\'m not in a voice channel in this server!',
			ephemeral: true,
		});
		return;
	}

	const recordedCount = recordable.size;
	connection.destroy();
	recordable.clear();
	activeRecordings.clear();

	await interaction.reply({
		content: `👋 Left the voice channel! ${recordedCount > 0 ? `Stopped recording ${recordedCount} user(s).` : ''}`,
		ephemeral: true,
	});
}

async function status(
	interaction: ChatInputCommandInteraction<'cached'>,
	recordable: Set<Snowflake>,
	activeRecordings: Map<Snowflake, boolean>
) {
	const connection = getVoiceConnection(interaction.guildId);
	
	if (!connection) {
		await interaction.reply({
			content: '❌ I\'m not in a voice channel in this server.',
			ephemeral: true,
		});
		return;
	}

	const channelId = connection.joinConfig.channelId;
	const channel = interaction.guild.channels.cache.get(channelId!);
	
	let statusMessage = `🤖 **Bot Status**\n`;
	statusMessage += `📍 Connected to: **${channel?.name || 'Unknown Channel'}**\n`;
	statusMessage += `🎤 Recording ${recordable.size} user(s)\n`;
	
	if (recordable.size > 0) {
		statusMessage += `\n**Currently recording:**\n`;
		for (const userId of recordable) {
			try {
				const user = await interaction.client.users.fetch(userId);
				const isActivelyRecording = activeRecordings.get(userId) ? '🔴' : '⚪';
				statusMessage += `${isActivelyRecording} ${user.displayName}\n`;
			} catch (error) {
				statusMessage += `❓ Unknown User (${userId})\n`;
			}
		}
	}

	await interaction.reply({
		content: statusMessage,
		ephemeral: true,
	});
}

export const interactionHandlers = new Map([
	['join', join],
	['leave', leave],
	['record', record],
	['stop', stop],
	['status', status],
]);