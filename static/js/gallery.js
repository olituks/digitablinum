// --- LOGIQUE SIDEBAR ET RESIZER ---
const layoutGrid = document.getElementById('layout-grid');
const resizer = document.getElementById('drag-handle');
const btnToggle = document.getElementById('btn-toggle-sidebar');

let sidebarWidth = 350;
let isResizing = false;

function toggleSidebar() {
    if (!layoutGrid || !btnToggle) return;
    layoutGrid.classList.toggle('sidebar-hidden');
    if (layoutGrid.classList.contains('sidebar-hidden')) {
        layoutGrid.style.gridTemplateColumns = `1fr 0px 0px`;
        btnToggle.style.opacity = '0.6';
    } else {
        layoutGrid.style.gridTemplateColumns = `1fr 6px ${sidebarWidth}px`;
        btnToggle.style.opacity = '1';
    }
}

if (resizer) {
    resizer.addEventListener('mousedown', (e) => { 
        isResizing = true; 
        resizer.classList.add('dragging'); 
        document.body.style.cursor = 'col-resize'; 
        e.preventDefault(); 
    });
}

document.addEventListener('mousemove', (e) => {
    if (!isResizing || !layoutGrid) return;
    let newWidth = window.innerWidth - e.clientX;
    if (newWidth < 250) newWidth = 250; 
    if (newWidth > window.innerWidth * 0.4) newWidth = window.innerWidth * 0.4;
    sidebarWidth = newWidth;
    layoutGrid.style.gridTemplateColumns = `1fr 6px ${newWidth}px`;
});

document.addEventListener('mouseup', () => { 
    if (isResizing) { 
        isResizing = false; 
        if (resizer) resizer.classList.remove('dragging'); 
        document.body.style.cursor = 'default'; 
    } 
});

// --- MÉMORISATION DU SCROLL ---
const mainContentArea = document.querySelector('.gallery-content');
if (history.scrollRestoration) history.scrollRestoration = 'manual';
const SCROLL_KEY = "gallery_scroll_pos";

const savedScroll = sessionStorage.getItem(SCROLL_KEY);
if (savedScroll && mainContentArea) {
    setTimeout(() => {
        mainContentArea.scrollTop = parseInt(savedScroll, 10);
        mainContentArea.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize')); 
    }, 100);
}

// --- RECHERCHE ET FILTRAGE AVANCÉ ---
let searchInput;
let cards = [];
let galleryContainer;
let emptyState;

const normalizeText = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const stripPunct    = t => (t || "").replace(/[^a-z0-9]/g, "");

// État des filtres
let selectedTags = new Set(); // Set de strings: "family:name"
let activeFamily = null; // Nom de la famille active
let filterMode = 'OR'; // 'OR' ou 'AND'
const FILTERS_COOKIE_NAME = "advanced_filters_state";

async function filterByFamily(familyName) {
    const header = document.getElementById('family-header');
    if (activeFamily === familyName) {
        backToGallery();
    } else {
        activeFamily = familyName;
        // Pousser un état dans l'historique pour le bouton Back
        history.pushState({ family: familyName }, "", window.location.pathname + window.location.search);
        
        // Si on filtre par famille, on nettoie les autres filtres pour la clarté
        selectedTags.clear();
        document.querySelectorAll('.filter-tag-pill').forEach(p => p.classList.remove('active'));
        if (searchInput) searchInput.value = '';
        const visualSearchContainer = document.getElementById('visual-search-container');
        if (visualSearchContainer) {
            visualSearchContainer.classList.add('visual-search-hidden');
            visualSearchContainer.innerHTML = '';
        }
        
        try {
            const res = await fetch('/api/admin/families');
            const families = await res.json();
            const family = families.find(f => f.name === familyName);
            if (family && header) {
                document.getElementById('family-title').innerText = family.name;
                document.getElementById('family-description').innerText = family.description || "";
                const coverImg = document.getElementById('family-cover');
                if (family.cover_path) {
                    coverImg.src = family.cover_path;
                    coverImg.style.display = 'block';
                } else {
                    coverImg.style.display = 'none';
                }
                header.style.display = 'flex';
            } else if (header) {
                // Si pas d'infos admin, on affiche quand même un header minimaliste ou on le cache
                document.getElementById('family-title').innerText = familyName;
                document.getElementById('family-description').innerText = "";
                document.getElementById('family-cover').style.display = 'none';
                header.style.display = 'flex';
            }
        } catch (e) {
            console.error("Error loading family info:", e);
        }
    }
    applyFilters();
}

/**
 * Sort du mode Collection tout en préservant les filtres avancés globaux (Tri, Tags, Recherche)
 */
window.backToGallery = () => {
    activeFamily = null;
    const header = document.getElementById('family-header');
    if (header) header.style.display = 'none';
    
    // On ne réinitialise PAS tout, on déclenche juste un filtrage sans la famille
    applyFilters();
};

function saveFiltersState() {
    const state = {
        search: searchInput ? searchInput.value : "",
        sort: document.getElementById('filter-sort')?.value || "name_asc",
        rating: document.getElementById('filter-rating')?.value || "0",
        mode: filterMode,
        tags: Array.from(selectedTags)
    };
    
    // Cookie valide 30 jours
    const d = new Date();
    d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = FILTERS_COOKIE_NAME + "=" + encodeURIComponent(JSON.stringify(state)) + ";" + expires + ";path=/;SameSite=Strict";
}

function loadFiltersState() {
    const name = FILTERS_COOKIE_NAME + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    let cookieVal = "";
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(name) === 0) {
            cookieVal = c.substring(name.length, c.length);
            break;
        }
    }
    
    if (!cookieVal) return;
    
    try {
        const state = JSON.parse(cookieVal);
        
        // 1. Recherche
        if (searchInput && state.search) {
            searchInput.value = state.search;
        }
        
        // 2. Tri
        const sortEl = document.getElementById('filter-sort');
        if (sortEl && state.sort) {
            sortEl.value = state.sort;
        }

        // 3. Note
        const ratingEl = document.getElementById('filter-rating');
        if (ratingEl && state.rating) {
            ratingEl.value = state.rating;
        }
        
        // 4. Mode
        if (state.mode) {
            filterMode = state.mode;
            // Mise à jour visuelle immédiate
            const btnOr = document.getElementById('btn-filter-or');
            const btnAnd = document.getElementById('btn-filter-and');
            if (btnOr && btnAnd) {
                btnOr.classList.toggle('active', filterMode === 'OR');
                btnAnd.classList.toggle('active', filterMode === 'AND');
            }
        }
        
        // 5. Tags
        if (state.tags && Array.isArray(state.tags)) {
            selectedTags = new Set(state.tags);
            // Les pilules seront marquées actives par renderFilterTags lors de l'initialisation
        }
    } catch (e) {
        console.error("Failed to load filters from cookie:", e);
    }
}

function resetFilters() {
    selectedTags.clear();
    document.querySelectorAll('.filter-tag-pill').forEach(p => p.classList.remove('active'));
    
    const sortEl = document.getElementById('filter-sort');
    if (sortEl) sortEl.value = 'name_asc';

    const ratingEl = document.getElementById('filter-rating');
    if (ratingEl) ratingEl.value = '0';
    
    setFilterMode('OR');
    
    if (searchInput) searchInput.value = '';
    
    // Supprimer le cookie
    document.cookie = FILTERS_COOKIE_NAME + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;";
    
    applyFilters();
}

function setFilterMode(mode) {
    filterMode = mode;
    
    // Mise à jour visuelle des boutons capsule
    const btnOr = document.getElementById('btn-filter-or');
    const btnAnd = document.getElementById('btn-filter-and');
    
    if (btnOr && btnAnd) {
        if (mode === 'OR') {
            btnOr.classList.add('active');
            btnAnd.classList.remove('active');
        } else {
            btnAnd.classList.add('active');
            btnOr.classList.remove('active');
        }
    }
    
    saveFiltersState();
    applyFilters();
}

function renderFilterTags(tags) {
    const list = document.getElementById('filter-tags-list');
    if (!list) return;
    list.innerHTML = '';

    const families = {};
    tags.forEach(t => {
        if (!families[t.family]) families[t.family] = [];
        families[t.family].push(t);
    });

    Object.keys(families).sort().forEach(familyName => {
        const group = document.createElement('div');
        group.className = 'filter-tag-family-group';
        group.innerHTML = `
            <div class="filter-tag-family-name">${familyName}</div>
            <div class="filter-tag-items"></div>
        `;
        const itemsDiv = group.querySelector('.filter-tag-items');
        families[familyName].sort((a,b) => a.name.localeCompare(b.name)).forEach(t => {
            const pill = document.createElement('div');
            pill.className = 'filter-tag-pill';
            pill.innerHTML = `<span class="filter-tag-dot" style="background-color:${t.color}"></span><span>${t.name}</span>`;
            const key = `${t.family}:${t.name}`;
            if (selectedTags.has(key)) pill.classList.add('active');
            
            pill.onclick = () => {
                pill.classList.toggle('active');
                if (pill.classList.contains('active')) selectedTags.add(key);
                else selectedTags.delete(key);
                saveFiltersState();
                applyFilters();
            };
            itemsDiv.appendChild(pill);
        });
        list.appendChild(group);
    });
}

function applyFilters() {
    if (!searchInput) searchInput = document.getElementById('game-search');
    if (!cards || cards.length === 0) cards = Array.from(document.querySelectorAll('.game-card'));
    if (!galleryContainer) galleryContainer = document.getElementById('gallery-container');
    if (!emptyState) emptyState = document.getElementById('gallery-empty');

    const rawTerm = searchInput ? searchInput.value : "";
    const termNorm  = normalizeText(rawTerm);
    const searchWords = termNorm.split(/\s+/).filter(w => w.length > 0).map(w => stripPunct(w)).filter(w => w.length > 0);
    
    const mode = filterMode || 'OR';
    const minRating = parseInt(document.getElementById('filter-rating')?.value || "0", 10);
    
    let visibleCount = 0;

    cards.forEach(c => {
        const titleEl = c.querySelector('.card-title');
        if (!titleEl) return;
        
        const folderKey = c.dataset.folder ? c.dataset.folder.toLowerCase() : "";
        const gameData = (window.GAMES_DATA && window.GAMES_DATA[folderKey]) || null;

        const titleText = titleEl.innerText.trim();
        const titleNorm  = normalizeText(titleText);
        const titleClean = stripPunct(titleNorm);
        let textMatch = true;

        if (searchWords.length > 0) {
            textMatch = searchWords.some(word => titleClean.includes(word));
        }

        let ratingMatch = true;
        if (minRating > 0) {
            const rating = gameData ? (gameData.user_rating || 0) : 0;
            ratingMatch = rating >= minRating;
        }

        let tagMatch = true;
        if (selectedTags.size > 0) {
            const gameTags = gameData ? (gameData.tags || []).map(t => `${t.family}:${t.name}`) : [];
            if (mode === 'OR') tagMatch = Array.from(selectedTags).some(t => gameTags.includes(t));
            else tagMatch = Array.from(selectedTags).every(t => gameTags.includes(t));
        }

        let familyMatch = true;
        if (activeFamily) {
            familyMatch = (c.dataset.family === activeFamily);
        }

        const isVisible = textMatch && ratingMatch && tagMatch && familyMatch;
        c.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
    });

    if (emptyState) emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
    
    saveFiltersState();
    sortGallery();
}

function sortGallery() {
    const sortEl = document.getElementById('filter-sort');
    if (!sortEl || !galleryContainer || !cards || cards.length === 0) return;
    const sortBy = sortEl.value;
    
    saveFiltersState();

    const sortedCards = [...cards].sort((a, b) => {
        const folderA = a.dataset.folder ? a.dataset.folder.toLowerCase() : "";
        const folderB = b.dataset.folder ? b.dataset.folder.toLowerCase() : "";
        
        // Sécurisation maximale : on essaye GAMES_DATA, sinon on prend le texte HTML
        const titleA = (window.GAMES_DATA && window.GAMES_DATA[folderA] && window.GAMES_DATA[folderA].title) || a.querySelector('.card-title')?.innerText || "";
        const titleB = (window.GAMES_DATA && window.GAMES_DATA[folderB] && window.GAMES_DATA[folderB].title) || b.querySelector('.card-title')?.innerText || "";

        const ctimeA = (window.GAMES_DATA && window.GAMES_DATA[folderA] && window.GAMES_DATA[folderA].ctime) || 0;
        const ctimeB = (window.GAMES_DATA && window.GAMES_DATA[folderB] && window.GAMES_DATA[folderB].ctime) || 0;

        const releaseA = (window.GAMES_DATA && window.GAMES_DATA[folderA] && window.GAMES_DATA[folderA].release_date) || "";
        const releaseB = (window.GAMES_DATA && window.GAMES_DATA[folderB] && window.GAMES_DATA[folderB].release_date) || "";

        const ratingA = (window.GAMES_DATA && window.GAMES_DATA[folderA] && window.GAMES_DATA[folderA].user_rating) || 0;
        const ratingB = (window.GAMES_DATA && window.GAMES_DATA[folderB] && window.GAMES_DATA[folderB].user_rating) || 0;

        switch (sortBy) {
            case 'name_asc':
                return titleA.localeCompare(titleB);
            case 'name_desc':
                return titleB.localeCompare(titleA);
            case 'date_added_desc':
                return ctimeB - ctimeA;
            case 'date_added_asc':
                return ctimeA - ctimeB;
            case 'release_desc':
                return releaseB.localeCompare(releaseA);
            case 'release_asc':
                return releaseA.localeCompare(releaseB);
            case 'rating_desc':
                return ratingB - ratingA;
            case 'rating_asc':
                return ratingA - ratingB;
            default:
                return 0;
        }
    });

    sortedCards.forEach(c => galleryContainer.appendChild(c));
}

document.addEventListener('DOMContentLoaded', () => {
    searchInput = document.getElementById('game-search');
    cards = Array.from(document.querySelectorAll('.game-card'));
    galleryContainer = document.getElementById('gallery-container');
    emptyState = document.getElementById('gallery-empty');

    console.log(`🔍 Gallery initialized with ${cards.length} cards.`);

    if (galleryContainer) {
        galleryContainer.classList.add('ready');
        galleryContainer.style.opacity = '1';
        galleryContainer.style.visibility = 'visible';
    }
    
    // Charger l'état sauvegardé AVANT le premier applyFilters
    loadFiltersState();

    if (window.ALL_TAGS) {
        renderFilterTags(window.ALL_TAGS);
    }

    // Premier filtrage après chargement de l'état
    applyFilters();

    // Fix: Force un recalcul de la zone de scroll
    if (mainContentArea) {
        requestAnimationFrame(() => {
            mainContentArea.style.display = 'none';
            mainContentArea.offsetHeight; // force reflow
            mainContentArea.style.display = 'block';
            console.log("🚀 Scroll area reflow forced.");
        });
    }

    // --- GESTION DE LA RECHERCHE VISUELLE ---
    const visualSearchContainer = document.getElementById('visual-search-container');
    
    function updateVisualSearch(query, isPasting = false) {
        if (!visualSearchContainer) return;
        
        // On nettoie la query pour ignorer les espaces de fin si nécessaire ? 
        // Non, on garde tel quel pour la fidélité visuelle.
        const currentText = Array.from(visualSearchContainer.querySelectorAll('.visual-search-letter'))
            .map(el => el.textContent).join('');
        
        if (query === currentText) return;

        // Si query est vide, on cache tout
        if (!query || query.length === 0) {
            visualSearchContainer.classList.add('visual-search-hidden');
            // Petit délai pour l'animation d'opacité avant de vider
            setTimeout(() => {
                if (!searchInput || searchInput.value.length === 0) {
                    visualSearchContainer.innerHTML = '';
                }
            }, 300);
            return;
        }

        visualSearchContainer.classList.remove('visual-search-hidden');

        // Cas simple: on reconstruit tout si on colle ou si la différence est complexe
        if (isPasting || Math.abs(query.length - currentText.length) > 1) {
            visualSearchContainer.innerHTML = '';
            for (let char of query) {
                const span = document.createElement('span');
                span.className = 'visual-search-letter';
                span.textContent = char === ' ' ? '\u00A0' : char; // NBSP pour l'espace
                visualSearchContainer.appendChild(span);
            }
            return;
        }

        // Cas unitaire: Ajout (à la fin)
        if (query.length > currentText.length) {
            const char = query[query.length - 1];
            const span = document.createElement('span');
            span.className = 'visual-search-letter letter-animate-in';
            span.textContent = char === ' ' ? '\u00A0' : char;
            visualSearchContainer.appendChild(span);
            
            // On retire la classe d'animation après coup
            setTimeout(() => span.classList.remove('letter-animate-in'), 300);
        } 
        // Cas unitaire: Suppression (Backspace - à la fin)
        else {
            const lastSpan = visualSearchContainer.lastElementChild;
            if (lastSpan) {
                lastSpan.classList.add('letter-animate-out');
                setTimeout(() => {
                    // Vérifier si c'est toujours le dernier et si on doit vraiment le supprimer
                    if (lastSpan.parentElement === visualSearchContainer) {
                        lastSpan.remove();
                        // Si vide maintenant, cacher
                        if (visualSearchContainer.children.length === 0) {
                            visualSearchContainer.classList.add('visual-search-hidden');
                        }
                    }
                }, 180);
            }
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            updateVisualSearch(searchInput.value);
        });
        
        // Fix: Restaurer la recherche visuelle si un terme était mémorisé (cookie)
        if (searchInput.value) {
            updateVisualSearch(searchInput.value, true);
        }
    }

    // --- ECOUTEUR CLAVIER GLOBAL ---
    document.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
        
        // Si on est déjà dans un champ, on laisse faire le comportement par défaut
        if (isInput) return;

        // On ignore les raccourcis système
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Gestion du Backspace (si pas dans un input)
        if (e.key === 'Backspace' && searchInput && searchInput.value.length > 0) {
            e.preventDefault();
            searchInput.value = searchInput.value.slice(0, -1);
            // Trigger l'event input pour que le filtrage et la recherche visuelle s'activent
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        // Si l'utilisateur tape un caractère imprimable
        if (e.key.length === 1) {
            if (searchInput) {
                // Au lieu de focus l'input, on ajoute directement le caractère
                searchInput.value += e.key;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    });

    // Gestion du Paste global
    document.addEventListener('paste', (e) => {
        const activeEl = document.activeElement;
        const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
        
        if (!isInput && searchInput) {
            const pasteData = (e.clipboardData || window.clipboardData).getData('text');
            if (pasteData) {
                searchInput.value += pasteData;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                // On force le mode "pasting" pour reconstruire sans animation lettre par lettre
                updateVisualSearch(searchInput.value, true);
            }
        }
    });

    // --- INITIALISATION LOZAD (Lazy Loading) ---
    if (typeof lozad === 'function') {
        const observer = lozad('.lozad', {
            rootMargin: '1000px 0px', // Preload images much earlier
            threshold: 0.1,
            loaded: function(el) {
                const isPicture = el.nodeName.toLowerCase() === 'picture';
                const img = isPicture ? el.querySelector('img') : el;
                
                // Fix: Si c'est un picture, on s'assure que les sources sont swappées
                // car certaines versions de lozad peuvent rater le coche si mal configuré
                if (isPicture) {
                    el.querySelectorAll('source').forEach(s => {
                        if (s.dataset.srcset && !s.srcset) s.srcset = s.dataset.srcset;
                    });
                    if (img && img.dataset.src && !img.src) img.src = img.dataset.src;
                    if (img && img.dataset.srcset && !img.srcset) img.srcset = img.dataset.srcset;
                }

                if (img && 'decode' in img) {
                    img.decode().then(() => {
                        el.dataset.loaded = "true";
                    }).catch((err) => {
                        el.dataset.loaded = "true";
                    });
                } else {
                    el.dataset.loaded = "true";
                }
            }
        });
        observer.observe();
        window.lozadObserver = observer;
    }

    // Fix: Gérer le bouton "Back" du navigateur pour réinitialiser les filtres
    window.addEventListener('popstate', (event) => {
        // On réinitialise systématiquement la vue pour sortir du filtre collection/recherche
        window.backToGallery();
    });
});

let scrollTimeout;
if (mainContentArea) {
    mainContentArea.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            sessionStorage.setItem(SCROLL_KEY, mainContentArea.scrollTop);
        }, 100);
    }, { passive: true });
}

// --- SCAN BIBLIOTHÈQUE ---
const brandBtn = document.getElementById('brand-btn');
const d20Icon  = document.getElementById('d20-icon');
let   scanning = false;

if (brandBtn) {
    brandBtn.addEventListener('click', async () => {
        if (scanning) return;
        scanning = true;
        if (d20Icon) d20Icon.style.animation = 'spin-d20 1s linear infinite';
        brandBtn.style.opacity  = '0.7';
        sessionStorage.removeItem(SCROLL_KEY);
        await fetch('/api/restart', { method: 'POST' });
        setTimeout(() => location.reload(), 1500);
    });

    let hintTimer, gravityTimer;
    brandBtn.style.transition = 'all 0.3s ease';
    
    brandBtn.addEventListener('mouseenter', () => {
        hintTimer = setTimeout(() => {
            brandBtn.style.color = 'var(--primary)';
            brandBtn.style.textShadow = '0 0 20px var(--primary-glow)';
            brandBtn.style.transform = 'scale(1.05)';
        }, 3000);

        gravityTimer = setTimeout(() => {
            triggerGravity();
        }, 7000);
    });

    brandBtn.addEventListener('mouseleave', () => {
        clearTimeout(hintTimer);
        clearTimeout(gravityTimer);
        brandBtn.style.color = '';
        brandBtn.style.textShadow = '';
        brandBtn.style.transform = '';
    });
}

function triggerGravity() {
    const cards = document.querySelectorAll('.game-card');
    if (cards.length === 0) return;
    
    cards.forEach((card) => {
        const randRot = (Math.random() * 120 - 60) + 'deg';
        card.style.setProperty('--rand-rot', randRot);
        setTimeout(() => {
            card.classList.add('card-falling');
        }, Math.random() * 800);
    });

    setTimeout(() => {
        cards.forEach(card => {
            card.classList.remove('card-falling');
            card.classList.add('card-reappear');
            setTimeout(() => {
                card.classList.remove('card-reappear');
            }, 1000);
        });
    }, 4500);
}

// --- GESTION DU LONG-PRESS (ADMIN) ---
if (document.getElementById('mgmt-modal')) {
    let longPressTimer;
    let isLongPress = false;
    let currentMgmtGame = { title: '', folderPath: '' };
    const LONG_PRESS_DURATION = 3000;

    const mgmtModal = document.getElementById('mgmt-modal');
    const confirmDeleteModal = document.getElementById('confirm-delete-modal');
    const confirmDeleteModal2 = document.getElementById('confirm-delete-modal-2');

    function startLongPress(e, card) {
        isLongPress = false;
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            openManagementModal(card);
        }, LONG_PRESS_DURATION);
        
        card.classList.add('pressing');
    }

    function cancelLongPress(card) {
        clearTimeout(longPressTimer);
        card.classList.remove('pressing');
    }

    async function openManagementModal(card) {
        const titleElInside = card.querySelector('.card-title');
        currentMgmtGame.title = titleElInside ? titleElInside.innerText : "Inconnu";
        currentMgmtGame.folderPath = card.dataset.folder;
        
        const titleEl = document.getElementById('mgmt-modal-title');
        if (titleEl) titleEl.innerText = _('game_management_title') + " : " + currentMgmtGame.title;
        
        const btnRestore = document.getElementById('btn-restore-backup');
        try {
            const res = await fetch(`/api/admin/list_cache_files?folder_path=${encodeURIComponent(currentMgmtGame.folderPath)}`);
            const data = await res.json();
            if (btnRestore) btnRestore.style.display = data.has_backup ? 'flex' : 'none';
        } catch(e) {
            if (btnRestore) btnRestore.style.display = 'none';
        }

        if (mgmtModal) mgmtModal.showModal();
        card.classList.remove('pressing');
    }

    const btnEditMeta = document.getElementById('btn-edit-meta');
    if (btnEditMeta) {
        btnEditMeta.onclick = () => {
            window.location.href = `/view?path=${encodeURIComponent(currentMgmtGame.folderPath)}&edit=true`;
        };
    }

    const btnRename = document.getElementById('btn-rename-game');
    if (btnRename) {
        btnRename.onclick = async () => {
            const newName = prompt(_('rename_folder_btn') + " :", currentMgmtGame.title);
            if (newName && newName !== currentMgmtGame.title) {
                const res = await fetch('/api/admin/rename_game_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        old_folder_path: currentMgmtGame.folderPath,
                        new_name: newName
                    })
                });
                const data = await res.json();
                if (data.ok) {
                    location.reload();
                } else {
                    await showAlert(_('role_change_error') + " : " + (data.detail || _('error_label')), "error", _('error_label'));
                }
            }
            if (mgmtModal) mgmtModal.close();
        };
    }

    const btnClearCache = document.getElementById('btn-clear-cache');
    if (btnClearCache) {
        btnClearCache.onclick = async () => {
            const confirmed = await showConfirm(_('confirm_clear_cache_text'));
            if (confirmed) {
                const res = await fetch('/api/admin/clear_game_cache', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder_path: currentMgmtGame.folderPath })
                });
                if ((await res.json()).ok) {
                    await showAlert(_('cache_cleared_success'), "success", _('success_label'));
                }
                if (mgmtModal) mgmtModal.close();
            }
        };
    }

    const btnRestoreBackup = document.getElementById('btn-restore-backup');
    if (btnRestoreBackup) {
        btnRestoreBackup.onclick = async () => {
            const confirmed = await showConfirm(_('confirm_restore_backup_text'));
            if (confirmed) {
                const res = await fetch('/api/admin/restore_game', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder_path: currentMgmtGame.folderPath })
                });
                const data = await res.json();
                if (data.ok) {
                    await showAlert(_('restore_success'), "success", _('success_label'));
                } else {
                    await showAlert(_('error_label') + ": " + (data.detail || _('error_label')), "error", _('error_label'));
                }
                if (mgmtModal) mgmtModal.close();
            }
        };
    }

    const btnDeleteGame = document.getElementById('btn-delete-game');
    if (btnDeleteGame) {
        btnDeleteGame.onclick = () => {
            const delNameEl = document.getElementById('delete-game-name');
            if (delNameEl) delNameEl.innerText = currentMgmtGame.title;
            if (mgmtModal) mgmtModal.close();
            if (confirmDeleteModal) confirmDeleteModal.showModal();
        };
    }

    const btnConfirmDelete1 = document.getElementById('btn-confirm-delete-1');
    if (btnConfirmDelete1) {
        btnConfirmDelete1.onclick = () => {
            if (confirmDeleteModal) confirmDeleteModal.close();
            if (confirmDeleteModal2) confirmDeleteModal2.showModal();
        };
    }

    const btnConfirmDeleteFinal = document.getElementById('btn-confirm-delete-final');
    if (btnConfirmDeleteFinal) {
        btnConfirmDeleteFinal.onclick = async () => {
            const res = await fetch('/api/admin/delete_game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_path: currentMgmtGame.folderPath })
            });
            if ((await res.json()).ok) {
                location.reload();
            } else {
                await showAlert("Erreur lors de la suppression.", "error", "Erreur");
                if (confirmDeleteModal2) confirmDeleteModal2.close();
            }
        };
    }

    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('mousedown', (e) => startLongPress(e, card));
        card.addEventListener('touchstart', (e) => startLongPress(e, card), { passive: true });
        
        card.addEventListener('mouseup', () => cancelLongPress(card));
        card.addEventListener('mouseleave', () => cancelLongPress(card));
        card.addEventListener('touchend', () => cancelLongPress(card));
        card.addEventListener('touchcancel', () => cancelLongPress(card));

        card.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                isLongPress = false;
            }
        });
    });
}
