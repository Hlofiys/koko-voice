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

		ffmpeg.on('close', (code) => {
			if (code === 0) {
				resolve(wavFilePath);
			} else {
				reject(new Error(`FFmpeg process exited with code ${code}`));
			}
		});

		ffmpeg.on('error', (error) => {
			reject(error);
		});
	});
}