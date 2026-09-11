document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const addTextBtn = document.getElementById('add-text-btn');
    const fontUpload = document.getElementById('font-upload');
    const layerList = document.getElementById('layer-list');
    const propertiesContent = document.getElementById('properties-content');
    const exportPngBtn = document.getElementById('export-png-btn');
    const exportWebmBtn = document.getElementById('export-webm-btn');
    const playMotionBtn = document.getElementById('play-motion-btn');
    const canvasRatio = document.getElementById('canvas-ratio');
    const videoDurationSelect = document.getElementById('video-duration');
    const resetProjectBtn = document.getElementById('reset-project-btn');

    let activeElement = null;
    let customFonts = [];
    let uid = 0;

    const MOTIONS = [
        { value: '', label: 'None' },
        { value: 'motion-fade', label: 'Fade In' },
        { value: 'motion-pulse', label: 'Pulse Glow' },
        { value: 'motion-zoom', label: 'Pop Zoom' },
        { value: 'motion-slide-up', label: 'Slide Up' }
    ];

    const PROJECT_KEY = 'textcraft_project_v7';

    // ----------------------------------------------------------------
    // INDEXEDDB FONT SYSTEM (Lifetime font storage)
    // ----------------------------------------------------------------
    function openFontDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TextCraftFontDB_v2', 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('fonts')) {
                    db.createObjectStore('fonts', { keyPath: 'name' });
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveFontToStorage(name, buffer) {
        const db = await openFontDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('fonts', 'readwrite');
            tx.objectStore('fonts').put({ name, data: buffer });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async function loadStoredFonts() {
        try {
            const db = await openFontDB();
            const tx = db.transaction('fonts', 'readonly');
            const request = tx.objectStore('fonts').getAll();
            const records = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (e) => reject(e.target.error);
            });

            for (const fontData of records) {
                try {
                    const font = new FontFace(fontData.name, fontData.data);
                    const loaded = await font.load();
                    document.fonts.add(loaded);
                    if (!customFonts.includes(fontData.name)) {
                        customFonts.push(fontData.name);
                    }
                } catch (err) {
                    console.error(`Font "${fontData.name}" failed:`, err);
                }
            }
        } catch (err) {
            console.error('Failed to load saved fonts:', err);
        }
    }

    // Load fonts and initial state
    (async () => {
        await loadStoredFonts();
        restoreProject();
    })();

    // ----------------------------------------------------------------
    // AUTOSAVE ENGINE
    // ----------------------------------------------------------------
    function saveProject() {
        const layers = Array.from(canvas.querySelectorAll('.draggable-text')).map(el => ({
            id: el.dataset.id,
            text: el.innerText,
            left: el.style.left,
            top: el.style.top,
            fontSize: el.style.fontSize,
            fontFamily: el.style.fontFamily,
            color: el.style.color,
            glowColor: el.dataset.glowColor || '',
            glowRadius: el.dataset.glowRadius || '0',
            preset: el.dataset.preset || '',
            motion: el.dataset.motion || ''
        }));

        const project = { ratio: canvasRatio.value, layers };
        localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
    }

    function restoreProject() {
        let project = null;
        try {
            project = JSON.parse(localStorage.getItem(PROJECT_KEY));
        } catch(e) {}

        if (!project || !project.layers) return;

        canvasRatio.value = project.ratio || 'ratio-1-1';
        canvas.className = `transparent-canvas ${canvasRatio.value}`;

        project.layers.forEach(data => {
            const el = createTextElement(data.text);
            el.dataset.id = data.id || String(uid++);
            el.style.left = data.left || '50px';
            el.style.top = data.top || '50px';
            el.style.fontSize = data.fontSize || '50px';
            el.style.fontFamily = data.fontFamily || 'sans-serif';
            el.style.color = data.color || '#ffffff';

            if (data.glowColor) {
                applyGlow(el, data.glowColor, data.glowRadius || 10);
            }
            if (data.preset) applyPresetToElement(el, data.preset);
            if (data.motion) {
                el.classList.add(data.motion);
                el.dataset.motion = data.motion;
            }

            canvas.appendChild(el);
        });
        updateLayers();
    }

    // ----------------------------------------------------------------
    // CUSTOMIZATIONS & PROPERTIES
    // ----------------------------------------------------------------
    function createTextElement(text) {
        const textEl = document.createElement('div');
        textEl.className = 'draggable-text';
        textEl.contentEditable = true;
        textEl.innerText = text;
        textEl.dataset.id = String(uid++);
        textEl.style.color = '#ffffff';

        enableDragging(textEl);
        textEl.addEventListener('click', (e) => {
            e.stopPropagation();
            selectText(textEl);
        });
        textEl.addEventListener('input', () => {
            updateLayerLabelOnly(textEl);
            saveProject();
        });

        return textEl;
    }

    function applyGlow(el, color, radius) {
        el.dataset.glowColor = color;
        el.dataset.glowRadius = radius;
        if (radius > 0) {
            el.style.textShadow = `0 0 ${radius}px ${color}, 0 0 ${radius*2}px ${color}`;
        } else {
            el.style.textShadow = 'none';
        }
    }

    function renderProperties() {
        if (!activeElement) return;

        const fontOptions = `
            <option value="sans-serif">Default Sans-Serif</option>
            <option value="'Hind Siliguri', sans-serif">Bangla (Hind Siliguri)</option>
        ` + customFonts.map(f => `<option value="${f}">${f}</option>`).join('');

        const currentFont = activeElement.style.fontFamily || 'sans-serif';
        const currentMotion = activeElement.dataset.motion || '';
        const currentColor = rgbToHex(activeElement.style.color) || '#ffffff';
        const currentGlowColor = activeElement.dataset.glowColor || '#00f2fe';
        const currentGlowRadius = activeElement.dataset.glowRadius || 0;

        propertiesContent.innerHTML = `
            <div class="prop-group">
                <label>Text Content</label>
                <input type="text" id="prop-text-input" class="prop-input" value="${activeElement.innerText}">
            </div>
            <div class="prop-group">
                <label>Text Color</label>
                <input type="color" id="prop-color" class="prop-input" value="${currentColor}">
            </div>
            <div class="prop-group">
                <label>Glow Color</label>
                <input type="color" id="prop-glow-color" class="prop-input" value="${currentGlowColor}">
            </div>
            <div class="prop-group">
                <label>Glow Radius (${currentGlowRadius}px)</label>
                <input type="range" id="prop-glow-radius" min="0" max="40" value="${currentGlowRadius}">
            </div>
            <div class="prop-group">
                <label>Font Family</label>
                <select id="prop-font" class="prop-input">${fontOptions}</select>
            </div>
            <div class="prop-group">
                <label>Font Size</label>
                <input type="range" id="prop-size" min="16" max="150" value="${parseInt(activeElement.style.fontSize) || 50}">
            </div>
            <div class="prop-group">
                <label>Motion FX</label>
                <select id="prop-motion" class="prop-input">
                    ${MOTIONS.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
                </select>
            </div>
            <button id="delete-layer-btn" class="btn btn-danger" style="width:100%; margin-top:10px;">Delete Layer</button>
        `;

        document.getElementById('prop-font').value = currentFont;
        document.getElementById('prop-motion').value = currentMotion;

        // Listeners for Live Editing
        document.getElementById('prop-text-input').addEventListener('input', (e) => {
            activeElement.innerText = e.target.value;
            updateLayerLabelOnly(activeElement);
            saveProject();
        });
        document.getElementById('prop-color').addEventListener('input', (e) => {
            activeElement.style.color = e.target.value;
            saveProject();
        });
        document.getElementById('prop-glow-color').addEventListener('input', (e) => {
            const rad = document.getElementById('prop-glow-radius').value;
            applyGlow(activeElement, e.target.value, rad);
            saveProject();
        });
        document.getElementById('prop-glow-radius').addEventListener('input', (e) => {
            const col = document.getElementById('prop-glow-color').value;
            applyGlow(activeElement, col, e.target.value);
            saveProject();
        });
        document.getElementById('prop-font').addEventListener('change', (e) => {
            activeElement.style.fontFamily = e.target.value;
            saveProject();
        });
        document.getElementById('prop-size').addEventListener('input', (e) => {
            activeElement.style.fontSize = `${e.target.value}px`;
            saveProject();
        });
        document.getElementById('prop-motion').addEventListener('change', (e) => {
            MOTIONS.forEach(m => { if(m.value) activeElement.classList.remove(m.value); });
            if (e.target.value) activeElement.classList.add(e.target.value);
            activeElement.dataset.motion = e.target.value;
            saveProject();
        });
        document.getElementById('delete-layer-btn').addEventListener('click', () => {
            activeElement.remove();
            activeElement = null;
            propertiesContent.innerHTML = '<p class="empty-msg">ক্যানভাস থেকে যেকোনো টেক্সট সিলেক্ট করুন</p>';
            updateLayers();
            saveProject();
        });
    }

    // Helper functions
    function rgbToHex(rgb) {
        if (!rgb) return '#ffffff';
        const res = rgb.match(/\d+/g);
        return res ? "#" + ((1 << 24) + (+res[0] << 16) + (+res[1] << 8) + +res[2]).toString(16).slice(1) : rgb;
    }

    function selectText(el) {
        if (activeElement) activeElement.classList.remove('selected');
        activeElement = el;
        activeElement.classList.add('selected');
        renderProperties();
        updateLayers();
    }

    function enableDragging(el) {
        let isDragging = false, startX, startY, initLeft, initTop;
        el.addEventListener('mousedown', (e) => {
            if (document.activeElement === el) return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            initLeft = el.offsetLeft; initTop = el.offsetTop;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        function onMove(e) {
            if (!isDragging) return;
            el.style.left = `${initLeft + e.clientX - startX}px`;
            el.style.top = `${initTop + e.clientY - startY}px`;
        }
        function onUp() {
            if (isDragging) saveProject();
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
    }

    function updateLayers() {
        layerList.innerHTML = '';
        canvas.querySelectorAll('.draggable-text').forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'layer-card' + (item === activeElement ? ' active-layer' : '');
            card.dataset.id = item.dataset.id;
            card.innerHTML = `<span>Layer ${idx + 1}</span> <b>${item.innerText.substring(0, 8)}</b>`;
            card.addEventListener('click', () => selectText(item));
            layerList.appendChild(card);
        });
    }

    function updateLayerLabelOnly(el) {
        const card = layerList.querySelector(`.layer-card[data-id="${el.dataset.id}"]`);
        if (card) card.querySelector('b').innerText = el.innerText.substring(0, 8);
    }

    function applyPresetToElement(el, presetType) {
        el.className = 'draggable-text' + (el === activeElement ? ' selected' : '');
        el.classList.add(`fx-${presetType}`);
        el.dataset.preset = presetType;
    }

    document.querySelectorAll('.preset-card').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!activeElement) return;
            applyPresetToElement(activeElement, btn.dataset.preset);
            saveProject();
        });
    });

    addTextBtn.addEventListener('click', () => {
        const el = createTextElement('নতুন টেক্সট');
        canvas.appendChild(el);
        selectText(el);
        updateLayers();
        saveProject();
    });

    fontUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fontName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now().toString(36);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const buffer = evt.target.result;
            const font = new FontFace(fontName, buffer);
            await font.load();
            document.fonts.add(font);
            await saveFontToStorage(fontName, buffer);
            customFonts.push(fontName);
            alert(`Font '${fontName}' Permanent Load Complete!`);
            if (activeElement) renderProperties();
        };
        reader.readAsArrayBuffer(file);
    });

    playMotionBtn.addEventListener('click', () => {
        canvas.querySelectorAll('.draggable-text').forEach(item => {
            const motion = item.dataset.motion;
            if (motion) {
                item.classList.remove(motion);
                void item.offsetWidth;
                item.classList.add(motion);
            }
        });
    });

    canvasRatio.addEventListener('change', (e) => {
        canvas.className = `transparent-canvas ${e.target.value}`;
        saveProject();
    });

    resetProjectBtn.addEventListener('click', () => {
        if (confirm('সব লেয়ার মুছে ফেলবেন?')) {
            canvas.innerHTML = '';
            activeElement = null;
            propertiesContent.innerHTML = '<p class="empty-msg">ক্যানভাস থেকে যেকোনো টেক্সট সিলেক্ট করুন</p>';
            updateLayers();
            saveProject();
        }
    });

    // ----------------------------------------------------------------
    // PERFECT WEBM RECORDING ENGINE (Fixes Black Screen & Dark Shadows)
    // ----------------------------------------------------------------
    exportWebmBtn.addEventListener('click', async () => {
        if (activeElement) activeElement.classList.remove('selected');
        exportWebmBtn.innerText = '⏳ Exporting...';
        exportWebmBtn.disabled = true;

        playMotionBtn.click();

        const duration = parseInt(videoDurationSelect.value) || 3000;
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.clientWidth;
        offscreenCanvas.height = canvas.clientHeight;
        const ctx = offscreenCanvas.getContext('2d');

        const stream = offscreenCanvas.captureStream(30);
        let recorder;
        try {
            recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        } catch(e) {
            recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        }

        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'textcraft-animation.webm';
            a.click();

            exportWebmBtn.innerText = '🎬 Export WebM';
            exportWebmBtn.disabled = false;
            if (activeElement) activeElement.classList.add('selected');
        };

        recorder.start();

        const startTime = Date.now();
        const renderLoop = async () => {
            if (Date.now() - startTime < duration) {
                // background: null keeps transparency intact without black box
                const cvs = await html2canvas(canvas, { 
                    backgroundColor: null, 
                    scale: 1,
                    logging: false,
                    useCORS: true
                });
                ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                ctx.drawImage(cvs, 0, 0);
                setTimeout(renderLoop, 1000 / 30);
            } else {
                recorder.stop();
            }
        };

        renderLoop();
    });

    exportPngBtn.addEventListener('click', () => {
        if (activeElement) activeElement.classList.remove('selected');
        html2canvas(canvas, { backgroundColor: null, scale: 2 }).then(cvs => {
            const a = document.createElement('a');
            a.download = 'textcraft-image.png';
            a.href = cvs.toDataURL('image/png');
            a.click();
            if (activeElement) activeElement.classList.add('selected');
        });
    });

    canvas.addEventListener('click', (e) => {
        if (e.target === canvas && activeElement) {
            activeElement.classList.remove('selected');
            activeElement = null;
            propertiesContent.innerHTML = '<p class="empty-msg">ক্যানভাস থেকে যেকোনো টেক্সট সিলেক্ট করুন</p>';
            updateLayers();
        }
    });
});
