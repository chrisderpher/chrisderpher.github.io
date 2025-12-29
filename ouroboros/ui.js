// UI State Management

export const UI_STATE = {
    START: 'start',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over',
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
