import Game from './game.js';
import UIManager, { UI_STATE } from './ui.js';

// Initialize
const game = new Game();
const ui = new UIManager();

// DOM elements
const startScreen = document.getElementById('start-screen');
const modeSelectionScreen = document.getElementById('mode-selection-screen');
const gameScreen = document.getElementById('game-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const helpScreen = document.getElementById('help-screen');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const streakEl = document.getElementById('streak');
const timerBar = document.getElementById('timer-bar');
const timerText = document.getElementById('timer-text');
const drillArea = document.getElementById('drill-area');
const feedbackEl = document.getElementById('feedback');
const highScoreValue = document.getElementById('high-score-value');
const orderingHighScore = document.getElementById('ordering-high-score');
const biggerSmallerHighScore = document.getElementById('bigger-smaller-high-score');
const finalScoreEl = document.getElementById('final-score');
const finalAccuracyEl = document.getElementById('final-accuracy');
const finalStreakEl = document.getElementById('final-streak');
const finalModeEl = document.getElementById('final-mode');
const finalModeHighScoreEl = document.getElementById('final-mode-high-score');
const newHighScoreEl = document.getElementById('new-high-score');

// Game loop
let animationFrameId = null;

function gameLoop() {
    game.update();
    updateUI();
    
    // Check for game over (handles timeout-triggered game overs)
    if (game.gameOver && ui.getState() === UI_STATE.PLAYING) {
        ui.setState(UI_STATE.GAME_OVER);
        setTimeout(() => {
            if (ui.getState() !== UI_STATE.GAME_OVER) return;
            showScreen('game-over');
            
            const modeName = game.currentDrill?.name || game.selectedMode || 'Unknown';
            const modeHighScore = game.getModeHighScore(modeName);
            
            finalScoreEl.textContent = game.score;
            finalModeEl.textContent = modeName;
            finalModeHighScoreEl.textContent = modeHighScore;
            finalAccuracyEl.textContent = game.getAccuracy();
            finalStreakEl.textContent = game.bestStreak;
            
            const isNewHigh = game.score >= modeHighScore;
            if (isNewHigh) {
                newHighScoreEl.classList.remove('hidden');
            } else {
                newHighScoreEl.classList.add('hidden');
            }
        }, 1000); // 1 second delay to show final state
        return; // Stop the game loop
    }
    
    if (ui.getState() === UI_STATE.PLAYING && !game.gameOver) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

function updateUI() {
    // Update stats
    scoreEl.textContent = game.score;
    levelEl.textContent = game.level;
    livesEl.textContent = '●'.repeat(game.lives) + '○'.repeat(3 - game.lives);
    streakEl.textContent = game.streak;

    // Update timer
    if (game.currentDrill) {
        const timeRemaining = Math.ceil(game.currentDrill.timeRemaining);
        const timeLimit = game.getTimeLimit();
        const percentage = Math.min(100, (timeRemaining / timeLimit) * 100);
        
        timerBar.style.width = percentage + '%';
        timerText.textContent = timeRemaining;
        
        // Warning when time is low
        if (timeRemaining <= 5) {
            timerBar.classList.add('warning');
        } else {
            timerBar.classList.remove('warning');
        }

        // Render drill
        renderDrill();
    }
}

function renderDrill() {
    if (!game.currentDrill) return;

    const data = game.currentDrill.getDisplayData();
    const drill = game.currentDrill;

    if (drill.name === 'Ordering') {
        renderOrderingDrill(data);
    } else if (drill.name === 'Bigger/Smaller') {
        renderBiggerSmallerDrill(data);
    } else if (drill.name === 'To Decimal') {
        renderToDecimalDrill(data);
    } else if (drill.name === 'Between Marks') {
        renderBetweenMarksDrill(data);
    } else if (drill.name === 'Add/Subtract') {
        renderAddSubtractDrill(data);
    } else if (drill.name === 'Mixed to Improper') {
        renderMixedToImproperDrill(data);
    } else if (drill.name === 'Difference') {
        renderDifferenceDrill(data);
    } else if (drill.name === 'Inches to Feet') {
        renderInchesToFeetDrill(data);
    }

    // Show feedback
    if (data.feedback) {
        showFeedback(data.feedback, drill.name);
    } else {
        feedbackEl.textContent = '';
        feedbackEl.className = 'feedback';
    }
    
    // Update input highlighting based on window focus
    updateInputActiveState();
}

// Track last rendered state to avoid unnecessary re-renders
let lastOrderingRenderKey = '';

// Reset render keys when starting a new game (called from mode selection)
function resetRenderKeys() {
    lastOrderingRenderKey = '';
    lastBiggerSmallerRenderKey = '';
}

function renderOrderingDrill(data) {
    const { fractions, selectedOrder, feedback } = data;
    
    // Create a key representing current state - only re-render if changed
    const renderKey = fractions.map(f => f.toString()).join(',') + '|' + selectedOrder.join(',');
    
    
    if (renderKey === lastOrderingRenderKey) {
        return; // Skip re-render if nothing changed
    }
    lastOrderingRenderKey = renderKey;
    
    let html = '<div class="ordering-drill">';
    html += '<p class="drill-title">Arrange from smallest to largest:</p>';
    html += '<div class="fractions-list">';
    
    fractions.forEach((frac, index) => {
        const isSelected = selectedOrder.includes(index);
        const position = selectedOrder.indexOf(index);
        const positionClass = position >= 0 ? `position-${position + 1}` : '';
        
        html += `<div class="fraction-item ${isSelected ? 'selected ' + positionClass : ''}" data-index="${index}" onclick="window.handleFractionClick(${index})">`;
        html += `<span class="fraction">${frac.toString()}</span>`;
        if (isSelected) {
            html += `<span class="position">[${position + 1}]</span>`;
        }
        html += '</div>';
    });
    
    html += '</div>';
    
    if (selectedOrder.length < 5) {
        html += `<p class="hint">Tap or press ${5 - selectedOrder.length} more fraction(s)</p>`;
    }
    
    html += '</div>';
    drillArea.innerHTML = html;
}

// Global handler for ordering drill clicks (inline onclick approach)
window.handleFractionClick = function(index) {
    if (ui.getState() !== UI_STATE.PLAYING || game.gameOver) return;
    
    const result = game.handleInput(String(index + 1));
    if (result.handled) {
        updateUI();
        if (game.level > previousLevel) {
            showLevelUp();
            previousLevel = game.level;
        }
    }
};

// Track last rendered state to avoid unnecessary re-renders for Bigger/Smaller
let lastBiggerSmallerRenderKey = '';

function renderBiggerSmallerDrill(data) {
    const { fractions, feedback } = data;
    const [left, right] = fractions;
    
    // Create render key to avoid unnecessary re-renders that destroy click handlers
    const renderKey = left.toString() + '|' + right.toString();
    if (renderKey === lastBiggerSmallerRenderKey) {
        return; // Skip re-render if nothing changed
    }
    lastBiggerSmallerRenderKey = renderKey;
    
    let html = '<div class="bigger-smaller-drill">';
    html += '<p class="drill-title">Which fraction is bigger?</p>';
    html += '<div class="comparison-area">';
    html += `<div class="fraction-box left-box" data-side="left" onclick="window.handleBiggerSmallerClick('left')">`;
    html += `<div class="fraction-large">${left.toString()}</div>`;
    html += '<div class="hint desktop-hint">Press ←</div>';
    html += '</div>';
    html += '<div class="vs">VS</div>';
    html += `<div class="fraction-box right-box" data-side="right" onclick="window.handleBiggerSmallerClick('right')">`;
    html += `<div class="fraction-large">${right.toString()}</div>`;
    html += '<div class="hint desktop-hint">Press →</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    
    drillArea.innerHTML = html;
}

// Global handler for Bigger/Smaller clicks
window.handleBiggerSmallerClick = function(side) {
    if (ui.getState() !== UI_STATE.PLAYING || game.gameOver) return;
    game.handleTouch(side);
    updateUI();
};

function renderToDecimalDrill(data) {
    const { fraction, userInput, feedback } = data;
    
    let html = '<div class="to-decimal-drill">';
    html += '<p class="drill-title">Convert to decimal:</p>';
    html += `<div class="fraction-display">${fraction.toString()}</div>`;
    html += '<div class="input-area">';
    html += `<input type="text" class="decimal-input" value="${userInput}" placeholder="0.0000" readonly>`;
    html += '</div>';
    html += '<p class="hint">Type the decimal and press Enter</p>';
    html += '</div>';
    
    drillArea.innerHTML = html;
}

function renderBetweenMarksDrill(data) {
    const { fraction1, fraction2, userInput, feedback } = data;
    
    let html = '<div class="between-marks-drill">';
    html += '<p class="drill-title">Find the fraction halfway between:</p>';
    html += '<div class="fraction-pair">';
    html += `<div class="fraction-display">${fraction1.toString()}</div>`;
    html += '<div class="and">and</div>';
    html += `<div class="fraction-display">${fraction2.toString()}</div>`;
    html += '</div>';
    html += '<div class="input-area">';
    html += `<input type="text" class="fraction-input" value="${userInput}" placeholder="numerator/denominator" readonly>`;
    html += '</div>';
    html += '<p class="hint">Type the fraction (e.g., 1/4) and press Enter</p>';
    html += '</div>';
    
    drillArea.innerHTML = html;
}

function renderAddSubtractDrill(data) {
    const { fraction1, fraction2, operation, userInput, feedback } = data;
    const opSymbol = operation === 'add' ? '+' : '-';
    
    let html = '<div class="add-subtract-drill">';
    html += '<p class="drill-title">Calculate:</p>';
    html += '<div class="equation">';
    html += `<div class="fraction-display">${fraction1.toString()}</div>`;
    html += `<div class="operator">${opSymbol}</div>`;
    html += `<div class="fraction-display">${fraction2.toString()}</div>`;
    html += '<div class="equals">=</div>';
    html += `<input type="text" class="fraction-input" value="${userInput}" placeholder="numerator/denominator" readonly>`;
    html += '</div>';
    html += '<p class="hint">Type the answer as a fraction and press Enter</p>';
    html += '</div>';
    
    drillArea.innerHTML = html;
}


function renderMixedToImproperDrill(data) {
    const { mixed, userInput, feedback } = data;
    
    let html = '<div class="mixed-to-improper-drill">';
    html += '<p class="drill-title">Convert to improper fraction:</p>';
    html += `<div class="mixed-display">${mixed.whole} ${mixed.numerator}/${mixed.denominator}</div>`;
    html += '<div class="input-area">';
    html += `<input type="text" class="fraction-input" value="${userInput}" placeholder="numerator/denominator" readonly>`;
    html += '</div>';
    html += '<p class="hint">Type the improper fraction and press Enter</p>';
    html += '</div>';
    
    drillArea.innerHTML = html;
}

function renderDifferenceDrill(data) {
    const { fraction1, fraction2, userInput, feedback } = data;
    
    let html = '<div class="difference-drill">';
    html += '<p class="drill-title">Find the difference:</p>';
    html += '<div class="equation">';
    html += `<div class="fraction-display">${fraction1.toString()}</div>`;
    html += '<div class="operator">-</div>';
    html += `<div class="fraction-display">${fraction2.toString()}</div>`;
    html += '<div class="equals">=</div>';
    html += `<input type="text" class="fraction-input" value="${userInput}" placeholder="numerator/denominator" readonly>`;
    html += '</div>';
    html += '<p class="hint">Type the answer as a fraction and press Enter</p>';
    html += '</div>';
    
    drillArea.innerHTML = html;
}

function renderInchesToFeetDrill(data) {
    const { totalInches, userFeet, userInches, inputMode, feedback } = data;
    
    let html = '<div class="inches-to-feet-drill">';
    html += '<p class="drill-title">Convert to feet and inches:</p>';
    html += `<div class="inches-display">${totalInches} inches</div>`;
    html += '<div class="input-area">';
    html += `<input type="text" class="feet-input ${inputMode === 'feet' ? 'active' : ''}" value="${userFeet}" placeholder="feet" readonly>`;
    html += '<span class="unit">ft</span>';
    html += `<input type="text" class="inches-input ${inputMode === 'inches' ? 'active' : ''}" value="${userInches}" placeholder="inches" readonly>`;
    html += '<span class="unit">in</span>';
    html += '</div>';
    html += '<p class="hint">Type feet and inches, press Tab to switch fields, Enter to submit</p>';
    html += '</div>';
    
    drillArea.innerHTML = html;
}

function showFeedback(feedback, drillName) {
    if (feedback.correct) {
        feedbackEl.textContent = '>>> CORRECT! <<<';
        feedbackEl.className = 'feedback correct';
        // Clear feedback after short delay for correct answers
        setTimeout(() => {
            feedbackEl.textContent = '';
            feedbackEl.className = 'feedback';
        }, 1500);
    } else {
        feedbackEl.textContent = '>>> WRONG! <<<';
        feedbackEl.className = 'feedback wrong';
        
        if (drillName === 'Ordering') {
            const correctOrder = feedback.correctOrder.map(f => f.toString()).join(' < ');
            feedbackEl.textContent += ` Correct: ${correctOrder}`;
        } else if (drillName === 'Bigger/Smaller') {
            const correct = feedback.correctAnswer === 'left' ? 'LEFT' : 'RIGHT';
            feedbackEl.textContent += ` Correct: ${correct}`;
        } else if (feedback.correctAnswer) {
            feedbackEl.textContent += ` Correct: ${feedback.correctAnswer}`;
        }
        
        // Keep feedback visible longer for wrong answers so player can read it
        setTimeout(() => {
            feedbackEl.textContent = '';
            feedbackEl.className = 'feedback';
        }, 4000); // 4 seconds for wrong answers
    }
}

function showScreen(screenName) {
    [startScreen, modeSelectionScreen, gameScreen, pauseScreen, gameOverScreen, helpScreen].forEach(screen => {
        screen.classList.add('hidden');
    });
    
    switch(screenName) {
        case 'start':
            startScreen.classList.remove('hidden');
            break;
        case 'mode-selection':
            modeSelectionScreen.classList.remove('hidden');
            break;
        case 'game':
            gameScreen.classList.remove('hidden');
            break;
        case 'pause':
            pauseScreen.classList.remove('hidden');
            break;
        case 'game-over':
            gameOverScreen.classList.remove('hidden');
            break;
        case 'help':
            helpScreen.classList.remove('hidden');
            break;
    }
}

function showLevelUp() {
    const message = document.createElement('div');
    // Raise level up prompt higher for Bigger/Smaller game only
    const isBiggerSmaller = game.currentDrill?.name === 'Bigger/Smaller';
    message.className = isBiggerSmaller ? 'level-up level-up-high' : 'level-up';
    message.textContent = `>>> LEVEL UP! Level ${game.level} <<<`;
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.remove();
    }, 667); // 1/3 of original 2000ms
}

// Track previous level for level-up detection
let previousLevel = 1;

// Keyboard input
document.addEventListener('keydown', (e) => {
    const state = ui.getState();
    
    if (state === UI_STATE.START) {
        if (e.code === 'Space') {
            e.preventDefault();
            ui.setState(UI_STATE.MODE_SELECTION);
            showScreen('mode-selection');
            updateModeHighScores();
        }
    } else if (state === UI_STATE.MODE_SELECTION) {
        const modes = [
            'Ordering',
            'Bigger/Smaller',
            'To Decimal',
            'Between Marks',
            'Add/Subtract',
            'Mixed to Improper',
            'Difference',
            'Inches to Feet'
        ];
        
        const num = parseInt(e.key);
        if (num >= 1 && num <= 8) {
            e.preventDefault();
            const selectedMode = modes[num - 1];
            if (selectedMode) {
                game.setMode(selectedMode);
                game.start();
                previousLevel = 1;
                resetRenderKeys(); // Reset render cache for new game
                ui.setState(UI_STATE.PLAYING);
                showScreen('game');
                updateNumpadVisibility();
                gameLoop();
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
            
            // Check for level up
            if (game.level > previousLevel) {
                showLevelUp();
                previousLevel = game.level;
            }
        }
    } else if (state === UI_STATE.PAUSED) {
        if (e.key === 'Escape') {
            ui.setState(UI_STATE.PLAYING);
            showScreen('game');
            updateNumpadVisibility();
            gameLoop();
        } else if (e.code === 'Space') {
            e.preventDefault();
            // Return to main menu
            numpad?.classList.add('hidden');
            ui.setState(UI_STATE.MODE_SELECTION);
            showScreen('mode-selection');
            updateModeHighScores();
            previousLevel = 1;
        }
    } else if (state === UI_STATE.GAME_OVER) {
        if (e.code === 'Space') {
            e.preventDefault();
            numpad?.classList.add('hidden');
            ui.setState(UI_STATE.MODE_SELECTION);
            showScreen('mode-selection');
            updateModeHighScores();
            previousLevel = 1;
        }
    } else if (state === UI_STATE.HELP) {
        if (e.key === '?') {
            ui.setState(UI_STATE.PLAYING);
            showScreen('game');
            updateNumpadVisibility();
            gameLoop();
        }
    }
    
    // Check for game over
    if (game.gameOver && state === UI_STATE.PLAYING) {
        // Immediately transition to GAME_OVER state to prevent multiple setTimeout scheduling
        ui.setState(UI_STATE.GAME_OVER);
        // Show the last question and answer for a moment before showing game over screen
        setTimeout(() => {
            // Guard: only show game-over screen if user hasn't navigated away
            if (ui.getState() !== UI_STATE.GAME_OVER) {
                return;
            }
            showScreen('game-over');
            
            const modeName = game.currentDrill?.name || game.selectedMode || 'Unknown';
            const modeHighScore = game.getModeHighScore(modeName);
            
            finalScoreEl.textContent = game.score;
            finalModeEl.textContent = modeName;
            finalModeHighScoreEl.textContent = modeHighScore;
            finalAccuracyEl.textContent = game.getAccuracy();
            finalStreakEl.textContent = game.bestStreak;
            
            const isNewHigh = game.score >= modeHighScore;
            if (isNewHigh) {
                newHighScoreEl.classList.remove('hidden');
            } else {
                newHighScoreEl.classList.add('hidden');
            }
        }, 1000); // 1 second delay to show final state before game over screen
    }
});

// Initialize
function updateHighScoreDisplay() {
    highScoreValue.textContent = game.highScores.overall;
}

function updateModeHighScores() {
    const modeElements = {
        'ordering': document.getElementById('ordering-high-score'),
        'biggermall': document.getElementById('bigger-smaller-high-score'),
        'todecimal': document.getElementById('todecimal-high-score'),
        'betweenmarks': document.getElementById('betweenmarks-high-score'),
        'addsubtract': document.getElementById('addsubtract-high-score'),
        'mixedtoimproper': document.getElementById('mixedtoimproper-high-score'),
        'difference': document.getElementById('difference-high-score'),
        'inchestofeet': document.getElementById('inchestofeet-high-score')
    };
    
    const modes = [
        'Ordering',
        'Bigger/Smaller',
        'To Decimal',
        'Between Marks',
        'Add/Subtract',
        'Mixed to Improper',
        'Difference',
        'Inches to Feet'
    ];
    
    modes.forEach((mode, index) => {
        const key = Object.keys(modeElements)[index];
        const element = modeElements[key];
        if (element) {
            element.textContent = game.getModeHighScore(mode);
        }
    });
}

updateHighScoreDisplay();
updateModeHighScores();
showScreen('start');

// Track window focus state for input highlighting
let windowHasFocus = document.hasFocus();

window.addEventListener('focus', () => {
    windowHasFocus = true;
    updateInputActiveState();
});

window.addEventListener('blur', () => {
    windowHasFocus = false;
    updateInputActiveState();
});

function updateInputActiveState() {
    // Update all game inputs to reflect window focus state
    const inputs = drillArea.querySelectorAll('.decimal-input, .fraction-input, .number-input, .feet-input, .inches-input');
    inputs.forEach(input => {
        if (windowHasFocus && ui.getState() === UI_STATE.PLAYING) {
            input.classList.add('window-focused');
        } else {
            input.classList.remove('window-focused');
        }
    });
}

// Note: Click handlers for fraction items are handled via inline onclick
// attributes (handleFractionClick) to work with the render key optimization
// that prevents constant innerHTML re-renders. Auto-submit on 5 selections.

// Add click handlers for mode selection
document.querySelectorAll('.mode-option').forEach(option => {
    option.addEventListener('click', () => {
        const mode = option.getAttribute('data-mode');
        if (mode) {
            game.setMode(mode);
            game.start();
            previousLevel = 1;
            resetRenderKeys(); // Reset render cache for new game
            ui.setState(UI_STATE.PLAYING);
            showScreen('game');
            updateNumpadVisibility();
            gameLoop();
        }
    });
});

// ========================================
// MOBILE TOUCH SUPPORT
// ========================================

const numpad = document.getElementById('numpad');

// #region agent log - debug display helper
const debugDisplay = document.getElementById('debug-display');
function debugLog(msg) {
    if (debugDisplay) {
        const time = new Date().toLocaleTimeString();
        debugDisplay.innerHTML = `[${time}] ${msg}<br>` + debugDisplay.innerHTML;
        if (debugDisplay.children.length > 20) debugDisplay.innerHTML = debugDisplay.innerHTML.split('<br>').slice(0,20).join('<br>');
    }
}
debugLog(`Numpad found: ${!!numpad}, keys: ${numpad?.querySelectorAll('.numpad-key').length || 0}`);
// #endregion

// Detect if device is touch-capable
function isTouchDevice() {
    const result = ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0) || 
           (navigator.msMaxTouchPoints > 0) ||
           (window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    // #region agent log
    debugLog(`isTouchDevice: ${result}, touchPoints: ${navigator.maxTouchPoints}`);
    // #endregion
    return result;
}

// Games that need the numpad
const numpadGames = [
    'To Decimal',
    'Between Marks', 
    'Add/Subtract',
    'Mixed to Improper',
    'Difference',
    'Inches to Feet'
];

// Show/hide numpad based on current game
function updateNumpadVisibility() {
    if (!isTouchDevice() || !numpad) return;
    
    const state = ui.getState();
    const currentMode = game.selectedMode;
    
    // #region agent log
    debugLog(`updateNumpad: state=${state}, mode=${currentMode}, willShow=${state===UI_STATE.PLAYING&&numpadGames.includes(currentMode)}`);
    // #endregion
    
    if (state === UI_STATE.PLAYING && numpadGames.includes(currentMode)) {
        numpad.classList.remove('hidden');
    } else {
        numpad.classList.add('hidden');
    }
}

// Start button
const startButton = document.getElementById('start-button');
if (startButton) {
    startButton.addEventListener('click', () => {
        ui.setState(UI_STATE.MODE_SELECTION);
        showScreen('mode-selection');
        updateModeHighScores();
    });
}

// Resume button (pause screen)
const resumeButton = document.getElementById('resume-button');
if (resumeButton) {
    resumeButton.addEventListener('click', () => {
        ui.setState(UI_STATE.PLAYING);
        showScreen('game');
        updateNumpadVisibility();
        gameLoop();
    });
}

// Menu button (pause screen)
const menuButton = document.getElementById('menu-button');
if (menuButton) {
    menuButton.addEventListener('click', () => {
        numpad?.classList.add('hidden');
        ui.setState(UI_STATE.MODE_SELECTION);
        showScreen('mode-selection');
        updateModeHighScores();
        previousLevel = 1;
    });
}

// Restart button (game over screen)
const restartButton = document.getElementById('restart-button');
if (restartButton) {
    restartButton.addEventListener('click', () => {
        numpad?.classList.add('hidden');
        ui.setState(UI_STATE.MODE_SELECTION);
        showScreen('mode-selection');
        updateModeHighScores();
        previousLevel = 1;
    });
}

// Close help button
const closeHelpButton = document.getElementById('close-help-button');
if (closeHelpButton) {
    closeHelpButton.addEventListener('click', () => {
        ui.setState(UI_STATE.PLAYING);
        showScreen('game');
        updateNumpadVisibility();
        gameLoop();
    });
}

// In-game pause button
const pauseBtn = document.getElementById('pause-btn');
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        numpad?.classList.add('hidden');
        ui.setState(UI_STATE.PAUSED);
        showScreen('pause');
    });
}

// In-game help button
const helpBtn = document.getElementById('help-btn');
if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        numpad?.classList.add('hidden');
        ui.setState(UI_STATE.HELP);
        showScreen('help');
    });
}

// Numpad key handlers
// #region agent log
debugLog(`Numpad setup: attaching listeners to ${numpad?.querySelectorAll('.numpad-key').length || 0} keys`);
// #endregion

// Helper function to process numpad input
function processNumpadKey(keyValue) {
    // #region agent log
    debugLog(`PROCESS: key=${keyValue}, state=${ui.getState()}, isPlaying=${ui.getState()===UI_STATE.PLAYING}`);
    // #endregion
    if (keyValue && ui.getState() === UI_STATE.PLAYING) {
        const result = game.handleInput(keyValue);
        // #region agent log
        debugLog(`RESULT: handled=${result.handled}, update=${result.update}`);
        // #endregion
        if (result.paused !== undefined) {
            ui.setState(result.paused ? UI_STATE.PAUSED : UI_STATE.PLAYING);
            showScreen(result.paused ? 'pause' : 'game');
            if (result.paused) {
                numpad.classList.add('hidden');
            }
        }
        
        // Check for level up
        if (game.level > previousLevel) {
            showLevelUp();
            previousLevel = game.level;
        }
        
        // Update UI immediately after input
        updateUI();
        
        // Check for game over after input
        checkGameOverAfterInput();
    }
}

if (numpad) {
    numpad.querySelectorAll('.numpad-key').forEach(key => {
        // Use touchend for mobile - more reliable than click
        key.addEventListener('touchend', (e) => {
            e.preventDefault(); // Prevent ghost click
            // #region agent log
            debugLog(`TOUCHEND: key=${key.getAttribute('data-key')}`);
            // #endregion
            processNumpadKey(key.getAttribute('data-key'));
        });
        
        // Keep click for desktop/mouse users
        key.addEventListener('click', (e) => {
            // Only process if not a touch event (avoid double-processing)
            if (e.pointerType === 'touch') return;
            // #region agent log
            debugLog(`CLICK: key=${key.getAttribute('data-key')}`);
            // #endregion
            e.preventDefault();
            processNumpadKey(key.getAttribute('data-key'));
        });
    });
}

// Handle game over triggered by numpad input
function checkGameOverAfterInput() {
    if (game.gameOver && ui.getState() === UI_STATE.PLAYING) {
        ui.setState(UI_STATE.GAME_OVER);
        numpad?.classList.add('hidden');
        setTimeout(() => {
            if (ui.getState() !== UI_STATE.GAME_OVER) return;
            showScreen('game-over');
            
            const modeName = game.currentDrill?.name || game.selectedMode || 'Unknown';
            const modeHighScore = game.getModeHighScore(modeName);
            
            finalScoreEl.textContent = game.score;
            finalModeEl.textContent = modeName;
            finalModeHighScoreEl.textContent = modeHighScore;
            finalAccuracyEl.textContent = game.getAccuracy();
            finalStreakEl.textContent = game.bestStreak;
            
            const isNewHigh = game.score >= modeHighScore;
            if (isNewHigh) {
                newHighScoreEl.classList.remove('hidden');
            } else {
                newHighScoreEl.classList.add('hidden');
            }
        }, 1000);
    }
}
