import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';

/**
 * Convert OGG file to WAV format using native child_process
 * @param oggFilePath Path to the OGG file
 * @returns Path to the converted WAV file
 */
export async function convertToWav(oggFilePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const dir = dirname(oggFilePath);
		const name = basename(oggFilePath, extname(oggFilePath));
		const wavFilePath = join(dir, `${name}.wav`);

		console.log(`🔄 Converting ${oggFilePath} to WAV...`);

		const ffmpeg = spawn('ffmpeg', [
			'-i',
			oggFilePath,
			'-acodec',
			'pcm_s16le',
			'-ac',
			'1',
			'-ar',
			'48000',
			'-t',
			'30',
			'-y',
			wavFilePath,
		]);

		ffmpeg.stdout.on('data', (data) => {
			console.log(`FFmpeg stdout: ${data}`);
		});

		ffmpeg.stderr.on('data', (data) => {
			// FFmpeg outputs progress to stderr, this is normal
			const output = data.toString();
			if (output.includes('time=')) {
				console.log(`🔄 Converting: ${output.trim()}`);
			}
		});

		ffmpeg.on('close', (code) => {
			if (code === 0) {
				console.log(`✅ Conversion completed: ${wavFilePath}`);
				resolve(wavFilePath);
			} else {
				reject(new Error(`FFmpeg process exited with code ${code}`));
			}
		});

		ffmpeg.on('error', (error) => {
			console.error(`❌ FFmpeg error: ${error.message}`);
			reject(error);
		});
	});
}

/**
 * Convert audio file to MP3 format using native child_process
 * @param inputFilePath Path to the input audio file
 * @returns Path to the converted MP3 file
 */
export async function convertToMp3(inputFilePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const dir = dirname(inputFilePath);
		const name = basename(inputFilePath, extname(inputFilePath));
		const mp3FilePath = join(dir, `${name}.mp3`);

		console.log(`🔄 Converting ${inputFilePath} to MP3...`);

		const ffmpeg = spawn('ffmpeg', [
			'-i', inputFilePath,
			'-acodec', 'mp3',
			'-ab', '128k',
			'-y',
			mp3FilePath
		]);

		ffmpeg.on('close', (code) => {
			if (code === 0) {
				console.log(`✅ MP3 conversion completed: ${mp3FilePath}`);
				resolve(mp3FilePath);
			} else {
				reject(new Error(`FFmpeg process exited with code ${code}`));
			}
		});

		ffmpeg.on('error', (error) => {
			console.error(`❌ FFmpeg error: ${error.message}`);
			reject(error);
		});
	});
}

/**
 * Get audio file duration in seconds using ffprobe
 * @param audioFilePath Path to the audio file
 * @returns Duration in seconds
 */
export async function getAudioDuration(audioFilePath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const ffprobe = spawn('ffprobe', [
			'-v', 'quiet',
			'-show_entries', 'format=duration',
			'-of', 'csv=p=0',
			audioFilePath
		]);

		let output = '';

		ffprobe.stdout.on('data', (data) => {
			output += data.toString();
		});

		ffprobe.on('close', (code) => {
			if (code === 0) {
				const duration = parseFloat(output.trim());
				if (!isNaN(duration)) {
					resolve(duration);
				} else {
					reject(new Error('Could not parse duration'));
				}
			} else {
				reject(new Error(`ffprobe process exited with code ${code}`));
			}
		});

		ffprobe.on('error', (error) => {
			reject(error);
		});
	});
}

/**
 * Clean up temporary audio files
 * @param filePaths Array of file paths to delete
 */
export async function cleanupAudioFiles(filePaths: string[]): Promise<void> {
	for (const filePath of filePaths) {
		try {
			await fs.unlink(filePath);
			console.log(`🗑️  Cleaned up: ${filePath}`);
		} catch (error) {
			console.warn(`⚠️  Could not delete ${filePath}:`, error);
		}
	}
}