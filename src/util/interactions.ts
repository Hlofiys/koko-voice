import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus, createAudioPlayer, createAudioResource, NoSubscriberBehavior } from '@discordjs/voice';
import type { ChatInputCommandInteraction, Snowflake } from 'discord.js';
import { createVolumeMonitoringStream } from './createListeningStream.js';
import { structuredLog } from './modernFeatures.js';
import { Gemini } from './gemini.js';
import { Readable } from 'node:stream';
import { conversationHistoryManager } from './conversationHistory.js';
import { smartResponseManager } from './smartResponseManager.js';
import { voiceActivityDetector } from './voiceActivityDetector.js';

const mutedUsers = new Map<Snowflake, NodeJS.Timeout>();
const activeStreams = new Map<Snowflake, () => void>();

export async function handleLiveCommand(interaction: ChatInputCommandInteraction<'cached'>) {
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
            selfMute: false,
        });
    }

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        const receiver = connection.receiver;
        const gemini = new Gemini();
        const channelId = interaction.member.voice.channel!.id;

        await interaction.followUp(`🎙️ Now listening to everyone in **${interaction.member?.voice.channel?.name}**!`);

        receiver.speaking.on('start', async (userId) => {
            try {
                const user = await interaction.client.users.fetch(userId);
                if (user.bot) return;

                // Track voice activity start
                voiceActivityDetector.onVoiceStart(userId);
            } catch (error) {
                const err = error as Error;
                structuredLog('error', 'Error tracking voice start', {
                    error: err.message,
                    userId
                });
            }
        });

        receiver.speaking.on('end', async (userId) => {
            try {
                const user = await interaction.client.users.fetch(userId);
                if (user.bot) return;

                // Analyze voice activity and get priority
                const priority = voiceActivityDetector.onVoiceEnd(user);
                
                if (priority === 'skip') {
                    return; // Skip very short utterances
                }

                // For high priority (likely bot name), always consider transcription
                let shouldConsiderResponse = false;
                if (priority === 'high') {
                    structuredLog('info', 'High priority voice detected - forcing transcription', { 
                        user: user.username 
                    });
                    shouldConsiderResponse = true;
                } else {
                    // Normal priority - use smart response manager
                    shouldConsiderResponse = smartResponseManager.shouldConsiderResponse(user, channelId);
                }
                
                if (!shouldConsiderResponse) {
                    structuredLog('info', 'Skipping transcription - user/channel in cooldown', { 
                        user: user.username 
                    });
                    return;
                }

                // Only transcribe if we might respond
                let result;
                try {
                    result = await gemini.startConversation(receiver, user, channelId);
                } catch (recordingError: any) {
                    // Handle recording/conversion errors gracefully
                    if (recordingError.message.includes('empty') || 
                        recordingError.message.includes('too briefly') ||
                        recordingError.message.includes('Failed to record') ||
                        recordingError.message.includes('Failed to convert')) {
                        structuredLog('info', 'Skipping due to recording issue', { 
                            user: user.username, 
                            error: recordingError.message 
                        });
                        return;
                    }
                    // Re-throw other errors
                    throw recordingError;
                }
                
                if (!result.audioBuffer || result.audioBuffer.length === 0) {
                    return; // Skip playback if the audio buffer is empty
                }

                // Final check with transcription for bot name detection
                const shouldRespond = smartResponseManager.shouldRespond(user, channelId, result.transcription);
                
                if (!shouldRespond) {
                    structuredLog('info', 'Response skipped after transcription', { 
                        user: user.username, 
                        transcription: result.transcription 
                    });
                    return;
                }

                structuredLog('info', 'Bot responding to user', { 
                    user: user.username, 
                    transcription: result.transcription 
                });

                const player = createAudioPlayer({
                    behaviors: {
                        noSubscriber: NoSubscriberBehavior.Pause,
                    },
                });

                player.on('error', (error) => {
                    structuredLog('error', 'Audio player error', { error });
                });

                const subscription = connection.subscribe(player);

                player.on('stateChange', (oldState, newState) => {
                    if (newState.status === 'idle') {
                        player.stop();
                        if (subscription) {
                            subscription.unsubscribe();
                        }
                    }
                });

                const resource = createAudioResource(Readable.from(result.audioBuffer));
                player.play(resource);
            } catch (error) {
                const err = error as Error;
                structuredLog('error', 'Error in live conversation', {
                    error: err.message,
                    stack: err.stack
                });
            }
        });

        const onStateChange = (oldState: any, newState: any) => {
            if (newState.status === VoiceConnectionStatus.Destroyed) {
                gemini.clearChatSession(channelId);
                conversationHistoryManager.clearHistory(channelId);
                voiceActivityDetector.cleanup();
                structuredLog('info', 'Cleared conversation history for channel', { channelId });
                connection.removeListener('stateChange', onStateChange);
            }
        };
        
        connection.on('stateChange', onStateChange);

        // Periodic cleanup of voice activity detector
        const cleanupInterval = setInterval(() => {
            voiceActivityDetector.cleanup();
        }, 60000); // Every minute

        // Clear interval when connection is destroyed
        connection.on('stateChange', (oldState, newState) => {
            if (newState.status === VoiceConnectionStatus.Destroyed) {
                clearInterval(cleanupInterval);
            }
        });

    } catch (error) {
        const err = error as Error;
        structuredLog('error', 'Error in live command', {
            error: err.message,
            stack: err.stack
        });
        await interaction.followUp('An error occurred while processing your request.');
    }
}

async function join(interaction: ChatInputCommandInteraction<'cached'>) {
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
			selfMute: false,
		});
	}

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
		const receiver = connection.receiver;

		// Subscribe to all users speaking in the channel
		receiver.speaking.on('start', async (userId) => {
			if (activeStreams.has(userId)) {
				return; // Already monitoring this user
			}

			try {
				const user = await interaction.client.users.fetch(userId);
				const member = await interaction.guild.members.fetch(userId);
				const cleanup = createVolumeMonitoringStream(receiver, user, member, mutedUsers);
				activeStreams.set(userId, cleanup);
			} catch (error) {
				console.error(`Error starting volume monitoring for user ${userId}:`, error);
			}
		});

		receiver.speaking.on('end', (userId) => {
			if (activeStreams.has(userId)) {
				const cleanup = activeStreams.get(userId);
				if (cleanup) {
					cleanup();
				}
				activeStreams.delete(userId);
				structuredLog('info', 'Stopped volume monitoring', { userId });
			}
		});

		await interaction.followUp(`✅ Ready! Joined **${interaction.member?.voice.channel?.name}** and monitoring ALL users' volume levels automatically.`);
	} catch (error) {
		console.warn('Failed to join voice channel:', error);
		await interaction.followUp('❌ Failed to join voice channel within 20 seconds, please try again later!');
	}
}

async function leave(interaction: ChatInputCommandInteraction<'cached'>) {
	const connection = getVoiceConnection(interaction.guildId);
	
	// Clear all conversation histories when bot leaves
	conversationHistoryManager.clearAllHistories();
	structuredLog('info', 'Cleared all conversation histories');

	if (connection) {
		// Clean up all active streams and timeouts
		for (const cleanup of activeStreams.values()) {
			cleanup();
		}
		activeStreams.clear();

		for (const timeout of mutedUsers.values()) {
			clearTimeout(timeout);
		}
		mutedUsers.clear();

		connection.destroy();
		await interaction.reply({ content: '👋 Left the voice channel!', ephemeral: true });
	} else {
		await interaction.reply({ content: '❌ I\'m not in a voice channel in this server!', ephemeral: true });
	}
}

async function threshold(interaction: ChatInputCommandInteraction<'cached'>) {
	const newThreshold = interaction.options.getNumber('value', true);
	process.env.VOLUME_THRESHOLD = newThreshold.toString();
	await interaction.reply({ content: `🔊 Volume threshold updated to **${newThreshold}**`, ephemeral: true });
}

async function unmute(interaction: ChatInputCommandInteraction<'cached'>) {
	const user = interaction.options.getUser('user');

	if (user) {
		const unmuteTimeout = mutedUsers.get(user.id);
		if (unmuteTimeout) {
			clearTimeout(unmuteTimeout);
			mutedUsers.delete(user.id);
			try {
				const member = await interaction.guild.members.fetch(user.id);
				if (member.voice.channel) {
					await member.voice.setMute(false, 'Manual unmute');
				}
				await interaction.reply({ content: `🔊 Unmuted **${user.displayName}**`, ephemeral: true });
			} catch {
				await interaction.reply({ content: `❌ Could not unmute **${user.displayName}**`, ephemeral: true });
			}
		} else {
			await interaction.reply({ content: `❌ **${user.displayName}** is not muted.`, ephemeral: true });
		}
	} else {
		// Unmute all
		for (const [userId, timeout] of mutedUsers.entries()) {
			clearTimeout(timeout);
			try {
				const member = await interaction.guild.members.fetch(userId);
				if (member.voice.channel) {
					await member.voice.setMute(false, 'Manual unmute all');
				}
			} catch {
				// Ignore errors
			}
		}
		mutedUsers.clear();
		await interaction.reply({ content: '🔊 Unmuted all users.', ephemeral: true });
	}
}


async function stats(interaction: ChatInputCommandInteraction<'cached'>) {
	const stats = smartResponseManager.getStats();
	const embed = {
		title: '🤖 Кокоджамба Stats',
		color: 0x00ff00,
		fields: [
			{
				name: '📊 Responses This Hour',
				value: `${stats.responsesThisHour}/${stats.maxResponsesPerHour}`,
				inline: true
			},
			{
				name: '⏰ Time Until Reset',
				value: `${Math.ceil(stats.timeUntilReset / 60000)} minutes`,
				inline: true
			},
			{
				name: '👥 Active Users',
				value: `${stats.activeUsers}`,
				inline: true
			}
		],
		timestamp: new Date().toISOString()
	};
	
	await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function reset(interaction: ChatInputCommandInteraction<'cached'>) {
	// Check if user has admin permissions
	if (!interaction.memberPermissions?.has('Administrator')) {
		await interaction.reply({ content: '❌ You need Administrator permissions to use this command.', ephemeral: true });
		return;
	}
	
	smartResponseManager.resetCooldowns();
	await interaction.reply({ content: '✅ All cooldowns and stats have been reset!', ephemeral: true });
}

export const interactionHandlers = new Map([
	['monitor', join],
	['stop', leave],
	['threshold', threshold],
	['unmute', unmute],
	['stats', stats],
	['reset', reset],
]);