import { GoogleGenAI, Modality } from "@google/genai";
import { botConfig } from "../config";
import { Logger } from "../logger";

export interface GeminiLiveSession {
  session: any;
  close: () => void;
  sendAudio: (audioData: Buffer) => void;
  onAudioResponse: (callback: (audioData: Buffer) => void) => void;
}

export class GeminiLiveService {
  private genAI: GoogleGenAI;
  private currentSession: GeminiLiveSession | null = null;

  constructor() {
    this.genAI = new GoogleGenAI({
      apiKey: botConfig.geminiApiKey,
    });
  }

  async createSession(
    systemInstruction: string = "You are a helpful AI voice assistant in a Discord voice channel. You MUST respond with spoken audio, not text. Keep responses conversational, natural, and relatively brief (under 30 seconds). Always speak your responses out loud.",
  ): Promise<GeminiLiveSession> {
    if (this.currentSession) {
      this.currentSession.close();
    }

    const model = "gemini-2.0-flash-live-001";
    const audioCallbacks: ((audioData: Buffer) => void)[] = [];

    Logger.info("🔄 Creating Gemini Live session...");

    try {
      const session = await this.genAI.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 1000,
          },
        },
        callbacks: {
          onopen: () => {
            Logger.info("✅ Gemini Live WebSocket connection opened");
          },
          onmessage: (message: any) => {
            Logger.info("📨 Received message from Gemini Live");
            Logger.debug("Message details:", JSON.stringify(message, null, 2));

            // Handle setup completion
            if (message.setupComplete) {
              Logger.info("✅ Gemini Live setup completed successfully!");
              return;
            }

            // Handle tool calls
            if (message.toolCall || message.toolCallCancellation) {
              Logger.info("🔧 Received tool-related message from Gemini");
              return;
            }

            // Handle server content with audio
            if (message.serverContent) {
              Logger.info("📋 Processing server content...");

              // Check for text responses (we want audio only)
              if (message.serverContent.text) {
                Logger.warn(
                  "⚠️ Gemini responded with text instead of audio:",
                  message.serverContent.text,
                );
              }

              // Process audio chunks
              if (
                message.serverContent.audioChunks &&
                message.serverContent.audioChunks.length > 0
              ) {
                Logger.info(
                  `🎵 Found ${message.serverContent.audioChunks.length} audio chunks`,
                );

                message.serverContent.audioChunks.forEach(
                  (chunk: any, index: number) => {
                    if (chunk && chunk.data) {
                      try {
                        const audioBuffer = Buffer.from(chunk.data, "base64");
                        Logger.info(
                          `🎤 Processing audio chunk ${index + 1}/${message.serverContent.audioChunks.length}: ${audioBuffer.length} bytes (MIME: ${chunk.mimeType || "unknown"})`,
                        );

                        // Notify all audio callbacks
                        audioCallbacks.forEach((callback) => {
                          try {
                            callback(audioBuffer);
                          } catch (callbackError) {
                            Logger.error(
                              "❌ Error in audio callback:",
                              callbackError,
                            );
                          }
                        });
                      } catch (error) {
                        Logger.error(
                          `❌ Error processing audio chunk ${index + 1}:`,
                          error,
                        );
                      }
                    } else {
                      Logger.warn(
                        `⚠️ Audio chunk ${index + 1} is missing data`,
                      );
                    }
                  },
                );
              } else {
                Logger.warn(
                  "⚠️ Server content received but no audio chunks found",
                );
              }
            } else {
              Logger.debug("📝 Non-server-content message received");
            }
          },
          onerror: (error: Error) => {
            Logger.error("❌ Gemini Live connection error:", error);
          },
          onclose: (event: any) => {
            Logger.info(
              "🔌 Gemini Live session closed:",
              event?.reason || "Unknown reason",
            );
          },
        },
      });

      const geminiSession: GeminiLiveSession = {
        session,
        close: () => {
          Logger.info("🔌 Closing Gemini Live session...");
          try {
            session.close();
          } catch (error) {
            Logger.error("❌ Error closing Gemini session:", error);
          }
          this.currentSession = null;
        },
        sendAudio: (audioData: Buffer) => {
          try {
            if (!audioData || audioData.length === 0) {
              Logger.warn("⚠️ Empty audio buffer, skipping send to Gemini");
              return;
            }

            Logger.info(
              `📤 Sending ${audioData.length} bytes of audio to Gemini Live`,
            );

            // Send realtime audio input to Gemini Live
            session.sendRealtimeInput({
              audio: {
                data: audioData.toString("base64"),
                mimeType: "audio/pcm",
              } as any,
            });

            Logger.info("✅ Audio sent to Gemini Live successfully");
          } catch (error) {
            Logger.error("❌ Error sending audio to Gemini Live:", error);
          }
        },
        onAudioResponse: (callback: (audioData: Buffer) => void) => {
          audioCallbacks.push(callback);
          Logger.debug(
            `📋 Audio callback registered (total: ${audioCallbacks.length})`,
          );
        },
      };

      this.currentSession = geminiSession;
      Logger.info("✅ Gemini Live session created successfully");
      return geminiSession;
    } catch (error) {
      Logger.error("❌ Failed to create Gemini Live session:", error);
      throw error;
    }
  }

  getCurrentSession(): GeminiLiveSession | null {
    return this.currentSession;
  }

  closeCurrentSession() {
    if (this.currentSession) {
      this.currentSession.close();
      this.currentSession = null;
    }
  }
}

export const geminiLiveService = new GeminiLiveService();
