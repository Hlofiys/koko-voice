import { GoogleGenAI } from '@google/genai';
import pkg from 'wavefile';
const { WaveFile } = pkg;
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
import https from 'https';

const execAsync = promisify(exec);

export class Gemini {
    private readonly ai: GoogleGenAI;
    private telegramClient: TelegramClient | null = null;
    private readonly model = "gemini-2.5-flash";
    private readonly sileroVoiceBotUsername = 'silero_voice_bot';

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
            const { stdout, stderr } = await execAsync(
                `ffmpeg -i ${oggPath} -filter:a "volume=2.0" -ar 16000 -ac 1 -c:a pcm_s16le ${wavPath}`
            );
            if (stderr) {
                structuredLog('warn', 'ffmpeg conversion warning', { error: stderr });
            }
        } catch (error) {
            structuredLog('error', 'ffmpeg conversion failed', { error });
            throw new Error('Failed to convert audio file.');
        }
    }

    public async startConversation(receiver: VoiceReceiver, user: User): Promise<Buffer> {
        // 1. Record user's audio to a temporary OGG file
        const opusStream = receiver.subscribe(user.id, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1500, // Increased silence duration
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

        structuredLog('info', 'Starting audio recording pipeline...');
        try {
            await pipeline(opusStream, oggStream, out);
            structuredLog('info', 'Audio recording pipeline finished.');
        } catch (error: any) {
            structuredLog('error', 'Error in recording pipeline', { error: error.message });
            throw new Error('Failed to record audio.');
        } finally {
            if (!opusStream.destroyed) {
                structuredLog('warn', 'Opus stream was not destroyed by pipeline, destroying manually.');
                opusStream.destroy();
            }
        }

        // 2. Convert the OGG file to a WAV file
        const tempWavPath = tempOggPath.replace('.ogg', '.wav');
        await this.convertOggToWav(tempOggPath, tempWavPath);
        // Delete the OGG file now that we have the WAV file
        await fs.unlink(tempOggPath);

        // 3. Send audio to Gemini 2.5 Flash for transcription and get text response
        structuredLog('info', 'Reading converted WAV file...', { filename: tempWavPath });
        const fileBuffer = await fs.readFile(tempWavPath);
        await fs.unlink(tempWavPath); // Delete the intermediate WAV file
        structuredLog('info', 'WAV file read', { bufferSize: fileBuffer.length });

        if (fileBuffer.length === 0) {
            structuredLog('error', 'Converted WAV file is empty.');
            throw new Error('Converted audio file is empty.');
        }

        // Convert audio to base64 for Gemini API
        const base64Audio = fileBuffer.toString('base64');
        structuredLog('info', 'Audio converted to Base64', { base64Length: base64Audio.length });

        // 4. Send audio to Gemini for transcription and response
        structuredLog('info', 'Sending audio to Gemini for transcription...');
        
        try {
            const response = await this.ai.models.generateContent({
                model: this.model,
                contents: [
                    {
                        parts: [
                            {
                                text: `Пользователь ${user.username} говорит на русском языке. Пожалуйста, расшифруйте то, что он сказал, и дайте полезный ответ на русском языке. Если аудио неясно или пусто, ответьте дружелюбным сообщением на русском, попросив говорить снова.`
                            },
                            {
                                inlineData: {
                                    mimeType: "audio/wav",
                                    data: base64Audio
                                }
                            }
                        ]
                    }
                ],
                config: {
                    maxOutputTokens: 1000,
                    temperature: 0.7,
                    systemInstruction: "Ты полезный помощник в голосовом чате Discord. Отвечай естественно и разговорчиво на то, что говорит пользователь. Всегда отвечай на русском языке. Делай ответы краткими, но дружелюбными. Ты можешь помочь с вопросами, поддержать беседу или просто пообщаться."
                }
            });

            const responseText = response.text;
            if (!responseText) {
                throw new Error('No text response from Gemini');
            }

            structuredLog('info', `Received text response from Gemini (${responseText.length} chars): ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);

            // 5. Convert text response to speech using local TTS
            const audioBuffer = await this.textToSpeech(responseText);
            
            return audioBuffer;

        } catch (error: any) {
            structuredLog('error', 'Error processing with Gemini', { error: error.message });
            
            // Fallback response
            const fallbackText = "Извините, я не смог понять, что вы сказали. Не могли бы вы повторить?";
            const fallbackAudio = await this.textToSpeech(fallbackText);
            return fallbackAudio;
        }
    }

    private async textToSpeech(text: string): Promise<Buffer> {
        structuredLog('info', `Converting text to speech via Telegram Silero bot: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

        try {
            // Send text to silero_voice_bot and wait for audio response
            const audioBuffer = await this.sendToSileroBot(text);
            
            structuredLog('info', `Silero TTS conversion completed, audio size: ${audioBuffer.length} bytes`);
            
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
                structuredLog('info', 'Text sent to Silero bot, waiting for audio response...');

                // Set up timeout
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout waiting for Silero bot response'));
                }, 30000); // 30 second timeout

                // Listen for new messages from silero_voice_bot
                const handler = async (event: any) => {
                    try {
                        const message = event.message;
                        
                        structuredLog('info', `Received message from Telegram - ChatID: ${message.chatId?.toString()}, SileroID: ${sileroBot.id.toString()}, HasVoice: ${!!message.voice}, HasAudio: ${!!message.audio}, HasDocument: ${!!message.document}`);
                        
                        // Check if message is from silero_voice_bot
                        if (message.chatId?.toString() === sileroBot.id.toString()) {
                            // Check for any type of media (voice, audio, document)
                            if (message.voice || message.audio || message.document) {
                                structuredLog('info', 'Found audio message from Silero bot, downloading...');
                                clearTimeout(timeout);
                                
                                try {
                                    // Download the audio file
                                    const audioBuffer = await this.telegramClient!.downloadMedia(message, {});
                                    
                                    if (audioBuffer) {
                                        structuredLog('info', `Downloaded audio from Silero: ${audioBuffer.length} bytes`);
                                        
                                        // Convert to WAV if needed
                                        let finalBuffer: Buffer;
                                        const isMp3 = (message.audio && message.audio.mimeType === 'audio/mpeg') ||
                                                      (message.document && message.document.mimeType === 'audio/mpeg');

                                        if (isMp3) {
                                            // It's an MP3, convert to WAV for Discord
                                            structuredLog('info', 'Detected MP3 audio, converting to WAV...');
                                            finalBuffer = await this.convertMp3ToWavBuffer(Buffer.from(audioBuffer));
                                        } else {
                                            // Assume OGG voice message, convert to WAV
                                            structuredLog('info', 'Detected OGG or other audio format, converting to WAV...');
                                            finalBuffer = await this.convertOggToWavBuffer(Buffer.from(audioBuffer));
                                        }
                                        
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
                            } else {
                                structuredLog('info', 'Message from Silero bot has no audio content');
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

    // Removed downloadTelegramFile - now using client.downloadMedia directly

    private async convertOggToWavBuffer(oggBuffer: Buffer): Promise<Buffer> {
        const tempOggPath = `./recordings/temp-${Date.now()}.ogg`;
        const tempWavPath = `./recordings/temp-${Date.now()}.wav`;
        
        try {
            // Write OGG buffer to temporary file
            await fs.writeFile(tempOggPath, oggBuffer);
            
            // Convert to WAV
            await this.convertOggToWav(tempOggPath, tempWavPath);
            
            // Read WAV buffer
            const wavBuffer = await fs.readFile(tempWavPath);
            
            // Clean up temporary files
            await fs.unlink(tempOggPath).catch(() => {});
            await fs.unlink(tempWavPath).catch(() => {});
            
            return wavBuffer;
        } catch (error) {
            // Clean up on error
            await fs.unlink(tempOggPath).catch(() => {});
            await fs.unlink(tempWavPath).catch(() => {});
            throw error;
        }
    }

    private async convertMp3ToWavBuffer(mp3Buffer: Buffer): Promise<Buffer> {
        const tempMp3Path = `./recordings/temp-${Date.now()}.mp3`;
        const tempWavPath = `./recordings/temp-${Date.now()}.wav`;
        
        try {
            // Write MP3 buffer to temporary file
            await fs.writeFile(tempMp3Path, mp3Buffer);
            
            // Convert MP3 to WAV using ffmpeg
            const { stdout, stderr } = await execAsync(
                `ffmpeg -i ${tempMp3Path} -ar 16000 -ac 1 -c:a pcm_s16le ${tempWavPath}`
            );
            
            if (stderr && !stderr.includes('Warning')) {
                structuredLog('warn', 'ffmpeg MP3 conversion warning', { error: stderr });
            }
            
            // Read WAV buffer
            const wavBuffer = await fs.readFile(tempWavPath);
            
            // Clean up temporary files
            await fs.unlink(tempMp3Path).catch(() => {});
            await fs.unlink(tempWavPath).catch(() => {});
            
            return wavBuffer;
        } catch (error) {
            // Clean up on error
            await fs.unlink(tempMp3Path).catch(() => {});
            await fs.unlink(tempWavPath).catch(() => {});
            throw error;
        }
    }
}