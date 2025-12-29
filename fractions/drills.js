import { 
    generateUniqueFractions, 
    generateComparisonPair, 
    sortFractions, 
    isCorrectOrder,
    generateRandomFraction,
    addFractions,
    subtractFractions,
    fractionBetween,
    mixedToImproper,
    generateMixedNumber,
    inchesToFeetInches,
    Fraction
} from './fractions.js';

// Base Drill class
class Drill {
    constructor(name, basePoints) {
        this.name = name;
        this.basePoints = basePoints;
        this.active = false;
        this.startTime = null;
        this.timeLimit = 0;
    }

    start(level, timeLimit) {
        this.active = true;
        this.level = level;
        this.timeLimit = timeLimit;
        this.startTime = Date.now();
        this.timeRemaining = timeLimit;
    }

    update() {
        if (!this.active) return;
        const elapsed = (Date.now() - this.startTime) / 1000;
        this.timeRemaining = Math.max(0, this.timeLimit - elapsed);
        return this.timeRemaining > 0;
    }

    end() {
        this.active = false;
    }

    handleInput(key) {
        // Override in subclasses
        return { handled: false };
    }

    getFeedback() {
        // Override in subclasses
        return null;
    }
}

// Ordering Drill: Arrange 5 fractions from smallest to largest
class OrderingDrill extends Drill {
    constructor() {
        super('Ordering', 100);
        this.fractions = [];
        this.selectedOrder = [];
        this.completed = false;
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        this.fractions = generateUniqueFractions(5, level);
        this.selectedOrder = [];
        this.completed = false;
        this.feedback = null;
    }

    handleInput(key) {
        if (!this.active || this.completed) return { handled: false };

        // Number keys 1-5 to select fractions in order
        const num = parseInt(key);
        if (num >= 1 && num <= 5) {
            const index = num - 1;
            if (!this.selectedOrder.includes(index)) {
                this.selectedOrder.push(index);
                this.feedback = null;
                
                if (this.selectedOrder.length === 5) {
                    // Auto-submit when all selected
                    return this.submit();
                }
                return { handled: true, update: true };
            }
        }

        // Enter to submit
        if (key === 'Enter' && this.selectedOrder.length === 5) {
            return this.submit();
        }

        // Backspace to clear last selection
        if (key === 'Backspace' && this.selectedOrder.length > 0) {
            this.selectedOrder.pop();
            this.feedback = null;
            return { handled: true, update: true };
        }

        return { handled: false };
    }

    submit() {
        this.completed = true;
        const ordered = this.selectedOrder.map(i => this.fractions[i]);
        const correct = isCorrectOrder(ordered);
        
        this.feedback = {
            correct,
            correctOrder: sortFractions(this.fractions),
            playerOrder: ordered
        };

        return {
            handled: true,
            complete: true,
            correct,
            score: correct ? this.calculateScore() : 0
        };
    }

    calculateScore() {
        const timeBonus = Math.floor(this.timeRemaining * (10 - this.level));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            fractions: this.fractions,
            selectedOrder: this.selectedOrder,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Bigger/Smaller Drill: Rapid-fire comparison with survival time mechanic
class BiggerSmallerDrill extends Drill {
    constructor() {
        super('Bigger/Smaller', 25); // Reduced from 50 to 25
        this.fractions = [];
        this.currentPair = null;
        this.lastAnswerTime = null;
        this.feedbackDelay = 200;
        // Survival mode properties
        this.correctAnswerCount = 0;
        this.maxTime = 15; // Cap at 15 seconds
        this.pendingTimeoutId = null; // Track pending setTimeout to cancel on new answer
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        // Always include 32nds and exclude whole numbers (fractions equal to 1)
        this.fractions = generateComparisonPair(level, true, true);
        this.currentPair = this.fractions;
        this.lastAnswerTime = null;
        this.feedback = null;
        this.correctAnswerCount = 0;
    }

    // Calculate time bonus using exponential decay
    // 1st: 1.2s, 2nd: 1.02s, 3rd: 0.87s, etc. (minimum 0.3s)
    calculateTimeBonus() {
        const initialBonus = 1.2;
        const decayRate = 0.85;
        const minBonus = 0.3;
        const bonus = initialBonus * Math.pow(decayRate, this.correctAnswerCount);
        return Math.max(minBonus, bonus);
    }

    // Add time to the clock (used when answering correctly)
    addTime(seconds) {
        this.timeLimit += seconds;
        // Cap at maximum time
        const elapsed = (Date.now() - this.startTime) / 1000;
        const currentTimeRemaining = this.timeLimit - elapsed;
        if (currentTimeRemaining > this.maxTime) {
            this.timeLimit = elapsed + this.maxTime;
        }
    }

    handleInput(key) {
        if (!this.active) return { handled: false };

        // Check if we're in feedback delay
        if (this.lastAnswerTime && Date.now() - this.lastAnswerTime < this.feedbackDelay) {
            return { handled: false };
        }

        let direction = null;
        if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
            direction = 'left';
        } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
            direction = 'right';
        }

        if (direction) {
            return this.answer(direction);
        }

        return { handled: false };
    }

    handleTouch(side) {
        if (!this.active) return { handled: false };
        if (this.lastAnswerTime && Date.now() - this.lastAnswerTime < this.feedbackDelay) {
            return { handled: false };
        }
        return this.answer(side);
    }

    answer(direction) {
        const [left, right] = this.currentPair;
        const leftIsBigger = left.compare(right) > 0;
        const correct = (direction === 'left' && leftIsBigger) || (direction === 'right' && !leftIsBigger);

        this.feedback = {
            correct,
            correctAnswer: leftIsBigger ? 'left' : 'right',
            playerAnswer: direction
        };

        this.lastAnswerTime = Date.now();

        // Add time for correct answers (survival mode)
        if (correct) {
            const timeBonus = this.calculateTimeBonus();
            this.addTime(timeBonus);
            this.correctAnswerCount++;
        }

        // Cancel any pending setTimeout from previous answer to prevent jarring fraction changes
        if (this.pendingTimeoutId) {
            clearTimeout(this.pendingTimeoutId);
            this.pendingTimeoutId = null;
        }

        // Generate new pair after feedback delay (longer for wrong answers)
        const delay = correct ? this.feedbackDelay : 4000;
        this.pendingTimeoutId = setTimeout(() => {
            if (this.active) {
                // Always include 32nds and exclude whole numbers (fractions equal to 1)
                this.fractions = generateComparisonPair(this.level, true, true);
                this.currentPair = this.fractions;
                this.feedback = null;
            }
            this.pendingTimeoutId = null;
        }, delay);

        return {
            handled: true,
            correct,
            score: correct ? this.calculateScore() : 0,
            continue: true
        };
    }

    calculateScore() {
        // Reduced time bonus multiplier by half
        const timeBonus = Math.floor(this.timeRemaining * Math.floor((10 - this.level) / 2));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            fractions: this.currentPair,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Convert to Decimal Drill: Type the decimal equivalent
class ToDecimalDrill extends Drill {
    constructor() {
        super('To Decimal', 60);
        this.fraction = null;
        this.userInput = '';
        this.completed = false;
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        // Exclude fractions with denominator 1 (trivial: always equals numerator)
        do {
            this.fraction = generateRandomFraction(level);
        } while (this.fraction.denominator === 1);
        this.userInput = '';
        this.completed = false;
        this.feedback = null;
    }

    handleInput(key) {
        if (!this.active || this.completed) return { handled: false };

        // Number keys and decimal point
        if ((key >= '0' && key <= '9') || key === '.') {
            this.userInput += key;
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Backspace
        if (key === 'Backspace' && this.userInput.length > 0) {
            this.userInput = this.userInput.slice(0, -1);
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Enter to submit
        if (key === 'Enter' && this.userInput.length > 0) {
            return this.submit();
        }

        return { handled: false };
    }

    submit() {
        this.completed = true;
        const userDecimal = parseFloat(this.userInput);
        const correctDecimal = this.fraction.toDecimal();
        const tolerance = 0.001; // Allow small rounding differences
        const correct = Math.abs(userDecimal - correctDecimal) < tolerance;

        this.feedback = {
            correct,
            correctAnswer: correctDecimal.toFixed(4),
            playerAnswer: this.userInput
        };

        return {
            handled: true,
            complete: true,
            correct,
            score: correct ? this.calculateScore() : 0
        };
    }

    calculateScore() {
        const timeBonus = Math.floor(this.timeRemaining * (10 - this.level));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            fraction: this.fraction,
            userInput: this.userInput,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Between Marks Drill: Find fraction between two marks
class BetweenMarksDrill extends Drill {
    constructor() {
        super('Between Marks', 80);
        this.fraction1 = null;
        this.fraction2 = null;
        this.userInput = '';
        this.completed = false;
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        const pair = generateComparisonPair(level);
        this.fraction1 = pair[0].compare(pair[1]) < 0 ? pair[0] : pair[1];
        this.fraction2 = pair[0].compare(pair[1]) > 0 ? pair[0] : pair[1];
        this.userInput = '';
        this.completed = false;
        this.feedback = null;
    }

    handleInput(key) {
        if (!this.active || this.completed) return { handled: false };

        // Number keys, slash, and decimal point
        if ((key >= '0' && key <= '9') || key === '/' || key === '.') {
            this.userInput += key;
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Backspace
        if (key === 'Backspace' && this.userInput.length > 0) {
            this.userInput = this.userInput.slice(0, -1);
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Enter to submit
        if (key === 'Enter' && this.userInput.length > 0) {
            return this.submit();
        }

        return { handled: false };
    }

    submit() {
        this.completed = true;
        const correct = fractionBetween(this.fraction1, this.fraction2);
        
        // Parse user input (could be fraction or decimal)
        let userFraction = null;
        if (this.userInput.includes('/')) {
            const parts = this.userInput.split('/');
            if (parts.length === 2) {
                const num = parseInt(parts[0]);
                const den = parseInt(parts[1]);
                if (!isNaN(num) && !isNaN(den) && den !== 0) {
                    userFraction = new Fraction(num, den);
                }
            }
        } else {
            const decimal = parseFloat(this.userInput);
            if (!isNaN(decimal)) {
                // Convert decimal to fraction (simplified check)
                const tolerance = 0.001;
                if (Math.abs(decimal - correct.toDecimal()) < tolerance) {
                    userFraction = correct;
                }
            }
        }

        const isCorrect = userFraction && userFraction.equals(correct);

        this.feedback = {
            correct: isCorrect,
            correctAnswer: correct.toString(),
            playerAnswer: this.userInput
        };

        return {
            handled: true,
            complete: true,
            correct: isCorrect,
            score: isCorrect ? this.calculateScore() : 0
        };
    }

    calculateScore() {
        const timeBonus = Math.floor(this.timeRemaining * (10 - this.level));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            fraction1: this.fraction1,
            fraction2: this.fraction2,
            userInput: this.userInput,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Add/Subtract Drill: Calculate sum or difference
class AddSubtractDrill extends Drill {
    constructor() {
        super('Add/Subtract', 70);
        this.fraction1 = null;
        this.fraction2 = null;
        this.operation = null; // 'add' or 'subtract'
        this.userInput = '';
        this.completed = false;
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        const pair = generateComparisonPair(level);
        this.fraction1 = pair[0];
        this.fraction2 = pair[1];
        this.operation = Math.random() < 0.5 ? 'add' : 'subtract';
        this.userInput = '';
        this.completed = false;
        this.feedback = null;
    }

    handleInput(key) {
        if (!this.active || this.completed) return { handled: false };

        // Number keys, slash, and minus
        if ((key >= '0' && key <= '9') || key === '/' || key === '-') {
            this.userInput += key;
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Backspace
        if (key === 'Backspace' && this.userInput.length > 0) {
            this.userInput = this.userInput.slice(0, -1);
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Enter to submit
        if (key === 'Enter' && this.userInput.length > 0) {
            return this.submit();
        }

        return { handled: false };
    }

    submit() {
        this.completed = true;
        const correct = this.operation === 'add' 
            ? addFractions(this.fraction1, this.fraction2)
            : subtractFractions(this.fraction1, this.fraction2);
        
        // Parse user input
        let userFraction = null;
        if (this.userInput.includes('/')) {
            const parts = this.userInput.split('/');
            if (parts.length === 2) {
                const num = parseInt(parts[0]);
                const den = parseInt(parts[1]);
                if (!isNaN(num) && !isNaN(den) && den !== 0) {
                    userFraction = new Fraction(num, den);
                }
            }
        }

        const isCorrect = userFraction && userFraction.equals(correct);

        this.feedback = {
            correct: isCorrect,
            correctAnswer: correct.toString(),
            playerAnswer: this.userInput
        };

        return {
            handled: true,
            complete: true,
            correct: isCorrect,
            score: isCorrect ? this.calculateScore() : 0
        };
    }

    calculateScore() {
        const timeBonus = Math.floor(this.timeRemaining * (10 - this.level));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            fraction1: this.fraction1,
            fraction2: this.fraction2,
            operation: this.operation,
            userInput: this.userInput,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Mixed to Improper Drill: Convert mixed numbers
class MixedToImproperDrill extends Drill {
    constructor() {
        super('Mixed to Improper', 70);
        this.mixed = null;
        this.userInput = '';
        this.completed = false;
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        this.mixed = generateMixedNumber(level);
        this.userInput = '';
        this.completed = false;
        this.feedback = null;
    }

    handleInput(key) {
        if (!this.active || this.completed) return { handled: false };

        // Number keys and slash
        if ((key >= '0' && key <= '9') || key === '/') {
            this.userInput += key;
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Backspace
        if (key === 'Backspace' && this.userInput.length > 0) {
            this.userInput = this.userInput.slice(0, -1);
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Enter to submit
        if (key === 'Enter' && this.userInput.length > 0) {
            return this.submit();
        }

        return { handled: false };
    }

    submit() {
        this.completed = true;
        const correct = mixedToImproper(this.mixed.whole, this.mixed.numerator, this.mixed.denominator);
        
        // Parse user input
        let userFraction = null;
        if (this.userInput.includes('/')) {
            const parts = this.userInput.split('/');
            if (parts.length === 2) {
                const num = parseInt(parts[0]);
                const den = parseInt(parts[1]);
                if (!isNaN(num) && !isNaN(den) && den !== 0) {
                    userFraction = new Fraction(num, den);
                }
            }
        }

        const isCorrect = userFraction && userFraction.equals(correct);

        this.feedback = {
            correct: isCorrect,
            correctAnswer: correct.toString(),
            playerAnswer: this.userInput
        };

        return {
            handled: true,
            complete: true,
            correct: isCorrect,
            score: isCorrect ? this.calculateScore() : 0
        };
    }

    calculateScore() {
        const timeBonus = Math.floor(this.timeRemaining * (10 - this.level));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            mixed: this.mixed,
            userInput: this.userInput,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Difference Drill: Find difference between two fractions
class DifferenceDrill extends Drill {
    constructor() {
        super('Difference', 75);
        this.fraction1 = null;
        this.fraction2 = null;
        this.userInput = '';
        this.completed = false;
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        const pair = generateComparisonPair(level);
        this.fraction1 = pair[0].compare(pair[1]) > 0 ? pair[0] : pair[1];
        this.fraction2 = pair[0].compare(pair[1]) < 0 ? pair[0] : pair[1];
        this.userInput = '';
        this.completed = false;
        this.feedback = null;
    }

    handleInput(key) {
        if (!this.active || this.completed) return { handled: false };

        // Number keys and slash
        if ((key >= '0' && key <= '9') || key === '/') {
            this.userInput += key;
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Backspace
        if (key === 'Backspace' && this.userInput.length > 0) {
            this.userInput = this.userInput.slice(0, -1);
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Enter to submit
        if (key === 'Enter' && this.userInput.length > 0) {
            return this.submit();
        }

        return { handled: false };
    }

    submit() {
        this.completed = true;
        const correct = subtractFractions(this.fraction1, this.fraction2);
        
        // Parse user input
        let userFraction = null;
        if (this.userInput.includes('/')) {
            const parts = this.userInput.split('/');
            if (parts.length === 2) {
                const num = parseInt(parts[0]);
                const den = parseInt(parts[1]);
                if (!isNaN(num) && !isNaN(den) && den !== 0) {
                    userFraction = new Fraction(num, den);
                }
            }
        }

        const isCorrect = userFraction && userFraction.equals(correct);

        this.feedback = {
            correct: isCorrect,
            correctAnswer: correct.toString(),
            playerAnswer: this.userInput
        };

        return {
            handled: true,
            complete: true,
            correct: isCorrect,
            score: isCorrect ? this.calculateScore() : 0
        };
    }

    calculateScore() {
        const timeBonus = Math.floor(this.timeRemaining * (10 - this.level));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            fraction1: this.fraction1,
            fraction2: this.fraction2,
            userInput: this.userInput,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Inches to Feet Drill: Convert inches to feet and inches
class InchesToFeetDrill extends Drill {
    constructor() {
        super('Inches to Feet', 65);
        this.totalInches = null;
        this.userFeet = '';
        this.userInches = '';
        this.completed = false;
    }

    start(level, timeLimit) {
        super.start(level, timeLimit);
        // Generate total inches between 13 and 47 (more than 1 foot, less than 4 feet)
        this.totalInches = Math.floor(Math.random() * 35) + 13;
        this.userFeet = '';
        this.userInches = '';
        this.completed = false;
        this.feedback = null;
        this.inputMode = 'feet'; // 'feet' or 'inches'
    }

    handleInput(key) {
        if (!this.active || this.completed) return { handled: false };

        // Tab to switch between feet and inches
        if (key === 'Tab') {
            this.inputMode = this.inputMode === 'feet' ? 'inches' : 'feet';
            return { handled: true, update: true };
        }

        // Number keys
        if (key >= '0' && key <= '9') {
            if (this.inputMode === 'feet') {
                this.userFeet += key;
            } else {
                this.userInches += key;
            }
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Backspace
        if (key === 'Backspace') {
            if (this.inputMode === 'feet' && this.userFeet.length > 0) {
                this.userFeet = this.userFeet.slice(0, -1);
            } else if (this.inputMode === 'inches' && this.userInches.length > 0) {
                this.userInches = this.userInches.slice(0, -1);
            }
            this.feedback = null;
            return { handled: true, update: true };
        }

        // Enter to submit
        if (key === 'Enter' && this.userFeet.length > 0 && this.userInches.length > 0) {
            return this.submit();
        }

        return { handled: false };
    }

    submit() {
        this.completed = true;
        const correctAnswer = inchesToFeetInches(this.totalInches);
        const userFeet = parseInt(this.userFeet);
        const userInches = parseInt(this.userInches);
        const correct = userFeet === correctAnswer.feet && userInches === correctAnswer.inches;

        this.feedback = {
            correct,
            correctAnswer: `${correctAnswer.feet} ft ${correctAnswer.inches} in`,
            playerAnswer: `${this.userFeet} ft ${this.userInches} in`
        };

        return {
            handled: true,
            complete: true,
            correct,
            score: correct ? this.calculateScore() : 0
        };
    }

    calculateScore() {
        const timeBonus = Math.floor(this.timeRemaining * (10 - this.level));
        return this.basePoints + timeBonus;
    }

    getDisplayData() {
        return {
            totalInches: this.totalInches,
            userFeet: this.userFeet,
            userInches: this.userInches,
            inputMode: this.inputMode,
            feedback: this.feedback,
            timeRemaining: Math.ceil(this.timeRemaining)
        };
    }
}

// Drill registry
const DRILLS = [
    OrderingDrill, 
    BiggerSmallerDrill, 
    ToDecimalDrill,
    BetweenMarksDrill,
    AddSubtractDrill,
    MixedToImproperDrill,
    DifferenceDrill,
    InchesToFeetDrill
];

const DRILL_NAMES = {
    'Ordering': OrderingDrill,
    'Bigger/Smaller': BiggerSmallerDrill,
    'To Decimal': ToDecimalDrill,
    'Between Marks': BetweenMarksDrill,
    'Add/Subtract': AddSubtractDrill,
    'Mixed to Improper': MixedToImproperDrill,
    'Difference': DifferenceDrill,
    'Inches to Feet': InchesToFeetDrill
};

function getRandomDrill() {
    const DrillClass = DRILLS[Math.floor(Math.random() * DRILLS.length)];
    return new DrillClass();
}

function getDrillByName(name) {
    const DrillClass = DRILL_NAMES[name];
    if (DrillClass) {
        return new DrillClass();
    }
    return getRandomDrill(); // Fallback
}

export { 
    Drill, 
    OrderingDrill, 
    BiggerSmallerDrill, 
    ToDecimalDrill,
    BetweenMarksDrill,
    AddSubtractDrill,
    MixedToImproperDrill,
    DifferenceDrill,
    InchesToFeetDrill,
    getRandomDrill, 
    getDrillByName 
};
