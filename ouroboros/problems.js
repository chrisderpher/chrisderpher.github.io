// Problem generation for Ouroboros

class Problem {
    constructor(multiplicand, multiplier) {
        this.multiplicand = multiplicand;
        this.multiplier = multiplier;
        this.answer = multiplicand * multiplier;
        this.createdAt = Date.now();
        this.spawnedAt = null; // When problem was spawned (set when initialized)
        this.expiresAt = null; // Absolute expiration time (set when expiration starts)
        this.levelAtSpawn = null; // Level when problem was spawned (for level up recalculation)
        this.expirationTime = null; // Expiration duration in seconds (set when initialized)
        this.position = null; // Fixed position in the circle (set once, never changes)
        this.answered = false; // Whether this problem has been answered
    }

    // Set expiration time and calculate expiresAt
    setExpiration(expirationTime, level, now = null) {
        this.expirationTime = expirationTime;
        this.levelAtSpawn = level;
        // expiresAt is set when problem becomes current (starts expiring)
        // For now, just store the expiration time
    }

    // Start expiration - called when problem becomes current
    startExpiration() {
        const now = Date.now();
        if (this.expiresAt === null && this.expirationTime !== null) {
            this.expiresAt = now + (this.expirationTime * 1000);
        }
    }

    // Get time remaining in seconds
    getTimeRemaining() {
        if (this.expiresAt === null) {
            // Not started expiring yet - return full expiration time
            return this.expirationTime || 0;
        }
        const now = Date.now();
        const remaining = (this.expiresAt - now) / 1000;
        return Math.max(0, remaining);
    }

    // Check if problem is expired
    isExpired() {
        if (this.expiresAt === null) {
            return false; // Not started expiring yet
        }
        const now = Date.now();
        return now >= this.expiresAt;
    }

    // Recalculate expiresAt after level up
    recalculateExpiresAt(newExpirationTime) {
        const now = Date.now();
        this.expirationTime = newExpirationTime;
        
        if (this.expiresAt === null) {
            // Not started expiring yet, just update expiration time
            return;
        }
        
        // Problem has started expiring - maintain the same remaining time
        const timeRemaining = this.getTimeRemaining();
        this.expiresAt = now + (timeRemaining * 1000);
    }


    toString() {
        return `${this.multiplicand} × ${this.multiplier} = ${this.answer}`;
    }

    // Format for vertical display
    toVerticalString() {
        const multStr = this.multiplicand.toString();
        const mult2Str = this.multiplier.toString();
        const answerStr = this.answer.toString();
        const maxWidth = Math.max(multStr.length, mult2Str.length, answerStr.length);
        
        const pad = (str) => str.padStart(maxWidth, ' ');
        
        return [
            pad(multStr),
            `×${pad(this.multiplier.toString()).slice(1)}`,
            '-'.repeat(maxWidth + 1),
            pad(answerStr)
        ].join('\n');
    }
}

// Generate a random multiplication problem (0-10 × 0-10)
function generateProblem(level = 1) {
    // Early levels: avoid too many trivial problems (0×n, 1×n)
    // Later levels: all problems are fair game
    let multiplicand, multiplier;
    
    if (level <= 3) {
        // Early levels: prefer 2-10 range, occasional 0-1
        if (Math.random() < 0.2) {
            multiplicand = Math.floor(Math.random() * 11); // 0-10
        } else {
            multiplicand = Math.floor(Math.random() * 9) + 2; // 2-10
        }
        multiplier = Math.floor(Math.random() * 11); // 0-10
    } else {
        // All problems fair game
        multiplicand = Math.floor(Math.random() * 11); // 0-10
        multiplier = Math.floor(Math.random() * 11); // 0-10
    }
    
    return new Problem(multiplicand, multiplier);
}

// Generate initial set of problems
function generateInitialProblems(count, level) {
    const problems = [];
    for (let i = 0; i < count; i++) {
        problems.push(generateProblem(level));
    }
    return problems;
}

export { Problem, generateProblem, generateInitialProblems };
