/**
 * Audio volume analysis utilities
 */

/**
 * Analyze the volume level of PCM audio data
 * @param pcmData Raw PCM audio buffer
 * @returns Volume level between 0.0 and 1.0
 */
export function analyzeAudioVolume(pcmData: Buffer): number {
	if (!pcmData || pcmData.length === 0) {
		return 0;
	}

	// Ensure buffer length is valid and even (16-bit samples)
	const validLength = Math.floor(pcmData.length / 2) * 2;
	if (validLength < 2) {
		return 0;
	}

	// Convert buffer to 16-bit signed integers with safe bounds checking
	const samples: number[] = [];
	for (let i = 0; i <= validLength - 2; i += 2) {
		try {
			// Double check bounds before reading
			if (i + 1 < pcmData.length && i < pcmData.length - 1) {
				const sample = pcmData.readInt16LE(i);
				if (!isNaN(sample) && isFinite(sample)) {
					samples.push(sample);
				}
			}
		} catch (error) {
			// Skip invalid samples and continue
			break;
		}
	}

	if (samples.length === 0) {
		return 0;
	}

	// Calculate RMS (Root Mean Square) volume
	const rms = calculateRMS(samples);
	
	// Normalize to 0-1 range (32767 is max value for 16-bit signed)
	const normalizedVolume = rms / 32767;
	
	// Apply some smoothing and ensure it's within bounds
	return Math.min(Math.max(normalizedVolume, 0), 1);
}

/**
 * Calculate RMS (Root Mean Square) of audio samples
 * @param samples Array of audio sample values
 * @returns RMS value
 */
function calculateRMS(samples: number[]): number {
	let sumOfSquares = 0;
	
	for (const sample of samples) {
		sumOfSquares += sample * sample;
	}
	
	const meanSquare = sumOfSquares / samples.length;
	return Math.sqrt(meanSquare);
}

/**
 * Calculate peak volume of audio samples
 * @param samples Array of audio sample values
 * @returns Peak volume value
 */
export function calculatePeakVolume(samples: number[]): number {
	let peak = 0;
	
	for (const sample of samples) {
		const absoluteSample = Math.abs(sample);
		if (absoluteSample > peak) {
			peak = absoluteSample;
		}
	}
	
	return peak / 32767; // Normalize to 0-1 range
}

/**
 * Calculate average volume of audio samples
 * @param samples Array of audio sample values
 * @returns Average volume value
 */
export function calculateAverageVolume(samples: number[]): number {
	if (samples.length === 0) return 0;
	
	let sum = 0;
	for (const sample of samples) {
		sum += Math.abs(sample);
	}
	
	const average = sum / samples.length;
	return average / 32767; // Normalize to 0-1 range
}

/**
 * Detect if audio contains speech based on volume patterns
 * @param volumes Array of recent volume measurements
 * @returns True if speech is detected
 */
export function detectSpeech(volumes: number[]): boolean {
	if (volumes.length < 3) return false;
	
	const averageVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
	const speechThreshold = 0.1; // Minimum volume to consider as speech
	
	// Check for volume variation (speech has natural volume changes)
	const maxVolume = Math.max(...volumes);
	const minVolume = Math.min(...volumes);
	const volumeVariation = maxVolume - minVolume;
	
	return averageVolume > speechThreshold && volumeVariation > 0.05;
}