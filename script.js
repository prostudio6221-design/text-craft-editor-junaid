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

    const PROJECT_KEY = 'textcraft_project_v9';

    // INDEXEDDB FONT ENGINE
    function openFontDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TextCraftFontDB_v9', 1);
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
                    if (!customFonts.includes(fontData.name)) customFonts.push(fontData.name);
                } catch (err) { console.error('Font err:', err); }
            }
        } catch (err) { console.error('DB err:', err); }
    }

    (async () => {
        await loadStoredFonts();
        restoreProject();
    })();

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
        localStorage.setItem(PROJECT_KEY, JSON.stringify({ ratio: canvasRatio.value, layers }));
    }

    function restoreProject() {
        let project = null;
        try { project = JSON.parse(localStorage.getItem(PROJECT_KEY)); } catch(e){}
        if (!project || !project.layers) return;

        canvasRatio.value = project.ratio || 'ratio-1-1';
        canvas.className = `transparent-canvas ${canvasRatio.value}`;

        project.layers.forEach(data => {
            const el = createTextElement(data.text);
            el.dataset.id = data.id || String(uid++);
            el.style.left = data.left || '50px';
            el.style.top = data.top || '50px';
            el.style.fontSize = data.fontSize || '55px';
            el.style.fontFamily = data.fontFamily || "'Segoe UI', sans-serif";
            el.style.color = data.color || '#ffffff';

            if (data.glowColor) applyGlow(el, data.glowColor, data.glowRadius || 10);
            if (data.preset) applyPresetToElement(el, data.preset);
            if (data.motion) {
                el.classList.add(data.motion);
                el.dataset.motion = data.motion;
            }
            canvas.appendChild(el);
        });
        updateLayers();
    }

    function createTextElement(text) {
        const textEl = document.createElement('div');
        textEl.className = 'draggable-text';
        textEl.contentEditable = true;
        textEl.innerText = text;
        textEl.dataset.id = String(uid++);
        textEl.style.color = '#ffffff';

        enableDragging(textEl);
        textEl.addEventListener('click', (e) => { e.stopPropagation(); selectText(textEl); });
        textEl.addEventListener('input', () => { updateLayerLabelOnly(textEl); saveProject(); });
        return textEl;
    }

    function applyGlow(el, color, radius) {
        el.dataset.glowColor = color;
        el.dataset.glowRadius = radius;
        if (parseInt(radius) > 0) {
            el.style.textShadow = `0 0 ${radius}px ${color}, 0 0 ${radius*2}px ${color}`;
        } else {
            el.style.textShadow = 'none';
        }
    }

    function renderProperties() {
        if (!activeElement) return;

        const fontOptions = `
            <option value="'Segoe UI', sans-serif">Standard Font</option>
        ` + customFonts.map(f => `<option value="${f}">${f} (Custom)</option>`).join('');

        const currentFont = activeElement.style.fontFamily || "'Segoe UI', sans-serif";
        const currentMotion = activeElement.dataset.motion || '';
        const currentColor = rgbToHex(activeElement.style.color) || '#ffffff';
        const currentGlowColor = activeElement.dataset.glowColor || '#00f2fe';
        const currentGlowRadius = activeElement.dataset.glowRadius || '0';

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
                <label>Neon Glow Color</label>
                <input type="color" id="prop-glow-color" class="prop-input" value="${currentGlowColor}">
            </div>
            <div class="prop-group">
                <label>Glow Power (${currentGlowRadius}px)</label>
                <input type="range" id="prop-glow-radius" min="0" max="50" value="${currentGlowRadius}">
            </div>
            <div class="prop-group">
                <label>Font Family</label>
                <select id="prop-font" class="prop-input">${fontOptions}</select>
            </div>
            <div class="prop-group">
                <label>Font Size (${parseInt(activeElement.style.fontSize) || 55}px)</label>
                <input type="range" id="prop-size" min="16" max="150" value="${parseInt(activeElement.style.fontSize) || 55}">
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
            applyGlow(activeElement, e.target.value, document.getElementById('prop-glow-radius').value);
            saveProject();
        });
        document.getElementById('prop-glow-radius').addEventListener('input', (e) => {
            applyGlow(activeElement, document.getElementById('prop-glow-color').value, e.target.value);
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
        const keep = Array.from(el.classList).filter(c => !c.startsWith('fx-'));
        el.className = keep.join(' ');
        if (!el.classList.contains('draggable-text')) el.classList.add('draggable-text');
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
        const el = createTextElement('আমার পরানো');
        el.style.left = '50px';
        el.style.top = '100px';
        el.style.fontSize = '55px';
        applyPresetToElement(el, 'cyan-glass');
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
            alert(`ফন্ট '${fontName}' সফলভাবে যুক্ত হয়েছে!`);
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
        if (confirm('সব কিছু মুছে ফেলতে চান?')) {
            canvas.innerHTML = '';
            activeElement = null;
            propertiesContent.innerHTML = '<p class="empty-msg">ক্যানভাস থেকে যেকোনো টেক্সট সিলেক্ট করুন</p>';
            updateLayers();
            saveProject();
        }
    });

    // ----------------------------------------------------------------
    // ULTRA HD TRANSPARENT WEBM RENDER ENGINE (CapCut Supported)
    // ----------------------------------------------------------------
    function renderElementToCanvasCtx(ctx, el, scale) {
        const rect = el.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        const x = (rect.left - canvasRect.left + (rect.width / 2)) * scale;
        const y = (rect.top - canvasRect.top + (rect.height / 2)) * scale;

        ctx.save();
        ctx.translate(x, y);

        const glowColor = el.dataset.glowColor;
        const glowRadius = (parseInt(el.dataset.glowRadius) || 0) * scale;
        if (glowRadius > 0 && glowColor) {
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = glowRadius;
        }

        const computedStyle = window.getComputedStyle(el);
        const fontSizePx = parseFloat(computedStyle.fontSize) * scale;
        
        ctx.font = `${computedStyle.fontWeight} ${fontSizePx}px ${computedStyle.fontFamily}`;
        ctx.fillStyle = computedStyle.color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillText(el.innerText, 0, 0);
        ctx.restore();
    }

    exportWebmBtn.addEventListener('click', async () => {
        if (activeElement) activeElement.classList.remove('selected');
        exportWebmBtn.innerText = '⏳ Rendering 4K Transparent...';
        exportWebmBtn.disabled = true;

        playMotionBtn.click();

        const duration = parseInt(videoDurationSelect.value) || 3000;
        const scale = 2; // High Resolution Scaling

        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = canvas.clientWidth * scale;
        renderCanvas.height = canvas.clientHeight * scale;
        const ctx = renderCanvas.getContext('2d', { alpha: true });

        // CapCut Compatibility WebM Mime Types
        let options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm;codecs=vp8' };
        }

        const stream = renderCanvas.captureStream(60);
        const recorder = new MediaRecorder(stream, options);

        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'capcut-ready-transparent-motion.webm';
            a.click();

            exportWebmBtn.innerText = '🎬 WebM (CapCut Ready)';
            exportWebmBtn.disabled = false;
            if (activeElement) activeElement.classList.add('selected');
        };

        recorder.start();

        const startTime = Date.now();
        const renderLoop = () => {
            if (Date.now() - startTime < duration) {
                ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
                canvas.querySelectorAll('.draggable-text').forEach(el => renderElementToCanvasCtx(ctx, el, scale));
                requestAnimationFrame(renderLoop);
            } else {
                recorder.stop();
            }
        };

        renderLoop();
    });

    exportPngBtn.addEventListener('click', () => {
        if (activeElement) activeElement.classList.remove('selected');
        const scale = 2;
        const pngCanvas = document.createElement('canvas');
        pngCanvas.width = canvas.clientWidth * scale;
        pngCanvas.height = canvas.clientHeight * scale;
        const ctx = pngCanvas.getContext('2d', { alpha: true });

        canvas.querySelectorAll('.draggable-text').forEach(el => renderElementToCanvasCtx(ctx, el, scale));

        const a = document.createElement('a');
        a.download = 'textcraft-ultra-hd.png';
        a.href = pngCanvas.toDataURL('image/png');
        a.click();
        if (activeElement) activeElement.classList.add('selected');
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
