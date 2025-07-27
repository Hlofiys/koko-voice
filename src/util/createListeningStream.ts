import { EndBehaviorType, type VoiceReceiver } from '@discordjs/voice';
import type { User, Snowflake, GuildMember } from 'discord.js';
import * as prism from 'prism-media';
import { structuredLog } from './modernFeatures.js';
import { analyzeAudioVolume } from './volumeAnalyzer.js';

/**
 * Creates a volume monitoring stream for a user and returns a cleanup function.
 */
export function createVolumeMonitoringStream(
	receiver: VoiceReceiver,
	user: User,
	member: GuildMember,
	mutedUsers: Map<Snowflake, NodeJS.Timeout>,
): () => void {
	// Use Manual behavior to control the stream's lifecycle explicitly
	const opusStream = receiver.subscribe(user.id, {
		end: {
			behavior: EndBehaviorType.Manual,
		},
	});

	const decoder = new (prism.opus as any).Decoder({
		frameSize: 960,
		channels: 2,
		rate: 48000,
	});

	structuredLog('info', 'Started volume monitoring', { userId: user.id });

	const cleanup = () => {
		if (!opusStream.destroyed) {
			opusStream.destroy();
		}
		if (!decoder.destroyed) {
			decoder.destroy();
		}
	};

	// Pipe the streams
	opusStream.pipe(decoder);

	// Handle stream errors
	opusStream.on('error', (error: any) => {
		if (error.message.includes('push() after EOF') || error.message.includes('ERR_STREAM_PUSH_AFTER_EOF')) {
			// Ignore common, expected errors
		} else {
			structuredLog('error', 'Opus stream error', { userId: user.id, error: error.message });
		}
		cleanup();
	});

	decoder.on('error', (error: any) => {
		// This error is expected and can be safely ignored
		if (error.message.includes('out of range')) {
			return;
		}
		structuredLog('error', 'Decoder stream error', { userId: user.id, error: error.message });
		cleanup();
	});

	let lastVolumeCheck = 0;
	const VOLUME_CHECK_INTERVAL = 100; // ms

	decoder.on('data', (pcmData: Buffer) => {
		const now = Date.now();
		if (now - lastVolumeCheck < VOLUME_CHECK_INTERVAL) {
			return;
		}
		lastVolumeCheck = now;

		try {
			const volume = analyzeAudioVolume(pcmData);
			const volumeThreshold = parseFloat(process.env.VOLUME_THRESHOLD || '0.8');

			if (volume > volumeThreshold && !mutedUsers.has(user.id)) {
				muteUserForBeingLoud(member, user, volume, mutedUsers);
			}
		} catch (error: any) {
			structuredLog('error', 'Error analyzing volume', {
				userId: user.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

	return cleanup;
}

async function muteUserForBeingLoud(
	member: GuildMember,
	user: User,
	volume: number,
	mutedUsers: Map<Snowflake, NodeJS.Timeout>,
) {
	try {
		const muteDuration = parseInt(process.env.MUTE_DURATION || '30000'); // 30 seconds default
		await member.voice.setMute(true, 'Volume too loud - automatic mute');

		structuredLog('info', 'User muted for being too loud', { userId: user.id });

		const unmuteTimeout = setTimeout(async () => {
			try {
				// Check if member is still in a voice channel
				if (member.voice.channel) {
					await member.voice.setMute(false, 'Automatic unmute after volume timeout');
					structuredLog('info', 'User automatically unmuted', { userId: user.id });
				}
			} catch (unmuteError: any) {
				// Ignore errors if user has left, etc.
			} finally {
				mutedUsers.delete(user.id);
			}
		}, muteDuration);

		mutedUsers.set(user.id, unmuteTimeout);
	} catch (error: any) {
		structuredLog('error', 'Error muting user', { userId: user.id, error });
	}
}