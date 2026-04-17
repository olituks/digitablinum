/**
 * New Game Edit Wizard logic using GenericWizard component.
 */

window.GameEditWizardV2 = {
    instance: null,
    backgroundTasksTriggered: false,

    init: function() {
        if (this.instance) return;

        this.instance = createGenericWizard({
            id: 'generic-wizard-modal',
            title: _('wizard_default_title'),
            mode: 'wizard',
            steps: [
                {
                    label: _('metadata_tab'),
                    content: () => document.querySelector('#game-tab-meta').innerHTML,
                    onEnter: (state, body) => this.onEnterMeta(state, body)
                },
                {
                    label: _('cover_tab'),
                    content: () => document.querySelector('#game-tab-cover').innerHTML,
                    onEnter: (state, body) => this.onEnterCover(state, body)
                },
                {
                    label: _('synopsis_tab'),
                    content: () => document.querySelector('#game-tab-desc').innerHTML,
                    onEnter: (state, body) => this.onEnterDesc(state, body)
                },
                {
                    label: _('links_tab'),
                    content: () => document.querySelector('#game-tab-links').innerHTML,
                    onEnter: (state, body) => this.onEnterLinks(state, body)
                }
            ],
            onSubmit: async (state) => await this.finalSubmit(state)
        });
    },

    open: function() {
        if (!this.instance) this.init();
        this.backgroundTasksTriggered = false;
        this.instance.heightLocked = false;
        if (this.instance.bodyEl) this.instance.bodyEl.style.minHeight = '';
        
        if (window.GAME_CONFIG) {
            // Update title to game name
            const gameTitle = window.GAME_CONFIG.title || _('game_label');
            this.instance.config.title = gameTitle;
            if (this.instance.titleEl) this.instance.titleEl.innerText = gameTitle;

            const meta = window.GAME_CONFIG.meta || {};
            this.instance.state = {
                'gm-title-fr': meta.title_fr || '',
                'gm-title-en': meta.title_en || '',
                'gm-developer': meta.developer || '',
                'gm-publisher': meta.publisher || '',
                'gm-genre': meta.genre || '',
                'gm-release-date': meta.release_date || '',
                'gm-platform': meta.platform || '',
                'gm-universe': meta.universe || '',
                'gm-studio': meta.studio || '',
                'gm-rating': meta.rating || '',
                'gm-keywords': meta.keywords || '',
                'gm-youtube-urls': meta.youtube_urls || '',
                'desc-textarea': window.GAME_CONFIG.description || '',
                'search-input': meta.title_fr || meta.title_en || window.GAME_CONFIG.title,
                'ai_results_cover': null,
                'ai_results_desc': null,
                'ai_results_links': null,
                'status_meta': 'idle',
                'status_cover': 'idle',
                'status_desc': 'idle',
                'status_links': 'idle'
            };
        }

        this.instance.open();
    },

    onEnterMeta: function(state, body) {
        console.log("onEnterMeta - body:", body);
        // Transformation de l'icône IA en bouton capsule
        // Search specifically for the button that calls generateGameMeta
        const genIcon = body.querySelector('button[onclick*="generateGameMeta"]');
        if (genIcon) {
            console.log("Found IA button, transforming...");
            genIcon.className = 'btn-capsule';
            genIcon.style.display = 'inline-flex';
            genIcon.style.marginLeft = '10px';
            genIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                <span>${_('generate_with_ai_btn')}</span>
            `;
            genIcon.onclick = (e) => {
                e.preventDefault();
                this.runMetaAI(genIcon);
            };

            // Restore state if processing or success
            if (state.status_meta === 'processing') {
                setCapsuleState(genIcon, 'processing', _('loading_label') + '...');
            } else if (state.status_meta === 'success') {
                setCapsuleState(genIcon, 'success', _('generated_label'));
            }
        } else {
            console.warn("IA button NOT found in Meta step.");
        }

        if (_gameEditions.length === 0 && window.GAME_CONFIG && window.GAME_CONFIG.editions_cache) {
            renderEditionPills(window.GAME_CONFIG.editions_cache);
        }
    },

    runMetaAI: async function(btn) {
        this.instance.state.status_meta = 'processing';
        await generateGameMeta(btn);
        this.instance.state.status_meta = 'success';
        this.syncDOMToState();
        this.triggerBackgroundTasks();
    },

    triggerBackgroundTasks: function() {
        if (this.backgroundTasksTriggered) return;
        this.backgroundTasksTriggered = true;
        
        console.log("🚀 Starting background AI tasks...");
        this.runCoverSearch();
        this.runDescGeneration();
        this.runLinksSearch();
    },

    runCoverSearch: async function() {
        this.instance.state.status_cover = 'processing';
        const state = this.instance.state;
        const title = state['gm-title-fr'] || state['gm-title-en'] || window.GAME_CONFIG.title;
        const q = `${title} ${state['gm-developer']} ${state['gm-release-date']}`.trim();
        
        try {
            const res = await fetch(`/api/search_cover?query=${encodeURIComponent(q)}`);
            const data = await res.json();
            this.instance.state.ai_results_cover = data.images || [];
            this.instance.state.status_cover = 'success';
            console.log("✅ Background: Cover search done.");
            this.refreshCurrentStepIf('cover');
        } catch (e) {
            this.instance.state.status_cover = 'error';
        }
    },

    runDescGeneration: async function() {
        this.instance.state.status_desc = 'processing';
        const state = this.instance.state;
        const title = state['gm-title-fr'] || state['gm-title-en'] || window.GAME_CONFIG.title;
        const prompt = window.GAME_CONFIG.ai_prompt_desc + ` (Contexte : Jeu vidéo ${title}, développé par ${state['gm-developer']} sorti en ${state['gm-release-date']})`;
        
        try {
            const res = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=gemini-flash-latest`);
            const data = await res.json();
            if (data.results && data.results[0]) {
                this.instance.state.ai_results_desc = data.results[0].body;
                this.instance.state['desc-textarea'] = data.results[0].body;
            }
            this.instance.state.status_desc = 'success';
            console.log("✅ Background: Description generation done.");
            this.refreshCurrentStepIf('desc');
        } catch (e) {
            this.instance.state.status_desc = 'error';
        }
    },

    runLinksSearch: async function() {
        this.instance.state.status_links = 'processing';
        const state = this.instance.state;
        const title = state['gm-title-fr'] || state['gm-title-en'] || window.GAME_CONFIG.title;
        let prompt = window.GAME_CONFIG.ai_prompt_links;
        prompt = prompt.replace('{title}', title).replace('{pub}', state['gm-publisher']);

        try {
            const res = await fetch(`/api/search_desc?query=${encodeURIComponent(prompt)}&model=gemini-flash-latest`);
            const data = await res.json();
            let aiText = data.results[0].body.trim();
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) aiText = jsonMatch[0];
            const result = JSON.parse(aiText);
            
            this.instance.state.ai_results_links = result.links || [];
            this.instance.state.status_links = 'success';
            console.log("✅ Background: Links search done.");
            this.refreshCurrentStepIf('links');
        } catch (e) {
            this.instance.state.status_links = 'error';
        }
    },

    refreshCurrentStepIf: function(stepId) {
        const currentStep = this.instance.config.steps[this.instance.currentStepIndex];
        if (currentStep.label.toLowerCase().includes(stepId) || (stepId === 'cover' && currentStep.label === 'Illustration')) {
            this.instance.renderStep(this.instance.currentStepIndex);
        }
    },

    onEnterCover: function(state, body) {
        const container = body.querySelector('#web-results');
        const btn = body.querySelector('.cover-search-btn');
        
        if (state.status_cover === 'processing') {
            if (btn) setCapsuleState(btn, 'processing', 'Recherche...');
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#fff; opacity:0.7; font-style:italic;"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-dashoffset="15.7"/></svg><br><br>Recherche automatique en cours...</div>';
        } else if (state.status_cover === 'success' && state.ai_results_cover) {
            container.innerHTML = "";
            state.ai_results_cover.forEach(url => {
                if (!url || url === 'None') return;
                
                // Filtrer les images "non disponibles" connues (placeholders)
                const lowerUrl = url.toLowerCase();
                const isPlaceholder = lowerUrl.includes('placeholder') || 
                                    lowerUrl.includes('notfound') || 
                                    lowerUrl.includes('no-image') ||
                                    lowerUrl.includes('default-cover') ||
                                    lowerUrl.includes('image-not-available') ||
                                    lowerUrl.includes('unavailable') ||
                                    lowerUrl.includes('nocover');
                
                if (isPlaceholder) return;

                const el = document.createElement('div'); el.className = 'cover-option';
                const proxiedUrl = `/api/img_proxy?url=${encodeURIComponent(url)}`;
                el.innerHTML = `<img src="${proxiedUrl}" alt="" onerror="this.parentElement.remove()">`;
                el.onclick = () => saveFromWeb(url);
                container.appendChild(el);
            });
        }
    },

    onEnterDesc: function(state, body) {
        const textarea = body.querySelector('#desc-textarea');
        const genBtn = body.querySelector('button[onclick="generateDescription(this)"]');
        
        if (genBtn) {
            genBtn.className = 'btn-capsule';
            genBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                <span>Régénérer</span>
            `;
        }

        if (state.status_desc === 'processing') {
            if (genBtn) setCapsuleState(genBtn, 'processing', 'Génération...');
            if (textarea) textarea.placeholder = "Génération automatique en cours...";
        } else if (state.status_desc === 'success') {
            if (textarea) textarea.value = state['desc-textarea'];
        }
    },

    onEnterLinks: function(state, body) {
        const list = body.querySelector('#links-editor-list');
        const genBtn = body.querySelector('button[onclick="generateGameLinks(this)"]');

        if (genBtn) {
            genBtn.className = 'btn-capsule';
            genBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                <span>Suggérer d'autres liens</span>
            `;
        }

        if (state.status_links === 'processing') {
            if (genBtn) setCapsuleState(genBtn, 'processing', 'Recherche...');
            list.innerHTML = '<div style="padding:20px; color:#fff; opacity:0.7; font-style:italic;">Recherche des liens de référence...</div>';
        } else if (state.status_links === 'success' && state.ai_results_links) {
            list.innerHTML = '';
            state.ai_results_links.forEach(link => {
                const row = document.createElement('div');
                row.className = 'link-row';
                row.innerHTML = `<input type="text" value="${link.name}" class="link-name"><input type="text" value="${link.url}" class="link-url"><button class="icon-action icon-action--danger" onclick="this.parentElement.remove()">×</button>`;
                list.appendChild(row);
            });
        }
    },

    syncDOMToState: function() {
        if (this.instance) {
            this.instance.bodyEl.querySelectorAll('input, textarea, select').forEach(el => {
                const key = el.name || el.id;
                if (key) {
                    this.instance.state[key] = (el.type === 'checkbox') ? el.checked : el.value;
                }
            });
        }
    },

    finalSubmit: async function(state) {
        console.log("Final centralized save...");
        this.syncDOMToState();
        
        const results = [];
        const metaData = {
            folder_path: window.GAME_CONFIG.base_path,
            title_fr: state['gm-title-fr'],
            title_en: state['gm-title-en'],
            developer: state['gm-developer'],
            publisher: state['gm-publisher'],
            genre: state['gm-genre'],
            release_date: state['gm-release-date'],
            platform: state['gm-platform'],
            universe: state['gm-universe'],
            studio: state['gm-studio'],
            rating: parseFloat(state['gm-rating']) || null,
            keywords: state['gm-keywords'],
            youtube_urls: state['gm-youtube-urls'],
            synopsis: state['desc-textarea']
        };

        results.push(fetch('/api/save_game_meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metaData)
        }));

        const linkRows = document.querySelectorAll('.link-row');
        const links = [];
        linkRows.forEach(row => {
            const name = row.querySelector('.link-name')?.value.trim();
            const url = row.querySelector('.link-url')?.value.trim();
            if (name && url) links.push({ name, url });
        });

        if (links.length > 0) {
            results.push(fetch('/api/save_links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_path: window.GAME_CONFIG.base_path, links: links })
            }));
        }

        await Promise.all(results);
        location.reload();
    }
};
