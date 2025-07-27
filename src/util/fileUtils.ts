import { mkdir, access } from 'node:fs/promises';

/**
 * Ensure the recordings directory exists
 */
export async function ensureRecordingsDirectory(): Promise<void> {
	const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
	
	try {
		await access(recordingsDir);
	} catch (error) {
		try {
			await mkdir(recordingsDir, { recursive: true });
			console.log(`📁 Created recordings directory: ${recordingsDir}`);
		} catch (mkdirError) {
			console.error(`❌ Failed to create recordings directory: ${recordingsDir}`, mkdirError);
			throw mkdirError;
		}
	}
}