import { generateProblem, generateInitialProblems } from './problems.js';
import SnakeLayout from './snake.js';

class Game {
    constructor() {
        this.reset();
        this.loadHighScore();
        this.snakeLayout = new SnakeLayout();
    }

    reset() {
        this.score = 0;
        this.level = 1;
        this.streak = 0;
        this.bestStreak = this.bestStreak || 0;
        this.consecutiveCorrect = 0;
        this.correctAnswers = 0;
        this.totalQuestions = 0;
        this.problems = [];
        this.currentProblemIndex = 0;
        this.currentProblem = null;
        this.circleSize = 12;
        this.gameOver = false;
        this.paused = false;
        this.pauseStartTime = null;
        this.totalPauseDuration = 0;
        this.wrongAnswerTimeout = false;
        this.wrongAnswerTimeoutEnd = 0;
        this.baseExpirationTime = 12.0;
        this.answersPerLevel = 8;
        this.answersThisLevel = 0;
    }

    start() {
        this.reset();
        
        // Generate exactly 12 problems for the circle
        this.problems = generateInitialProblems(this.circleSize, this.level);
        
        // Initialize each problem with spawnedAt and expiration time
        this.problems.forEach((problem, index) => {
            this.initializeProblem(problem);
        });
        
        this.currentProblemIndex = 0;
        this.currentProblem = this.problems[0];
        this.updatePositions();
        
        // Start expiration for the first problem only
        if (this.currentProblem) {
            this.currentProblem.startExpiration();
        }
    }
    
    updatePositions() {
        if (!this.snakeLayout || !this.problems || this.problems.length === 0) return;
        try {
            const positions = this.snakeLayout.calculatePositions(this.problems);
            this.problems.forEach((problem, index) => {
                if (positions && positions[index]) {
                    problem.position = positions[index];
                }
            });
        } catch (error) {
            console.error('Error updating positions:', error);
        }
    }

    togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            this.pauseStartTime = Date.now();
        } else {
            if (this.pauseStartTime !== null) {
                const pauseDuration = Date.now() - this.pauseStartTime;
                this.totalPauseDuration += pauseDuration;
                this.pauseStartTime = null;
                // Extend all expiresAt timestamps by pause duration
                this.problems.forEach(problem => {
                    if (problem && problem.expiresAt !== null) {
                        problem.expiresAt += pauseDuration;
                    }
                });
            }
        }
    }

    getExpirationTime() {
        // Level 1: 18s, Level 2: 14s, Level 3: 10s, then -1s per level
        // After level 7, ramp up aggressively: -2s per level, minimum 2.5s
        if (this.level === 1) return 18.0;
        if (this.level === 2) return 14.0;
        if (this.level <= 7) {
            // Level 3-7: starts at 10s, decreasing by 1s per level
            const reduction = (this.level - 3) * 1.0;
            return 10.0 - reduction; // L3=10, L4=9, L5=8, L6=7, L7=6
        }
        // Level 8+: aggressive ramp from 6s, -2s per level, min 2.5s
        const reduction = (this.level - 7) * 2.0;
        return Math.max(6.0 - reduction, 2.5);
    }

    initializeProblem(problem) {
        const now = Date.now();
        const expirationTime = this.getExpirationTime();
        if (problem.spawnedAt === null) {
            problem.spawnedAt = now;
        }
        problem.setExpiration(expirationTime, this.level);
    }

    update() {
        if (this.gameOver || this.paused) return;

        // Check wrong answer timeout
        if (this.wrongAnswerTimeout && Date.now() >= this.wrongAnswerTimeoutEnd) {
            this.wrongAnswerTimeout = false;
        }

        if (this.wrongAnswerTimeout) return;

        // Ensure we have exactly 12 problems
        while (this.problems.length < this.circleSize) {
            const newProblem = generateProblem(this.level);
            this.initializeProblem(newProblem);
            this.problems.push(newProblem);
        }
        this.updatePositions();

        // Start expiration for current problem if it hasn't started yet
        if (this.currentProblem && this.currentProblem.expiresAt === null) {
            this.currentProblem.startExpiration();
        }

        // Check if current problem expired (GAME OVER)
        if (this.currentProblem && this.currentProblem.isExpired()) {
            this.endGame();
            return;
        }

        // Replace expired answered problems (except current)
        for (let i = 0; i < this.circleSize; i++) {
            if (i === this.currentProblemIndex) continue;
            
            const problem = this.problems[i];
            if (problem && problem.answered && problem.isExpired()) {
                const newProblem = generateProblem(this.level);
                this.initializeProblem(newProblem);
                this.problems[i] = newProblem;
            }
        }
        
        this.updatePositions();
    }

    handleInput(key) {
        if (this.gameOver || this.wrongAnswerTimeout) {
            if (key === 'Escape') {
                this.togglePause();
                return { handled: true, paused: this.paused };
            }
            return { handled: false };
        }

        if (key === 'Escape') {
            this.togglePause();
            return { handled: true, paused: this.paused };
        }

        if (!this.currentProblem) {
            this.currentProblem = this.problems[this.currentProblemIndex];
        }
        if (!this.currentProblem) return { handled: false };

        if (key >= '0' && key <= '9') {
            return { handled: true, input: key };
        }

        if (key === 'Backspace') {
            return { handled: true, backspace: true };
        }

        return { handled: false };
    }

    submitAnswer(userAnswer) {
        // Block empty/blank submissions - treat as unsubmittable
        if (!userAnswer || (typeof userAnswer === 'string' && userAnswer.trim() === '')) {
            return { handled: false, blocked: true };
        }
        
        if (!this.currentProblem) {
            this.currentProblem = this.problems[this.currentProblemIndex];
        }
        if (!this.currentProblem) return { handled: false };

        const correct = parseInt(userAnswer) === this.currentProblem.answer;
        this.totalQuestions++;

        if (correct) {
            // STEP 1: Mark current problem as answered (it keeps its expiresAt)
            this.currentProblem.answered = true;
            
            // Calculate score
            const timeRemaining = this.currentProblem.getTimeRemaining();
            const basePoints = 10;
            const speedBonus = Math.floor(timeRemaining * 2);
            const streakBonus = Math.min(this.streak, 50);
            const levelMultiplier = 1 + (this.level - 1) * 0.05;
            const streakMultiplier = (this.consecutiveCorrect > 0 && this.consecutiveCorrect % 10 === 0) ? 1.2 : 1.0;
            const points = Math.floor((basePoints + speedBonus + streakBonus) * levelMultiplier * streakMultiplier);
            this.score += points;

            this.streak++;
            this.consecutiveCorrect++;
            this.bestStreak = Math.max(this.bestStreak, this.streak);
            this.correctAnswers++;
            this.answersThisLevel++;

            if (this.answersThisLevel >= this.answersPerLevel) {
                this.levelUp();
            }

            // STEP 2: Move to next position
            this.currentProblemIndex = (this.currentProblemIndex + 1) % this.circleSize;
            
            // STEP 3: Check if we landed on the tail BEFORE replacing
            const tailEatResult = this.checkTailEaten();
            
            // STEP 4: Only replace problem if it was already answered (we wrapped around)
            // If problem is fresh/unanswered, keep it so player can plan ahead!
            const existingProblem = this.problems[this.currentProblemIndex];
            const wasAnswered = existingProblem?.answered || false;
            
            if (wasAnswered) {
                // Problem was already answered - replace with fresh one
                const newProblem = generateProblem(this.level);
                this.initializeProblem(newProblem);
                this.problems[this.currentProblemIndex] = newProblem;
                this.updatePositions();
            }
            
            // Update current problem reference and start its expiration
            this.currentProblem = this.problems[this.currentProblemIndex];
            if (this.currentProblem) {
                this.currentProblem.startExpiration();
            }

            return {
                handled: true,
                correct: true,
                score: points,
                tailEaten: tailEatResult,
                continue: true
            };
        } else {
            const timeoutDuration = 2 + (this.level * 0.3);
            this.wrongAnswerTimeout = true;
            this.wrongAnswerTimeoutEnd = Date.now() + (timeoutDuration * 1000);
            this.streak = 0;
            this.consecutiveCorrect = 0;

            return {
                handled: true,
                correct: false,
                correctAnswer: this.currentProblem.answer,
                timeout: timeoutDuration
            };
        }
    }

    // Find the tail: oldest answered problem that hasn't expired
    getTailProblem() {
        let oldestTail = null;
        let oldestIndex = -1;
        
        for (let i = 0; i < this.circleSize; i++) {
            const problem = this.problems[i];
            if (problem && problem.answered && !problem.isExpired()) {
                if (!oldestTail || problem.spawnedAt < oldestTail.spawnedAt) {
                    oldestTail = problem;
                    oldestIndex = i;
                }
            }
        }
        
        return oldestTail ? { problem: oldestTail, index: oldestIndex } : null;
    }

    // Check if player landed on tail and eat it if fast enough
    checkTailEaten() {
        const tail = this.getTailProblem();
        if (!tail) return null;
        
        const now = Date.now();
        const landedOnTail = this.currentProblemIndex === tail.index;
        const notExpired = now < tail.problem.expiresAt;
        
        if (landedOnTail && notExpired) {
            return this.eatTail(tail);
        }
        
        return null;
    }

    // Eat tail: award bonus and replace with new problem
    eatTail(tail) {
        const timeRemaining = tail.problem.getTimeRemaining();
        const baseBonus = 50;
        const timeBonus = Math.floor(timeRemaining * 5);
        const bonus = baseBonus + timeBonus;
        
        this.score += bonus;
        
        // Replace tail problem with new one
        const newProblem = generateProblem(this.level);
        this.initializeProblem(newProblem);
        this.problems[tail.index] = newProblem;
        
        if (this.currentProblemIndex === tail.index) {
            this.currentProblem = newProblem;
            newProblem.startExpiration();
        }
        
        return { eaten: 1, bonus: bonus };
    }

    levelUp() {
        this.level++;
        this.answersThisLevel = 0;
        const newExpirationTime = this.getExpirationTime();
        this.problems.forEach(problem => {
            if (problem) {
                problem.recalculateExpiresAt(newExpirationTime);
            }
        });
    }

    endGame() {
        this.gameOver = true;
        this.saveHighScore();
    }

    getAccuracy() {
        return this.totalQuestions > 0 
            ? Math.round((this.correctAnswers / this.totalQuestions) * 100) 
            : 0;
    }

    getCurrentProblem() {
        if (this.currentProblem) {
            return this.currentProblem;
        }
        this.currentProblem = this.problems[this.currentProblemIndex];
        return this.currentProblem;
    }

    // Get problems to display: current + 3 ahead + answered/expiring behind
    getVisibleProblems() {
        const visible = [];
        const currentIdx = this.currentProblemIndex;
        
        // Always show 3 problems ahead
        for (let i = 1; i <= 3; i++) {
            const idx = (currentIdx + i) % this.circleSize;
            const problem = this.problems[idx];
            if (problem) {
                visible.push({ problem, index: idx, type: 'ahead' });
            }
        }
        
        // Show answered problems behind (expiring ones first)
        const expiringBehind = [];
        const expiredBehind = [];
        
        for (let i = 1; i <= 10; i++) {
            const idx = (currentIdx - i + this.circleSize) % this.circleSize;
            const problem = this.problems[idx];
            if (problem && problem.answered) {
                if (!problem.isExpired()) {
                    expiringBehind.push({ problem, index: idx, type: 'behind' });
                } else {
                    expiredBehind.push({ problem, index: idx, type: 'behind' });
                }
            }
        }
        
        visible.push(...expiringBehind);
        visible.push(...expiredBehind.slice(0, 5));
        
        return visible;
    }

    // Check if player is on a streak (every 10 correct answers)
    isOnStreak() {
        return this.consecutiveCorrect > 0 && this.consecutiveCorrect % 10 === 0;
    }

    // Check if player is approaching the tail (for yellow highlighting)
    // Returns true when player is within 1 position of catching the tail
    isOnTail() {
        const tail = this.getTailProblem();
        if (!tail) return false;
        
        const now = Date.now();
        const notExpired = now < tail.problem.expiresAt;
        
        // Calculate distance from current position to tail
        // Distance is how many steps until we reach the tail
        let distance;
        if (tail.index >= this.currentProblemIndex) {
            distance = tail.index - this.currentProblemIndex;
        } else {
            // Tail is behind us (we need to wrap around)
            distance = (this.circleSize - this.currentProblemIndex) + tail.index;
        }
        
        // Show yellow when we're within 1 step of the tail AND tail hasn't expired
        return distance <= 1 && notExpired;
    }

    getStreakRange() {
        if (this.consecutiveCorrect === 0) return [];
        const start = Math.max(0, this.consecutiveCorrect - 10);
        return { start, end: this.consecutiveCorrect };
    }

    loadHighScore() {
        try {
            const saved = localStorage.getItem('ouroborosHighScore');
            this.highScore = saved ? parseInt(saved) : 0;
        } catch (e) {
            this.highScore = 0;
        }
    }

    saveHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            try {
                localStorage.setItem('ouroborosHighScore', this.highScore.toString());
            } catch (e) {
                console.warn('Could not save high score:', e);
            }
        }
    }
}

export default Game;
