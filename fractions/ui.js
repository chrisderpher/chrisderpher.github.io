// UI State Management

export const UI_STATE = {
    START: 'start',
    MODE_SELECTION: 'mode_selection',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over',
    HELP: 'help'
};

class UIManager {
    constructor() {
        this.state = UI_STATE.START;
        this.firstTime = true;
    }

    setState(newState) {
        this.state = newState;
    }

    getState() {
        return this.state;
    }

    isFirstTime() {
        return this.firstTime;
    }

    markFirstTimeComplete() {
        this.firstTime = false;
    }
}

export default UIManager;
