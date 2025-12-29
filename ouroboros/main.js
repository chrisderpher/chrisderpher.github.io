import Game from './game.js';
import UIManager, { UI_STATE } from './ui.js';

// Initialize
const game = new Game();
const ui = new UIManager();

// Set container dimensions for circular layout
function updateLayoutDimensions() {
    const snakeArea = document.getElementById('snake-area');
    if (snakeArea && game.snakeLayout) {
        const rect = snakeArea.getBoundingClientRect();
        game.snakeLayout.setContainerDimensions(rect.width, rect.height);
    }
}

window.addEventListener('resize', updateLayoutDimensions);

// DOM elements
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const helpScreen = document.getElementById('help-screen');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const streakEl = document.getElementById('streak');
const snakeArea = document.getElementById('snake-area');
const feedbackEl = document.getElementById('feedback');
const highScoreValue = document.getElementById('high-score-value');
const finalScoreEl = document.getElementById('final-score');
const finalAccuracyEl = document.getElementById('final-accuracy');
const finalStreakEl = document.getElementById('final-streak');
const newHighScoreEl = document.getElementById('new-high-score');

// Input state
let currentInput = '';
let inputElement = null;

// Track previous level for level-up detection
let previousLevel = 1;

// Level up banner
function showLevelUp() {
    const message = document.createElement('div');
    message.className = 'level-up';
    message.textContent = `>>> LEVEL UP! Level ${game.level} <<<`;
    
    // Position at center of snake-area
    const rect = snakeArea.getBoundingClientRect();
    message.style.left = (rect.left + rect.width / 2) + 'px';
    message.style.top = (rect.top + rect.height / 2) + 'px';
    message.style.transform = 'translate(-50%, -50%) scale(0.5)';
    
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.remove();
    }, 2000);
}

// Game loop
let animationFrameId = null;

function gameLoop() {
    game.update();
    updateUI();
    
    if (ui.getState() === UI_STATE.PLAYING && !game.gameOver) {
        animationFrameId = requestAnimationFrame(gameLoop);
    } else if (game.gameOver && ui.getState() === UI_STATE.PLAYING) {
        setTimeout(() => {
            ui.setState(UI_STATE.GAME_OVER);
            showScreen('game-over');
            
            finalScoreEl.textContent = game.score;
            finalAccuracyEl.textContent = game.getAccuracy();
            finalStreakEl.textContent = game.bestStreak;
            
            const isNewHigh = game.score >= game.highScore;
            if (isNewHigh) {
                newHighScoreEl.classList.remove('hidden');
            } else {
                newHighScoreEl.classList.add('hidden');
            }
        }, 1000);
    }
}

function updateUI() {
    scoreEl.textContent = game.score;
    levelEl.textContent = game.level;
    streakEl.textContent = game.streak;

    if (ui.getState() === UI_STATE.PLAYING) {
        renderSnake();
    }
}

function renderSnake() {
    if (!game.problems || game.problems.length === 0) return;

    const currentProblem = game.getCurrentProblem();
    if (!currentProblem) return;
    
    if (!currentProblem.position) {
        game.updatePositions();
    }
    
    // Get visibility info
    const visibleProblems = game.getVisibleProblems();
    const isOnTail = game.isOnTail();
    
    let html = '<div class="snake-container">';
    
    // Render current problem
    const currentIdx = game.currentProblemIndex;
    const currentPos = currentProblem.position;
    if (!currentPos) return;
    
    const expirationTime = currentProblem.expirationTime || game.getExpirationTime();
    const timeRemaining = currentProblem.getTimeRemaining();
    const percentage = Math.max(0, expirationTime > 0 ? (timeRemaining / expirationTime) * 100 : 0);
    
    let timeClass = 'time-ok';
    if (percentage < 20) timeClass = 'time-critical';
    else if (percentage < 40) timeClass = 'time-warning';
    
    // Yellow highlight when approaching tail
    const yellowClass = isOnTail ? 'streak' : '';
    
    html += `<div class="problem-box current ${timeClass} ${yellowClass}" 
             style="left: ${currentPos.x}px; top: ${currentPos.y}px;"
             data-index="${currentIdx}">`;
    
    html += '<div class="problem-vertical">';
    html += `<div class="problem-line">${currentProblem.multiplicand}</div>`;
    html += `<div class="problem-line">× ${currentProblem.multiplier}</div>`;
    html += '<div class="problem-line problem-divider">────</div>';
    html += `<div class="problem-line problem-answer">`;
    html += `<input type="text" class="answer-input" value="${currentInput}" 
             placeholder="?" maxlength="3" readonly>`;
    html += `</div>`;
    html += '</div>';
    html += `<div class="time-bar" style="width: ${percentage}%"></div>`;
    html += '</div>';
    
    // Render visible problems (ahead + behind)
    visibleProblems.forEach(({ problem, index, type }) => {
        if (!problem || !problem.position) return;
        
        const pos = problem.position;
        const isBehind = type === 'behind';
        const expTime = problem.expirationTime || game.getExpirationTime();
        const timeRem = problem.getTimeRemaining();
        const pct = Math.max(0, expTime > 0 ? (timeRem / expTime) * 100 : 0);
        
        let tClass = 'time-ok';
        if (pct < 20) tClass = 'time-critical';
        else if (pct < 40) tClass = 'time-warning';
        
        const isExpired = problem.isExpired();
        
        html += `<div class="problem-box ${tClass} ${isExpired ? 'expired' : ''} ${isBehind ? 'behind' : ''}" 
                 style="left: ${pos.x}px; top: ${pos.y}px;"
                 data-index="${index}">`;
        
        html += '<div class="problem-vertical">';
        html += `<div class="problem-line">${problem.multiplicand}</div>`;
        html += `<div class="problem-line">× ${problem.multiplier}</div>`;
        html += '<div class="problem-line problem-divider">────</div>';
        
        if (isBehind && problem.answered) {
            html += `<div class="problem-line problem-answer">${problem.answer}</div>`;
        } else {
            html += `<div class="problem-line problem-answer">?</div>`;
        }
        
        html += '</div>';
        
        if (!isExpired) {
            html += `<div class="time-bar" style="width: ${pct}%"></div>`;
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    snakeArea.innerHTML = html;
    
    inputElement = snakeArea.querySelector('.answer-input');
    if (inputElement && document.activeElement !== inputElement) {
        inputElement.focus();
    }
    
    // Wrong answer feedback
    if (game.wrongAnswerTimeout) {
        const timeLeft = Math.ceil((game.wrongAnswerTimeoutEnd - Date.now()) / 1000);
        feedbackEl.textContent = `>>> WRONG! Correct: ${currentProblem.answer} (${timeLeft}s timeout) <<<`;
        feedbackEl.className = 'feedback wrong';
    } else {
        feedbackEl.textContent = '';
        feedbackEl.className = 'feedback';
    }
}

function showScreen(screenName) {
    [startScreen, gameScreen, pauseScreen, gameOverScreen, helpScreen].forEach(screen => {
        screen.classList.add('hidden');
    });
    
    switch(screenName) {
        case 'start': startScreen.classList.remove('hidden'); break;
        case 'game': gameScreen.classList.remove('hidden'); break;
        case 'pause': pauseScreen.classList.remove('hidden'); break;
        case 'game-over': gameOverScreen.classList.remove('hidden'); break;
        case 'help': helpScreen.classList.remove('hidden'); break;
    }
}

// Keyboard input
document.addEventListener('keydown', (e) => {
    const state = ui.getState();
    
    if (state === UI_STATE.START) {
        if (e.code === 'Space') {
            e.preventDefault();
            try {
                updateLayoutDimensions();
                game.start();
                currentInput = '';
                previousLevel = 1;
                ui.setState(UI_STATE.PLAYING);
                showScreen('game');
                gameLoop();
            } catch (error) {
                console.error('Error starting game:', error);
            }
        }
    } else if (state === UI_STATE.PLAYING) {
        if (e.key === '?') {
            e.preventDefault();
            ui.setState(UI_STATE.HELP);
            showScreen('help');
        } else {
            const result = game.handleInput(e.key);
            
            if (result.paused !== undefined) {
                ui.setState(result.paused ? UI_STATE.PAUSED : UI_STATE.PLAYING);
                showScreen(result.paused ? 'pause' : 'game');
                if (!result.paused) {
                    gameLoop();
                }
            }
            
            if (result.input) {
                if (currentInput.length < 3) {
                    currentInput += result.input;
                }
            } else if (result.backspace) {
                currentInput = currentInput.slice(0, -1);
            }
        }
    } else if (state === UI_STATE.PAUSED) {
        if (e.key === 'Escape') {
            game.togglePause();
            ui.setState(UI_STATE.PLAYING);
            showScreen('game');
            gameLoop();
        } else if (e.code === 'Space') {
            e.preventDefault();
            previousLevel = 1;
            ui.setState(UI_STATE.START);
            showScreen('start');
            updateHighScoreDisplay();
        }
    } else if (state === UI_STATE.GAME_OVER) {
        if (e.code === 'Space') {
            e.preventDefault();
            previousLevel = 1;
            ui.setState(UI_STATE.START);
            showScreen('start');
            updateHighScoreDisplay();
        }
    } else if (state === UI_STATE.HELP) {
        if (e.key === '?') {
            ui.setState(UI_STATE.PLAYING);
            showScreen('game');
            gameLoop();
        }
    }
});

// Handle Enter key for answer submission
document.addEventListener('keydown', (e) => {
    if (ui.getState() === UI_STATE.PLAYING && !game.paused && !game.wrongAnswerTimeout) {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            // Don't submit if no input - just ignore the Enter key
            if (!currentInput || currentInput.trim() === '') {
                return;
            }
            const result = game.submitAnswer(currentInput);
            if (result.handled) {
                if (result.correct) {
                    currentInput = '';
                    
                    // Check for level up
                    if (game.level > previousLevel) {
                        showLevelUp();
                        previousLevel = game.level;
                    }
                    
                    // Show tail eaten feedback if applicable
                    if (result.tailEaten) {
                        feedbackEl.textContent = `>>> TAIL EATEN! +${result.tailEaten.bonus} BONUS! <<<`;
                        feedbackEl.className = 'feedback correct';
                    } else {
                        feedbackEl.textContent = '>>> CORRECT! <<<';
                        feedbackEl.className = 'feedback correct';
                    }
                    setTimeout(() => {
                        feedbackEl.textContent = '';
                        feedbackEl.className = 'feedback';
                    }, 500);
                } else {
                    currentInput = '';
                }
            }
        }
    }
});

function updateHighScoreDisplay() {
    if (highScoreValue) {
        highScoreValue.textContent = game.highScore;
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateHighScoreDisplay();
        updateLayoutDimensions();
        showScreen('start');
    });
} else {
    updateHighScoreDisplay();
    updateLayoutDimensions();
    showScreen('start');
}
