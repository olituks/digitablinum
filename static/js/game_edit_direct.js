/**
 * Direct Game Edit Modal logic (Tabs based)
 */

window.switchDirectTab = (tabId, btn) => {
    // Buttons
    const container = btn.closest('.manage-tab-container');
    container.querySelectorAll('.manage-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Contents
    const modal = document.getElementById('direct-edit-modal');
    modal.querySelectorAll('.manage-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('direct-tab-' + tabId).classList.add('active');

    // Auto-trigger cover search if switching to cover tab and results are empty
    if (tabId === 'cover') {
        const results = document.getElementById('direct-web-results');
        if (results && results.innerHTML.trim() === '') {
            GameEditDirectModal.launchWebSearch();
        }
    }
};

window.GameEditDirectModal = {
    colors: [
        "#1abc9c", "#16a085", "#2ecc71", "#27ae60", "#3498db", "#2980b9", "#9b59b6", "#8e44ad",
        "#34495e", "#2c3e50", "#f1c40f", "#f39c12", "#e67e22", "#d35400", "#e74c3c", "#c0392b",
        "#ecf0f1", "#bdc3c7", "#95a5a6", "#7f8c8d", "#000000", "#ffffff", "#7a7f85", "#0284c7",
        "#f59e0b", "#ef4444", "#10b981", "#6366f1", "#a855f7", "#ec4899", "#f43f5e", "#d946ef",
        "#8b5cf6", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e", "#84cc16", "#eab308",
        "#f97316", "#ef4444", "#78716c", "#71717a", "#737373", "#525252", "#404040", "#262626",
        "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6", "#fb7185", "#818cf8", "#2dd4bf",
        "#4ade80", "#a3e635", "#fde047", "#fb923c", "#f87171", "#a8a29e", "#a1a1aa", "#a3a3a3"
    ],

    open: function() {
        const modal = document.getElementById('direct-edit-modal');
        if (!modal) return;
        
        this.populate();
        modal.showModal();

        // On vérifie s'il y a un cache d'éditions à afficher immédiatement
        if (window.GAME_CONFIG && window.GAME_CONFIG.editions_cache && window.GAME_CONFIG.editions_cache.length > 0) {
            this.renderEditionSelector(window.GAME_CONFIG.editions_cache);
        }

        // Fixe la hauteur minimale basée sur le premier onglet (Métadonnées) 
        // pour éviter que la modale ne change de taille entre les onglets.
        setTimeout(() => {
            const body = modal.querySelector('.manage-body');
            const firstTab = document.getElementById('direct-tab-meta');
            if (body && firstTab) {
                body.style.minHeight = '0px'; 
                const height = firstTab.scrollHeight;
                body.style.minHeight = (height + 20) + 'px'; 
            }
        }, 50);
    },

    populate: function() {
        if (!window.GAME_CONFIG) return;
        const config = window.GAME_CONFIG;
        const meta = config.meta || {};
        
        console.log("[GameEditDirectModal] Populating modal with meta:", meta);

        // Meta Tab
        document.getElementById('direct-gm-title-fr').value = meta.title_fr || '';
        document.getElementById('direct-gm-title-en').value = meta.title_en || '';
        document.getElementById('direct-gm-developer').value = meta.developer || '';
        document.getElementById('direct-gm-publisher').value = meta.publisher || '';
        document.getElementById('direct-gm-genre').value = meta.genre || '';
        document.getElementById('direct-gm-release-date').value = meta.release_date || '';
        document.getElementById('direct-gm-platform').value = meta.platform || '';
        document.getElementById('direct-gm-universe').value = meta.universe || '';
        document.getElementById('direct-gm-studio').value = meta.studio || '';
        document.getElementById('direct-gm-rating').value = meta.rating || '';
        document.getElementById('direct-collection-input').value = meta.family || ''; 
        console.log("[GameEditDirectModal] Collection input set to:", meta.family);
        document.getElementById('direct-gm-keywords').value = meta.keywords || '';
        document.getElementById('direct-gm-youtube-urls').value = meta.youtube_urls || '';

        // Feedback reset
        const feedback = document.getElementById('direct-gm-feedback');
        if (feedback) feedback.textContent = '';

        // Cover Tab
        const coverSearchInput = document.getElementById('direct-cover-search-input');
        if (coverSearchInput) {
            coverSearchInput.value = config.title || '';
        }
        document.getElementById('direct-web-results').innerHTML = `<div class="cover-grid-empty">${_('click_to_search_image_hint') || 'Prêt pour la recherche...'}</div>`;

        // Desc Tab
        document.getElementById('direct-ai-prompt').value = config.ai_prompt_desc || '';
        document.getElementById('direct-desc-textarea').value = config.description || '';

        // Links Tab
        this.renderLinks(config.external_links || []);

        // Tags Tab
        this.renderTags(meta.tags || []);
    },

    renderLinks: function(links) {
        const list = document.getElementById('direct-links-editor-list');
        list.innerHTML = '';
        links.forEach(link => {
            this.addLinkRow(link.name, link.url);
        });
    },

    addLinkRow: function(name = '', url = '') {
        const list = document.getElementById('direct-links-editor-list');
        const row = document.createElement('div');
        row.className = 'link-row';
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.marginBottom = '8px';
        row.innerHTML = `
            <input type="text" value="${name}" class="link-name" placeholder="Nom (ex: Steam)" style="flex: 1;">
            <input type="text" value="${url}" class="link-url" placeholder="URL" style="flex: 2;">
            <button class="icon-action icon-action--danger" onclick="this.parentElement.remove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        list.appendChild(row);
    },

    renderTags: function(tags) {
        const container = document.getElementById('direct-tags-container');
        container.innerHTML = '';
        
        // Group tags by family
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
                item.onclick = (e) => {
                    if (e.target.closest('.tag-remove-btn')) return;
                    this.editTag(t, item);
                };
                grid.appendChild(item);
            });
            container.appendChild(group);
        });
    },

    addTagRow: function() {
        const container = document.getElementById('direct-tags-container');
        
        // On récupère les familles existantes dans la page pour les suggérer
        const existingFamilies = [...document.querySelectorAll('.tag-family-title')].map(el => el.textContent);
        const uniqueFamilies = [...new Set(existingFamilies)];
        
        const datalistId = 'direct-family-suggestions';
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
            <button class="btn-capsule" onclick="GameEditDirectModal.confirmAddTag(this.parentElement)">OK</button>
        `;
        
        const preview = row.querySelector('.tag-color-preview');
        preview.onclick = () => this.showColorPicker(preview);
        
        container.prepend(row);
    },

    showColorPicker: function(targetEl) {
        let picker = document.getElementById('direct-tag-color-picker');
        const dialog = document.getElementById('direct-edit-modal');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'direct-tag-color-picker';
            picker.className = 'color-picker-grid';
            picker.style.position = 'fixed'; // Fixed instead of absolute
            if (dialog) dialog.appendChild(picker);
            else document.body.appendChild(picker);
        }
        
        picker.innerHTML = this.colors.map(c => `<div class="color-option" data-color="${c}" style="background-color:${c}"></div>`).join('');
        
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
    },

    confirmAddTag: function(row) {
        const family = row.querySelector('.tag-family-input').value.trim();
        const name = row.querySelector('.tag-name-input').value.trim();
        const color = row.querySelector('.tag-color-preview').dataset.color || "#7a7f85";
        
        if (!family || !name) return;

        // On ajoute à l'UI
        let group = [...document.querySelectorAll('.tag-family-group')].find(g => g.querySelector('.tag-family-title').textContent === family);
        if (!group) {
            group = document.createElement('div');
            group.className = 'tag-family-group';
            group.innerHTML = `<div class="tag-family-header"><span class="tag-family-title">${family}</span></div><div class="tag-items-grid"></div>`;
            document.getElementById('direct-tags-container').appendChild(group);
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
    },

    saveSection: async function(section, btn) {
        if (!window.GAME_CONFIG) return;
        setCapsuleState(btn, 'processing', _('saving_label') + '...');

        try {
            let res;
            let genreVal = "";
            let universeVal = "";
            let currentTags = [];

            if (section === 'meta') {
                genreVal = document.getElementById('direct-gm-genre').value;
                universeVal = document.getElementById('direct-gm-universe').value;
                
                // --- Logique d'Auto-Tagging (v2.4.15) ---
                currentTags = (window.GAME_CONFIG.meta && window.GAME_CONFIG.meta.tags) ? [...window.GAME_CONFIG.meta.tags] : [];
                
                const processAutoTags = (inputStr, familyName) => {
                    if (!inputStr) return;
                    const names = inputStr.split(',').map(s => s.trim()).filter(s => s !== "");
                    names.forEach(name => {
                        const exists = currentTags.find(t => t.name.toLowerCase() === name.toLowerCase() && t.family.toLowerCase() === familyName.toLowerCase());
                        if (!exists) {
                            const randomColor = this.colors[Math.floor(Math.random() * this.colors.length)];
                            currentTags.push({
                                name: name,
                                family: familyName,
                                color: randomColor
                            });
                        }
                    });
                };

                processAutoTags(genreVal, "Genre");
                processAutoTags(universeVal, "Univers");
                // ----------------------------------------

                const data = {
                    folder_path: window.GAME_CONFIG.base_path,
                    title_fr: document.getElementById('direct-gm-title-fr').value,
                    title_en: document.getElementById('direct-gm-title-en').value,
                    developer: document.getElementById('direct-gm-developer').value,
                    publisher: document.getElementById('direct-gm-publisher').value,
                    genre: genreVal,
                    release_date: document.getElementById('direct-gm-release-date').value,
                    platform: document.getElementById('direct-gm-platform').value,
                    universe: universeVal,
                    family_name: document.getElementById('direct-collection-input').value.trim(),
                    studio: document.getElementById('direct-gm-studio').value,
                    rating: parseFloat(document.getElementById('direct-gm-rating').value) || null,
                    keywords: document.getElementById('direct-gm-keywords').value,
                    youtube_urls: document.getElementById('direct-gm-youtube-urls').value,
                    tags: currentTags // On envoie les tags mis à jour
                };
                res = await fetch('/api/save_game_meta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else if (section === 'desc') {
                const data = {
                    folder_path: window.GAME_CONFIG.base_path,
                    text: document.getElementById('direct-desc-textarea').value
                };
                res = await fetch('/api/save_desc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else if (section === 'links') {
                const rows = document.querySelectorAll('#direct-links-editor-list .link-row');
                const links = [];
                rows.forEach(row => {
                    const n = row.querySelector('.link-name').value.trim();
                    const u = row.querySelector('.link-url').value.trim();
                    if (n && u) links.push({ name: n, url: u });
                });
                res = await fetch('/api/save_links', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder_path: window.GAME_CONFIG.base_path, links: links })
                });
            } else if (section === 'cover') {
                res = { ok: true };
            } else if (section === 'tags') {
                const items = document.querySelectorAll('.tag-item');
                const tags = [];
                items.forEach(it => {
                    // Si it a des datasets (nouveaux tags) ou des spans (tags existants)
                    const name = it.dataset.name || it.querySelector('span:nth-child(2)').textContent;
                    const family = it.dataset.family || it.closest('.tag-family-group').querySelector('.tag-family-title').textContent;
                    const color = it.dataset.color || it.querySelector('.tag-color-dot').style.backgroundColor;
                    tags.push({ name, family, color });
                });
                const collectionName = document.getElementById('direct-collection-input').value.trim();
                res = await fetch('/api/save_game_meta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        folder_path: window.GAME_CONFIG.base_path, 
                        tags: tags,
                        family_name: collectionName
                    })
                });
            }

            if (res && res.ok) {
                setCapsuleState(btn, 'success', _('saved_label'));
                
                // Mise à jour dynamique de l'interface (v2.4.71)
                if (section === 'meta') {
                    const data = {
                        title_fr: document.getElementById('direct-gm-title-fr').value,
                        title_en: document.getElementById('direct-gm-title-en').value,
                        developer: document.getElementById('direct-gm-developer').value,
                        publisher: document.getElementById('direct-gm-publisher').value,
                        genre: genreVal,
                        release_date: document.getElementById('direct-gm-release-date').value,
                        platform: document.getElementById('direct-gm-platform').value,
                        universe: universeVal,
                        studio: document.getElementById('direct-gm-studio').value,
                        rating: parseFloat(document.getElementById('direct-gm-rating').value) || null,
                        keywords: document.getElementById('direct-gm-keywords').value,
                        youtube_urls: document.getElementById('direct-gm-youtube-urls').value,
                        family: document.getElementById('direct-collection-input').value.trim(),
                        tags: currentTags 
                    };

                    console.log("[GameEditDirectModal] Updating local config with new family:", data.family);

                    // Titre principal
                    const mainTitle = data.title_fr || data.title_en || window.GAME_CONFIG.title;
                    const titleEl = document.querySelector('.game-title');
                    if (titleEl) {
                        titleEl.textContent = mainTitle;
                        titleEl.title = mainTitle;
                    }

                    // Lignes de métadonnées
                    const setDisplay = (idRow, idVal, val) => {
                        const row = document.getElementById(idRow);
                        const display = document.getElementById(idVal);
                        if (val) {
                            if (row) row.style.display = 'flex';
                            if (display) display.textContent = val;
                        } else if (row) {
                            row.style.display = 'none';
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

                    // Vidéos YouTube
                    if (typeof updateYoutubePlayer === 'function') {
                        updateYoutubePlayer(data.youtube_urls);
                    }

                    // Tags Sidebar
                    const tagsContainer = document.getElementById('sidebar-tags-container');
                    if (tagsContainer) {
                        if (data.tags && data.tags.length > 0) {
                            tagsContainer.style.display = 'flex';
                            tagsContainer.innerHTML = data.tags.map(t => `
                                <div class="sidebar-tag-badge" title="${t.family} : ${t.name}">
                                    <span class="tag-dot" style="background-color: ${t.color}"></span>
                                    <span>${t.name}</span>
                                </div>
                            `).join('');
                        } else {
                            tagsContainer.style.display = 'none';
                        }
                    }

                    // Update config for next open
                    if (window.GAME_CONFIG.meta) Object.assign(window.GAME_CONFIG.meta, data);
                } 
                else if (section === 'desc') {
                    const text = document.getElementById('direct-desc-textarea').value;
                    const descContent = document.getElementById('description-content');
                    if (descContent && typeof marked !== 'undefined') {
                        descContent.innerHTML = marked.parse(text || "");
                    }
                    window.GAME_CONFIG.description = text;
                }
                else if (section === 'links') {
                    const rows = document.querySelectorAll('#direct-links-editor-list .link-row');
                    const links = [];
                    rows.forEach(row => {
                        const n = row.querySelector('.link-name').value.trim();
                        const u = row.querySelector('.link-url').value.trim();
                        if (n && u) links.push({ name: n, url: u });
                    });
                    
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
                    } else if (containerLinks) {
                        containerLinks.style.display = 'none';
                    }
                    window.GAME_CONFIG.external_links = links;
                }
                else if (section === 'tags') {
                    const items = document.querySelectorAll('.tag-item');
                    const tags = [];
                    items.forEach(it => {
                        const name = it.dataset.name || it.querySelector('span:nth-child(2)').textContent;
                        const family = it.dataset.family || it.closest('.tag-family-group').querySelector('.tag-family-title').textContent;
                        const color = it.dataset.color || it.querySelector('.tag-color-dot').style.backgroundColor;
                        tags.push({ name, family, color });
                    });
                    
                    // Update Sidebar Tags
                    const tagsContainer = document.getElementById('sidebar-tags-container');
                    if (tagsContainer) {
                        if (tags.length > 0) {
                            tagsContainer.style.display = 'flex';
                            tagsContainer.innerHTML = tags.map(t => `
                                <div class="sidebar-tag-badge" title="${t.family} : ${t.name}">
                                    <span class="tag-dot" style="background-color: ${t.color}"></span>
                                    <span>${t.name}</span>
                                </div>
                            `).join('');
                        } else {
                            tagsContainer.style.display = 'none';
                        }
                    }

                    const collectionName = document.getElementById('direct-collection-input').value.trim();
                    if (window.GAME_CONFIG.meta) {
                        window.GAME_CONFIG.meta.tags = tags;
                        window.GAME_CONFIG.meta.family = collectionName;
                    }
                }

            } else {
                setCapsuleState(btn, 'error', 'Erreur');
            }
        } catch (e) {
            console.error(e);
            setCapsuleState(btn, 'error', 'Réseau');
        } finally {
            setTimeout(() => {
                btn.classList.remove('is-success', 'is-error');
                btn.innerHTML = btn.dataset.originalHtml;
                btn.disabled = false;
            }, 2000);
        }
    },

    runMetaAI: async function(btn) {
        if (!window.GAME_CONFIG) return;
        const feedback = document.getElementById('direct-gm-feedback');
        if (feedback) {
            feedback.style.color = '#fff';
            feedback.textContent = ''; // Vide pendant la recherche (le bouton capsule gère l'état)
        }
        setCapsuleState(btn, 'processing', (_('searching_label') || 'Analyse') + '...');

        try {
            const model = document.getElementById('gemini-model')?.value || 'gemini-flash-latest';
            const prompt = window.GAME_CONFIG.ai_prompt_editions;
            
            const res = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=${model}`);
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.detail || `Erreur ${res.status}`);
            if (!data.results || !data.results[0] || !data.results[0].body) throw new Error("Réponse vide");

            let aiText = data.results[0].body.trim();
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) aiText = jsonMatch[0];

            const result = JSON.parse(aiText);
            const editions = result.editions || [];

            if (editions.length > 0) {
                this.renderEditionSelector(editions);
                setCapsuleState(btn, 'success', _('found_label') || 'Trouvé');
                
                // On affiche le message d'invitation seulement après avoir trouvé des éditions
                if (feedback) feedback.textContent = _('select_edition_msg');
                
                // Auto-sélection de la première édition
                const selector = document.getElementById('direct-gm-edition-selector');
                const firstPill = selector ? selector.querySelector('.edition-pill') : null;
                if (firstPill) firstPill.click();

                // Sauvegarde du cache
                fetch('/api/save_editions_cache', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folder_path: window.GAME_CONFIG.base_path,
                        editions: editions
                    })
                }).catch(err => console.error("Erreur cache:", err));
            } else {
                setCapsuleState(btn, 'error', 'Aucun');
                if (feedback) feedback.textContent = "Aucun résultat trouvé.";
            }
        } catch (e) {
            console.error("IA Error:", e);
            setCapsuleState(btn, 'error', 'Erreur');
            if (feedback) {
                feedback.style.color = 'var(--danger)';
                feedback.textContent = "Erreur IA: " + e.message;
            }
        } finally {
            setTimeout(() => {
                btn.classList.remove('is-success', 'is-error');
                btn.innerHTML = btn.dataset.originalHtml;
                btn.disabled = false;
            }, 2000);
        }
    },

    renderEditionSelector: function(editions) {
        const container = document.getElementById('direct-gm-edition-selector');
        container.innerHTML = '';
        editions.forEach(ed => {
            const btn = document.createElement('button');
            btn.className = 'edition-pill';
            btn.textContent = ed.display_name;
            btn.onclick = () => {
                document.getElementById('direct-gm-title-fr').value = ed.title_fr || '';
                document.getElementById('direct-gm-title-en').value = ed.title_en || '';
                document.getElementById('direct-gm-developer').value = ed.developer || '';
                document.getElementById('direct-gm-publisher').value = ed.publisher || '';
                document.getElementById('direct-gm-genre').value = ed.genre || '';
                document.getElementById('direct-gm-release-date').value = ed.release_date || '';
                document.getElementById('direct-gm-platform').value = ed.platform || '';
                document.getElementById('direct-gm-universe').value = ed.universe || '';
                document.getElementById('direct-gm-studio').value = ed.studio || '';
                document.getElementById('direct-gm-rating').value = ed.rating || '';
                document.getElementById('direct-gm-keywords').value = ed.keywords || '';
                document.getElementById('direct-gm-youtube-urls').value = (ed.youtube_urls || []).join('\n');
                
                container.querySelectorAll('.edition-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
            container.appendChild(btn);
        });
    },

    generateDescription: async function(btn) {
        const prompt = document.getElementById('direct-ai-prompt').value;
        if (!prompt) return;
        
        setCapsuleState(btn, 'processing', _('generating_label') + '...');
        try {
            const model = document.getElementById('gemini-model')?.value || 'gemini-flash-latest';
            const res = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=${model}`);
            const data = await res.json();
            if (data.results && data.results[0]) {
                document.getElementById('direct-desc-textarea').value = data.results[0].body;
                setCapsuleState(btn, 'success', _('done_label'));
            }
        } catch (e) {
            setCapsuleState(btn, 'error', 'Erreur');
        } finally {
            setTimeout(() => {
                btn.classList.remove('is-success', 'is-error');
                btn.innerHTML = btn.dataset.originalHtml;
                btn.disabled = false;
            }, 2000);
        }
    },

    generateGameLinks: async function(btn) {
        if (!window.GAME_CONFIG) return;
        setCapsuleState(btn, 'processing', _('searching_label') + '...');
        const feedback = document.getElementById('direct-gl-feedback');
        feedback.textContent = _('ia_searching_links_msg');

        try {
            const model = document.getElementById('gemini-model')?.value || 'gemini-flash-latest';
            const prompt = `Trouve les liens officiels (Steam, GOG, IGDB, Site officiel) pour le jeu vidéo "${window.GAME_CONFIG.title}". Réponds UNIQUEMENT avec un JSON valide: {"links": [{"name": "...", "url": "..."}]}`;
            const res = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=${model}`);
            const data = await res.json();
            
            if (data.results && data.results[0]) {
                const body = data.results[0].body;
                const jsonMatch = body.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const linksData = JSON.parse(jsonMatch[0]);
                    if (linksData.links) {
                        linksData.links.forEach(l => this.addLinkRow(l.name, l.url));
                        setCapsuleState(btn, 'success', _('found_label'));
                        feedback.textContent = "Liens ajoutés.";
                    }
                }
            }
        } catch (e) {
            setCapsuleState(btn, 'error', 'Erreur');
            feedback.textContent = "Échec recherche liens.";
        } finally {
            setTimeout(() => {
                btn.classList.remove('is-success', 'is-error');
                btn.innerHTML = btn.dataset.originalHtml;
                btn.disabled = false;
                feedback.textContent = "";
            }, 2000);
        }
    },

    launchWebSearch: async function() {
        const query = document.getElementById('direct-cover-search-input').value;
        const container = document.getElementById('direct-web-results');
        const loadingMsg = _('searching_images_msg') || 'Recherche en cours...';
        container.innerHTML = `<div class="cover-grid-empty"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-dashoffset="15.7"/></svg><div style="margin-top:15px; opacity:0.8;">${loadingMsg}</div></div>`;

        
        try {
            const res = await fetch(`/api/search_cover?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            container.innerHTML = '';
            (data.images || []).forEach(url => {
                const el = document.createElement('div'); el.className = 'cover-option';
                const proxiedUrl = `/api/img_proxy?url=${encodeURIComponent(url)}`;
                el.innerHTML = `<img src="${proxiedUrl}" alt="" onerror="this.parentElement.remove()">`;
                el.onclick = async () => {
                    const resSave = await fetch('/api/save_cover', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder_path: window.GAME_CONFIG.base_path, image_url: url })
                    });
                    if (resSave.ok) {
                        document.getElementById('direct-cover-save-status').classList.add('visible');
                        setTimeout(() => document.getElementById('direct-cover-save-status').classList.remove('visible'), 2000);
                        
                        // Dynamic Update of cover (v2.4.72)
                        const mainCover = document.querySelector('.media-content.active img');
                        if (mainCover) {
                            mainCover.src = proxiedUrl;
                        }
                        const immersiveBg = document.querySelector('.immersive-bg');
                        if (immersiveBg) {
                            immersiveBg.style.backgroundImage = `url('${proxiedUrl}')`;
                            immersiveBg.style.display = 'block';
                        }
                        window.GAME_CONFIG.cover_url = url;
                    }
                };
                container.appendChild(el);
            });
        } catch(e) {
            container.innerHTML = '<p>Erreur lors de la recherche.</p>';
        }
    }
};
