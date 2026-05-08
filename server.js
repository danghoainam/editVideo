const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const VideoProcessor = require('./index'); 
const Dubber = require('./dubber');
const { translate } = require('google-translate-api-x');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'input';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'video.mp4');
    }
});

const upload = multer({ storage });

app.post('/upload', upload.single('video'), (req, res) => {
    res.json({ message: 'Tải video thành công' });
});

app.post('/process', async (req, res) => {
    const options = req.body;
    console.log('Bắt đầu xử lý với options:', JSON.stringify(options, null, 2));

    try {
        const inputPath = path.join(__dirname, 'input', 'video.mp4');
        const outputPath = path.join(__dirname, 'output', `result_${Date.now()}.mp4`);
        
        if (!fs.existsSync('output')) fs.mkdirSync('output');

        // Lấy thông tin video ngay từ đầu (độ dài và khung hình)
        const videoInfo = await new Promise((resolve) => {
            ffmpeg.ffprobe(inputPath, (err, metadata) => {
                if (err) return resolve({ duration: 0, width: 1280, height: 720 });
                const stream = metadata.streams.find(s => s.codec_type === 'video');
                resolve({
                    duration: metadata.format.duration,
                    width: stream ? stream.width : 1280,
                    height: stream ? stream.height : 720
                });
            });
        });

        const videoDuration = videoInfo.duration;

        let finalSfx = [];
        const dubber = new Dubber();
        const tempDir = path.join(__dirname, 'assets', 'temp_dub');

        if (options.dubbing && options.dubbing.enabled) {
            console.log('Generating AI Voice-over...');
            
            for (let seg of options.dubbing.segments) {
                const hasChinese = /[\u4e00-\u9fa5]/.test(seg.text);
                if (hasChinese) {
                    try {
                        const translation = await translate(seg.text, { to: 'vi' });
                        seg.text = translation.text;
                    } catch (e) {
                        console.error('Auto-translation error', e);
                    }
                }
            }

            const dubSfx = await dubber.processSegments(
                options.dubbing.segments,
                options.dubbing.voice,
                tempDir,
                options.dubbing.voiceRate || '+0%',
                options.dubbing.voicePitch || '+0Hz',
                options.dubbing.apiKey,
                videoDuration
            );
            finalSfx = [...finalSfx, ...dubSfx];
        }

        const processor = new VideoProcessor(inputPath, outputPath);
        
        // Background Music Selection
        let bgmOption = null;
        if (options.bgm && options.bgm.enabled) {
            const bgmDir = path.join(__dirname, 'assets', 'bgm');
            if (fs.existsSync(bgmDir)) {
                const bgmFiles = fs.readdirSync(bgmDir).filter(f => f.toLowerCase().endsWith('.mp3'));
                if (bgmFiles.length > 0) {
                    const randomBgm = bgmFiles[Math.floor(Math.random() * bgmFiles.length)];
                    bgmOption = {
                        path: path.join(bgmDir, randomBgm),
                        volume: options.bgm.volume || 0.1
                    };
                    console.log(`[BGM] Selected random music: ${randomBgm}`);
                }
            }
        }

        const resultPath = await processor.setOptions({
            ...options,
            bgm: bgmOption,
            sfx: finalSfx,
            duration: videoDuration,
            width: videoInfo.width,
            height: videoInfo.height
        }).process();

        res.json({ success: true, downloadUrl: `/output/${path.basename(resultPath)}` });
    } catch (err) {
        const errorMsg = err && err.message ? err.message : 'Lỗi không xác định';
        console.error('CRITICAL PROCESS ERROR:', err);
        res.status(500).json({ success: false, error: errorMsg });
    }
});

app.post('/translate', async (req, res) => {
    const { text, to } = req.body;
    try {
        const result = await translate(text, { to: to || 'vi' });
        res.json({ text: result.text });
    } catch (err) {
        console.error('Translation error:', err);
        res.status(500).json({ error: 'Lỗi dịch: ' + err.message });
    }
});

app.get('/video-info', (req, res) => {
    const videoPath = path.join(__dirname, 'input', 'video.mp4');
    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Chưa tải video' });
    
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return res.status(500).json({ error: 'Lỗi đọc video' });
        res.json({ duration: metadata.format.duration });
    });
});

app.use('/output', express.static(path.join(__dirname, 'output')));

app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});
