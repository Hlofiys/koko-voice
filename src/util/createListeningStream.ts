import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { EndBehaviorType, type VoiceReceiver } from '@discordjs/voice';
import type { User, Snowflake } from 'discord.js';
import * as prism from 'prism-media';
import { convertToWav } from './audioConverter.js';
import { PerformanceMonitor, structuredLog, createTimeoutController } from './modernFeatures.js';

export async function createListeningStream(
	receiver: VoiceReceiver,
	user: User,
	activeRecordings: Map<Snowflake, boolean>
) {
	const timestamp = Date.now();
	const opusStream = receiver.subscribe(user.id, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: parseInt(process.env.RECORDING_SILENCE_DURATION || '1000'),
		},
	});

	const oggStream = new (prism.opus as any).OggLogicalBitstream({
		opusHead: new (prism.opus as any).OpusHead({
			channelCount: 2,
			sampleRate: 48_000,
		}),
		pageSizeControl: {
			maxPackets: 10,
		},
	});

	const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
	const filename = `${recordingsDir}/${timestamp}-${user.id}.ogg`;
	const out = createWriteStream(filename);

	structuredLog('info', 'Started recording', {
		userId: user.id,
		filename,
	});
	
	PerformanceMonitor.mark(`recording-${user.id}`);

	try {
		// Create timeout controller for the recording
		const timeoutController = createTimeoutController(
			parseInt(process.env.MAX_RECORDING_DURATION || '300000')
		);

		await pipeline(opusStream, oggStream, out, { signal: timeoutController.signal });
		
		const duration = PerformanceMonitor.measure('Recording completed', `recording-${user.id}`);
		
		structuredLog('info', 'Recording completed', {
			userId: user.id,
			filename,
			duration,
		});

		// Mark recording as finished
		activeRecordings.set(user.id, false);

		// Convert to WAV if enabled
		if (process.env.AUDIO_CONVERT_TO_WAV === 'true') {
			try {
				structuredLog('info', 'Converting audio to WAV', {
					userId: user.id,
					filename,
				});
				
				const wavFilename = await convertToWav(filename);
				
				structuredLog('info', 'Audio conversion completed', {
					userId: user.id,
					originalFile: filename,
					convertedFile: wavFilename,
				});
			} catch (conversionError) {
				structuredLog('error', 'Error during audio conversion', {
					userId: user.id,
					filename,
					error: conversionError,
				});
			}
		}

	} catch (error: any) {
		console.warn(`❌ Error recording file ${filename} - ${error.message}`);
		activeRecordings.set(user.id, false);
	}
}