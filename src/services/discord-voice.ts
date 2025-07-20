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
} from "@discordjs/voice";
import { VoiceChannel } from "discord.js";
import { Logger } from "../logger";
import { geminiLiveService, GeminiLiveSession } from "./gemini-live";
import { AudioProcessor } from "../utils/audio-processor";
import { Readable } from "stream";

export class DiscordVoiceService {
  private connection: VoiceConnection | null = null;
  private audioPlayer: AudioPlayer | null = null;
  private geminiSession: GeminiLiveSession | null = null;
  private isListening = false;
  private activeSubscriptions = new Map<string, any>();

  async joinChannel(channel: VoiceChannel): Promise<void> {
    if (this.connection) {
      Logger.info("Leaving existing voice channel before joining new one");
      this.leaveChannel();
    }

    Logger.info(
      `Attempting to join voice channel: ${channel.name} (${channel.id})`,
    );
    Logger.info(`Guild: ${channel.guild.name} (${channel.guild.id})`);
    Logger.info(
      `Channel type: ${channel.type}, User limit: ${channel.userLimit}`,
    );

    // Validate channel permissions
    const botMember = channel.guild.members.me;
    if (!botMember) {
      throw new Error("Bot is not a member of this guild");
    }

    const permissions = channel.permissionsFor(botMember);
    if (!permissions) {
      throw new Error("Cannot determine bot permissions for this channel");
    }

    // Check required permissions using Discord.js permission flags
    if (!permissions.has("Connect")) {
      throw new Error(
        'Bot is missing "Connect" permission for this voice channel',
      );
    }

    if (!permissions.has("Speak")) {
      throw new Error(
        'Bot is missing "Speak" permission for this voice channel',
      );
    }

    try {
      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      Logger.info("Voice connection initiated, waiting for ready state...");

      // Wait for connection to be ready with retry logic
      await this.waitForConnectionReady();
      Logger.info("Successfully connected to voice channel");

      this.setupConnectionHandlers();
      this.setupAudioPlayer();

      Logger.info("Voice connection setup complete");
    } catch (error) {
      Logger.error("Failed to join voice channel:", error);
      this.cleanup();

      // Provide more helpful error messages
      let errorMessage = "Failed to connect to voice channel";
      if (error instanceof Error) {
        if (
          error.message.includes("ABORT_ERR") ||
          error.message.includes("timeout")
        ) {
          errorMessage =
            "Voice connection timed out. Please check: 1) Bot has proper permissions, 2) Discord server region is set correctly, 3) No network/firewall issues";
        } else {
          errorMessage = error.message;
        }
      }

      throw new Error(errorMessage);
    }
  }

  private async waitForConnectionReady(maxRetries = 5): Promise<void> {
    if (!this.connection) throw new Error("No connection available");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        Logger.info(
          `Voice connection attempt ${attempt}/${maxRetries} - waiting for ready state...`,
        );

        // Increase timeout to 30 seconds for better reliability
        await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);

        Logger.info("Voice connection established successfully");
        return;
      } catch (error) {
        Logger.warn(`Voice connection attempt ${attempt} failed:`, error);

        if (attempt === maxRetries) {
          throw new Error(
            `Failed to establish voice connection after ${maxRetries} attempts. Please check bot permissions and network connectivity.`,
          );
        }

        // Exponential backoff: 2s, 4s, 6s, 8s, 10s
        const delay = 2000 * attempt;
        Logger.info(`Retrying voice connection in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.connection) return;

    // Log all connection state changes for debugging
    this.connection.on("stateChange", (oldState, newState) => {
      Logger.info(
        `Voice connection state: ${oldState.status} → ${newState.status}`,
      );
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        Logger.warn("Voice connection disconnected:", newState.reason);
      }
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      Logger.warn("Voice connection disconnected, attempting to reconnect...");
      try {
        await Promise.race([
          entersState(
            this.connection!,
            VoiceConnectionStatus.Signalling,
            10_000,
          ),
          entersState(
            this.connection!,
            VoiceConnectionStatus.Connecting,
            10_000,
          ),
        ]);
        Logger.info("Voice connection re-established");
      } catch (error) {
        Logger.error("Failed to reconnect to voice channel:", error);
        this.connection?.destroy();
        this.connection = null;
        this.cleanup();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      Logger.info("Voice connection destroyed");
      this.cleanup();
    });

    this.connection.on("error", (error) => {
      Logger.error("Voice connection error:", error);
    });
  }

  private setupAudioPlayer(): void {
    if (!this.connection) return;

    this.audioPlayer = createAudioPlayer();

    // Set up audio player event listeners
    this.audioPlayer.on("stateChange", (oldState, newState) => {
      Logger.info(
        `🎛️ Audio player state: ${oldState.status} → ${newState.status}`,
      );
    });

    this.audioPlayer.on("error", (error) => {
      Logger.error("❌ Audio player error:", error);
    });

    this.audioPlayer.on("debug", (message) => {
      Logger.debug("🔧 Audio player debug:", message);
    });

    // Subscribe the connection to the audio player
    const subscription = this.connection.subscribe(this.audioPlayer);
    if (!subscription) {
      Logger.error("❌ Failed to subscribe connection to audio player");
    } else {
      Logger.info("✅ Audio player subscribed to voice connection");
    }
  }

  async startListening(channel: VoiceChannel): Promise<void> {
    if (!this.connection) {
      Logger.error("Cannot start listening: no voice connection available");
      return;
    }

    if (this.isListening) {
      Logger.warn(
        "Already listening to voice channel, ignoring duplicate request",
      );
      return;
    }

    Logger.info(`Starting to listen in channel: ${channel.name}`);

    try {
      Logger.info("Creating Gemini Live session...");
      this.geminiSession = await geminiLiveService.createSession(
        "You are a helpful AI assistant in a Discord voice channel. Respond naturally and conversationally to users.",
      );
      Logger.info("Gemini Live session created successfully");

      Logger.info("Setting up Gemini audio handler...");
      this.setupGeminiAudioHandler();

      Logger.info("Starting audio reception...");
      this.startReceivingAudio(channel);

      this.isListening = true;
      Logger.info("Successfully started listening to voice channel");
    } catch (error) {
      Logger.error("Failed to start listening:", error);
      throw error;
    }
  }

  private setupGeminiAudioHandler(): void {
    if (!this.geminiSession) {
      Logger.error(
        "❌ Cannot setup Gemini audio handler: no session available",
      );
      return;
    }

    Logger.info("🔗 Setting up Gemini audio response handler...");
    this.geminiSession.onAudioResponse((audioData: Buffer) => {
      Logger.info(
        `🎤 Received ${audioData.length} bytes of audio response from Gemini Live!`,
      );

      // Add a small delay to ensure proper audio processing
      setTimeout(() => {
        this.playAudioToDiscord(audioData);
      }, 10);
    });
    Logger.info("✅ Gemini audio response handler set up successfully");
  }

  private startReceivingAudio(channel: VoiceChannel): void {
    if (!this.connection) {
      Logger.error("Cannot start receiving audio: no voice connection");
      return;
    }

    Logger.info(`Setting up audio reception for channel: ${channel.name}`);
    Logger.info(`Voice connection status: ${this.connection.state.status}`);
    Logger.info(
      `Voice connection receiver exists: ${!!this.connection.receiver}`,
    );

    // Listen for users starting to speak
    this.connection.receiver.speaking.on("start", (userId) => {
      Logger.info(
        `🎤 User ${userId} started speaking - subscribing to audio stream`,
      );
      this.subscribeToUser(userId, this.connection!.receiver);
    });

    // Also listen for speaking end events for debugging
    this.connection.receiver.speaking.on("end", (userId) => {
      Logger.info(`🔇 User ${userId} stopped speaking`);
    });

    Logger.info("✅ Audio reception handlers set up successfully");
    Logger.info("🎧 Bot is now ready to receive voice input!");
  }

  private subscribeToUser(userId: string, receiver: any): void {
    // Check if we already have an active subscription for this user
    if (this.activeSubscriptions.has(userId)) {
      Logger.debug(
        `🔄 User ${userId} already has active subscription, skipping`,
      );
      return;
    }

    Logger.info(`📻 Subscribing to audio from user ${userId}`);

    try {
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 500, // Reduced duration for more responsive detection
        },
      });

      // Store the subscription
      this.activeSubscriptions.set(userId, audioStream);
      Logger.info(`✅ Audio stream subscription created for user ${userId}`);

      const audioBuffer: Buffer[] = [];

      audioStream.on("data", (chunk: Buffer) => {
        Logger.info(
          `🎵 Received audio chunk: ${chunk.length} bytes from user ${userId}`,
        );
        audioBuffer.push(chunk);
      });

      audioStream.on("end", () => {
        Logger.info(
          `⏹️ Audio stream ended for user ${userId}, collected ${audioBuffer.length} chunks`,
        );

        // Clean up the subscription
        this.activeSubscriptions.delete(userId);

        if (audioBuffer.length > 0) {
          const combinedBuffer = Buffer.concat(audioBuffer);
          Logger.info(
            `🔄 Processing ${combinedBuffer.length} total bytes of audio from user ${userId}`,
          );
          this.processAudioForGemini(combinedBuffer);
        } else {
          Logger.warn(
            `⚠️ No audio data received from user ${userId} - check microphone and permissions`,
          );
        }
      });

      audioStream.on("error", (error: Error) => {
        Logger.error(`❌ Error on audio stream for user ${userId}:`, error);
        // Clean up the subscription on error
        this.activeSubscriptions.delete(userId);
      });

      audioStream.on("close", () => {
        Logger.debug(`📴 Audio stream closed for user ${userId}`);
        // Clean up the subscription on close
        this.activeSubscriptions.delete(userId);
      });

      Logger.info(
        `🎧 Successfully set up audio stream handlers for user ${userId}`,
      );
    } catch (error) {
      Logger.error(`❌ Failed to subscribe to user ${userId}:`, error);
      // Make sure to clean up on error
      this.activeSubscriptions.delete(userId);
    }
  }

  private processAudioForGemini(audioBuffer: Buffer): void {
    if (!this.geminiSession) {
      Logger.error("❌ No Gemini session available for audio processing");
      return;
    }

    try {
      Logger.info(
        `🔄 Processing audio buffer of ${audioBuffer.length} bytes for Gemini`,
      );

      // Calculate audio volume for debugging
      const rms = AudioProcessor.calculateRMS(audioBuffer);
      Logger.info(
        `🔊 Audio RMS level: ${rms.toFixed(4)} (${rms > 0.01 ? "GOOD" : "LOW VOLUME"})`,
      );

      // Ensure buffer is 16-bit aligned
      const alignedBuffer =
        audioBuffer.length % 2 === 0
          ? audioBuffer
          : audioBuffer.slice(0, audioBuffer.length - 1);

      if (alignedBuffer.length === 0) {
        Logger.warn("⚠️ Empty aligned buffer, skipping processing");
        return;
      }

      Logger.info("✅ Audio buffer validation starting...");
      if (!AudioProcessor.validateAudioBuffer(alignedBuffer, 2, 48000)) {
        Logger.error("❌ Invalid audio buffer format, skipping processing");
        return;
      }
      Logger.info("✅ Audio buffer validation passed");

      // Convert Discord audio format (48kHz, stereo) to Gemini format (16kHz, mono, 16-bit PCM)
      Logger.info("🔄 Converting Discord audio to Gemini format...");
      const convertedBuffer = AudioProcessor.discordToGemini(alignedBuffer);
      Logger.info(
        `✅ Converted buffer from ${alignedBuffer.length} to ${convertedBuffer.length} bytes`,
      );

      Logger.info("🔄 Applying noise gate...");
      const processedBuffer = AudioProcessor.applyNoiseGate(
        convertedBuffer,
        100,
      );
      Logger.info(
        `✅ Applied noise gate, final buffer: ${processedBuffer.length} bytes`,
      );

      Logger.info("📤 Sending audio to Gemini Live...");
      this.geminiSession.sendAudio(processedBuffer);
      Logger.info(
        `✅ Successfully sent ${processedBuffer.length} bytes to Gemini Live!`,
      );
    } catch (error) {
      Logger.error("❌ Error processing audio for Gemini:", error);
    }
  }

  private playAudioToDiscord(audioData: Buffer): void {
    if (!this.audioPlayer) {
      Logger.error("❌ Cannot play audio: no audio player available");
      return;
    }

    if (!this.connection) {
      Logger.error("❌ Cannot play audio: no voice connection available");
      return;
    }

    try {
      Logger.info(
        `🔊 Starting playback of ${audioData.length} bytes from Gemini Live`,
      );

      // Gemini Live sends PCM audio at 24kHz, mono, 16-bit
      // Discord expects 48kHz, stereo, 16-bit PCM for raw audio
      Logger.info("🔄 Converting Gemini audio to Discord format...");
      const convertedBuffer = AudioProcessor.geminiToDiscord(audioData);
      Logger.info(
        `✅ Audio conversion complete: ${audioData.length} → ${convertedBuffer.length} bytes`,
      );

      if (convertedBuffer.length === 0) {
        Logger.warn("⚠️ Converted audio buffer is empty, skipping playback");
        return;
      }

      // Create a readable stream from the audio buffer
      const audioStream = new Readable({
        read() {
          this.push(convertedBuffer);
          this.push(null); // End the stream
        },
      });

      // Create audio resource with proper configuration for Discord
      const resource = createAudioResource(audioStream, {
        inputType: StreamType.Raw,
        metadata: {
          title: "Gemini Live Response",
          source: "gemini-live",
        },
      });

      // Add resource error handling
      resource.playStream.on("error", (error) => {
        Logger.error("❌ Audio stream error:", error);
      });

      Logger.info("🎵 Playing audio resource to Discord...");
      this.audioPlayer.play(resource);

      Logger.info(
        `🎉 Successfully queued ${convertedBuffer.length} bytes of audio for Discord playback!`,
      );
    } catch (error) {
      Logger.error("❌ Error playing audio to Discord:", error);
      Logger.error(
        "Stack trace:",
        error instanceof Error ? error.stack : "Unknown error",
      );
    }
  }

  stopListening(): void {
    if (this.geminiSession) {
      this.geminiSession.close();
      this.geminiSession = null;
    }

    this.isListening = false;
    Logger.info("Stopped listening to voice channel");
  }

  leaveChannel(): void {
    this.stopListening();

    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }

    this.cleanup();
    Logger.info("Left voice channel");
  }

  private cleanup(): void {
    if (this.audioPlayer) {
      this.audioPlayer.stop();
      this.audioPlayer = null;
    }

    // Clean up all active subscriptions
    this.activeSubscriptions.clear();

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
