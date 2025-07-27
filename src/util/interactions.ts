import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus, createAudioPlayer, createAudioResource, NoSubscriberBehavior } from '@discordjs/voice';
import type { ChatInputCommandInteraction, Snowflake } from 'discord.js';
import { createVolumeMonitoringStream } from './createListeningStream.js';
import { structuredLog } from './modernFeatures.js';
import { Gemini } from './gemini.js';
import { Readable } from 'node:stream';
import { conversationHistoryManager } from './conversationHistory.js';

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

                const audioBuffer = await gemini.startConversation(receiver, user, channelId);
                
                if (audioBuffer.length === 0) {
                    return; // Skip playback if the audio buffer is empty
                }

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

                const resource = createAudioResource(Readable.from(audioBuffer));
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
                structuredLog('info', 'Cleared conversation history for channel', { channelId });
                connection.removeListener('stateChange', onStateChange);
            }
        };
        
        connection.on('stateChange', onStateChange);

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


export const interactionHandlers = new Map([
	['monitor', join],
	['stop', leave],
	['threshold', threshold],
	['unmute', unmute],
]);