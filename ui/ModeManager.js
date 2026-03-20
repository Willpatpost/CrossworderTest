// ui/ModeManager.js
export class ModeManager {
    constructor() {
        this.currentMode = 'default';
        this.modes = ['number', 'letter', 'drag'];
    }

    toggle(modeType) {
        if (this.currentMode === modeType) {
            this.currentMode = 'default';
        } else {
            this.currentMode = modeType;
        }
        this._updateUI();
        return this.currentMode;
    }

    _updateUI() {
        const label = document.getElementById('mode-label');
        if (label) label.textContent = `Mode: ${this.currentMode.charAt(0).toUpperCase() + this.currentMode.slice(1)}`;

        this.modes.forEach(m => {
            const btn = document.getElementById(`${m}-entry-button`) || document.getElementById(`${m}-mode-button`);
            if (btn) {
                const isActive = this.currentMode === m;
                btn.style.backgroundColor = isActive ? "#dc3545" : "#0069d9";
                btn.textContent = isActive ? `Exit ${m.charAt(0).toUpperCase() + m.slice(1)} Mode` : `${m.charAt(0).toUpperCase() + m.slice(1)} Mode`;
            }
        });
    }
}