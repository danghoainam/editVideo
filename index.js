const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

class VideoProcessor {
    constructor(inputPath, outputPath) {
        this.inputPath = inputPath;
        this.outputPath = outputPath;
        this.settings = {
            zoom: 1.0,
            speed: 1.0,
            color: { brightness: 0, contrast: 1, saturation: 1 },
            logo: null,
            subtitles: { enabled: false },
            bgm: null,
            sfx: [],
            duration: 0,
            width: 1280,
            height: 720
        };
    }

    setOptions(options) {
        this.settings = { ...this.settings, ...options };
        return this;
    }

    async process() {
        return new Promise(async (resolve, reject) => {
            const tempDir = path.join(__dirname, 'assets', 'temp_process');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            try {
                const mergedAudioPath = path.join(tempDir, `merged_audio_${Date.now()}.mp3`);
                await this.createMergedAudio(this.settings.sfx, mergedAudioPath);

                let command = ffmpeg(this.inputPath);
                let videoFilters = [];
                
                // --- DYNAMIC ZOOM ---
                if (this.settings.zoom > 1.0) {
                    const z = this.settings.zoom;
                    const w = this.settings.width || 1280;
                    const h = this.settings.height || 720;
                    videoFilters.push(`zoompan=z='min(zoom+0.0015,${z})':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}`);
                }

                // --- AGGRESSIVE COLOR ---
                const { brightness, contrast, saturation } = this.settings.color;
                videoFilters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
                
                if (this.settings.speed !== 1.0) videoFilters.push(`setpts=${1 / this.settings.speed}*PTS`);

                // --- LOGO ---
                if (this.settings.logo && this.settings.logo.enabled && this.settings.logo.text) {
                    videoFilters.push(`drawtext=text='${this.settings.logo.text}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.4:boxborderw=10:x=w-tw-20:y=20`);
                }

                // --- SUBTITLES ---
                let assPath = null;
                if (this.settings.subtitles && this.settings.subtitles.enabled && this.settings.sfx.length > 0) {
                    assPath = path.join(tempDir, `subs_${Date.now()}.ass`);
                    this.createAssFile(this.settings.sfx, assPath);
                    // Use the subtitles filter
                    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
                    videoFilters.push(`subtitles='${escapedAssPath}'`);
                }

                const complexFilters = [];
                let lastVideoLabel = '0:v';
                if (videoFilters.length > 0) {
                    complexFilters.push({ filter: videoFilters.join(','), inputs: '0:v', outputs: 'v_proc' });
                    lastVideoLabel = 'v_proc';
                }

                command.input(mergedAudioPath);
                let speechLabel = '1:a';
                let inputCount = 2;
                let finalAudioLabel = speechLabel;

                if (this.settings.bgm && fs.existsSync(this.settings.bgm.path)) {
                    command.input(this.settings.bgm.path).inputOptions('-stream_loop -1');
                    let bgmInputLabel = `${inputCount}:a`;
                    complexFilters.push({ filter: 'volume', options: this.settings.bgm.volume || 0.1, inputs: bgmInputLabel, outputs: 'bgm_vol' });
                    complexFilters.push({ filter: 'amix', options: { inputs: 2, duration: 'longest', dropout_transition: 0 }, inputs: [speechLabel, 'bgm_vol'], outputs: 'a_mixed' });
                    finalAudioLabel = 'a_mixed';
                }

                if (complexFilters.length > 0) command.complexFilter(complexFilters);
                command.map(lastVideoLabel).map(finalAudioLabel);
                if (this.settings.duration > 0) command.duration(this.settings.duration);

                command
                    .on('error', (err, stdout, stderr) => {
                        console.error('FFmpeg Error:', err.message);
                        reject(new Error(err.message + ' | ' + stderr));
                    })
                    .on('end', () => {
                        if (fs.existsSync(mergedAudioPath)) fs.unlinkSync(mergedAudioPath);
                        if (assPath && fs.existsSync(assPath)) fs.unlinkSync(assPath);
                        resolve(this.outputPath);
                    })
                    .save(this.outputPath);

            } catch (err) {
                reject(err);
            }
        });
    }

    createAssFile(segments, outputPath) {
        // Style parameters:
        // Fontsize: 28 (Standard readable size)
        // PrimaryColour: &H00000000 (Black text)
        // BackColour: &H00FFFFFF (Solid White box)
        // BorderStyle: 3 (Opaque box)
        // Outline: 3 (Acts as padding for the box in BorderStyle 3)
        // Shadow: 0
        // Alignment: 2 (Bottom center)
        // MarginV: 150 (Distance from bottom)
        
        let content = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${this.settings.width}\nPlayResY: ${this.settings.height}\n\n[v4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,sans-serif,28,&H00000000,&H000000FF,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,3,0,2,20,20,150,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

        segments.forEach(seg => {
            const start = this.formatAssTime(seg.startTime);
            const end = this.formatAssTime(seg.startTime + (seg.duration || 2));
            const text = seg.text.replace(/\n/g, '\\N');
            content += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
        });

        fs.writeFileSync(outputPath, content, 'utf8');
    }

    formatAssTime(seconds) {
        const date = new Date(seconds * 1000);
        const hh = date.getUTCHours().toString().padStart(1, '0');
        const mm = date.getUTCMinutes().toString().padStart(2, '0');
        const ss = date.getUTCSeconds().toString().padStart(2, '0');
        const ms = Math.floor(date.getUTCMilliseconds() / 10).toString().padStart(2, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
    }

    async createMergedAudio(sfxList, outputPath) {
        return new Promise((resolve, reject) => {
            if (!sfxList || sfxList.length === 0) {
                ffmpeg().input('anullsrc=r=44100:cl=stereo').inputFormat('lavfi').duration(1).save(outputPath).on('end', resolve).on('error', reject);
                return;
            }
            let cmd = ffmpeg();
            let filters = [];
            let inputs = [];
            sfxList.forEach((sfx, i) => {
                cmd.input(sfx.path);
                const inputLabel = `${i}:a`;
                const resampledLabel = `r${i}`;
                const delayedLabel = `a${i}`;
                filters.push({ filter: 'aresample', options: '44100', inputs: inputLabel, outputs: resampledLabel });
                filters.push({ filter: 'adelay', options: `${Math.floor(sfx.startTime * 1000)}|${Math.floor(sfx.startTime * 1000)}`, inputs: resampledLabel, outputs: delayedLabel });
                inputs.push(delayedLabel);
            });
            filters.push({ filter: 'amix', options: { inputs: inputs.length, duration: 'longest', dropout_transition: 0 }, inputs: inputs, outputs: 'out' });
            cmd.complexFilter(filters).map('out').on('end', resolve).on('error', (err, stdout, stderr) => reject(err)).save(outputPath);
        });
    }
}

module.exports = VideoProcessor;
