/**
 * Game View Main JavaScript logic
 * Extracted from game_view.html
 */

window.openEditModal = () => {
    if (window.GAME_CONFIG.has_sidecar) {
        if (typeof GameEditDirectModal !== 'undefined') GameEditDirectModal.open();
    } else {
        if (typeof GameEditWizardV2 !== 'undefined') GameEditWizardV2.open();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Flag to avoid redundant/loud agent error logs in console
    window.isAgentMissing = false;

    // Initial synopsis rendering
    const synopsisContent = document.getElementById('description-content');
    if (synopsisContent && window.GAME_CONFIG) {
        synopsisContent.innerHTML = marked.parse(window.GAME_CONFIG.description || "");
    }

    // Reset agent modal on close
    const agentModal = document.getElementById('mount-agent-modal');
    if (agentModal) {
        agentModal.addEventListener('close', () => {
            if (mountMonitoringInterval) {
                clearInterval(mountMonitoringInterval);
                mountMonitoringInterval = null;
            }
            if (agentPollingInterval) {
                clearInterval(agentPollingInterval);
                agentPollingInterval = null;
            }
            const logArea = document.getElementById('agent-log-area');
            if (logArea) logArea.innerHTML = '';
            
            const btnMain = document.getElementById('btn-agent-main');
            if (btnMain) btnMain.style.display = 'none';
        });
    }

    // Automatic re-opening of virtual accordions after investigation
    const autoOpenId = localStorage.getItem('auto_open_virtual');
    if (autoOpenId) {
        console.log("♻️ Attempting to auto-reopen accordion:", autoOpenId);
        localStorage.removeItem('auto_open_virtual');
        const content = document.getElementById(autoOpenId);
        if (content) {
            const header = content.previousElementSibling;
            if (header && header.classList.contains('files-card-header')) {
                console.log("✅ Accordion found, simulating click.");
                header.click();
            }
        }
    }

    // Metadata Observability logging
    if (window.GAME_CONFIG) {
        console.group("🧩 Metadata Observability");
        const source = window.GAME_CONFIG.metadata_source;
        const sourceName = source === 'db' ? _('database_label') : _('sidecar_file_label');
        console.log(`${_('source_label')} : ${sourceName}`);
        if (source === 'sidecar') {
            console.info("💡 " + _('data_loaded_sidecar_hint'));
        }
        console.groupEnd();

        // Auto-open modal logic
        if ((window.GAME_CONFIG.is_new && window.GAME_CONFIG.open_modal_auto && window.GAME_CONFIG.user_role === 'admin') || window.GAME_CONFIG.force_edit) {
            console.log("✨ " + _('forced_opening_wizard_log'));
            openEditModal();
        }

        // Zip status display update
        if (window.GAME_CONFIG.zip_status === 'processing') {
            const zipBtn = document.getElementById('zip-btn');
            if (zipBtn) {
                zipBtn.innerHTML = `<span class="zip-percent">${window.GAME_CONFIG.zip_progress || 0}%</span>`;
            }
        }

        // Initialize YouTube player with new layout
        if (window.GAME_CONFIG.meta && window.GAME_CONFIG.meta.youtube_urls) {
            updateYoutubePlayer(window.GAME_CONFIG.meta.youtube_urls);
        }
    }

    // Handle suggestions panel if screen is wide enough
    if (window.innerWidth >= 1800 && window.GAME_CONFIG) {
        const panel = document.getElementById('suggestions-panel');
        if (panel) {
            panel.classList.add('active');
            const hasMeta = window.GAME_CONFIG.meta.title_fr || window.GAME_CONFIG.meta.title_en;

            if (!hasMeta) {
                const content = document.getElementById('suggestions-content');
                if (content) {
                    content.innerHTML = `
                        <div class="suggestions-loading" style="opacity: 0.6; padding: 20px;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            ${_('waiting_metadata_suggestions_hint')}
                        </div>`;
                }
            } else {
                fetch('/api/suggestions', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ 
                        folder_path: window.GAME_CONFIG.base_path, 
                        game_title: window.GAME_CONFIG.title,
                        title_fr: window.GAME_CONFIG.meta.title_fr,
                        title_en: window.GAME_CONFIG.meta.title_en,
                        publisher_orig: window.GAME_CONFIG.meta.publisher_orig,
                        publish_date: window.GAME_CONFIG.meta.publish_date,
                        rules_system: window.GAME_CONFIG.meta.rules_system,
                        setting: window.GAME_CONFIG.meta.setting
                    }) 
                })
                .then(res => res.json()).then(data => {
                    const container = document.getElementById('suggestions-content');
                    if (data.suggestions && data.suggestions.length > 0) {
                        const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 150' fill='none'%3E%3Crect width='100' height='150' fill='%23111'/%3E%3Crect x='10' y='10' width='80' height='130' rx='4' stroke='%23333' stroke-width='1'/%3E%3Ccircle cx='50' cy='60' r='18' stroke='%23444' stroke-width='1.5'/%3E%3Cpolyline points='30,110 50,80 70,110' stroke='%23444' stroke-width='1.5' fill='none'/%3E%3C/svg%3E`;
                        const proxyImg = (url) => (url && url.trim() !== '' && url !== 'None') ? `/api/img_proxy?url=${encodeURIComponent(url)}` : PLACEHOLDER;
                        const FR_WORDS = new Set(['le','la','les','du','de','des','un','une','au','aux','et','ou','en','par','pour','sur','sous','dans','avec','sans','ce','cet','cette','ces','mon','ton','son','ma','ta','sa','mes','tes','ses','nos','vos','leurs','qui','que','dont','car','si','ni','mais','donc','or','ainsi','l','d','j','m','t','s','n','y']);
                        const isTitleFrench = (title) => { const words = title.toLowerCase().replace(/['']/g, ' ').split(/[\s\-]+/); return words.some(w => FR_WORDS.has(w)); };
                        
                        if (container) {
                            container.innerHTML = data.suggestions.map(s => {
                                const isEnOnly = !isTitleFrench(s.title);
                                const imgSrc = proxyImg(s.image);
                                return `<div class="suggestion-card" title="${s.desc}"><div class="suggestion-img-wrapper"><img src="${imgSrc}" class="suggestion-img" loading="lazy" decoding="async" alt="${s.title}">${isEnOnly ? '<span class="badge-lang">EN ONLY</span>' : ''}</div><div class="suggestion-info"><span class="suggestion-title">${s.title}</span><span class="suggestion-desc">${s.desc}</span></div></div>`;
                            }).join('');
                        }
                    } else { panel.style.display = 'none'; }
                }).catch(() => panel.style.display = 'none');
            }
        }
    }
});

function toggleTreeFolder(el) {
    const children = el.nextElementSibling;
    children.style.display = children.style.display === 'none' ? 'block' : 'none';
}

function toggleArchiveAccordion(header, directPath = null, directHasIndex = null) {
    const block = header.closest('.virtual-archive-block');
    if (!block) return;
    
    const content = block.querySelector('[id^="archive-content-"]');
    const isOpening = !block.classList.contains('active');
    
    block.classList.toggle('active');
    
    if (content) {
        content.style.display = isOpening ? 'block' : 'none';

        if (isOpening) {
            let path = directPath;
            let hasIndex = directHasIndex;

            if (path === null) {
                const pathAttr = content.getAttribute('data-path');
                if (pathAttr) {
                    try { path = JSON.parse(pathAttr); } catch(e) { path = pathAttr; }
                }
            }
            if (hasIndex === null) {
                hasIndex = content.getAttribute('data-has-index') === 'true';
            }

            if (path && hasIndex === false) {
                investigateArchive(path, content);
            }
        }
    }
}

function togglePin(absolutePath) {
    fetch('/api/toggle_pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: absolutePath })
    })
    .then(response => response.json())
    .then(data => { if (data.success) location.reload(); })
    .catch(error => console.error('Erreur:', error));
}

function openManageModal(path, filename) {
    _managePath = path;
    _manageFilename = filename;

    document.getElementById('manage-modal-title').textContent = filename;

    document.querySelectorAll('#manage-modal .manage-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#manage-modal .manage-tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-meta').classList.add('active');
    document.querySelector('#manage-modal .manage-tab-btn[data-tab="meta"]').classList.add('active');

    document.querySelectorAll('.manage-feedback').forEach(el => {
        el.textContent = ''; el.className = 'manage-feedback';
    });

    const ri = document.getElementById('rename-input');
    ri.value = filename;
    updateRenameBtn(ri);

    document.getElementById('db-loading').style.display = 'flex';
    document.getElementById('db-content').style.display = 'none';
    document.getElementById('local-files-list').innerHTML = '<div class="manage-spinner"><svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4"/></svg> Scan…</div>';

    document.getElementById('manage-modal').showModal();
}

function closeManageModal() {
    document.getElementById('manage-modal').close();
}

function showSaveStatus(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('visible');
        setTimeout(() => el.classList.remove('visible'), 2000);
    }
}

async function startArchival() {
    if (!window.GAME_CONFIG) return;
    const confirmed = await showConfirm(`⚠️ ARCHIVAGE DÉFINITIF\nVoulez-vous transformer ce dossier en archive ${window.GAME_CONFIG.archive_format} ?\nLes fichiers originaux seront déplacés dans .backup.`, "Archivage Définitif");
    if (!confirmed) return;

    const btn = document.getElementById('main-archive-btn');
    if (!btn || btn.disabled) return;

    setCapsuleState(btn, 'processing', 'Archivage...');

    try {
        const res = await fetch('/api/games/archive/start', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ folder_path: window.GAME_CONFIG.base_path })
        });
        
        if (res.ok) {
            if (window.zipMonitor) window.zipMonitor.check();
        } else {
            const data = await res.json();
            setCapsuleState(btn, 'error', 'Erreur');
            await showAlert("Erreur: " + (data.detail || "Inconnue"), "error", "Erreur");
        }
    } catch (err) {
        console.error("Erreur archivage:", err);
        setCapsuleState(btn, 'error', 'Réseau');
        await showAlert("Erreur réseau lors du lancement de l'archivage.", "error", "Erreur Réseau");
    }
}

// Global Zip Monitor Listener for this page
if (window.zipMonitor) {
    window.zipMonitor.addListener((notif) => {
        if (window.GAME_CONFIG && notif.folder_path === window.GAME_CONFIG.base_path) {
            const btn = document.getElementById('zip-btn');
            const arcBtn = document.getElementById('archive-btn');

            if (notif.zip_status === 'ready') {
                if (btn) {
                    btn.dataset.status = 'ready';
                    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
                    btn.title = `Télécharger l'archive ${window.GAME_CONFIG.archive_format}`;
                }
                console.log("Archive terminée, rechargement de la page...");
                setTimeout(() => location.reload(), 1000);
            } else if (notif.zip_status === 'processing') {
                if (btn) {
                    btn.dataset.status = 'processing';
                    btn.innerHTML = `<span class="zip-percent">${notif.zip_progress}%</span>`;
                }
                if (arcBtn) {
                    arcBtn.disabled = true;
                }
            }
        }
    });
}

async function saveUserRating(rating) {
    if (!window.GAME_CONFIG) return;
    console.log("Saving rating:", rating);
    try {
        const res = await fetch('/api/user/save_review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_path: window.GAME_CONFIG.base_path,
                rating: rating
            })
        });
        if (res.ok) {
            console.log("Rating saved successfully");
        }
    } catch (err) {
        console.error("Error saving rating:", err);
    }
}

async function saveUserComment() {
    if (!window.GAME_CONFIG) return;
    const comment = document.getElementById('user-comment').value;
    console.log("Saving comment...");
    try {
        const res = await fetch('/api/user/save_review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_path: window.GAME_CONFIG.base_path,
                comment: comment
            })
        });
        if (res.ok) {
            showSaveStatus('appreciation-save-status');
        }
    } catch (err) {
        console.error("Error saving comment:", err);
    }
}

function getAgentUI() {
    const modal = document.getElementById('mount-agent-modal');
    const logArea = document.getElementById('agent-log-area');
    const btnMain = document.getElementById('btn-agent-main');
    return { modal, logArea, btnMain };
}

let agentWasFoundThisSession = false;

function updateAgentButton(state, options = {}) {
    const ui = getAgentUI();
    if (!ui.btnMain) return;

    ui.btnMain.style.display = 'inline-flex';
    ui.btnMain.disabled = false;
    ui.btnMain.className = 'btn-capsule';

    if (state === 'retry') {
        ui.btnMain.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:8px;"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            <span>Connexion à l'agent local</span>
        `;
        ui.btnMain.onclick = () => initiateIsoMount(currentIsoPathForMount, true);
    }
    else if (state === 'polling') {
        ui.btnMain.disabled = true;
        ui.btnMain.innerHTML = `
            <span class="capsule-spinner"></span>
            <span>ATTENTE d'une réponse de l'agent...</span>
        `;
        ui.btnMain.onclick = null;
    }
    else if (state === 'mount') {
        ui.btnMain.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:8px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
            <span>Monter l'ISO</span>
        `;
        ui.btnMain.onclick = () => performMount(options.isoPath);
    }
    else if (state === 'unmount') {
        ui.btnMain.classList.add('is-danger');
        ui.btnMain.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:8px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>Démonter l'ISO</span>
        `;
        ui.btnMain.onclick = () => performUnmount(options.isoPath);
    }
}

function logAgent(msg, type = 'info') {
    const ui = getAgentUI();
    if (!ui.logArea) return;
    const time = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ff5252' : '#00cf7f';
    const prefix = type === 'error' ? '[ERROR]' : (type === 'success' ? '[OK]' : '[INFO]');
    ui.logArea.innerHTML += `<div style="color: ${color}; opacity: ${type === 'info' ? 0.7 : 1}">${time} ${prefix} ${msg}</div>`;
    ui.logArea.scrollTop = ui.logArea.scrollHeight;
}

let currentIsoPathForMount = null;
let agentPollingInterval = null;

function startAgentPolling() {
    if (agentPollingInterval || !window.GAME_CONFIG) return;
    logAgent("Agent local recherché toutes les 5 secondes...");
    
    updateAgentButton('polling');

    agentPollingInterval = setInterval(async () => {
        try {
            // Presence check - using a very short timeout to avoid long waits
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 1000);
            
            const res = await fetch('http://127.0.0.1:8080/status', {
                headers: { 'Authorization': `Bearer ${window.GAME_CONFIG.agent_token}` },
                signal: controller.signal
            });
            clearTimeout(id);

            if (res.ok) {
                logAgent("Agent local détecté !", 'success');
                if (agentPollingInterval) {
                    clearInterval(agentPollingInterval);
                    agentPollingInterval = null;
                }
                initiateIsoMount(currentIsoPathForMount, true);
            }
        } catch (e) {
            // Silently ignore connection refused errors in console
        }
    }, 5000);
}

function updateAgentOfflineState() {
    updateAgentButton('retry');
    logAgent("L'agent local Rust n'est pas détecté. Assurez-vous qu'il est compilé et lancé sur votre machine.");
}

async function initiateIsoMount(isoPath, force = false) {
    if (!window.GAME_CONFIG) return;
    currentIsoPathForMount = isoPath;

    if (mountMonitoringInterval) {
        clearInterval(mountMonitoringInterval);
        mountMonitoringInterval = null;
    }
    if (agentPollingInterval && !force) {
        clearInterval(agentPollingInterval);
        agentPollingInterval = null;
    }

    const ui = getAgentUI();
    if (!ui.logArea || !ui.modal) {
        console.error("Agent modal elements not found in DOM");
        return;
    }

    ui.logArea.innerHTML = '';
    if (ui.btnMain) ui.btnMain.style.display = 'none';

    if (!ui.modal.open) ui.modal.showModal();

    // Reset missing flag if forced (manual retry or polling success)
    if (force) {
        window.isAgentMissing = false;
    }

    // If we already know the agent is missing in this session, don't trigger a new red error in console
    if (window.isAgentMissing && !force) {
        logAgent("Agent Local non détecté (dernière tentative échouée).", 'error');
        updateAgentOfflineState();
        return;
    }

    logAgent("Recherche de l'Agent Local sur http://127.0.0.1:8080...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
        const res = await fetch('http://127.0.0.1:8080/status', {
            signal: controller.signal,
            headers: { 'Authorization': `Bearer ${window.GAME_CONFIG.agent_token}` }
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            agentWasFoundThisSession = true;
            window.isAgentMissing = false;
            if (agentPollingInterval) {
                clearInterval(agentPollingInterval);
                agentPollingInterval = null;
            }
            const status = await res.json();
            logAgent(`Agent trouvé ! (Version: ${status.version})`, 'success');

            const checkRes = await fetch('http://127.0.0.1:8080/check_mount', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.GAME_CONFIG.agent_token}`
                },
                body: JSON.stringify({ iso_path: translatePath(isoPath) })
            });
            const checkData = await checkRes.json();

            if (checkData.attached) {
                logAgent("L'ISO est déjà monté.", 'success');
                updateAgentButton('unmount', { isoPath });
                startActiveMonitoring(translatePath(isoPath));
            } else {
                logAgent("Prêt pour le montage.");
                updateAgentButton('mount', { isoPath });
            }
        } else {
            throw new Error("Erreur agent");
        }
    } catch (err) {
        clearTimeout(timeoutId);
        window.isAgentMissing = true;
        logAgent("Agent Local non détecté.", 'error');
        updateAgentOfflineState();
    }
}

async function initiateIsoCreation(folderPath, btn) {
    if (!btn) return;
    setCapsuleState(btn, 'processing', 'Conversion...');

    try {
        const res = await fetch('/api/admin/convert_folder_to_iso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: folderPath })
        });

        const data = await res.json();
        if (res.ok) {
            setCapsuleState(btn, 'processing', 'En cours...');
            btn.disabled = true;
            
            const row = btn.closest('.file-item');
            if (row) {
                row.style.opacity = '0.5';
                row.style.pointerEvents = 'none';
                row.style.transition = 'opacity 0.5s ease';
            }
        } else {
            setCapsuleState(btn, 'error', 'Échec');
            throw new Error(data.detail || "Erreur lors de la création");
        }
    } catch (err) {
        console.error("ISO Creation Error:", err);
        setCapsuleState(btn, 'error', 'Erreur');
        await showAlert("Erreur lors de la conversion (Backend) : " + err.message, "error", "Erreur");
    }
}

function translatePath(isoPath) {
    if (!window.GAME_CONFIG) return isoPath;
    let hostPath = isoPath;
    const containerBase = "/bibliotheque";
    const hostBase = window.GAME_CONFIG.host_games_path;
    if (hostPath.startsWith(containerBase)) {
        hostPath = hostPath.replace(containerBase, hostBase);
        hostPath = hostPath.replace(/\//g, '\\');
    }
    return hostPath;
}

let mountMonitoringInterval;

async function performMount(isoPath) {
    if (!window.GAME_CONFIG) return;
    const ui = getAgentUI();
    if (ui.btnMain) ui.btnMain.disabled = true;
    logAgent("Envoi de la commande de montage...");
    
    const hostPath = translatePath(isoPath);
    logAgent(`Chemin traduit : ${hostPath}`);

    try {
        const res = await fetch('http://127.0.0.1:8080/mount_iso', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.GAME_CONFIG.agent_token}`
            },
            body: JSON.stringify({ iso_path: hostPath })
        });

        const data = await res.json();
        if (res.ok) {
            logAgent(`Montage réussi !`, 'success');
            logAgent(`Lecteur assigné : <span style="font-size: 1.2rem; font-weight: 900;">${data.drive_letter}</span>`, 'success');
            
            updateAgentButton('unmount', { isoPath });
            startActiveMonitoring(hostPath);
        } else {
            logAgent(`Erreur : ${data.message || 'Inconnue'}`, 'error');
            if (ui.btnMain) ui.btnMain.disabled = false;
        }
    } catch (err) {
        logAgent(`Erreur de communication avec l'agent : ${err.message}`, 'error');
        updateAgentOfflineState();
    }
}

async function performUnmount(isoPath) {
    if (!window.GAME_CONFIG) return;
    const ui = getAgentUI();
    if (ui.btnMain) ui.btnMain.disabled = true;
    logAgent("Envoi de la commande de démontage...");
    
    const hostPath = translatePath(isoPath);

    try {
        const res = await fetch('http://127.0.0.1:8080/unmount_iso', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.GAME_CONFIG.agent_token}`
            },
            body: JSON.stringify({ iso_path: hostPath })
        });

        if (res.ok) {
            logAgent(`Démontage réussi.`, 'success');
            stopMonitoringAndClose();
        } else {
            const data = await res.json();
            logAgent(`Erreur : ${data.message || 'Inconnue'}`, 'error');
            if (ui.btnMain) ui.btnMain.disabled = false;
        }
    } catch (err) {
        logAgent(`Erreur communication : ${err.message}`, 'error');
        updateAgentOfflineState();
    }
}

function startActiveMonitoring(hostPath) {
    if (mountMonitoringInterval) clearInterval(mountMonitoringInterval);
    
    logAgent("Surveillance active du montage activée (fermeture auto à l'éjection).", 'info');
    
    mountMonitoringInterval = setInterval(async () => {
        try {
            const res = await fetch('http://127.0.0.1:8080/check_mount', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.GAME_CONFIG.agent_token}`
                },
                body: JSON.stringify({ iso_path: hostPath })
            });
            
            if (res.ok) {
                const data = await res.json();
                if (!data.attached) {
                    logAgent("ISO éjecté. Fermeture de la modale...", 'info');
                    stopMonitoringAndClose();
                }
            } else {
                stopMonitoringAndClose();
            }
        } catch (e) {
            stopMonitoringAndClose();
        }
    }, 3000);
}

function stopMonitoringAndClose() {
    if (mountMonitoringInterval) {
        clearInterval(mountMonitoringInterval);
        mountMonitoringInterval = null;
    }
    const ui = getAgentUI();
    if (ui.modal && ui.modal.open) {
        ui.modal.close();
    }
}

function showFeedback(id, msg, isError = false, btn = null) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#e05c5c' : '#4caf82';
}

function updateRenameBtn(input) {
    const btn = document.getElementById('rename-btn');
    if (!btn) return;
    const changed = input.value.trim().length > 0 && input.value.trim() !== _manageFilename;
    btn.disabled = !changed;
}

async function renameFile(btn) {
    const newName = document.getElementById('rename-input').value.trim();
    if (!newName || newName === _manageFilename) return;
    
    setCapsuleState(btn, 'processing', 'Renommage...');

    const res = await fetch('/api/admin/rename_file', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ file_path: _managePath, new_name: newName })
    });
    const data = await res.json();
    if (data.ok) { 
        setCapsuleState(btn, 'success', 'Fait !');
        setTimeout(() => location.reload(), 900); 
    } else {
        setCapsuleState(btn, 'error', 'Échec');
        showFeedback('rename-feedback', '✗ ' + (data.detail || 'Erreur'), true);
    }
}

async function loadLocalFiles() {
    const container = document.getElementById('local-files-list');
    container.innerHTML = `<div class="manage-spinner"><svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4"/></svg> ${_('scan_folder_label')}</div>`;
    try {
        const folder = _managePath.substring(0, _managePath.lastIndexOf('/'));
        const res = await fetch('/api/admin/list_cache_files?folder_path=' + encodeURIComponent(folder));
        const data = await res.json();
        if (!data.files || data.files.length === 0) {
            container.innerHTML = `<div class="manage-spinner" style="font-style:italic;">${_('no_cache_files_found')}</div>`;
            return;
        }
        container.innerHTML = '';
        data.files.forEach(f => {
            const row = document.createElement('div');
            row.className = 'data-card';
            row.innerHTML = `
                <div class="data-card-header">
                    <span class="data-card-value">${f.name}</span>
                    <button class="btn btn-danger" onclick="deleteLocalFile('${f.path.replace(/'/g, "\\'")}', this)">${_('delete_btn')}</button>
                </div>
                <span class="data-card-label" style="text-transform:none; letter-spacing:0;">${f.size_kb} Ko</span>`;
            container.appendChild(row);
        });
    } catch(e) { container.innerHTML = `<div class="manage-spinner">${_('error_label')}</div>`; }
}

async function deleteLocalFile(filePath, btn) {
    const confirmed = await showConfirm(_('delete_cache_file_confirm', { name: filePath.split('/').pop() }));
    if (!confirmed) return;
    btn.disabled = true;
    const res = await fetch('/api/admin/delete_cache_file', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ file_path: filePath })
    });
    const data = await res.json();
    if (data.ok) {
        const card = btn.closest('.data-card');
        if (card) {
            card.style.opacity = '0.3';
            card.style.pointerEvents = 'none';
        }
        showFeedback('local-files-feedback', '✓ ' + filePath.split('/').pop() + ' ' + _('delete_btn'));
    } else {
        btn.disabled = false;
        showFeedback('local-files-feedback', '✗ ' + (data.detail || _('error_label')), true);
    }
}

async function deleteFile() {
    const confirmed = await showConfirm(_('delete_file_confirm', { name: _manageFilename }));
    if (!confirmed) return;
    const res = await fetch('/api/admin/delete_file', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ file_path: _managePath })
    });
    const data = await res.json();
    if (data.ok) { showFeedback('delete-feedback', '✓ ' + _('saved_label') + ', ' + _('loading_label') + '…'); setTimeout(() => location.reload(), 800); }
    else showFeedback('delete-feedback', '✗ ' + (data.detail || _('error_label')), true);
}

async function viewNfo(path, filename) {
    const drawer = document.getElementById('nfo-drawer');
    const title = document.getElementById('nfo-drawer-title');
    const container = document.getElementById('nfo-text-container');
    
    if (title) title.textContent = filename || 'NFO Viewer';
    if (container) container.textContent = _('loading_label') + '...';
    if (drawer) drawer.classList.add('active');
    
    try {
        const res = await fetch(`/api/games/read-nfo?path=${encodeURIComponent(path)}`);
        if (res.ok) {
            const data = await res.json();
            if (container) container.textContent = data.content;
        } else {
            if (container) container.textContent = _('nfo_load_error');
        }
    } catch (err) {
        console.error(err);
        if (container) container.textContent = _('nfo_network_error');
    }
}

function closeNfo() {
    const drawer = document.getElementById('nfo-drawer');
    if (drawer) drawer.classList.remove('active');
}

async function investigateArchive(path, target) {
    const isButton = target.tagName === 'BUTTON';
    const originalHtml = target.innerHTML;
    
    if (isButton) {
        target.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4"/></svg> ${_('investigation_label')}`;
        target.disabled = true;
    } else {
        target.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 30px; opacity: 0.8;">
                <svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00cf7f" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4"/></svg>
                <span style="font-size: 0.85rem; color: #00cf7f;">${_('investigation_in_progress')}</span>
            </div>
        `;
    }

    try {
        const res = await fetch('/api/archive/investigate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ archive_path: path })
        });
        const data = await res.json();
        if (res.ok) {
            console.log("✅ Investigation terminée avec succès. Mémorisation pour réouverture...");
            localStorage.setItem('auto_open_virtual', target.id);
            location.reload();
        } else {
            console.error("❌ Erreur investigation:", data.detail);
            if (isButton) {
                await showAlert(_('investigation_error') + ": " + (data.detail || _('error_label')), "error", _('error_label'));
                target.innerHTML = originalHtml;
                target.disabled = false;
            } else {
                target.innerHTML = `<p class="t-meta" style="color: #ff5252; padding: 20px;">${_('investigation_error')} : ${data.detail || _('error_label')}</p>`;
            }
        }
    } catch (err) {
        console.error("❌ Erreur réseau investigation:", err);
        if (isButton) {
            await showAlert(_('investigation_network_error'), "error", _('error_label'));
            target.innerHTML = originalHtml;
            target.disabled = false;
        } else {
            target.innerHTML = `<p class="t-meta" style="color: #ff5252; padding: 20px;">${_('investigation_network_error')}</p>`;
        }
    }
}

function viewNfoContent(filename, content) {
    const drawer = document.getElementById('nfo-drawer');
    const title = document.getElementById('nfo-drawer-title');
    const container = document.getElementById('nfo-text-container');
    
    if (title) title.textContent = filename || 'NFO Archive';
    if (container) container.textContent = content;
    if (drawer) drawer.classList.add('active');
}

function updateYoutubePlayer(urlsRaw) {
    let urls = [];
    if (urlsRaw) {
        if (typeof urlsRaw === 'string') {
            if (urlsRaw.trim().startsWith('[') || urlsRaw.trim().startsWith('{')) {
                try { urls = JSON.parse(urlsRaw); } catch(e) { urls = urlsRaw.split('\n'); }
            } else {
                urls = urlsRaw.split('\n').map(u => u.trim()).filter(u => u);
            }
        } else if (Array.isArray(urlsRaw)) {
            urls = urlsRaw;
        }
    }
    
    function getYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    const iframe = document.getElementById('youtube-iframe');
    const selector = document.getElementById('youtube-selector');
    const toggleBtn = document.querySelector('.media-toggle');
    
    if (urls.length > 0) {
        let validUrls = [];
        urls.forEach((url) => {
            const id = getYoutubeId(url);
            if (id) validUrls.push({url, id});
        });

        if (validUrls.length > 0) {
            if (toggleBtn) toggleBtn.style.display = 'flex';
            if (selector) {
                selector.innerHTML = '';
                if (iframe) iframe.src = `https://www.youtube.com/embed/${validUrls[0].id}`;
                
                if (validUrls.length > 1) {
                    validUrls.forEach((item, idx) => {
                        const btn = document.createElement('button');
                        btn.className = 'edition-pill' + (idx === 0 ? ' active' : '');
                        btn.textContent = `Vidéo ${idx + 1}`;
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            if (iframe) iframe.src = `https://www.youtube.com/embed/${item.id}`;
                            selector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                        };
                        selector.appendChild(btn);
                    });
                }
            }
        } else {
            if (toggleBtn) toggleBtn.style.display = 'none';
        }
    } else {
        if (toggleBtn) toggleBtn.style.display = 'none';
    }
}

/**
 * Media Toggle logic (Cover vs Video)
 */
window.toggleMedia = () => {
    const mediaCover = document.getElementById('media-cover');
    const mediaVideo = document.getElementById('media-video');
    const coverWrapper = document.querySelector('.cover-wrapper');

    if (mediaCover.classList.contains('active')) {
        mediaCover.classList.remove('active');
        mediaVideo.classList.add('active');
        if (coverWrapper) coverWrapper.classList.add('video-mode');
    } else {
        mediaCover.classList.add('active');
        mediaVideo.classList.remove('active');
        if (coverWrapper) coverWrapper.classList.remove('video-mode');
    }
};

/**
 * Info Tabs logic (Synopsis vs Metadata)
 */
window.switchInfoTab = (tabId, btn) => {
    // Tabs buttons
    document.querySelectorAll('.info-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Content panes
    document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById('tab-' + tabId);
    if (target) target.classList.add('active');
};
