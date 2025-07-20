import { Logger } from '../logger';

export class AudioProcessor {
  /**
   * Converts Discord audio (48kHz stereo) to Gemini format (16kHz mono 16-bit PCM)
   */
  static discordToGemini(audioBuffer: Buffer): Buffer {
    try {
      // Discord audio is typically 48kHz stereo, 16-bit PCM
      const inputRate = 48000;
      const outputRate = 16000;
      const inputChannels = 2;
      const outputChannels = 1;
      
      const inputLength = audioBuffer.length / 2; // 16-bit samples
      const outputLength = Math.floor(inputLength * outputRate / inputRate / inputChannels);
      const output = Buffer.alloc(outputLength * 2); // 16-bit output
      
      for (let i = 0; i < outputLength; i++) {
        const inputIndex = Math.floor(i * inputRate / outputRate) * inputChannels * 2;
        
        // Mix stereo to mono
        let left = audioBuffer.readInt16LE(inputIndex);
        let right = audioBuffer.readInt16LE(inputIndex + 2);
        let mixed = Math.floor((left + right) / 2);
        
        // Clamp to 16-bit range
        mixed = Math.max(-32768, Math.min(32767, mixed));
        
        output.writeInt16LE(mixed, i * 2);
      }
      
      return output;
    } catch (error) {
      Logger.error('Error converting Discord audio to Gemini format:', error);
      throw error;
    }
  }

  /**
   * Converts Gemini audio (24kHz mono) to Discord format (48kHz stereo)
   */
  static geminiToDiscord(audioBuffer: Buffer): Buffer {
    try {
      // Gemini audio is 24kHz mono, 16-bit PCM
      const inputRate = 24000;
      const outputRate = 48000;
      const inputChannels = 1;
      const outputChannels = 2;
      
      const inputLength = audioBuffer.length / 2; // 16-bit samples
      const outputLength = Math.floor(inputLength * outputRate / inputRate) * outputChannels;
      const output = Buffer.alloc(outputLength * 2); // 16-bit output
      
      for (let i = 0; i < outputLength / outputChannels; i++) {
        const inputIndex = Math.floor(i * inputRate / outputRate) * 2;
        const sample = audioBuffer.readInt16LE(inputIndex);
        
        // Duplicate to stereo
        output.writeInt16LE(sample, i * outputChannels * 2);
        output.writeInt16LE(sample, i * outputChannels * 2 + 2);
      }
      
      return output;
    } catch (error) {
      Logger.error('Error converting Gemini audio to Discord format:', error);
      throw error;
    }
  }

  /**
   * Validates if the audio buffer is in the expected format
   */
  static validateAudioBuffer(buffer: Buffer, expectedChannels: number, expectedRate: number): boolean {
    if (!buffer || buffer.length === 0) {
      Logger.warn('Empty audio buffer received');
      return false;
    }
    
    if (buffer.length % 2 !== 0) {
      Logger.warn('Invalid audio buffer length - not 16-bit aligned');
      return false;
    }
    
    return true;
  }

  /**
   * Applies basic noise gate to reduce background noise
   */
  static applyNoiseGate(audioBuffer: Buffer, threshold: number = 500): Buffer {
    try {
      const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength / 2);
      const output = Buffer.alloc(audioBuffer.length);
      
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i] || 0;
        const processedSample = Math.abs(sample) < threshold ? 0 : sample;
        output.writeInt16LE(processedSample, i * 2);
      }
      
      return output;
    } catch (error) {
      Logger.error('Error applying noise gate:', error);
      return audioBuffer;
    }
  }
}