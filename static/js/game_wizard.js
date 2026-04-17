/**
 * Game Edit Wizard JavaScript logic
 * Extracted from game_edit_wizard.html
 */

function openGameEditModal(tab = 'meta') {
    const modal = document.getElementById('game-edit-modal');
    if (modal) {
        modal.showModal();
        switchGameTab(tab, document.querySelector(`#game-edit-modal .manage-tab-btn[data-tab="${tab}"]`));
    }
}

function closeGameEditModal() { 
    if (gameMetaAbortController) {
        gameMetaAbortController.abort();
        gameMetaAbortController = null;
    }
    const modal = document.getElementById('game-edit-modal');
    if (modal) modal.close();
}

/**
 * Helper to find an element by ID, preferring the one in the currently active wizard/modal.
 * This prevents issues with duplicate IDs when both the old and new wizards are in the DOM.
 */
function _getEditorEl(id, btn = null) {
    if (btn) {
        const container = btn.closest('.manage-tab-content') || btn.closest('.modal') || btn.closest('dialog') || btn.closest('.gw-step-content');
        if (container) {
            const el = container.querySelector('#' + id);
            if (el) return el;
        }
    }
    // Fallback to searching in the generic wizard if open
    const genWiz = document.getElementById('generic-wizard-modal');
    if (genWiz && genWiz.hasAttribute('open')) {
        const el = genWiz.querySelector('#' + id);
        if (el) return el;
    }
    // Fallback to old modal if open
    const oldWiz = document.getElementById('game-edit-modal');
    if (oldWiz && oldWiz.hasAttribute('open')) {
        const el = oldWiz.querySelector('#' + id);
        if (el) return el;
    }
    return document.getElementById(id);
}

let _gameEditions = [];
let gameMetaAbortController = null;

const TAG_COLORS = [
    "#1abc9c", "#16a085", "#2ecc71", "#27ae60", "#3498db", "#2980b9", "#9b59b6", "#8e44ad",
    "#34495e", "#2c3e50", "#f1c40f", "#f39c12", "#e67e22", "#d35400", "#e74c3c", "#c0392b",
    "#ecf0f1", "#bdc3c7", "#95a5a6", "#7f8c8d", "#000000", "#ffffff", "#7a7f85", "#0284c7",
    "#f59e0b", "#ef4444", "#10b981", "#6366f1", "#a855f7", "#ec4899", "#f43f5e", "#d946ef",
    "#8b5cf6", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e", "#84cc16", "#eab308",
    "#f97316", "#ef4444", "#78716c", "#71717a", "#737373", "#525252", "#404040", "#262626",
    "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6", "#fb7185", "#818cf8", "#2dd4bf",
    "#4ade80", "#a3e635", "#fde047", "#fb923c", "#f87171", "#a8a29e", "#a1a1aa", "#a3a3a3"
];

function renderEditionPills(editions) {
    const selector = _getEditorEl('gm-edition-selector');
    if (!selector) return;
    selector.innerHTML = '';
    _gameEditions = editions;
    
    if (_gameEditions.length > 0) {
        _gameEditions.forEach((ed, idx) => {
            const pill = document.createElement('div');
            pill.className = 'edition-pill';
            pill.textContent = ed.display_name;
            pill.onclick = () => applyGameEdition(idx, pill);
            selector.appendChild(pill);
        });
    }
}

async function generateGameMeta(btn) {
    console.log("generateGameMeta started with btn:", btn);
    if (!window.GAME_CONFIG) {
        console.error("GAME_CONFIG is missing!");
        return;
    }
    if (gameMetaAbortController) gameMetaAbortController.abort();
    gameMetaAbortController = new AbortController();

    setCapsuleState(btn, 'processing', 'Analyse...');
    showFeedback('gm-feedback', '', false, btn);
    const selector = _getEditorEl('gm-edition-selector', btn);
    if (selector) selector.innerHTML = '';

    try {
        const modelSelect = _getEditorEl('gemini-model', btn);
        const model = modelSelect ? modelSelect.value : 'gemini-flash-latest';
        const prompt = window.GAME_CONFIG.ai_prompt_editions;
        console.log("Model:", model, "Prompt length:", prompt ? prompt.length : 0);

        const res = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=${model}`, {
            signal: gameMetaAbortController.signal
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ detail: "Erreur serveur inconnue" }));
            throw new Error(errorData.detail || `Erreur HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("IA Response received:", data);

        if (!data.results || !data.results[0] || !data.results[0].body) throw new Error("Réponse IA vide");

        let aiText = data.results[0].body.trim();
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            aiText = jsonMatch[0];
        }

        let result;
        try {
            result = JSON.parse(aiText);
        } catch (jsonErr) {
            console.error("JSON parse error:", aiText);
            throw new Error("Le format de réponse de l'IA est invalide (JSON attendu).");
        }

        const editions = result.editions || [];
        console.log("Editions found:", editions.length);
        renderEditionPills(editions);

        if (editions.length > 0) {
            const container = _getEditorEl('gm-edition-selector', btn);
            const firstPill = container ? container.querySelector('.edition-pill') : null;
            applyGameEdition(0, firstPill);
            showFeedback('gm-feedback', `✓ ${editions.length} édition(s) trouvée(s)`, false, btn);
            setCapsuleState(btn, 'success', 'Terminé !');
            
            fetch('/api/save_editions_cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_path: window.GAME_CONFIG.base_path,
                    editions: editions
                })
            }).catch(err => console.error("Erreur sauvegarde cache:", err));

        } else {
            showFeedback('gm-feedback', 'Aucune édition trouvée', true, btn);
            setCapsuleState(btn, 'error', 'Aucune');
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log("IA request aborted");
            return;
        }
        console.error("IA Error:", e);
        showFeedback('gm-feedback', '✗ ' + e.message, true, btn);
        setCapsuleState(btn, 'error', 'Échec');
    } finally {
        gameMetaAbortController = null;
    }
}

function applyGameEdition(index, pill = null) {
    const ed = _gameEditions[index];
    if (!ed) return;

    if (pill) {
        const container = pill.closest('#gm-edition-selector') || document;
        container.querySelectorAll('.edition-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
    }

    const setVal = (id, val) => {
        const el = _getEditorEl(id, pill);
        if (el) {
            if (el.type === 'number') {
                // Tenter d'extraire un nombre si c'est une chaîne (ex: "PEGI 16" -> 16)
                if (typeof val === 'string') {
                    const match = val.match(/\d+(\.\d+)?/);
                    el.value = match ? match[0] : "";
                } else {
                    el.value = (val !== null && val !== undefined) ? val : "";
                }
            } else {
                el.value = val || "";
            }
        }
    };

    setVal('gm-title-fr', ed.title_fr);
    setVal('gm-title-en', ed.title_en);
    setVal('gm-developer', ed.developer || ed.developers);
    setVal('gm-publisher', ed.publisher || ed.publishers);
    setVal('gm-genre', ed.genre || ed.genres);
    setVal('gm-release-date', ed.release_date || ed.publish_date);
    setVal('gm-platform', ed.platform || ed.platforms);
    setVal('gm-universe', ed.universe);
    setVal('gm-studio', ed.studio);
    setVal('gm-rating', ed.rating);
    setVal('gm-keywords', ed.keywords);
    
    const desc = ed.description || ed.synopsis || "";
    if (desc) setVal('desc-textarea', desc);

    if (ed.youtube_urls) {
        const yt = Array.isArray(ed.youtube_urls) ? ed.youtube_urls.join('\n') : ed.youtube_urls;
        setVal('gm-youtube-urls', yt);
    }
}

async function saveGameMeta(btn) {
    if (!window.GAME_CONFIG) return;
    const synopsis = _getEditorEl('desc-textarea', btn)?.value || "";
    const data = {
        folder_path: window.GAME_CONFIG.base_path,
        title_fr: _getEditorEl('gm-title-fr', btn)?.value || "",
        title_en: _getEditorEl('gm-title-en', btn)?.value || "",
        developer: _getEditorEl('gm-developer', btn)?.value || "",
        publisher: _getEditorEl('gm-publisher', btn)?.value || "",
        genre: _getEditorEl('gm-genre', btn)?.value || "",
        release_date: _getEditorEl('gm-release-date', btn)?.value || "",
        platform: _getEditorEl('gm-platform', btn)?.value || "",
        universe: _getEditorEl('gm-universe', btn)?.value || "",
        studio: _getEditorEl('gm-studio', btn)?.value || "",
        rating: parseFloat(_getEditorEl('gm-rating', btn)?.value) || null,
        keywords: _getEditorEl('gm-keywords', btn)?.value || "",
        youtube_urls: _getEditorEl('gm-youtube-urls', btn)?.value || "",
        synopsis: synopsis
    };

    console.group("💾 API Call: /api/save_game_meta");
    console.log("Payload:", data);

    setCapsuleState(btn, 'processing', 'Sauvegarde...');

    try {
        const res = await fetch('/api/save_game_meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        console.log("Status:", res.status, res.statusText);
        if (res.ok) {
            console.log("✅ Sauvegarde réussie.");
            setCapsuleState(btn, 'success', 'Sauvegardé');
            if (typeof updateYoutubePlayer === 'function') updateYoutubePlayer(data.youtube_urls);

            const mainTitle = data.title_fr || data.title_en || window.GAME_CONFIG.title;
            const titleEl = document.querySelector('.game-title');
            if (titleEl) titleEl.textContent = mainTitle;

            const descContent = document.getElementById('description-content');
            if (descContent && typeof marked !== 'undefined') {
                descContent.innerHTML = marked.parse(synopsis || "");
            }

            const container = document.getElementById('meta-display-container');
            if (container) container.classList.remove('is-empty');

            const setDisplay = (idRow, idVal, val) => {
                const row = document.getElementById(idRow);
                const display = document.getElementById(idVal);
                if (val) {
                    if (row) row.style.display = 'flex';
                    if (display) display.textContent = val;
                } else {
                    if (row) row.style.display = 'none';
                }
            };

            let tStr = data.title_fr || "";
            if (data.title_fr && data.title_en) tStr += " / " + data.title_en;
            else if (data.title_en) tStr = data.title_en;
            setDisplay('meta-row-titles', 'display-titles', tStr);

            let pStr = data.platform || "";
            if (data.platform && data.universe) pStr += " — " + data.universe;
            else if (data.universe) pStr = data.universe;
            setDisplay('meta-row-platform', 'display-platform-universe', pStr);

            setDisplay('meta-row-publisher', 'display-publisher', data.publisher);

            let gStr = data.genre || "";
            if (data.genre && data.release_date) gStr += " (" + data.release_date + ")";
            else if (data.release_date) gStr = data.release_date;
            setDisplay('meta-row-genre', 'display-genre-date', gStr);

            setDisplay('meta-row-developer', 'display-developer', data.developer);
            setDisplay('meta-row-studio', 'display-studio', data.studio);
            setDisplay('meta-row-rating', 'display-rating', data.rating ? data.rating + " / 100" : "");
            setDisplay('meta-row-keywords', 'display-keywords', data.keywords);

        } else {
            const errText = await res.text();
            console.error("❌ Échec de la sauvegarde:", errText);
        }
    } catch (err) {
        console.error("❌ Erreur réseau/fetch:", err);
    } finally {
        console.groupEnd();
    }
}

function switchGameTab(tabId, btn) {
    if (!window.GAME_CONFIG) return;
    const dialog = btn ? btn.closest('dialog') : document.getElementById('game-edit-modal');
    dialog.querySelectorAll('.manage-tab-content').forEach(el => el.classList.remove('active'));
    dialog.querySelectorAll('.manage-tab-btn').forEach(el => el.classList.remove('active'));
    
    const content = _getEditorEl('game-tab-' + tabId, btn);
    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabId === 'meta') {
        const cached = window.GAME_CONFIG.editions_cache;
        if (_gameEditions.length === 0 && cached && cached.length > 0) {
            console.log("Loading editions from cache...");
            renderEditionPills(cached);
            showFeedback('gm-feedback', `✓ ${cached.length} édition(s) chargées du cache`, false, btn);
        }
    }

    if (tabId === 'desc') {
        const current = window.GAME_CONFIG.description;
        const textarea = _getEditorEl('desc-textarea', btn);
        if (textarea && !textarea.value) {
            textarea.value = current || "";
        }
    }
    if (tabId === 'links') {
        const list = _getEditorEl('links-editor-list', btn);
        if (list) {
            list.innerHTML = '';
            currentLinks.forEach((link) => addLinkRow(link.name, link.url, btn));
            if (currentLinks.length === 0) addLinkRow('', '', btn);
        }
    }
    if (tabId === 'tags') {
        renderTags(window.GAME_CONFIG.meta?.tags || [], btn);
    }
}

function renderTags(tags, btn = null) {
    const container = _getEditorEl('tags-container', btn);
    if (!container) return;
    container.innerHTML = '';
    
    const families = {};
    tags.forEach(t => {
        if (!families[t.family]) families[t.family] = [];
        families[t.family].push(t);
    });

    Object.keys(families).forEach(familyName => {
        const group = document.createElement('div');
        group.className = 'tag-family-group';
        group.innerHTML = `
            <div class="tag-family-header">
                <span class="tag-family-title">${familyName}</span>
            </div>
            <div class="tag-items-grid"></div>
        `;
        const grid = group.querySelector('.tag-items-grid');
        families[familyName].forEach(t => {
            const item = document.createElement('div');
            item.className = 'tag-item';
            item.dataset.family = t.family;
            item.dataset.name = t.name;
            item.dataset.color = t.color;
            item.innerHTML = `
                <span class="tag-color-dot" style="background-color: ${t.color}"></span>
                <span>${t.name}</span>
                <button class="tag-remove-btn" onclick="this.closest('.tag-item').remove()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            grid.appendChild(item);
        });
        container.appendChild(group);
    });
}

function addTagRow() {
    const container = _getEditorEl('tags-container');
    if (!container) return;

    // On récupère les familles existantes dans la page pour les suggérer
    const existingFamilies = [...document.querySelectorAll('.tag-family-title')].map(el => el.textContent);
    const uniqueFamilies = [...new Set(existingFamilies)];
    
    const datalistId = 'wizard-family-suggestions';
    let datalist = document.getElementById(datalistId);
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = datalistId;
        document.body.appendChild(datalist);
    }
    datalist.innerHTML = uniqueFamilies.map(f => `<option value="${f}">`).join('');

    const row = document.createElement('div');
    row.className = 'tag-edit-row';
    row.innerHTML = `
        <div>
            <label class="data-card-label">Famille</label>
            <input type="text" class="tag-family-input" list="${datalistId}" placeholder="ex: Plateforme">
        </div>
        <div>
            <label class="data-card-label">Nom du Tag</label>
            <input type="text" class="tag-name-input" placeholder="ex: Exclusivité">
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
            <label class="data-card-label">Couleur</label>
            <div class="tag-color-preview" style="width:24px; height:24px; border-radius:4px; background:#7a7f85; cursor:pointer; border:1px solid #fff;"></div>
        </div>
        <button class="btn-capsule" onclick="confirmAddTagWizard(this.parentElement)">OK</button>
    `;
    
    const preview = row.querySelector('.tag-color-preview');
    preview.onclick = () => showColorPickerWizard(preview);
    
    container.prepend(row);
}

function showColorPickerWizard(targetEl) {
    let picker = document.getElementById('wizard-tag-color-picker');
    const dialog = document.getElementById('game-edit-modal') || document.getElementById('generic-wizard-modal');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'wizard-tag-color-picker';
        picker.className = 'color-picker-grid';
        picker.style.position = 'fixed'; // Fixed instead of absolute
        if (dialog) dialog.appendChild(picker);
        else document.body.appendChild(picker);
    }
    
    picker.innerHTML = TAG_COLORS.map(c => `<div class="color-option" data-color="${c}" style="background-color:${c}"></div>`).join('');
    
    const rect = targetEl.getBoundingClientRect();
    picker.style.top = (rect.bottom + 5) + 'px';
    picker.style.left = rect.left + 'px';
    picker.style.display = 'grid';

    const clickOutside = (e) => {
        if (!picker.contains(e.target) && e.target !== targetEl) {
            picker.style.display = 'none';
            document.removeEventListener('mousedown', clickOutside);
        }
    };
    document.addEventListener('mousedown', clickOutside);

    picker.querySelectorAll('.color-option').forEach(opt => {
        opt.onclick = () => {
            const color = opt.dataset.color;
            targetEl.style.backgroundColor = color;
            targetEl.dataset.color = color;
            picker.style.display = 'none';
            document.removeEventListener('mousedown', clickOutside);
        };
    });
}

function confirmAddTagWizard(row) {
    const family = row.querySelector('.tag-family-input').value.trim();
    const name = row.querySelector('.tag-name-input').value.trim();
    const color = row.querySelector('.tag-color-preview').dataset.color || "#7a7f85";
    
    if (!family || !name) return;

    const container = _getEditorEl('tags-container');
    let group = [...container.querySelectorAll('.tag-family-group')].find(g => g.querySelector('.tag-family-title').textContent === family);
    if (!group) {
        group = document.createElement('div');
        group.className = 'tag-family-group';
        group.innerHTML = `<div class="tag-family-header"><span class="tag-family-title">${family}</span></div><div class="tag-items-grid"></div>`;
        container.appendChild(group);
    }
    
    const grid = group.querySelector('.tag-items-grid');
    const item = document.createElement('div');
    item.className = 'tag-item';
    item.dataset.family = family;
    item.dataset.name = name;
    item.dataset.color = color;
    item.innerHTML = `
        <span class="tag-color-dot" style="background-color: ${color}"></span>
        <span>${name}</span>
        <button class="tag-remove-btn" onclick="this.closest('.tag-item').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;
    grid.appendChild(item);
    row.remove();
}

async function saveTags(btn) {
    if (!window.GAME_CONFIG) return;
    const container = _getEditorEl('tags-container', btn);
    const items = container.querySelectorAll('.tag-item');
    const tags = [];
    items.forEach(it => {
        tags.push({
            name: it.dataset.name,
            family: it.dataset.family,
            color: it.dataset.color
        });
    });

    const data = { folder_path: window.GAME_CONFIG.base_path, tags: tags };
    setCapsuleState(btn, 'processing', 'Sauvegarde...');

    try {
        const res = await fetch('/api/save_game_meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            setCapsuleState(btn, 'success', 'Sauvegardé');
            if (window.GAME_CONFIG.meta) window.GAME_CONFIG.meta.tags = tags;
        } else {
            setCapsuleState(btn, 'error', 'Échec');
        }
    } catch(e) {
        setCapsuleState(btn, 'error', 'Erreur');
    }
}

async function launchWebSearch() {
    if (!window.GAME_CONFIG) return;
    
    const btn = document.querySelector('.cover-search-btn');
    if (!btn) return;

    const title = _getEditorEl('gm-title-fr', btn)?.value || _getEditorEl('gm-title-en', btn)?.value || window.GAME_CONFIG.title;
    const dev   = _getEditorEl('gm-developer', btn)?.value || "";
    const date  = _getEditorEl('gm-release-date', btn)?.value || "";
    const input = _getEditorEl('search-input', btn);
    const q     = (input && input.value) || `${title} ${dev} ${date}`.trim();
    
    const originalIcon = btn.innerHTML;
    const spinnerIcon = `<svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-dashoffset="15.7"/></svg>`;

    btn.disabled = true;
    btn.innerHTML = spinnerIcon;
    
    try {
        const res = await fetch(`/api/search_cover?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        const div = _getEditorEl('web-results', btn); 
        if (div) {
            div.innerHTML = "";
            if (data.images && data.images.length > 0) {
                data.images.forEach(url => {
                    const el = document.createElement('div'); el.className = 'cover-option';
                    const proxiedUrl = `/api/img_proxy?url=${encodeURIComponent(url)}`;
                    el.innerHTML = `<img src="${proxiedUrl}" alt="">`;
                    el.onclick = () => saveFromWeb(url);
                    div.appendChild(el);
                });
            } else {
                div.innerHTML = "<div style='grid-column:1/-1; text-align:center; padding:20px;'>Aucune image trouvée</div>";
            }
        }
    } catch (error) {
        console.error('Erreur de recherche web:', error);
        const div = _getEditorEl('web-results', btn);
        if (div) div.innerHTML = "<div style='grid-column:1/-1; text-align:center; padding:20px; color:var(--danger);'>Erreur de recherche</div>";
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}

async function saveFromWeb(url) {
    if (!window.GAME_CONFIG) return;
    await fetch('/api/save_cover', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ folder_path: window.GAME_CONFIG.base_path, image_url: url })
    });
    if (typeof showSaveStatus === 'function') showSaveStatus('cover-save-status');

    const t = Date.now();
    let basePath = (window.GAME_CONFIG.base_path || "").replace(/\\/g, '/');
    if (basePath.startsWith('/bibliotheque')) {
        basePath = basePath.replace('/bibliotheque', '');
    }
    basePath = basePath.startsWith('/') ? basePath.substring(1) : basePath;
    const correctUrl = `/library/${encodeURIComponent(basePath)}/cover.jpg?t=${t}`;

    let img = document.querySelector('.cover-wrapper img');
    if (img) {
        img.src = correctUrl;
        img.style.display = 'block';
    } else {
        const wrapper = document.querySelector('.cover-wrapper');
        if (wrapper) {
            wrapper.innerHTML = `<img src="${correctUrl}" decoding="async" fetchpriority="high" alt="${window.GAME_CONFIG.title}" style="display:block;">`;
        }
    }

    const bg = document.querySelector('.immersive-bg');
    if (bg) {
        bg.style.backgroundImage = `url("${correctUrl}")`;
    }
}

async function generateDescription(btn) {
    if (!window.GAME_CONFIG) return;
    const title = _getEditorEl('gm-title-fr', btn)?.value || _getEditorEl('gm-title-en', btn)?.value || window.GAME_CONFIG.title;
    const dev   = _getEditorEl('gm-developer', btn)?.value || "";
    const date  = _getEditorEl('gm-release-date', btn)?.value || "";
    
    const promptEl = _getEditorEl('ai-prompt', btn);
    const model  = 'gemini-flash-latest';
    const prompt = (promptEl && promptEl.value) + ` (Contexte : Jeu vidéo ${title}, développé par ${dev} sorti en ${date})`;
    
    setCapsuleState(btn, 'processing', 'Génération...');

    console.group("🤖 API Call: /api/search_desc (Synopsis)");
    console.log("Model:", model);
    console.log("Prompt:", prompt);

    try {
        const res  = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=${model}`);
        const data = await res.json();
        console.groupEnd();
        if (data.results && data.results[0] && data.results[0].body) {
            const textarea = _getEditorEl('desc-textarea', btn);
            if (textarea) textarea.value = data.results[0].body;
            setCapsuleState(btn, 'success', 'Généré !');
        } else {
            setCapsuleState(btn, 'error', 'Vide');
        }
    } catch (error) { 
        console.groupEnd();
        console.error("❌ Erreur génération:", error); 
        setCapsuleState(btn, 'error', 'Échec');
    }
}

async function saveDescription(btn) { 
    if (!window.GAME_CONFIG) return;
    const textarea = _getEditorEl('desc-textarea', btn);
    const text = (textarea && textarea.value) || "";
    const data = { folder_path: window.GAME_CONFIG.base_path, text: text };
    console.group("💾 API Call: /api/save_desc");
    console.log("Payload:", data);
    
    setCapsuleState(btn, 'processing', 'Sauvegarde...');

    try {
        const res = await fetch('/api/save_desc', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(data) 
        });
        console.log("Status:", res.status);
        if (res.ok) {
            console.log("✅ Synopsis sauvegardé dans le fichier Sidecar.");
            setCapsuleState(btn, 'success', 'Sauvegardé');
            const descContent = document.getElementById('description-content');
            if (descContent && typeof marked !== 'undefined') {
                descContent.innerHTML = marked.parse(text || "");
            }
        } else {
            console.error("❌ Échec sauvegarde synopsis:", await res.text());
            setCapsuleState(btn, 'error', 'Échec');
        }
    } catch(e) {
        console.error("❌ Erreur fetch:", e);
        setCapsuleState(btn, 'error', 'Erreur');
    } finally {
        console.groupEnd();
    }
}

let currentLinks = [];
if (window.GAME_CONFIG) {
    currentLinks = window.GAME_CONFIG.external_links || [];
}

function addLinkRow(name = '', url = '', btn = null) {
    const list = _getEditorEl('links-editor-list', btn);
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'link-row';
    row.innerHTML = `
        <input type="text" placeholder="Nom (ex: VO)" value="${name}" class="link-name">
        <input type="text" placeholder="URL" value="${url}" class="link-url">
        <button class="icon-action icon-action--danger" onclick="this.parentElement.remove()" title="Supprimer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;
    list.appendChild(row);
}

async function saveLinks(btn) {
    if (!window.GAME_CONFIG) return;
    const container = btn.closest('.manage-tab-content') || document;
    const rows = container.querySelectorAll('.link-row');
    const links = [];
    rows.forEach(row => {
        const nameInput = row.querySelector('.link-name');
        const urlInput = row.querySelector('.link-url');
        const name = (nameInput && nameInput.value.trim()) || "";
        const url = (urlInput && urlInput.value.trim()) || "";
        if (name && url) links.push({ name, url });
    });

    const data = { folder_path: window.GAME_CONFIG.base_path, links: links };
    console.group("💾 API Call: /api/save_links");
    console.log("Payload:", data);

    setCapsuleState(btn, 'processing', 'Sauvegarde...');

    try {
        const res = await fetch('/api/save_links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        console.log("Status:", res.status);
        if (res.ok) {
            console.log("✅ Liens sauvegardés.");
            setCapsuleState(btn, 'success', 'Sauvegardé');
            currentLinks = links;

            const containerLinks = document.getElementById('meta-row-links');
            const badgesDiv = document.getElementById('display-links-badges');
            
            if (links.length > 0) {
                if (containerLinks) containerLinks.style.display = 'flex';
                if (badgesDiv) {
                    badgesDiv.innerHTML = links.map(l => `
                        <a href="${l.url}" target="_blank" class="sidebar-link-badge">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="4"></line></svg>
                            ${l.name}
                        </a>
                    `).join('');
                }
            } else {
                if (containerLinks) containerLinks.style.display = 'none';
            }
        } else {
            console.error("❌ Échec sauvegarde liens:", await res.text());
        }
    } catch(e) {
        console.error("❌ Erreur fetch:", e);
    } finally {
        console.groupEnd();
    }
}

async function generateGameLinks(btn) {
    if (!window.GAME_CONFIG) return;
    const title = _getEditorEl('gm-title-fr', btn)?.value || _getEditorEl('gm-title-en', btn)?.value || window.GAME_CONFIG.title;
    const pub   = _getEditorEl('gm-publisher', btn)?.value || "";
    
    setCapsuleState(btn, 'processing', 'Recherche...');
    showFeedback('gl-feedback', 'Recherche en cours...', false, btn);

    const model = 'gemini-flash-latest';
    let prompt = window.GAME_CONFIG.ai_prompt_links;
    prompt = prompt.replace('{title}', title).replace('{pub}', pub);

    console.group("🤖 API Call: /api/search_desc (Liens)");
    console.log("Model:", model);
    console.log("Prompt:", prompt);

    try {
        const res = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=${model}`);
        const data = await res.json();
        console.log("Response:", data);

        if (!res.ok) {
            throw new Error(data.detail || `Erreur serveur (${res.status})`);
        }

        if (!data.results || !data.results[0] || !data.results[0].body) throw new Error("Réponse IA vide");

        let aiText = data.results[0].body.trim();
        if (aiText.startsWith("ERREUR_IA:")) {
            throw new Error(aiText.replace("ERREUR_IA:", "Blocage IA :"));
        }
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            aiText = jsonMatch[0];
        }

        const result = JSON.parse(aiText);
        if (result.links && result.links.length > 0) {
            const list = _getEditorEl('links-editor-list', btn);
            if (list) {
                result.links.forEach(link => {
                    const exists = Array.from(list.querySelectorAll('.link-url')).some(input => input.value === link.url);
                    if (!exists) {
                        addLinkRow(link.name, link.url, btn);
                    }
                });
            }
            showFeedback('gl-feedback', `✓ ${result.links.length} lien(s) suggéré(s)`, false, btn);
            setCapsuleState(btn, 'success', 'Suggérés !');
        } else {
            showFeedback('gl-feedback', 'Aucun lien trouvé', true, btn);
            setCapsuleState(btn, 'error', 'Aucun');
        }
    } catch (e) {
        console.error("❌ Erreur génération liens:", e);
        showFeedback('gl-feedback', '✗ Erreur de recherche', true, btn);
        setCapsuleState(btn, 'error', 'Erreur');
    } finally {
        console.groupEnd();
    }
}
