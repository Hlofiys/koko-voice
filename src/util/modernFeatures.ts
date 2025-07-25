/**
 * Modern Node.js 24+ features and utilities
 */

/**
 * Enhanced error handling with cause chains (Node.js 16.9+)
 */
export class VoiceRecordingError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'VoiceRecordingError';
	}
}

/**
 * Enhanced file operations using Node.js 24+ features
 */
export async function safeFileOperation<T>(
	operation: () => Promise<T>,
	errorMessage: string,
): Promise<T | null> {
	try {
		return await operation();
	} catch (error) {
		throw new VoiceRecordingError(errorMessage, { cause: error });
	}
}

/**
 * Performance monitoring using Node.js performance hooks
 */
export class PerformanceMonitor {
	private static marks = new Map<string, number>();

	static mark(name: string): void {
		this.marks.set(name, performance.now());
	}

	static measure(name: string, startMark: string): number {
		const start = this.marks.get(startMark);
		if (!start) {
			throw new Error(`Start mark '${startMark}' not found`);
		}
		
		const duration = performance.now() - start;
		console.log(`⏱️  ${name}: ${duration.toFixed(2)}ms`);
		return duration;
	}

	static clear(name?: string): void {
		if (name) {
			this.marks.delete(name);
		} else {
			this.marks.clear();
		}
	}
}

/**
 * Memory usage monitoring
 */
export function logMemoryUsage(label: string): void {
	const usage = process.memoryUsage();
	console.log(`📊 Memory Usage (${label}):`);
	console.log(`  RSS: ${Math.round(usage.rss / 1024 / 1024)}MB`);
	console.log(`  Heap Used: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
	console.log(`  Heap Total: ${Math.round(usage.heapTotal / 1024 / 1024)}MB`);
	console.log(`  External: ${Math.round(usage.external / 1024 / 1024)}MB`);
}

/**
 * Enhanced AbortController usage for cancellable operations
 */
export function createTimeoutController(timeoutMs: number): AbortController {
	const controller = new AbortController();
	
	const timeoutId = setTimeout(() => {
		controller.abort(new Error(`Operation timed out after ${timeoutMs}ms`));
	}, timeoutMs);

	// Clean up timeout if operation completes
	controller.signal.addEventListener('abort', () => {
		clearTimeout(timeoutId);
	}, { once: true });

	return controller;
}

/**
 * Structured logging with modern formatting
 */
export interface LogContext {
	userId?: string;
	username?: string;
	guildId?: string;
	channelId?: string;
	filename?: string;
	originalFile?: string;
	convertedFile?: string;
	duration?: number;
	maxDuration?: number;
	silenceDuration?: number;
	volume?: string;
	threshold?: number;
	muteDuration?: number;
	currentStatus?: boolean;
	isAlreadyMonitoring?: boolean;
	chunkSize?: number;
	monitoredCount?: number;
	recordedCount?: number;
	activeCount?: number;
	mutedCount?: number;
	checkCount?: number;
	cooldownRemaining?: number;
	error?: unknown;
	reason?: string;
    bufferSize?: number;
    base64Length?: number;
    fromState?: string;
    toState?: string;
    stack?: string;
}

export function structuredLog(level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
	const timestamp = new Date().toISOString();
	const logEntry = {
		timestamp,
		level: level.toUpperCase(),
		message,
		...context,
	};

	const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
	console.log(`${emoji} ${JSON.stringify(logEntry, null, 2)}`);
}