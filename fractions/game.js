import { getRandomDrill, getDrillByName } from './drills.js';

class Game {
    constructor() {
        this.reset();
        this.loadHighScores();
        this.loadStatistics();
        this.selectedMode = null;
    }

    reset() {
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.streak = 0;
        this.bestStreak = this.bestStreak || 0;
        this.correctAnswers = 0;
        this.totalQuestions = 0;
        this.currentDrill = null;
        this.gameOver = false;
        this.paused = false;
        this.answersThisLevel = 0;
        this.answersPerLevel = 3;
    }

    setMode(modeName) {
        this.selectedMode = modeName;
    }

    start() {
        this.reset();
        this.startNewDrill();
    }

    startNewDrill() {
        if (this.currentDrill) {
            this.currentDrill.end();
        }

        // Use selected mode if set, otherwise random
        if (this.selectedMode) {
            this.currentDrill = getDrillByName(this.selectedMode);
        } else {
            this.currentDrill = getRandomDrill();
        }
        const timeLimit = this.getTimeLimit();
        this.currentDrill.start(this.level, timeLimit);
    }

    getTimeLimit() {
        // Different base times for different drills
        const drillTimes = {
            'Ordering': 30,
            'Bigger/Smaller': 12,  // Survival mode: starts at 12s, gains time per correct answer
            'To Decimal': 20,
            'Between Marks': 25,
            'Add/Subtract': 25,
            'Mixed to Improper': 25,
            'Difference': 25,
            'Inches to Feet': 30
        };
        
        const baseTime = drillTimes[this.currentDrill.name] || 30;
        
        // Custom time progression for Ordering drill
        let timeLimit;
        if (this.currentDrill.name === 'Ordering') {
            // Level 1: 20s (start at level 3 difficulty), Level 2: 16s, Level 3: 12s, Level 4: 8s, then continue to minimum of 4s
            if (this.level === 1) {
                timeLimit = 20;
            } else if (this.level === 2) {
                timeLimit = 16;
            } else if (this.level === 3) {
                timeLimit = 12;
            } else if (this.level === 4) {
                timeLimit = 8;
            } else {
                // Level 5+: reduce by 4 seconds per level from level 4's time
                timeLimit = 8 - (this.level - 4) * 4;
            }
            // Minimum time is 4 seconds
            timeLimit = Math.max(timeLimit, 4);
        } else if (this.currentDrill.name === 'Bigger/Smaller') {
            // Bigger/Smaller uses survival mode - no level-based time reduction
            // Time is managed by the drill itself (adds time for correct answers)
            timeLimit = baseTime;
        } else if (this.currentDrill.name === 'Mixed to Improper') {
            // Aggressive difficulty ramp - level 2 after first answer, fast times
            // Level 1: 25s (warm-up), Level 2: 12s (half), then gradual decrease
            if (this.level === 1) {
                timeLimit = 25;
            } else if (this.level === 2) {
                timeLimit = 12;
            } else if (this.level === 3) {
                timeLimit = 10;
            } else if (this.level === 4) {
                timeLimit = 8;
            } else {
                timeLimit = 7; // Minimum for level 5+
            }
        } else if (this.currentDrill.name === 'Difference') {
            // Very aggressive difficulty - this one should be tough to get far in
            // Each level is roughly 3/4 of the previous after the initial drops
            if (this.level === 1) {
                timeLimit = 25;
            } else if (this.level === 2) {
                timeLimit = 15; // Big drop
            } else if (this.level === 3) {
                timeLimit = 10; // Another big drop
            } else if (this.level === 4) {
                timeLimit = 7;  // ~3/4 of 10
            } else if (this.level === 5) {
                timeLimit = 5;  // ~3/4 of 7
            } else {
                timeLimit = 4;  // Minimum for level 6+
            }
        } else if (this.currentDrill.name === 'To Decimal') {
            // Sharp difficulty increase from level 3 onwards
            if (this.level === 1) {
                timeLimit = 20;
            } else if (this.level === 2) {
                timeLimit = 15;
            } else if (this.level === 3) {
                timeLimit = 8;  // Sharp drop
            } else if (this.level === 4) {
                timeLimit = 6;
            } else if (this.level === 5) {
                timeLimit = 5;
            } else {
                timeLimit = 4;  // Minimum for level 6+
            }
        } else if (this.currentDrill.name === 'Inches to Feet') {
            // Very aggressive difficulty - this should be tough
            if (this.level === 1) {
                timeLimit = 20;  // Short warm-up
            } else if (this.level === 2) {
                timeLimit = 12;  // Big drop immediately
            } else if (this.level === 3) {
                timeLimit = 8;   // Aggressive
            } else if (this.level === 4) {
                timeLimit = 6;
            } else if (this.level === 5) {
                timeLimit = 5;
            } else {
                timeLimit = 4;   // Minimum for level 6+ - very hard
            }
        } else {
            // Other drills: reduce by 2 seconds per level
            const reduction = (this.level - 1) * 2;
            const minTime = baseTime <= 25 ? 10 : 20;
            timeLimit = Math.max(baseTime - reduction, minTime);
        }
        
        return timeLimit;
    }

    update() {
        if (this.gameOver || this.paused || !this.currentDrill) return;

        const stillActive = this.currentDrill.update();
        if (!stillActive) {
            this.handleTimeout();
        }
    }

    handleInput(key) {
        if (this.gameOver || !this.currentDrill) return { handled: false };

        if (key === 'Escape') {
            this.paused = !this.paused;
            return { handled: true, paused: this.paused };
        }

        if (this.paused) return { handled: false };

        const result = this.currentDrill.handleInput(key);
        if (result.handled && result.complete) {
            this.handleDrillComplete(result);
        } else if (result.handled && result.continue) {
            this.handleAnswer(result);
        }

        return result;
    }

    handleTouch(side) {
        if (this.gameOver || this.paused || !this.currentDrill) return { handled: false };
        if (this.currentDrill.name !== 'Bigger/Smaller') return { handled: false };

        const result = this.currentDrill.handleTouch(side);
        if (result.handled) {
            this.handleAnswer(result);
        }
        return result;
    }

    handleAnswer(result) {
        this.totalQuestions++;
        
        if (result.correct) {
            // Calculate final score with bonuses
            let finalScore = result.score;
            
            // Apply level multiplier (+10% per level)
            const levelMultiplier = 1 + (this.level - 1) * 0.1;
            finalScore = Math.floor(finalScore * levelMultiplier);
            
            // Apply streak bonus (+5 points per streak, max 50)
            const streakBonus = Math.min(this.streak * 5, 50);
            finalScore += streakBonus;
            
            this.score += finalScore;
            this.streak++;
            this.bestStreak = Math.max(this.bestStreak, this.streak);
            this.correctAnswers++;
            this.answersThisLevel++;

            // Level up check
            if (this.answersThisLevel >= this.getAnswersRequiredForLevel()) {
                this.levelUp();
            }
        } else {
            this.loseLife();
            this.streak = 0;
        }
    }

    handleDrillComplete(result) {
        this.handleAnswer(result);
        
        if (!this.gameOver) {
            // Longer delay for wrong answers so player can read the correct answer
            const delay = result.correct ? 1500 : 4000;
            setTimeout(() => {
                if (!this.gameOver) {
                    this.startNewDrill();
                }
            }, delay);
        }
    }

    handleTimeout() {
        // Bigger/Smaller survival mode: timer running out = instant game over
        if (this.currentDrill?.name === 'Bigger/Smaller') {
            this.streak = 0;
            this.endGame();
            return;
        }
        
        this.loseLife();
        this.streak = 0;
        if (!this.gameOver) {
            this.startNewDrill();
        }
    }

    levelUp() {
        this.level++;
        this.answersThisLevel = 0;
        // Level up notification handled by UI
    }

    getAnswersRequiredForLevel() {
        // Custom progression for Mixed to Improper: 1 to reach level 2, then 3 for each subsequent level
        if (this.currentDrill?.name === 'Mixed to Improper') {
            return this.level === 1 ? 1 : 3;
        }
        // Default: 3 answers per level
        return this.answersPerLevel;
    }

    loseLife() {
        this.lives--;
        if (this.lives <= 0) {
            this.endGame();
        }
    }

    endGame() {
        this.gameOver = true;
        if (this.currentDrill) {
            this.currentDrill.end();
        }
        this.saveHighScore();
        this.saveStatistics();
    }

    getAccuracy() {
        return this.totalQuestions > 0 
            ? Math.round((this.correctAnswers / this.totalQuestions) * 100) 
            : 0;
    }

    getTimeBonus() {
        if (!this.currentDrill) return 0;
        const multiplier = Math.max(1, 10 - this.level);
        return Math.floor(this.currentDrill.timeRemaining * multiplier);
    }

    // High score management
    loadHighScores() {
        try {
            const saved = localStorage.getItem('tapeMeasureHighScores');
            this.highScores = saved ? JSON.parse(saved) : { overall: 0 };
            // Ensure overall exists
            if (!this.highScores.overall) {
                this.highScores.overall = 0;
            }
        } catch (e) {
            this.highScores = { overall: 0 };
        }
    }

    saveHighScore() {
        const drillName = this.currentDrill?.name;
        const scoreKey = drillName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown';
        
        if (!this.highScores[scoreKey]) {
            this.highScores[scoreKey] = 0;
        }
        
        this.highScores[scoreKey] = Math.max(this.highScores[scoreKey], this.score);
        this.highScores.overall = Math.max(this.highScores.overall, this.score);

        try {
            localStorage.setItem('tapeMeasureHighScores', JSON.stringify(this.highScores));
        } catch (e) {
            // Graceful degradation
            console.warn('Could not save high score:', e);
        }
    }

    getModeHighScore(modeName) {
        if (!modeName) return this.highScores.overall || 0;
        const scoreKey = modeName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return this.highScores[scoreKey] || 0;
    }

    // Statistics management
    loadStatistics() {
        try {
            const saved = localStorage.getItem('tapeMeasureStats');
            const stats = saved ? JSON.parse(saved) : {};
            this.bestStreak = stats.bestStreak || 0;
            this.totalGames = stats.totalGames || 0;
        } catch (e) {
            this.bestStreak = 0;
            this.totalGames = 0;
        }
    }

    saveStatistics() {
        try {
            const stats = {
                bestStreak: this.bestStreak,
                totalGames: (this.totalGames || 0) + 1,
                accuracy: this.getAccuracy()
            };
            localStorage.setItem('tapeMeasureStats', JSON.stringify(stats));
        } catch (e) {
            console.warn('Could not save statistics:', e);
        }
    }
}

export default Game;
