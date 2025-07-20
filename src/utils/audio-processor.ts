import { Logger } from "../logger";

export class AudioProcessor {
  /**
   * Converts Discord audio (48kHz stereo) to Gemini format (16kHz mono 16-bit PCM)
   */
  static discordToGemini(audioBuffer: Buffer): Buffer {
    try {
      Logger.debug(`Converting Discord audio: ${audioBuffer.length} bytes`);

      // Discord audio is typically 48kHz stereo, 16-bit PCM
      // Gemini Live expects 16kHz mono, 16-bit PCM
      const inputRate = 48000;
      const outputRate = 16000;
      const inputChannels = 2;
      const outputChannels = 1;
      const bytesPerSample = 2; // 16-bit

      // Validate input buffer
      if (audioBuffer.length < bytesPerSample * inputChannels) {
        Logger.warn("Audio buffer too small for conversion");
        return Buffer.alloc(0);
      }

      const inputSamples =
        audioBuffer.length / (bytesPerSample * inputChannels);
      const outputSamples = Math.floor((inputSamples * outputRate) / inputRate);
      const output = Buffer.alloc(outputSamples * bytesPerSample);

      Logger.debug(
        `Converting Gemini audio: ${inputSamples} samples (${inputRate}Hz mono) to ${outputSamples} samples (${outputRate}Hz stereo)`,
      );

      for (let i = 0; i < outputSamples; i++) {
        const inputSampleIndex = Math.floor((i * inputRate) / outputRate);
        const inputByteIndex =
          inputSampleIndex * inputChannels * bytesPerSample;

        // Ensure we don't read beyond buffer bounds
        if (
          inputByteIndex + inputChannels * bytesPerSample - 1 >=
          audioBuffer.length
        ) {
          break;
        }

        // Read stereo samples and mix to mono
        const left = audioBuffer.readInt16LE(inputByteIndex);
        const right = audioBuffer.readInt16LE(inputByteIndex + 2);
        let mixed = Math.floor((left + right) / 2);

        // Clamp to 16-bit signed integer range
        mixed = Math.max(-32768, Math.min(32767, mixed));

        output.writeInt16LE(mixed, i * bytesPerSample);
      }

      Logger.debug(`Conversion complete: ${output.length} bytes output`);
      return output;
    } catch (error) {
      Logger.error("Error converting Discord audio to Gemini format:", error);
      throw error;
    }
  }

  /**
   * Converts Gemini audio (24kHz mono) to Discord format (48kHz stereo)
   */
  static geminiToDiscord(audioBuffer: Buffer): Buffer {
    try {
      Logger.debug(`Converting Gemini audio: ${audioBuffer.length} bytes`);

      // Gemini Live outputs 24kHz mono, 16-bit PCM
      // Discord expects 48kHz stereo, 16-bit PCM
      const inputRate = 24000;
      const outputRate = 48000;
      const inputChannels = 1;
      const outputChannels = 2;
      const bytesPerSample = 2; // 16-bit

      // Validate input buffer
      if (audioBuffer.length < bytesPerSample) {
        Logger.warn("Gemini audio buffer too small for conversion");
        return Buffer.alloc(0);
      }

      const inputSamples = audioBuffer.length / bytesPerSample;
      const outputSamples = Math.floor((inputSamples * outputRate) / inputRate);
      const output = Buffer.alloc(
        outputSamples * outputChannels * bytesPerSample,
      );

      Logger.debug(
        `Converting Discord audio: ${inputSamples} samples (${inputRate}Hz stereo) to ${outputSamples} samples (${outputRate}Hz mono)`,
      );

      for (let i = 0; i < outputSamples; i++) {
        const inputSampleIndex = Math.floor((i * inputRate) / outputRate);
        const inputByteIndex = inputSampleIndex * bytesPerSample;

        // Ensure we don't read beyond buffer bounds
        if (inputByteIndex + bytesPerSample - 1 >= audioBuffer.length) {
          break;
        }

        const sample = audioBuffer.readInt16LE(inputByteIndex);
        const outputByteIndex = i * outputChannels * bytesPerSample;

        // Duplicate mono to stereo (left and right channels)
        output.writeInt16LE(sample, outputByteIndex); // Left channel
        output.writeInt16LE(sample, outputByteIndex + 2); // Right channel
      }

      Logger.debug(`Gemini conversion complete: ${output.length} bytes output`);
      return output;
    } catch (error) {
      Logger.error("Error converting Gemini audio to Discord format:", error);
      throw error;
    }
  }

  /**
   * Validates if the audio buffer is in the expected format
   */
  static validateAudioBuffer(
    buffer: Buffer,
    expectedChannels: number,
    expectedRate: number,
  ): boolean {
    if (!buffer || buffer.length === 0) {
      Logger.warn("Empty audio buffer received");
      return false;
    }

    if (buffer.length % 2 !== 0) {
      Logger.warn("Invalid audio buffer length - not 16-bit aligned");
      return false;
    }

    // Check minimum buffer size for expected format
    const minBytes = expectedChannels * 2; // 16-bit samples
    if (buffer.length < minBytes) {
      Logger.warn(
        `❌ Audio buffer too small: ${buffer.length} bytes, expected at least ${minBytes} bytes for ${expectedChannels} channels`,
      );
      return false;
    }

    Logger.debug(
      `✅ Audio buffer validation passed: ${buffer.length} bytes, ${expectedChannels} channels, ${expectedRate}Hz`,
    );
    return true;
  }

  /**
   * Applies basic noise gate to reduce background noise
   */
  static applyNoiseGate(audioBuffer: Buffer, threshold: number = 500): Buffer {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        Logger.warn("Empty buffer provided to noise gate");
        return audioBuffer;
      }

      const samples = new Int16Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / 2,
      );
      const output = Buffer.alloc(audioBuffer.length);

      let gatedSamples = 0;
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i] || 0;
        const processedSample = Math.abs(sample) < threshold ? 0 : sample;
        if (processedSample === 0 && sample !== 0) {
          gatedSamples++;
        }
        output.writeInt16LE(processedSample, i * 2);
      }

      if (gatedSamples > 0) {
        Logger.debug(
          `Noise gate removed ${gatedSamples} samples below threshold ${threshold}`,
        );
      }

      return output;
    } catch (error) {
      Logger.error("Error applying noise gate:", error);
      return audioBuffer;
    }
  }

  /**
   * Calculates RMS (Root Mean Square) of audio buffer for volume analysis
   */
  static calculateRMS(audioBuffer: Buffer): number {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        return 0;
      }

      const samples = new Int16Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / 2,
      );
      let sum = 0;

      for (let i = 0; i < samples.length; i++) {
        const sample = (samples[i] || 0) / 32768; // Normalize to -1 to 1
        sum += sample * sample;
      }

      return Math.sqrt(sum / samples.length);
    } catch (error) {
      Logger.error("Error calculating RMS:", error);
      return 0;
    }
  }
}
