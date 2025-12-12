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
        this.answersPerLevel = 5;
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
            'Bigger/Smaller': 60,
            'To Decimal': 20,
            'Between Marks': 25,
            'Add/Subtract': 25,
            'Mixed to Improper': 25,
            'Difference': 25,
            'Inches to Feet': 30
        };
        
        const baseTime = drillTimes[this.currentDrill.name] || 30;
        const reduction = (this.level - 1) * 2;
        const minTime = baseTime <= 25 ? 10 : 20;
        return Math.max(baseTime - reduction, minTime);
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
            if (this.answersThisLevel >= this.answersPerLevel) {
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
