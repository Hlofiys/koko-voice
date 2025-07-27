export function structuredLog(level: 'info' | 'warn' | 'error', message: string, context?: any): void {
	const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    if (context) {
	    console.log(`${emoji} ${message}`, context);
    } else {
        console.log(`${emoji} ${message}`);
    }
}