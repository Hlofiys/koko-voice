import { Content } from '@google/genai';

/**
 * Manages conversation history for voice channels
 */
export class ConversationHistoryManager {
    // Store conversation history per channel
    private histories: Map<string, Content[]> = new Map();
    
    /**
     * Get the conversation history for a channel
     * @param channelId The voice channel ID
     * @returns The conversation history or empty array if none exists
     */
    getHistory(channelId: string): Content[] {
        return this.histories.get(channelId) || [];
    }
    
    /**
     * Add a new entry to the conversation history
     * @param channelId The voice channel ID
     * @param content The content to add to history
     */
    addEntry(channelId: string, content: Content): void {
        if (!this.histories.has(channelId)) {
            this.histories.set(channelId, []);
        }
        
        const history = this.histories.get(channelId)!;
        history.push(content);
    }
    
    /**
     * Clear the conversation history for a channel
     * @param channelId The voice channel ID
     */
    clearHistory(channelId: string): void {
        this.histories.delete(channelId);
    }
    
    /**
     * Clear all conversation histories
     */
    clearAllHistories(): void {
        this.histories.clear();
    }
    
    /**
     * Check if a channel has conversation history
     * @param channelId The voice channel ID
     * @returns True if the channel has conversation history, false otherwise
     */
    hasHistory(channelId: string): boolean {
        return this.histories.has(channelId) && this.histories.get(channelId)!.length > 0;
    }
}

// Export a singleton instance
export const conversationHistoryManager = new ConversationHistoryManager();