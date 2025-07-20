import {
  VoiceConnection,
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayer,
  AudioResource,
  StreamType,
  VoiceConnectionStatus,
  entersState,
  VoiceConnectionDisconnectReason,
  EndBehaviorType,
} from '@discordjs/voice';
import { VoiceChannel } from 'discord.js';
import { Logger } from '../logger';
import { geminiLiveService, GeminiLiveSession } from './gemini-live';
import { AudioProcessor } from '../utils/audio-processor';
import { Readable } from 'stream';

export class DiscordVoiceService {
  private connection: VoiceConnection | null = null;
  private audioPlayer: AudioPlayer | null = null;
  private geminiSession: GeminiLiveSession | null = null;
  private isListening = false;

  async joinChannel(channel: VoiceChannel): Promise<void> {
    if (this.connection) {
      Logger.info('Leaving existing voice channel before joining new one');
      this.leaveChannel();
    }

    Logger.info(`Attempting to join voice channel: ${channel.name} (${channel.id})`);
    Logger.info(`Guild: ${channel.guild.name} (${channel.guild.id})`);
    Logger.info(`Channel type: ${channel.type}, User limit: ${channel.userLimit}`);

    // Validate channel permissions
    const botMember = channel.guild.members.me;
    if (!botMember) {
      throw new Error('Bot is not a member of this guild');
    }

    const permissions = channel.permissionsFor(botMember);
    if (!permissions) {
      throw new Error('Cannot determine bot permissions for this channel');
    }

    // Check required permissions using Discord.js permission flags
    if (!permissions.has('Connect')) {
      throw new Error('Bot is missing "Connect" permission for this voice channel');
    }
    
    if (!permissions.has('Speak')) {
      throw new Error('Bot is missing "Speak" permission for this voice channel');
    }

    try {
      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      Logger.info('Voice connection initiated, waiting for ready state...');
      
      // Wait for connection to be ready with retry logic
      await this.waitForConnectionReady();
      Logger.info('Successfully connected to voice channel');
      
      this.setupConnectionHandlers();
      this.setupAudioPlayer();
      
      Logger.info('Voice connection setup complete');
    } catch (error) {
      Logger.error('Failed to join voice channel:', error);
      this.cleanup();
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to connect to voice channel';
      if (error instanceof Error) {
        if (error.message.includes('ABORT_ERR') || error.message.includes('timeout')) {
          errorMessage = 'Voice connection timed out. Please check: 1) Bot has proper permissions, 2) Discord server region is set correctly, 3) No network/firewall issues';
        } else {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  private async waitForConnectionReady(maxRetries = 5): Promise<void> {
    if (!this.connection) throw new Error('No connection available');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        Logger.info(`Voice connection attempt ${attempt}/${maxRetries} - waiting for ready state...`);
        
        // Increase timeout to 30 seconds for better reliability
        await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
        
        Logger.info('Voice connection established successfully');
        return;
      } catch (error) {
        Logger.warn(`Voice connection attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to establish voice connection after ${maxRetries} attempts. Please check bot permissions and network connectivity.`);
        }
        
        // Exponential backoff: 2s, 4s, 6s, 8s, 10s
        const delay = 2000 * attempt;
        Logger.info(`Retrying voice connection in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.connection) return;

    // Log all connection state changes for debugging
    this.connection.on('stateChange', (oldState, newState) => {
      Logger.info(`Voice connection state: ${oldState.status} → ${newState.status}`);
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        Logger.warn('Voice connection disconnected:', newState.reason);
      }
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      Logger.warn('Voice connection disconnected, attempting to reconnect...');
      try {
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 10_000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 10_000),
        ]);
        Logger.info('Voice connection re-established');
      } catch (error) {
        Logger.error('Failed to reconnect to voice channel:', error);
        this.connection?.destroy();
        this.connection = null;
        this.cleanup();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      Logger.info('Voice connection destroyed');
      this.cleanup();
    });

    this.connection.on('error', (error) => {
      Logger.error('Voice connection error:', error);
    });
  }

  private setupAudioPlayer(): void {
    if (!this.connection) return;

    this.audioPlayer = createAudioPlayer();
    this.connection.subscribe(this.audioPlayer);
  }

  async startListening(): Promise<void> {
    if (!this.connection || this.isListening) return;

    try {
      this.geminiSession = await geminiLiveService.createSession(
        "You are a helpful AI assistant in a Discord voice channel. Respond naturally and conversationally to users."
      );

      this.setupGeminiAudioHandler();
      this.startReceivingAudio();
      
      this.isListening = true;
      Logger.info('Started listening to voice channel');
    } catch (error) {
      Logger.error('Failed to start listening:', error);
      throw error;
    }
  }

  private setupGeminiAudioHandler(): void {
    if (!this.geminiSession) return;

    this.geminiSession.onAudioResponse((audioData: Buffer) => {
      this.playAudioToDiscord(audioData);
    });
  }

  private startReceivingAudio(): void {
    if (!this.connection) return;

    const receiver = this.connection.receiver;
    
    receiver.speaking.on('start', (userId) => {
      Logger.debug(`User ${userId} started speaking`);
      
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.Manual,
        },
      });

      const audioBuffer: Buffer[] = [];
      
      audioStream.on('data', (chunk: Buffer) => {
        audioBuffer.push(chunk);
      });

      audioStream.on('end', () => {
        if (audioBuffer.length > 0) {
          const combinedBuffer = Buffer.concat(audioBuffer);
          this.processAudioForGemini(combinedBuffer);
        }
      });
    });
  }

  private processAudioForGemini(audioBuffer: Buffer): void {
    if (!this.geminiSession) return;

    try {
      if (!AudioProcessor.validateAudioBuffer(audioBuffer, 2, 48000)) {
        Logger.warn('Invalid audio buffer format, skipping processing');
        return;
      }

      // Convert Discord audio format (48kHz, stereo) to Gemini format (16kHz, mono, 16-bit PCM)
      const convertedBuffer = AudioProcessor.discordToGemini(audioBuffer);
      const processedBuffer = AudioProcessor.applyNoiseGate(convertedBuffer, 100);
      
      this.geminiSession.sendAudio(processedBuffer);
      Logger.debug(`Processed ${audioBuffer.length} bytes of Discord audio for Gemini`);
    } catch (error) {
      Logger.error('Error processing audio for Gemini:', error);
    }
  }

  private playAudioToDiscord(audioData: Buffer): void {
    if (!this.audioPlayer) return;

    try {
      if (!AudioProcessor.validateAudioBuffer(audioData, 1, 24000)) {
        Logger.warn('Invalid Gemini audio buffer format');
        return;
      }

      // Convert Gemini audio (24kHz, mono) to Discord format
      const convertedBuffer = AudioProcessor.geminiToDiscord(audioData);
      
      const audioStream = new Readable({
        read() {
          this.push(convertedBuffer);
          this.push(null);
        }
      });

      const resource = createAudioResource(audioStream, {
        inputType: StreamType.Raw,
      });

      this.audioPlayer.play(resource);
      Logger.debug(`Playing ${audioData.length} bytes of Gemini audio to Discord`);
    } catch (error) {
      Logger.error('Error playing audio to Discord:', error);
    }
  }

  stopListening(): void {
    if (this.geminiSession) {
      this.geminiSession.close();
      this.geminiSession = null;
    }
    
    this.isListening = false;
    Logger.info('Stopped listening to voice channel');
  }

  leaveChannel(): void {
    this.stopListening();
    
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    
    this.cleanup();
    Logger.info('Left voice channel');
  }

  private cleanup(): void {
    if (this.audioPlayer) {
      this.audioPlayer.stop();
      this.audioPlayer = null;
    }
    
    this.geminiSession = null;
    this.isListening = false;
  }

  isConnected(): boolean {
    return this.connection?.state.status === VoiceConnectionStatus.Ready;
  }

  isActive(): boolean {
    return this.isListening && this.isConnected();
  }
}

export const discordVoiceService = new DiscordVoiceService();