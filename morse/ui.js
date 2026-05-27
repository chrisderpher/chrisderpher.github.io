// Minimal UI state machine for the Morse trainer.

export const UI_STATE = {
    START: 'start',
    TRAINER: 'trainer',
    HELP: 'help'
};

class UIManager {
    constructor() {
        this.state = UI_STATE.START;
    }

    setState(newState) {
        this.state = newState;
    }

    getState() {
        return this.state;
    }
}

export default UIManager;
