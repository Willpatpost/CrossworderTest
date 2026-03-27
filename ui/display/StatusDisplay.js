export class StatusDisplay {
    constructor({ statusDisplay, liveStatus }) {
        this.statusDisplay = statusDisplay;
        this.liveStatus = liveStatus;
    }

    update(message, append = false) {
        if (!this.statusDisplay) return;

        const timestamp = new Date().toLocaleTimeString([], {
            hour12: false,
            minute: '2-digit',
            second: '2-digit'
        });

        const line = `[${timestamp}] ${message}\n`;

        this.statusDisplay.value = append
            ? `${this.statusDisplay.value}${line}`
            : line;

        this.statusDisplay.scrollTop = this.statusDisplay.scrollHeight;

        if (this.liveStatus) {
            this.liveStatus.textContent = message;
        }
    }
}
