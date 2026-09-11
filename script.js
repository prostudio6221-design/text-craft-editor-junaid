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
    const resetProjectBtn = document.getElementById('reset-project-btn');

    let activeElement = null;
    let customFonts = []; // font names currently loaded into document.fonts
    let uid = 0;

    const MOTIONS = [
        { value: '', label: 'None' },
        { value: 'motion-fade', label: 'Fade In' },
        { value: 'motion-pulse', label: 'Pulse Glow' },
        { value: 'motion-zoom', label: 'Pop Zoom' },
        { value: 'motion-bounce', label: 'Bounce In' },
        { value: 'motion-slide-up', label: 'Slide Up' },
        { value: 'motion-slide-left', label: 'Slide In (Left)' },
        { value: 'motion-slide-right', label: 'Slide In (Right)' },
        { value: 'motion-shake', label: 'Shake' },
        { value: 'motion-rotate-in', label: 'Rotate In' },
        { value: 'motion-elastic', label: 'Elastic Pop' },
        { value: 'motion-flicker', label: 'Neon Flicker' },
        { value: 'motion-glitch', label: 'Glitch' },
        { value: 'motion-wave', label: 'Gentle Wave' },
    ];

    const PROJECT_KEY = 'textcraft_project_v6';

    // ----------------------------------------------------------------
    // PERMANENT FONT STORAGE ENGINE (IndexedDB)
    // ----------------------------------------------------------------
    function openFontDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TextCraftFontDB', 1);
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

    // Loads every stored font into document.fonts and resolves once ALL
    // are actually ready to paint. Fonts used to "disappear" because the
    // canvas was restored before the async font load finished.
    async function loadStoredFonts() {
        try {
            const db = await openFontDB();
            const tx = db.transaction('fonts', 'readonly');
            const request = tx.objectStore('fonts').getAll();
            const records = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (e) => reject(e.target.error);
            });

            const loadPromises = records.map(async (fontData) => {
                try {
                    const font = new FontFace(fontData.name, fontData.data);
                    const loaded = await font.load();
                    document.fonts.add(loaded);
                    if (!customFonts.includes(fontData.name)) {
                        customFonts.push(fontData.name);
                    }
                } catch (err) {
                    console.error(`Font "${fontData.name}" failed to load:`, err);
                }
            });

            await Promise.all(loadPromises);
        } catch (err) {
            console.error('Failed to load saved fonts:', err);
        }
    }

    // ----------------------------------------------------------------
    // PROJECT AUTOSAVE (localStorage) — keeps every layer, preset,
    // motion, position and font choice across reloads.
    // ----------------------------------------------------------------
    function serializeLayer(el) {
        return {
            id: el.dataset.id,
            text: el.innerText,
            left: el.style.left,
            top: el.style.top,
            fontSize: el.style.fontSize,
            fontFamily: el.style.fontFamily,
            letterSpacing: el.style.letterSpacing,
            preset: el.dataset.preset || '',
            motion: el.dataset.motion || '',
        };
    }

    function saveProject() {
        const layers = Array.from(canvas.querySelectorAll('.draggable-text')).map(serializeLayer);
        const project = {
            ratio: canvasRatio.value,
            layers,
        };
        try {
            localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
        } catch (err) {
            console.error('Autosave failed:', err);
        }
    }

    function restoreProject() {
        let project;
        try {
            project = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null');
        } catch (err) {
            project = null;
        }
        if (!project || !Array.isArray(project.layers) || project.layers.length === 0) return false;

        if (project.ratio) {
            canvasRatio.value = project.ratio;
            canvas.className = `transparent-canvas ${project.ratio}`;
        }

        project.layers.forEach((layerData) => {
            const el = createTextElement(layerData.text || 'Text');
            el.dataset.id = layerData.id || String(uid++);
            el.style.left = layerData.left || '50px';
            el.style.top = layerData.top || '100px';
            el.style.fontSize = layerData.fontSize || '55px';
            el.style.fontFamily = layerData.fontFamily || "'Poppins', 'Hind Siliguri', sans-serif";
            el.style.letterSpacing = layerData.letterSpacing || '0px';
            if (layerData.preset) applyPresetToElement(el, layerData.preset);
            if (layerData.motion) {
                el.classList.add(layerData.motion);
                el.dataset.motion = layerData.motion;
            }
            canvas.appendChild(el);
        });

        return true;
    }

    // ----------------------------------------------------------------
    // BOOTSTRAP: load fonts first, THEN restore the saved project, so
    // custom fonts are guaranteed ready before layers try to use them.
    // ----------------------------------------------------------------
    (async () => {
        await loadStoredFonts();
        const restored = restoreProject();
        if (restored) updateLayers();
    })();

    canvasRatio.addEventListener('change', (e) => {
        canvas.className = `transparent-canvas ${e.target.value}`;
        saveProject();
    });

    // Font Upload Handler
    fontUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const fontName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now().toString(36);
        const reader = new FileReader();

        reader.onload = async (event) => {
            const buffer = event.target.result;
            try {
                const font = new FontFace(fontName, buffer);
                const loadedFont = await font.load();
                document.fonts.add(loadedFont);
                await saveFontToStorage(fontName, buffer);
                if (!customFonts.includes(fontName)) {
                    customFonts.push(fontName);
                }
                alert(`ফন্ট '${fontName}' ব্রাউজারে স্থায়ীভাবে সেভ হয়েছে!`);
                if (activeElement) renderProperties();
            } catch (err) {
                console.error('Font load failed:', err);
                alert('ফন্ট লোড করা যায়নি। ফাইলটি সঠিক .ttf/.otf/.woff কিনা যাচাই করুন।');
            }
        };
        reader.readAsArrayBuffer(file);
        fontUpload.value = '';
    });

    function createTextElement(text) {
        const textEl = document.createElement('div');
        textEl.className = 'draggable-text';
        textEl.contentEditable = true;
        textEl.innerText = text;
        textEl.dataset.id = String(uid++);

        enableDragging(textEl);
        textEl.addEventListener('click', (e) => {
            e.stopPropagation();
            selectText(textEl);
        });
        textEl.addEventListener('input', () => {
            updateLayers();
            saveProject();
        });
        textEl.addEventListener('blur', saveProject);

        return textEl;
    }

    addTextBtn.addEventListener('click', () => {
        const textEl = createTextElement('Breakdown');
        textEl.style.left = '50px';
        textEl.style.top = '100px';
        textEl.style.fontSize = '55px';
        textEl.style.fontFamily = "'Poppins', 'Hind Siliguri', sans-serif";

        applyPresetToElement(textEl, 'cyan-glass');

        canvas.appendChild(textEl);
        selectText(textEl);
        updateLayers();
        saveProject();
    });

    function enableDragging(el) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        el.addEventListener('mousedown', (e) => {
            if (document.activeElement === el) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = el.offsetLeft;
            initialTop = el.offsetTop;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            el.style.left = `${initialLeft + dx}px`;
            el.style.top = `${initialTop + dy}px`;
        }

        function onMouseUp() {
            if (isDragging) saveProject();
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }

    function selectText(el) {
        if (activeElement) activeElement.classList.remove('selected');
        activeElement = el;
        activeElement.classList.add('selected');
        renderProperties();
        updateLayers();
    }

    function renderProperties() {
        if (!activeElement) return;

        const fontOptions = `
            <option value="'Poppins', 'Hind Siliguri', sans-serif">English + বাংলা (ডিফল্ট)</option>
            <option value="'Hind Siliguri', sans-serif">Bangla (Hind Siliguri)</option>
            <option value="'Noto Sans Bengali', sans-serif">Bangla (Noto Sans Bengali)</option>
        ` + customFonts.map(f => `<option value="${f}">${f} (আপলোড করা)</option>`).join('');

        const currentFont = activeElement.style.fontFamily || "'Poppins', 'Hind Siliguri', sans-serif";
        const currentMotion = activeElement.dataset.motion || '';
        const motionOptions = MOTIONS.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
        const letterSpacing = parseFloat(activeElement.style.letterSpacing) || 0;

        propertiesContent.innerHTML = `
            <div class="prop-group">
                <label>Text Content</label>
                <input type="text" id="prop-text-input" class="prop-input" value="${activeElement.innerText}">
            </div>
            <div class="prop-group">
                <label>Font Family</label>
                <select id="prop-font" class="prop-input">${fontOptions}</select>
            </div>
            <div class="prop-group">
                <label>Font Size <span class="range-value" id="size-val">${parseInt(activeElement.style.fontSize) || 55}px</span></label>
                <input type="range" id="prop-size" min="16" max="150" value="${parseInt(activeElement.style.fontSize) || 55}">
            </div>
            <div class="prop-group">
                <label>Letter Spacing <span class="range-value" id="ls-val">${letterSpacing}px</span> — বাংলা লেখায় 0 রাখুন যাতে যুক্তাক্ষর না ভাঙে</label>
                <input type="range" id="prop-letter-spacing" min="-2" max="10" step="0.5" value="${letterSpacing}">
            </div>
            <div class="prop-group">
                <label>Motion FX</label>
                <select id="prop-motion" class="prop-input">${motionOptions}</select>
            </div>
            <button id="delete-layer-btn" style="width:100%; background:#ef4444; color:white; border:none; padding:10px; border-radius:6px; cursor:pointer; font-weight:bold; margin-top:10px;">Delete Element</button>
        `;

        propertiesContent.querySelector('#prop-font').value = currentFont;
        propertiesContent.querySelector('#prop-motion').value = currentMotion;

        document.getElementById('prop-text-input').addEventListener('input', (e) => {
            activeElement.innerText = e.target.value;
            updateLayers();
            saveProject();
        });
        document.getElementById('prop-font').addEventListener('change', (e) => {
            activeElement.style.fontFamily = e.target.value;
            saveProject();
        });
        document.getElementById('prop-size').addEventListener('input', (e) => {
            activeElement.style.fontSize = `${e.target.value}px`;
            document.getElementById('size-val').textContent = `${e.target.value}px`;
        });
        document.getElementById('prop-size').addEventListener('change', saveProject);
        document.getElementById('prop-letter-spacing').addEventListener('input', (e) => {
            activeElement.style.letterSpacing = `${e.target.value}px`;
            document.getElementById('ls-val').textContent = `${e.target.value}px`;
        });
        document.getElementById('prop-letter-spacing').addEventListener('change', saveProject);
        document.getElementById('prop-motion').addEventListener('change', (e) => {
            const chosen = e.target.value;
            MOTIONS.forEach(m => { if (m.value) activeElement.classList.remove(m.value); });
            if (chosen) activeElement.classList.add(chosen);
            activeElement.dataset.motion = chosen;
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

    const ALL_PRESETS = ['glass-frost','cyan-glass','gold-shine','neon-fire','metal-3d','holographic',
        'emerald-glass','purple-glow','chrome-mirror','gradient-fill','neon-sign','foil-rainbow',
        'comic-pop','paper-cut','sunset-gradient','retro-vhs','frosted'];

    function applyPresetToElement(el, presetType) {
        // Strip any previous fx-* class but keep base + selection + motion classes intact
        const keep = Array.from(el.classList).filter(c => !c.startsWith('fx-'));
        el.className = keep.join(' ');
        if (!el.classList.contains('draggable-text')) el.classList.add('draggable-text');

        if (ALL_PRESETS.includes(presetType)) {
            el.classList.add(`fx-${presetType}`);
            el.dataset.preset = presetType;
        }
    }

    document.querySelectorAll('.preset-card[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!activeElement) return;
            applyPresetToElement(activeElement, btn.dataset.preset);
            saveProject();
        });
    });

    function updateLayers() {
        layerList.innerHTML = '';
        const items = canvas.querySelectorAll('.draggable-text');
        items.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'layer-card' + (item === activeElement ? ' active-layer' : '');
            const label = (item.innerText || '').substring(0, 10);
            card.innerHTML = `<span>Layer ${idx + 1}</span> <b>${label}${item.innerText.length > 10 ? '…' : ''}</b>`;
            card.addEventListener('click', () => selectText(item));
            layerList.appendChild(card);
        });
    }

    function triggerMotion() {
        const items = canvas.querySelectorAll('.draggable-text');
        items.forEach(item => {
            const motion = item.dataset.motion;
            if (motion) {
                item.classList.remove(motion);
                void item.offsetWidth;
                item.classList.add(motion);
            }
        });
    }

    playMotionBtn.addEventListener('click', triggerMotion);

    resetProjectBtn.addEventListener('click', () => {
        if (!confirm('ক্যানভাসের সব লেয়ার মুছে ফেলতে চান?')) return;
        canvas.querySelectorAll('.draggable-text').forEach(el => el.remove());
        activeElement = null;
        propertiesContent.innerHTML = '<p class="empty-msg">ক্যানভাস থেকে যেকোনো টেক্সট সিলেক্ট করুন</p>';
        updateLayers();
        saveProject();
    });

    exportPngBtn.addEventListener('click', () => {
        if (activeElement) activeElement.classList.remove('selected');
        html2canvas(canvas, { backgroundColor: null, scale: 2 }).then(cvs => {
            const a = document.createElement('a');
            a.download = 'textcraft-static.png';
            a.href = cvs.toDataURL('image/png');
            a.click();
            if (activeElement) activeElement.classList.add('selected');
        });
    });

    exportWebmBtn.addEventListener('click', async () => {
        if (activeElement) activeElement.classList.remove('selected');
        exportWebmBtn.innerText = '⏳ Recording FX...';
        exportWebmBtn.disabled = true;

        triggerMotion();

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.clientWidth;
        offscreenCanvas.height = canvas.clientHeight;
        const ctx = offscreenCanvas.getContext('2d');

        const stream = offscreenCanvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        const chunks = [];

        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'textcraft-motion.webm';
            a.click();

            exportWebmBtn.innerText = '🎬 Export Motion (.webm)';
            exportWebmBtn.disabled = false;
            if (activeElement) activeElement.classList.add('selected');
        };

        recorder.start();

        let duration = 2400;
        let startTime = Date.now();

        const renderFrame = async () => {
            if (Date.now() - startTime < duration) {
                const cvs = await html2canvas(canvas, { backgroundColor: null, scale: 1 });
                ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                ctx.drawImage(cvs, 0, 0);
                requestAnimationFrame(renderFrame);
            } else {
                recorder.stop();
            }
        };

        renderFrame();
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
