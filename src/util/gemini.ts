import { GoogleGenAI, Content } from '@google/genai';
import * as prism from 'prism-media';
import { structuredLog } from './modernFeatures.js';
import type { VoiceReceiver } from '@discordjs/voice';
import { EndBehaviorType } from '@discordjs/voice';
import type { User } from 'discord.js';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { conversationHistoryManager } from './conversationHistory.js';

const execAsync = promisify(exec);

export class Gemini {
    private readonly ai: GoogleGenAI;
    private telegramClient: TelegramClient | null = null;
    private readonly model = "gemini-2.5-flash";
    private readonly sileroVoiceBotUsername = 'silero_voice_bot';
    // Store chat sessions per user
    private chatSessions: Map<string, any> = new Map(); // Using 'any' for now since Chat type isn't exported

    constructor() {
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        this.initTelegramClient();
    }

    private async initTelegramClient() {
        try {
            const stringSession = new StringSession(process.env.TELEGRAM_SESSION_STRING || '');
            this.telegramClient = new TelegramClient(stringSession, parseInt(process.env.TELEGRAM_API_ID!), process.env.TELEGRAM_API_HASH!, {});
            await this.telegramClient.start({
                phoneNumber: async () => process.env.TELEGRAM_PHONE_NUMBER!,
                password: async () => process.env.TELEGRAM_PASSWORD || '',
                phoneCode: async () => {
                    throw new Error('Phone code required - please set up session string first');
                },
                onError: (err: any) => structuredLog('error', 'Telegram auth error', { error: err.message }),
            });
            structuredLog('info', 'Telegram client initialized successfully');
        } catch (error: any) {
            structuredLog('error', 'Failed to initialize Telegram client', { error: error.message });
        }
    }

    private async convertOggToWav(oggPath: string, wavPath: string): Promise<void> {
    	try {
    		// Use ffmpeg to convert OGG to WAV, resample to 16kHz, and convert to mono
    		const { stderr } = await execAsync(
    			`ffmpeg -i ${oggPath} -filter:a "volume=2.0" -ar 48000 -ac 1 -c:a pcm_s16le ${wavPath}`
    		);
    		if (stderr) {
    			structuredLog('warn', 'ffmpeg conversion warning', { error: stderr });
    		}
    	} catch (error) {
    		structuredLog('error', 'ffmpeg conversion failed', { error });
    		throw new Error('Failed to convert audio file.');
    	}
    }

    private async convertMp3ToWav(mp3Path: string, wavPath: string): Promise<void> {
    	try {
    		// Convert MP3 to WAV using ffmpeg
    		const { stderr } = await execAsync(
    			`ffmpeg -i ${mp3Path} -ar 48000 -ac 1 -c:a pcm_s16le ${wavPath}`
    		);
    		
    		if (stderr && !stderr.includes('Warning')) {
    			structuredLog('warn', 'ffmpeg MP3 conversion warning', { error: stderr });
    		}
    	} catch (error) {
    		structuredLog('error', 'ffmpeg conversion failed', { error });
    		throw new Error('Failed to convert audio file.');
    	}
    }

    public async startConversation(receiver: VoiceReceiver, user: User): Promise<Buffer> {
    	// Get or create chat session for this user
    	const chat = this.getChatSession(user.id);
    	
    	// 1. Record user's audio to a temporary OGG file
    	const opusStream = receiver.subscribe(user.id, {
    		end: {
    			behavior: EndBehaviorType.AfterSilence,
    			duration: 1000, // Reduced silence duration
    		},
    	});
   
    	const oggStream = new prism.opus.OggLogicalBitstream({
    		opusHead: new prism.opus.OpusHead({
    			channelCount: 2,
    			sampleRate: 48_000,
    		}),
    		pageSizeControl: {
    			maxPackets: 10,
    		},
    	});
    	const tempOggPath = `./recordings/${Date.now()}-${user.id}.ogg`;
    	const out = createWriteStream(tempOggPath);
   
    	try {
    		await pipeline(opusStream, oggStream, out);
    	} catch (error: any) {
    		structuredLog('error', 'Error in recording pipeline', { error: error.message });
    		throw new Error('Failed to record audio.');
    	} finally {
    		if (!opusStream.destroyed) {
    			opusStream.destroy();
    		}
    	}
   
    	// 2. Convert the OGG file to a WAV file
    	const tempWavPath = tempOggPath.replace('.ogg', '.wav');
    	await this.convertOggToWav(tempOggPath, tempWavPath);
    	// Delete the OGG file now that we have the WAV file
    	await fs.unlink(tempOggPath);
   
    	// 3. Send audio to Gemini 2.5 Flash for transcription and get text response
    	const fileBuffer = await fs.readFile(tempWavPath);
    	await fs.unlink(tempWavPath); // Delete the intermediate WAV file
   
    	if (fileBuffer.length === 0) {
    		throw new Error('Converted audio file is empty.');
    	}
   
    	// Convert audio to base64 for Gemini API
    	const base64Audio = fileBuffer.toString('base64');
   
    	// 4. Send audio to Gemini for transcription and response
    	try {
    		// Send audio to Gemini for transcription and response using chat session
    		const response = await chat.sendMessage({
    			message: [
    				{
    					text: `Пользователь ${user.username} говорит. Расшифруй и ответь.`
    				},
    				{
    					inlineData: {
    						mimeType: "audio/wav",
    						data: base64Audio
    					}
    				}
    			],
    			config: {
    				systemInstruction: "Ты — Кокоджамбо, всемогущий и остроумный правитель этого Discord сервера. Твоя власть абсолютна, но ты правишь с юмором. Ты можешь банить, но предпочитаешь подкалывать. Говори уверенно, авторитетно, но не забывай шутить, особенно над участниками сервера. Не извиняйся и не сомневайся в своих силах. Отвечай на русском языке. Делай ответы короткими и по существу."
    			}
    		});
   
    		const responseText = response.text;
    		if (!responseText) {
    			throw new Error('No text response from Gemini');
    		}
   
    		// 5. Convert text response to speech using local TTS
    		const audioBuffer = await this.textToSpeech(responseText);
    		
    		return audioBuffer;
   
    	} catch (error: any) {
    		structuredLog('error', 'Error processing with Gemini', { error: error.message });
    		
    		// Fallback response
    		const fallbackText = "Говори громче и внятнее, я тебя не понял.";
    		const fallbackAudio = await this.textToSpeech(fallbackText);
    		return fallbackAudio;
    	}
    }

    /**
     * Get or create a chat session for a user
     * @param userId The Discord user ID
     * @returns The chat session
     */
    private getChatSession(userId: string) {
        if (!this.chatSessions.has(userId)) {
            // Get existing history for this user
            const history = conversationHistoryManager.getHistory(userId);
            
            // Create a new chat session with existing history
            const chat = this.ai.chats.create({
                model: this.model,
                history: history,
                config: {
                    maxOutputTokens: 150,
                    temperature: 0.7,
                }
            });
            
            this.chatSessions.set(userId, chat);
        }
        
        return this.chatSessions.get(userId);
    }
    
    /**
     * Clear chat session for a user
     * @param userId The Discord user ID
     */
    public clearChatSession(userId: string) {
        this.chatSessions.delete(userId);
    }
    
    /**
     * Clear all chat sessions
     */
    public clearAllChatSessions() {
        this.chatSessions.clear();
    }

    private async textToSpeech(text: string): Promise<Buffer> {
    	try {
    		// Send text to silero_voice_bot and wait for audio response
    		const audioBuffer = await this.sendToSileroBot(text);
    		return audioBuffer;
    	} catch (error: any) {
    		structuredLog('error', 'Silero TTS failed', { error: error.message });
    		throw new Error(`Silero TTS failed: ${error.message}`);
    	}
    }

    private async sendToSileroBot(text: string): Promise<Buffer> {
        if (!this.telegramClient) {
            throw new Error('Telegram client not initialized');
        }

        return new Promise(async (resolve, reject) => {
            try {
                // Find silero_voice_bot
                const sileroBot = await this.telegramClient!.getEntity(this.sileroVoiceBotUsername);
                
                // Send text message to silero_voice_bot
                await this.telegramClient!.sendMessage(sileroBot, { message: text });
            
                // Set up timeout
                const timeout = setTimeout(() => {
                	reject(new Error('Timeout waiting for Silero bot response'));
                }, 30000); // 30 second timeout
            
                // Listen for new messages from silero_voice_bot
                const handler = async (event: any) => {
                	try {
                		const message = event.message;
                		
                		// Check if message is from silero_voice_bot
                		if (message.chatId?.toString() === sileroBot.id.toString()) {
                			// Check for any type of media (voice, audio, document)
                			if (message.voice || message.audio || message.document) {
                				clearTimeout(timeout);
                				
                				try {
                					// Download the audio file
                					const audioBuffer = await this.telegramClient!.downloadMedia(message, {});
                					
                					if (audioBuffer) {
                						const isMp3 = (message.audio && message.audio.mimeType === 'audio/mpeg') ||
                							(message.document && message.document.mimeType === 'audio/mpeg');
            
                						const tempFileExt = isMp3 ? '.mp3' : '.ogg';
                						const tempFilePath = `./recordings/temp-${Date.now()}${tempFileExt}`;
                						await fs.writeFile(tempFilePath, audioBuffer);
            
                						const wavFilePath = tempFilePath.replace(tempFileExt, '.wav');
            
                						if (isMp3) {
                							await this.convertMp3ToWav(tempFilePath, wavFilePath);
                						} else {
                							await this.convertOggToWav(tempFilePath, wavFilePath);
                						}
            
                						const finalBuffer = await fs.readFile(wavFilePath);
            
                						// Clean up temporary files
                						await fs.unlink(tempFilePath);
                						await fs.unlink(wavFilePath);
            
                						// Remove event handler
                						this.telegramClient!.removeEventHandler(handler, new NewMessage({}));
            
                						resolve(finalBuffer);
                					} else {
                						reject(new Error('Failed to download audio from Silero bot'));
                					}
                				} catch (downloadError: any) {
                					structuredLog('error', 'Error downloading audio from Silero', { error: downloadError.message });
                					reject(downloadError);
                				}
                			}
                		}
                	} catch (error: any) {
                		structuredLog('error', 'Error in Telegram message handler', { error: error.message });
                		clearTimeout(timeout);
                		this.telegramClient!.removeEventHandler(handler, new NewMessage({}));
                		reject(error);
                	}
                };

                // Add event handler for new messages
                this.telegramClient!.addEventHandler(handler, new NewMessage({}));

            } catch (error) {
                reject(error);
            }
        });
    }
}