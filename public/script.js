const dropZone = document.getElementById('drop-zone');
const videoInput = document.getElementById('video-input');
const fileInfo = document.getElementById('file-info');
const fileNameSpan = document.getElementById('file-name');
const processBtn = document.getElementById('process-btn');
const segmentsContainer = document.getElementById('segments-container');
const addSegmentBtn = document.getElementById('add-segment');

let selectedFile = null;

// File Upload Logic
dropZone.onclick = () => videoInput.click();

videoInput.onchange = (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
};

dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#6366f1';
};

dropZone.ondrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
};

async function handleFile(file) {
    selectedFile = file;
    fileNameSpan.innerText = file.name;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');

    // Upload immediately to server
    const formData = new FormData();
    formData.append('video', file);

    processBtn.disabled = true;
    processBtn.innerText = "ĐANG TẢI VIDEO...";

    try {
        await fetch('/upload', { method: 'POST', body: formData });
        processBtn.disabled = false;
        processBtn.innerText = "BẮT ĐẦU XỬ LÝ";
    } catch (err) {
        alert("Lỗi khi tải video lên!");
    }
}

// Sliders value update
const sliders = ['zoom', 'speed', 'brightness', 'contrast', 'saturation'];
sliders.forEach(id => {
    const el = document.getElementById(id);
    const val = document.getElementById(`${id.substring(0, 6)}-val`); // mapping id to val span
    el.oninput = () => {
        const span = document.getElementById(`${id === 'brightness' ? 'bright' : id === 'saturation' ? 'satur' : id.substring(0, 8)}-val`);
        if (span) span.innerText = el.value;
    };
});

// Dubbing Segments
addSegmentBtn.onclick = () => {
    const div = document.createElement('div');
    div.className = 'segment-item';
    div.innerHTML = `
        <input type="number" placeholder="Giây" class="seg-time">
        <input type="text" placeholder="Nội dung" class="seg-text">
        <button class="btn-translate-single" title="Dịch sang tiếng Việt">🔄</button>
    `;
    segmentsContainer.appendChild(div);
};

// SRT Upload handling
const srtBtn = document.getElementById('srt-btn');
const srtInput = document.getElementById('srt-input');

if (srtBtn) {
    srtBtn.onclick = () => srtInput.click();

    srtInput.onchange = async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('srt', file);
            
            try {
                const res = await fetch('/parse-srt', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.segments) {
                    segmentsContainer.innerHTML = '';
                    data.segments.forEach(seg => {
                        const div = document.createElement('div');
                        div.className = 'segment-item';
                        div.innerHTML = `
                            <input type="number" placeholder="Giây" class="seg-time" value="${seg.time}">
                            <input type="text" placeholder="Nội dung" class="seg-text" value="${seg.text}">
                            <button class="btn-translate-single" title="Dịch sang tiếng Việt">🔄</button>
                        `;
                        segmentsContainer.appendChild(div);
                    });
                    alert("Đã nhập phụ đề thành công! Bạn có thể nhấn 'BẮT ĐẦU XỬ LÝ' ngay.");
                }
            } catch (err) {
                alert("Lỗi khi đọc file .srt");
            }
        }
    };
}

// Bulk Text handling
const bulkBtn = document.getElementById('bulk-text-btn');
const bulkContainer = document.getElementById('bulk-text-container');
const bulkInput = document.getElementById('bulk-text-input');
const applyBulkBtn = document.getElementById('apply-bulk-text');

if (bulkBtn) {
    bulkBtn.onclick = () => bulkContainer.classList.toggle('hidden');

    applyBulkBtn.onclick = async () => {
        const text = bulkInput.value.trim();
        if (!text) return;
        
        // Split by common Chinese/Vietnamese punctuation
        const sentences = text.split(/[，。！？\n,!?]/).filter(s => s.trim().length > 1);
        
        applyBulkBtn.disabled = true;
        applyBulkBtn.innerText = "⏳ Đang tách câu & Dịch...";
        
        segmentsContainer.innerHTML = '';
        let currentTime = 0.5;
        
        for (let s of sentences) {
            const row = document.createElement('div');
            row.className = 'segment-item';
            row.innerHTML = `
                <input type="number" class="seg-time" value="${currentTime.toFixed(1)}">
                <input type="text" class="seg-text" value="${s.trim()}">
                <button class="btn-translate-single">🔄</button>
            `;
            segmentsContainer.appendChild(row);
            
            // Trigger translation for this row
            const translateBtn = row.querySelector('.btn-translate-single');
            translateBtn.click(); 

            currentTime += 4.0; // Estimated time per sentence
        }
        
        applyBulkBtn.disabled = false;
        applyBulkBtn.innerText = "Tách câu & Dịch";
        bulkContainer.classList.add('hidden');
    };
}

// Auto-sync Timing
const syncBtn = document.getElementById('sync-btn');
if (syncBtn) {
    syncBtn.onclick = async () => {
        if (!selectedFile) return alert("Vui lòng tải video lên trước!");
        
        try {
            const res = await fetch('/video-info');
            const data = await res.json();
            const duration = parseFloat(data.duration);
            
            const rows = Array.from(document.querySelectorAll('.segment-item'));
            if (rows.length === 0) return;
            
            // Calculate gap so last sentence has about 1.5s to finish
            const gap = (duration - 1.5) / (rows.length - 1); 
            rows.forEach((row, i) => {
                const timeInput = row.querySelector('.seg-time');
                timeInput.value = (0.5 + i * gap).toFixed(1);
            });
            
            alert(`Đã căn chỉnh ${rows.length} câu vào video dài ${duration.toFixed(1)}s!`);
        } catch (err) {
            alert("Lỗi khi lấy thông tin video");
        }
    };
}

// Bulk and Single Translation logic
document.addEventListener('click', async (e) => {
    if (e.target && e.target.classList.contains('btn-translate-single')) {
        const row = e.target.closest('.segment-item');
        const input = row.querySelector('.seg-text');
        const text = input.value.trim();
        
        if (!text) return;
        
        const originalIcon = e.target.innerText;
        e.target.innerText = "⏳";
        try {
            const res = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await res.json();
            if (data.text) {
                input.value = data.text;
            } else if (data.error) {
                alert("Lỗi dịch: " + data.error);
            }
        } catch (err) {
            alert("Lỗi kết nối bộ dịch!");
        } finally {
            e.target.innerText = originalIcon;
        }
    }
});

// Voice rate & Pitch sliders update
const voiceRate = document.getElementById('voice-rate');
const vRateVal = document.getElementById('v-rate-val');
const voicePitch = document.getElementById('voice-pitch');
const vPitchVal = document.getElementById('v-pitch-val');

voiceRate.oninput = () => {
    const v = parseInt(voiceRate.value);
    vRateVal.innerText = (v >= 0 ? '+' : '') + v;
};
voicePitch.oninput = () => {
    const v = parseInt(voicePitch.value);
    vPitchVal.innerText = (v >= 0 ? '+' : '') + v;
};

const bgmVolume = document.getElementById('bgm-volume');
const bgmVolVal = document.getElementById('bgm-vol-val');
bgmVolume.oninput = () => {
    bgmVolVal.innerText = Math.round(bgmVolume.value * 100);
};

// Process
processBtn.onclick = async () => {
    const options = {
        zoom: parseFloat(document.getElementById('zoom').value),
        speed: parseFloat(document.getElementById('speed').value),
        color: {
            brightness: parseFloat(document.getElementById('brightness').value),
            contrast: parseFloat(document.getElementById('contrast').value),
            saturation: parseFloat(document.getElementById('saturation').value)
        },
        logo: {
            enabled: document.getElementById('logo-enabled').checked,
            text: document.getElementById('logo-text').value
        },
        subtitles: {
            enabled: document.getElementById('sub-enabled').checked
        },
        bgm: {
            enabled: document.getElementById('bgm-enabled').checked,
            volume: parseFloat(bgmVolume.value)
        },
        dubbing: {
            enabled: document.getElementById('dub-enabled').checked,
            voice: document.getElementById('voice').value,
            voiceRate: (parseInt(voiceRate.value) >= 0 ? '+' : '') + voiceRate.value + '%',
            voicePitch: (parseInt(voicePitch.value) >= 0 ? '+' : '') + voicePitch.value + 'Hz',
            apiKey: localStorage.getItem('openai_key'),
            segments: Array.from(document.querySelectorAll('.segment-item')).map(item => ({
                time: parseFloat(item.querySelector('.seg-time').value || 0),
                text: item.querySelector('.seg-text').value
            })).filter(s => s.text)
        }
    };

    document.getElementById('status-container').classList.remove('hidden');
    document.getElementById('result-container').classList.add('hidden');
    processBtn.disabled = true;

    try {
        const res = await fetch('/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('download-link').href = data.downloadUrl;
            document.getElementById('result-container').classList.remove('hidden');
        } else {
            alert("Lỗi: " + data.error);
        }
    } catch (err) {
        alert("Lỗi kết nối server!");
    } finally {
        processBtn.disabled = false;
        document.getElementById('status-container').classList.add('hidden');
    }
};
