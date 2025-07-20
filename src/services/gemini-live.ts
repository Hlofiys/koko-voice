import { GoogleGenAI, Modality } from '@google/genai';
import { botConfig } from '../config';
import { Logger } from '../logger';

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
    this.genAI = new GoogleGenAI({ apiKey: botConfig.geminiApiKey });
  }

  async createSession(systemInstruction: string = "You are a helpful AI assistant. Respond naturally and conversationally."): Promise<GeminiLiveSession> {
    if (this.currentSession) {
      this.currentSession.close();
    }

    const model = "gemini-2.5-flash-preview-native-audio-dialog";
    const config = {
      responseModalities: [Modality.AUDIO],
      systemInstruction,
    };

    const responseQueue: any[] = [];
    const audioCallbacks: ((audioData: Buffer) => void)[] = [];

    const session = await this.genAI.live.connect({
      model,
      callbacks: {
        onopen: () => {
          Logger.info('Gemini Live session opened');
        },
        onmessage: (message: any) => {
          responseQueue.push(message);
          
          // Handle audio data
          if (message.data) {
            const audioBuffer = Buffer.from(message.data, 'base64');
            audioCallbacks.forEach(callback => callback(audioBuffer));
          }
        },
        onerror: (error: Error) => {
          Logger.error('Gemini Live error:', error);
        },
        onclose: (event: any) => {
          Logger.info('Gemini Live session closed:', event.reason);
        },
      },
      config,
    });

    const geminiSession: GeminiLiveSession = {
      session,
      close: () => {
        session.close();
        this.currentSession = null;
      },
      sendAudio: (audioData: Buffer) => {
        const base64Audio = audioData.toString('base64');
        session.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000"
          }
        });
      },
      onAudioResponse: (callback: (audioData: Buffer) => void) => {
        audioCallbacks.push(callback);
      }
    };

    this.currentSession = geminiSession;
    return geminiSession;
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