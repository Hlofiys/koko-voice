import { GoogleGenAI, Modality } from '@google/genai';
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

const execAsync = promisify(exec);

export class Gemini {
    private readonly ai: GoogleGenAI;
    private readonly model = "gemini-live-2.5-flash-preview";

    constructor() {
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    private async convertOggToWav(oggPath: string, wavPath: string): Promise<void> {
        try {
            // Use ffmpeg to convert OGG to WAV, resample to 16kHz, and convert to mono
            const { stdout, stderr } = await execAsync(
                `ffmpeg -i ${oggPath} -ar 16000 -ac 1 -c:a pcm_s16le ${wavPath}`
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

        // 3. Prepare for Gemini Live API
        const responseQueue: any[] = [];
        const waitMessage = async () => {
            let done = false;
            let message = undefined;
            while (!done) {
                message = responseQueue.shift();
                if (message) {
                    done = true;
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
            return message;
        };

        const handleTurn = async (): Promise<any[]> => {
            const timeoutPromise = new Promise<any[]>((_, reject) =>
                setTimeout(() => reject(new Error('Gemini response timed out')), 5000)
            );

            const conversationPromise = (async () => {
                const turns = [];
                let done = false;
                while (!done) {
                    const message = await waitMessage();
                    turns.push(message);
                    if (message.serverContent && message.serverContent.turnComplete) {
                        done = true;
                    }
                }
                return turns;
            })();

            try {
                return await Promise.race([conversationPromise, timeoutPromise]);
            } catch (error) {
                structuredLog('warn', 'Gemini response timed out');
                return []; // Return empty buffer on timeout
            }
        };

        const session = await this.ai.live.connect({
            model: this.model,
            callbacks: {
                onopen: () => structuredLog('info', 'Gemini session opened'),
                onmessage: (message) => responseQueue.push(message),
                onerror: (e) => structuredLog('error', 'Gemini error', { error: e.message }),
                onclose: (e) => structuredLog('info', 'Gemini session closed', { reason: e?.reason ?? 'Unknown' }),
            },
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: "You are a helpful assistant and answer in a friendly tone.",
            },
        });

        // 4. Send the converted WAV file to Gemini
        structuredLog('info', 'Reading converted WAV file...', { filename: tempWavPath });
        const fileBuffer = await fs.readFile(tempWavPath);
        await fs.unlink(tempWavPath); // Delete the WAV file now that we have it in memory
        structuredLog('info', 'WAV file read', { bufferSize: fileBuffer.length });

        if (fileBuffer.length === 0) {
            structuredLog('error', 'Converted WAV file is empty.');
            throw new Error('Converted audio file is empty.');
        }

        const wav = new WaveFile();
        wav.fromBuffer(fileBuffer);
        wav.toSampleRate(16000); // Gemini expects 16kHz
        wav.toBitDepth('16'); // Ensure bit depth is set correctly

        const base64Audio = wav.toBase64();
        structuredLog('info', 'Audio converted to Base64', { base64Length: base64Audio.length });

        structuredLog('info', 'Sending audio to Gemini...');
        // session.sendRealtimeInput({
        //     text: `User ${user.username} is speaking. Respond something in any case , even if there is no audio.`,
        // });
        session.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: "audio/pcm;rate=16000"
            }
        });
        structuredLog('info', 'Audio sent to Gemini. Waiting for response...');

        const turns = await handleTurn();
        structuredLog('info', 'Received response from Gemini');

        // 5. Process the response from Gemini
        const combinedAudio = turns.reduce((acc, turn) => {
            if (turn.data) {
                const buffer = Buffer.from(turn.data, 'base64');
                const intArray = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Int16Array.BYTES_PER_ELEMENT);
                return acc.concat(Array.from(intArray));
            }
            return acc;
        }, []);

        const audioBuffer = new Int16Array(combinedAudio);
        const wf = new WaveFile();
        wf.fromScratch(1, 24000, '16', audioBuffer); // Gemini output is 24kHz

        session.close();

        return Buffer.from(wf.toBuffer());
    }
}