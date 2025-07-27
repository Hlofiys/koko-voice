import { smartResponseManager } from './smartResponseManager.js';
import { structuredLog } from './modernFeatures.js';
import type { User } from 'discord.js';

/**
 * Detects potential bot name mentions in voice activity patterns
 * This helps prioritize transcription for likely bot calls
 */
export class VoiceActivityDetector {
    private readonly BOT_NAMES = ['кокоджамба', 'кокоджамбо', 'коко', 'джамба', 'бот'];
    private readonly MIN_SPEECH_DURATION = 1500; // Minimum ms for potential bot name mention
    private readonly MAX_SPEECH_DURATION = 10000; // Maximum ms to consider
    
    private voiceStartTimes = new Map<string, number>();
    
    /**
     * Record when a user starts speaking
     */
    public onVoiceStart(userId: string): void {
        this.voiceStartTimes.set(userId, Date.now());
    }
    
    /**
     * Analyze voice activity when user stops speaking
     * Returns priority level for transcription
     */
    public onVoiceEnd(user: User): 'high' | 'normal' | 'skip' {
        const userId = user.id;
        const startTime = this.voiceStartTimes.get(userId);
        
        if (!startTime) {
            return 'normal';
        }
        
        const duration = Date.now() - startTime;
        this.voiceStartTimes.delete(userId);

        if (smartResponseManager.isUserInCooldown(userId)) {
            structuredLog('info', 'Skipping voice activity - user in spam cooldown', { 
                user: user.username, 
                duration 
            });
            return 'skip';
        }
        
        // Skip very short utterances (likely noise/cough)
        if (duration < 500) {
            structuredLog('info', 'Skipping very short voice activity', { 
                user: user.username, 
                duration 
            });
            return 'skip';
        }
        
        // High priority for speech duration that could contain bot name
        if (duration >= this.MIN_SPEECH_DURATION && duration <= this.MAX_SPEECH_DURATION) {
            structuredLog('info', 'High priority voice activity detected', { 
                user: user.username, 
                duration 
            });
            return 'high';
        }
        
        // Normal priority for other durations
        return 'normal';
    }
    
    /**
     * Quick heuristic check if text likely contains bot name
     * Used for fast pre-filtering before full name detection
     */
    public likelyContainsBotName(text: string): boolean {
        const lowerText = text.toLowerCase();
        
        // Check for partial matches or similar sounds
        const indicators = [
            'кок', 'джамб', 'коко', 'бот', 'эй', 'привет',
            'слушай', 'скажи', 'ответь', 'помоги'
        ];
        
        return indicators.some(indicator => lowerText.includes(indicator));
    }
    
    /**
     * Clear old voice start times to prevent memory leaks
     */
    public cleanup(): void {
        const now = Date.now();
        const maxAge = 30000; // 30 seconds
        
        for (const [userId, startTime] of this.voiceStartTimes.entries()) {
            if (now - startTime > maxAge) {
                this.voiceStartTimes.delete(userId);
            }
        }
    }
}

// Export singleton instance
export const voiceActivityDetector = new VoiceActivityDetector();