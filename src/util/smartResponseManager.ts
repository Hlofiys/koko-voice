import { structuredLog } from './modernFeatures.js';
import type { User } from 'discord.js';

/**
 * Manages smart response logic for the Discord bot to prevent spam and quota exhaustion
 */
export class SmartResponseManager {
    private lastResponseTime = new Map<string, number>();
    private userInteractionCount = new Map<string, number>();
    private channelCooldowns = new Map<string, number>();
    private lastVoiceActivation = new Map<string, number>();
    private voiceActivationCount = new Map<string, { count: number; resetTime: number }>();
    private userCooldowns = new Map<string, number>();
    
    // Configuration (from environment variables)
    private readonly GLOBAL_COOLDOWN_MS = parseInt(process.env.GLOBAL_COOLDOWN_MS || '30000');
    private readonly USER_COOLDOWN_MS = parseInt(process.env.USER_COOLDOWN_MS || '60000');
    private readonly RANDOM_RESPONSE_CHANCE = parseFloat(process.env.RANDOM_RESPONSE_CHANCE || '0.15');
    private readonly MAX_RESPONSES_PER_HOUR = parseInt(process.env.MAX_RESPONSES_PER_HOUR || '20');
    private readonly TRANSCRIPTION_MULTIPLIER = parseFloat(process.env.TRANSCRIPTION_MULTIPLIER || '3.0');
    private readonly VOICE_SPAM_COOLDOWN_MS = parseInt(process.env.VOICE_SPAM_COOLDOWN_MS || '2500'); // 2.5 seconds between voice activations
    private readonly VOICE_SPAM_THRESHOLD = parseInt(process.env.VOICE_SPAM_THRESHOLD || '3'); // Max 3 activations per minute
    private readonly BOT_NAMES = ['кокоджамба', 'кокоджамбо', 'коко', 'джамба', 'бот'];
    
    private responseCount = 0;
    private hourlyResetTime = Date.now() + 3600000; // Reset every hour

    /**
     * Check if a user is in a cooldown period for spamming.
     */
    public isUserInCooldown(userId: string): boolean {
        const cooldownUntil = this.userCooldowns.get(userId);
        if (cooldownUntil && Date.now() < cooldownUntil) {
            return true;
        }
        this.userCooldowns.delete(userId); // Cooldown expired
        return false;
    }

    /**
     * Puts a user into a cooldown period.
     */
    public setUserCooldown(userId: string, durationMs: number): void {
        this.userCooldowns.set(userId, Date.now() + durationMs);
        structuredLog('info', 'User put into cooldown', { userId, durationMs });
    }

    /**
     * Check for voice spam and apply anti-spam measures
     */
    private checkVoiceSpam(userId: string): boolean {
        const now = Date.now();

        if (this.isUserInCooldown(userId)) {
            structuredLog('info', 'Skipping transcription - user in spam cooldown', { userId });
            return false;
        }
        
        // Check minimum time between voice activations
        const lastActivation = this.lastVoiceActivation.get(userId) || 0;
        if (now - lastActivation < this.VOICE_SPAM_COOLDOWN_MS) {
            structuredLog('info', 'Voice spam detected - too frequent activation', { 
                userId, 
                timeSinceLastMs: now - lastActivation 
            });
            return false;
        }

        // Check activation count per minute
        const activationData = this.voiceActivationCount.get(userId) || { count: 0, resetTime: now + 60000 };
        
        // Reset counter if minute has passed
        if (now > activationData.resetTime) {
            activationData.count = 0;
            activationData.resetTime = now + 60000;
        }

        // Check if user exceeded threshold
        if (activationData.count >= this.VOICE_SPAM_THRESHOLD) {
            structuredLog('info', 'Voice spam detected - too many activations per minute', { 
                userId, 
                count: activationData.count 
            });
            this.setUserCooldown(userId, 60000); // 1-minute cooldown for exceeding rate limit
            return false;
        }

        // Update tracking
        this.lastVoiceActivation.set(userId, now);
        activationData.count++;
        this.voiceActivationCount.set(userId, activationData);
        
        return true;
    }

    /**
     * Pre-check if we should even consider responding (before transcription)
     * This saves API quota by avoiding unnecessary transcriptions
     */
    public shouldConsiderResponse(user: User, channelId: string): boolean {
        const now = Date.now();
        const userId = user.id;

        // First check for voice spam
        if (!this.checkVoiceSpam(userId)) {
            return false;
        }

        // Reset hourly counter
        if (now > this.hourlyResetTime) {
            this.responseCount = 0;
            this.hourlyResetTime = now + 3600000;
            structuredLog('info', 'Hourly response counter reset');
        }

        // Check if we've hit the hourly limit
        if (this.responseCount >= this.MAX_RESPONSES_PER_HOUR) {
            return false;
        }

        // Check global channel cooldown
        const lastChannelResponse = this.channelCooldowns.get(channelId) || 0;
        if (now - lastChannelResponse < this.GLOBAL_COOLDOWN_MS) {
            return false;
        }

        // Check user-specific cooldown
        const lastUserResponse = this.lastResponseTime.get(userId) || 0;
        if (now - lastUserResponse < this.USER_COOLDOWN_MS) {
            return false;
        }

        // Random chance for entertainment (this allows transcription for potential response)
        const shouldConsider = Math.random() < (this.RANDOM_RESPONSE_CHANCE * this.TRANSCRIPTION_MULTIPLIER);
        
        return shouldConsider;
    }

    /**
     * Determines if the bot should respond to a user's voice input (after transcription)
     */
    public shouldRespond(user: User, channelId: string, transcribedText?: string): boolean {
        const now = Date.now();
        const userId = user.id;

        // Reset hourly counter
        if (now > this.hourlyResetTime) {
            this.responseCount = 0;
            this.hourlyResetTime = now + 3600000;
            structuredLog('info', 'Hourly response counter reset');
        }

        // Check if we've hit the hourly limit
        if (this.responseCount >= this.MAX_RESPONSES_PER_HOUR) {
            structuredLog('info', 'Hourly response limit reached', { count: this.responseCount });
            return false;
        }

        // Check if bot name is mentioned in transcribed text
        const botNameMentioned = transcribedText && this.containsBotName(transcribedText);
        
        if (botNameMentioned) {
            structuredLog('info', 'Bot name mentioned, forcing response', { user: user.username, text: transcribedText });
            this.recordResponse(userId, channelId);
            return true;
        }

        // Check global channel cooldown
        const lastChannelResponse = this.channelCooldowns.get(channelId) || 0;
        if (now - lastChannelResponse < this.GLOBAL_COOLDOWN_MS) {
            structuredLog('info', 'Channel in cooldown', { 
                channelId, 
                remainingMs: this.GLOBAL_COOLDOWN_MS - (now - lastChannelResponse) 
            });
            return false;
        }

        // Check user-specific cooldown
        const lastUserResponse = this.lastResponseTime.get(userId) || 0;
        if (now - lastUserResponse < this.USER_COOLDOWN_MS) {
            structuredLog('info', 'User in cooldown', { 
                userId, 
                remainingMs: this.USER_COOLDOWN_MS - (now - lastUserResponse) 
            });
            return false;
        }

        // Random chance for entertainment
        const shouldRespondRandomly = Math.random() < this.RANDOM_RESPONSE_CHANCE;
        
        if (shouldRespondRandomly) {
            structuredLog('info', 'Random response triggered', { 
                user: user.username, 
                chance: this.RANDOM_RESPONSE_CHANCE 
            });
            this.recordResponse(userId, channelId);
            return true;
        }

        structuredLog('info', 'No response triggered', { user: user.username });
        return false;
    }

    /**
     * Check if the text contains bot name variations
     */
    private containsBotName(text: string): boolean {
        const lowerText = text.toLowerCase();
        return this.BOT_NAMES.some(name => lowerText.includes(name));
    }

    /**
     * Record that a response was given
     */
    private recordResponse(userId: string, channelId: string): void {
        const now = Date.now();
        this.lastResponseTime.set(userId, now);
        this.channelCooldowns.set(channelId, now);
        this.responseCount++;
        
        // Track user interaction count
        const currentCount = this.userInteractionCount.get(userId) || 0;
        this.userInteractionCount.set(userId, currentCount + 1);
        
        structuredLog('info', 'Response recorded', { 
            userId, 
            channelId, 
            totalResponses: this.responseCount,
            userInteractions: currentCount + 1
        });
    }

    /**
     * Get response statistics
     */
    public getStats(): {
        responsesThisHour: number;
        maxResponsesPerHour: number;
        timeUntilReset: number;
        activeUsers: number;
    } {
        return {
            responsesThisHour: this.responseCount,
            maxResponsesPerHour: this.MAX_RESPONSES_PER_HOUR,
            timeUntilReset: Math.max(0, this.hourlyResetTime - Date.now()),
            activeUsers: this.userInteractionCount.size
        };
    }

    /**
     * Force reset cooldowns (admin function)
     */
    public resetCooldowns(): void {
        this.lastResponseTime.clear();
        this.channelCooldowns.clear();
        this.userInteractionCount.clear();
        this.responseCount = 0;
        this.hourlyResetTime = Date.now() + 3600000;
        structuredLog('info', 'All cooldowns reset');
    }
}

// Export singleton instance
export const smartResponseManager = new SmartResponseManager();