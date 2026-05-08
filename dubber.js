const { UniversalEdgeTTS } = require('edge-tts-universal');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

class Dubber {
    constructor() {}

    async getDuration(filePath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata.format.duration);
            });
        });
    }

    async generateSpeech(text, voice, outputPath, rate = '+0%', pitch = '+0Hz', apiKey = null, forceSpeed = 1.0) {
        try {
            const tempPath = outputPath + '.tmp.mp3';
            if (apiKey && voice && voice.startsWith('openai-')) {
                const OpenAI = require('openai');
                const openai = new OpenAI({ apiKey });
                const voiceId = voice.replace('openai-', '');
                const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: voiceId, input: text });
                fs.writeFileSync(tempPath, Buffer.from(await mp3.arrayBuffer()));
            } else {
                const tts = new UniversalEdgeTTS(text, voice || 'vi-VN-HoaiMyNeural', rate, pitch);
                const result = await tts.synthesize();
                fs.writeFileSync(tempPath, Buffer.from(await result.audio.arrayBuffer()));
            }

            // High-precision speedup
            let speedMultiplier = forceSpeed;
            const rateMatch = rate.match(/([+-]\d+)%/);
            if (rateMatch && forceSpeed === 1.0) {
                speedMultiplier = 1 + (parseInt(rateMatch[1]) / 100);
            }

            // --- PHYSICAL PITCH SHIFTING ---
            let pitchMultiplier = 1.0;
            const pitchMatch = pitch.match(/([+-]\d+)Hz/);
            if (pitchMatch) {
                // Map Hz to a multiplier (e.g., +20Hz -> 1.2x pitch)
                pitchMultiplier = 1 + (parseInt(pitchMatch[1]) / 50); 
            }

            return new Promise((resolve, reject) => {
                let cmd = ffmpeg(tempPath);
                let filters = ['silenceremove=1:0:-50dB']; 
                
                // Pitch shift by changing sample rate, then fix speed with atempo
                if (pitchMultiplier !== 1.0) {
                    filters.push(`asetrate=24000*${pitchMultiplier}`);
                    // Adjust speed back to original because asetrate changes speed
                    speedMultiplier = speedMultiplier / pitchMultiplier;
                }

                if (speedMultiplier > 2) {
                    filters.push(`atempo=${speedMultiplier/2}`, 'atempo=2');
                } else if (speedMultiplier > 1.001 || speedMultiplier < 0.999) {
                    filters.push(`atempo=${speedMultiplier}`);
                }
                
                // Ensure output is 44.1k stereo for consistent mixing
                filters.push('aresample=44100');

                cmd.audioFilters(filters)
                    .on('end', () => {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                        resolve(outputPath);
                    })
                    .on('error', reject)
                    .save(outputPath);
            });
        } catch (error) {
            console.error('Error in generateSpeech:', error);
            throw error;
        }
    }

    async processSegments(segments, voice, tempDir, rate = '+0%', pitch = '+0Hz', apiKey = null, maxDuration = 0) {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        // Step 1: Generate all at requested rate to measure total duration
        console.log(`[AUTO-SPEED] Dang do do dai van ban...`);
        let totalSpeechDuration = 0;
        const tempFiles = [];

        for (let i = 0; i < segments.length; i++) {
            const audioPath = path.join(tempDir, `pre_${i}.mp3`);
            await this.generateSpeech(segments[i].text, voice, audioPath, rate, pitch, apiKey);
            const d = await this.getDuration(audioPath);
            totalSpeechDuration += d;
            tempFiles.push({ path: audioPath, duration: d });
        }

        // Step 2: Calculate auto-speed if needed
        let finalMultiplier = 1.0;
        const targetDuration = maxDuration > 0 ? maxDuration - 1.5 : totalSpeechDuration;
        
        if (maxDuration > 0 && totalSpeechDuration > targetDuration) {
            finalMultiplier = totalSpeechDuration / targetDuration;
            console.log(`[AUTO-SPEED] Phat hien qua tai! Tu dong tang toc: x${finalMultiplier.toFixed(2)}`);
        }

        // Step 3: Re-process with final speed and fix overlaps
        const results = [];
        let lastEndTime = 0;
        const MIN_GAP = 0.1;

        for (let i = 0; i < segments.length; i++) {
            const audioPath = path.join(tempDir, `seg_${i}.mp3`);
            // Speed up the existing temp file to save time
            await this.applySpeed(tempFiles[i].path, audioPath, finalMultiplier);
            const duration = await this.getDuration(audioPath);
            
            let startTime = segments[i].time / finalMultiplier; // Adjust start time too
            if (startTime < lastEndTime + MIN_GAP) {
                startTime = lastEndTime + MIN_GAP;
            }

            console.log(`[DUB] Cau ${i}: ${startTime.toFixed(1)}s (Duration: ${duration.toFixed(2)}s)`);
            results.push({ 
                path: audioPath, 
                startTime: startTime, 
                duration: duration,
                text: segments[i].text 
            });
            lastEndTime = startTime + duration;
        }

        // Cleanup pre files
        tempFiles.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path) });
        return results;
    }

    async applySpeed(input, output, speed) {
        if (speed === 1.0) {
            fs.copyFileSync(input, output);
            return;
        }
        return new Promise((resolve, reject) => {
            let filters = [];
            if (speed > 2) { filters.push(`atempo=${speed/2}`, 'atempo=2'); }
            else { filters.push(`atempo=${speed}`); }
            ffmpeg(input).audioFilters(filters).on('end', resolve).on('error', reject).save(output);
        });
    }
}

module.exports = Dubber;
