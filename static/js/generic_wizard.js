/**
 * GenericWizard - A generic component for Modals with Tabs or Sequential Wizards.
 */
class GenericWizard {
    constructor(config) {
        this.config = Object.assign({
            id: 'generic-wizard-modal',
            mode: 'modal', // 'modal' (tabs) or 'wizard' (linear)
            title: 'Wizard',
            steps: [],
            onSubmit: null,
            onClose: null,
            initialStep: 0,
            state: {} // Initial state
        }, config);

        this.currentStepIndex = this.config.initialStep;
        this.state = Object.assign({}, this.config.state); 
        this.modal = document.getElementById(this.config.id);
        this.heightLocked = false;
        
        if (!this.modal) {
            console.error(`GenericWizard: Modal with ID "${this.config.id}" not found.`);
            return;
        }

        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.titleEl = this.modal.querySelector('#gw-title');
        this.bodyEl = this.modal.querySelector('#gw-body');
        this.closeBtn = this.modal.querySelector('#gw-close-btn');
        
        // Navigation modes
        this.tabGroup = this.modal.querySelector('#gw-tab-group');
        this.tabContainer = this.modal.querySelector('#gw-tab-container');
        this.progressBar = this.modal.querySelector('#gw-progress-bar');
        this.stepsIndicators = this.modal.querySelector('#gw-steps-indicators');
        
        // Buttons
        this.prevBtn = this.modal.querySelector('#gw-prev-btn');
        this.nextBtn = this.modal.querySelector('#gw-next-btn');
        this.submitBtn = this.modal.querySelector('#gw-submit-btn');

        if (this.titleEl) this.titleEl.innerText = this.config.title;
    }

    bindEvents() {
        if (this.prevBtn) this.prevBtn.onclick = () => this.prev();
        if (this.nextBtn) this.nextBtn.onclick = () => this.next();
        if (this.submitBtn) this.submitBtn.onclick = () => this.submit();
        
        this.bodyEl.addEventListener('input', (e) => {
            const el = e.target;
            const key = el.name || el.id;
            if (key) {
                this.state[key] = (el.type === 'checkbox') ? el.checked : el.value;
            }
        });
    }

    open(initialState = null) {
        if (initialState) {
            this.state = Object.assign(this.state, initialState);
        }
        this.currentStepIndex = this.config.initialStep;
        this.render();
        this.modal.showModal();
    }

    close() {
        this.modal.close();
        if (this.config.onClose) this.config.onClose(this.state);
    }

    render() {
        if (this.config.mode === 'modal') {
            this.renderModalNavigation();
        } else {
            this.renderWizardNavigation();
        }
        this.renderStep(this.currentStepIndex);

        // Lock height after first render in wizard mode
        if (this.config.mode === 'wizard' && !this.heightLocked) {
            setTimeout(() => {
                const rect = this.bodyEl.getBoundingClientRect();
                if (rect.height > 100) {
                    this.bodyEl.style.minHeight = rect.height + 'px';
                    this.heightLocked = true;
                    console.log("Wizard height locked to:", rect.height);
                }
            }, 100);
        }
    }

    renderModalNavigation() {
        this.tabGroup.style.display = 'block';
        this.progressBar.style.display = 'none';
        this.prevBtn.style.display = 'none';
        this.nextBtn.style.display = 'none';
        this.submitBtn.style.display = 'none'; 

        this.tabContainer.innerHTML = '';
        this.config.steps.forEach((step, index) => {
            const btn = document.createElement('button');
            btn.className = `manage-tab-btn ${index === this.currentStepIndex ? 'active' : ''}`;
            btn.innerText = step.label;
            btn.onclick = () => this.goToStep(index);
            this.tabContainer.appendChild(btn);
        });
    }

    renderWizardNavigation() {
        this.tabGroup.style.display = 'none';
        this.progressBar.style.display = 'block';
        this.updateWizardControls();
    }

    updateWizardControls() {
        // Update Buttons
        this.prevBtn.style.display = this.currentStepIndex > 0 ? 'inline-flex' : 'none';
        
        if (this.currentStepIndex === this.config.steps.length - 1) {
            this.nextBtn.style.display = 'none';
            this.submitBtn.style.display = 'inline-flex';
        } else {
            this.nextBtn.style.display = 'inline-flex';
            this.submitBtn.style.display = 'none';
            
            // Dynamic next label
            const nextStep = this.config.steps[this.currentStepIndex + 1];
            const nextLabel = this.nextBtn.querySelector('span');
            if (nextLabel) nextLabel.innerText = nextStep.label;
        }

        // Update Indicators
        if (this.stepsIndicators) {
            this.stepsIndicators.innerHTML = '';
            this.config.steps.forEach((step, index) => {
                const indicator = document.createElement('div');
                indicator.className = `wizard-step-indicator ${index === this.currentStepIndex ? 'active' : ''} ${index < this.currentStepIndex ? 'completed' : ''}`;
                
                indicator.innerHTML = `
                    <div class="wizard-step-dot">${index + 1}</div>
                    <div class="wizard-step-label">${step.label}</div>
                `;
                this.stepsIndicators.appendChild(indicator);
            });
        }
    }

    renderStep(index) {
        const step = this.config.steps[index];
        if (!step) return;

        let contentHtml = '';
        if (typeof step.content === 'function') {
            contentHtml = step.content(this.state);
        } else if (step.content.startsWith('#') || step.content.startsWith('.')) {
            const source = document.querySelector(step.content);
            contentHtml = source ? source.innerHTML : step.content;
        } else {
            contentHtml = step.content;
        }

        this.bodyEl.innerHTML = `<div class="gw-step-content">${contentHtml}</div>`;
        
        this.bodyEl.querySelectorAll('input, textarea, select').forEach(el => {
            const key = el.name || el.id;
            if (key && this.state[key] !== undefined) {
                if (el.type === 'checkbox') {
                    el.checked = !!this.state[key];
                } else {
                    el.value = this.state[key];
                }
            }
        });

        if (step.onEnter) step.onEnter(this.state, this.bodyEl);
        
        if (this.config.mode === 'modal') {
            const tabs = this.tabContainer.querySelectorAll('.manage-tab-btn');
            tabs.forEach((tab, i) => tab.classList.toggle('active', i === index));
        }
    }

    async goToStep(index) {
        if (index === this.currentStepIndex) return;
        const currentStep = this.config.steps[this.currentStepIndex];
        
        if (this.config.mode === 'wizard' && index > this.currentStepIndex) {
            if (currentStep.validate) {
                const isValid = await currentStep.validate(this.state);
                if (!isValid) return;
            }
        }

        if (currentStep.onLeave) currentStep.onLeave(this.state);
        
        this.currentStepIndex = index;
        this.renderStep(index);
        
        if (this.config.mode === 'wizard') {
            this.updateWizardControls();
        }
    }

    next() {
        if (this.currentStepIndex < this.config.steps.length - 1) {
            this.goToStep(this.currentStepIndex + 1);
        }
    }

    prev() {
        if (this.currentStepIndex > 0) {
            this.goToStep(this.currentStepIndex - 1);
        }
    }

    async submit() {
        const currentStep = this.config.steps[this.currentStepIndex];
        if (currentStep.validate) {
            const isValid = await currentStep.validate(this.state);
            if (!isValid) return;
        }

        if (this.config.onSubmit) {
            const originalHtml = this.submitBtn.innerHTML;
            if (window.setCapsuleState) {
                setCapsuleState(this.submitBtn, 'processing', 'Sauvegarde...');
            }
            
            try {
                await this.config.onSubmit(this.state);
                if (window.setCapsuleState) {
                    setCapsuleState(this.submitBtn, 'success', 'Terminé !');
                }
                setTimeout(() => {
                    this.close();
                    this.submitBtn.innerHTML = originalHtml;
                }, 1000);
            } catch (e) {
                console.error("Wizard submission error:", e);
                if (window.setCapsuleState) {
                    setCapsuleState(this.submitBtn, 'error', 'Erreur');
                }
                setTimeout(() => {
                    this.submitBtn.innerHTML = originalHtml;
                }, 2000);
            }
        } else {
            this.close();
        }
    }
}

window.createGenericWizard = function(config) {
    return new GenericWizard(config);
};
