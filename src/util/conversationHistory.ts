import { Content } from '@google/genai';

/**
 * Manages conversation history for users in voice sessions
 */
export class ConversationHistoryManager {
    // Store conversation history per user session
    private histories: Map<string, Content[]> = new Map();
    
    /**
     * Get the conversation history for a user
     * @param userId The Discord user ID
     * @returns The conversation history or empty array if none exists
     */
    getHistory(userId: string): Content[] {
        return this.histories.get(userId) || [];
    }
    
    /**
     * Add a new entry to the conversation history
     * @param userId The Discord user ID
     * @param content The content to add to history
     */
    addEntry(userId: string, content: Content): void {
        if (!this.histories.has(userId)) {
            this.histories.set(userId, []);
        }
        
        const history = this.histories.get(userId)!;
        history.push(content);
    }
    
    /**
     * Clear the conversation history for a user
     * @param userId The Discord user ID
     */
    clearHistory(userId: string): void {
        this.histories.delete(userId);
    }
    
    /**
     * Clear all conversation histories
     */
    clearAllHistories(): void {
        this.histories.clear();
    }
    
    /**
     * Check if a user has conversation history
     * @param userId The Discord user ID
     * @returns True if the user has conversation history, false otherwise
     */
    hasHistory(userId: string): boolean {
        return this.histories.has(userId) && this.histories.get(userId)!.length > 0;
    }
}

// Export a singleton instance
export const conversationHistoryManager = new ConversationHistoryManager();