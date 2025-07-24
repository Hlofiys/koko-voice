import { mkdir, access, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Ensure the recordings directory exists
 */
export async function ensureRecordingsDirectory(): Promise<void> {
	const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
	
	try {
		await access(recordingsDir);
		console.log(`📁 Recordings directory exists: ${recordingsDir}`);
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

/**
 * Get list of recording files in the recordings directory
 * @param extension File extension to filter by (optional)
 * @returns Array of file names
 */
export async function getRecordingFiles(extension?: string): Promise<string[]> {
	const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
	
	try {
		const files = await readdir(recordingsDir);
		
		if (extension) {
			return files.filter(file => file.endsWith(extension));
		}
		
		return files;
	} catch (error) {
		console.error('Error reading recordings directory:', error);
		return [];
	}
}

/**
 * Get recording file statistics
 * @param filename Name of the file in recordings directory
 * @returns File stats or null if file doesn't exist
 */
export async function getRecordingFileStats(filename: string) {
	const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
	const filePath = join(recordingsDir, filename);
	
	try {
		return await stat(filePath);
	} catch (error) {
		return null;
	}
}

/**
 * Clean up old recording files
 * @param maxAgeHours Maximum age in hours for files to keep
 * @returns Number of files deleted
 */
export async function cleanupOldRecordings(maxAgeHours: number = 24): Promise<number> {
	const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
	const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
	const now = Date.now();
	let deletedCount = 0;
	
	try {
		const files = await readdir(recordingsDir);
		
		for (const file of files) {
			const filePath = join(recordingsDir, file);
			const stats = await stat(filePath);
			
			if (now - stats.mtime.getTime() > maxAge) {
				try {
					const fs = await import('node:fs/promises');
					await fs.unlink(filePath);
					console.log(`🗑️  Deleted old recording: ${file}`);
					deletedCount++;
				} catch (deleteError) {
					console.warn(`⚠️  Could not delete ${file}:`, deleteError);
				}
			}
		}
		
		if (deletedCount > 0) {
			console.log(`🧹 Cleaned up ${deletedCount} old recording files`);
		}
		
		return deletedCount;
	} catch (error) {
		console.error('Error during cleanup:', error);
		return 0;
	}
}

/**
 * Get total size of recordings directory
 * @returns Size in bytes
 */
export async function getRecordingsDirectorySize(): Promise<number> {
	const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
	let totalSize = 0;
	
	try {
		const files = await readdir(recordingsDir);
		
		for (const file of files) {
			const filePath = join(recordingsDir, file);
			const stats = await stat(filePath);
			totalSize += stats.size;
		}
		
		return totalSize;
	} catch (error) {
		console.error('Error calculating directory size:', error);
		return 0;
	}
}

/**
 * Format bytes to human readable string
 * @param bytes Number of bytes
 * @returns Formatted string
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}