// Fraction utility functions for tape measure practice

class Fraction {
    constructor(numerator, denominator) {
        this.numerator = numerator;
        this.denominator = denominator;
        this.simplified = this.simplify();
    }

    simplify() {
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        const divisor = gcd(Math.abs(this.numerator), this.denominator);
        return {
            numerator: this.numerator / divisor,
            denominator: this.denominator / divisor
        };
    }

    toDecimal() {
        return this.numerator / this.denominator;
    }

    toString() {
        if (this.denominator === 1) {
            return this.numerator.toString();
        }
        return `${this.numerator}/${this.denominator}`;
    }

    equals(other) {
        return this.toDecimal() === other.toDecimal();
    }

    compare(other) {
        const diff = this.toDecimal() - other.toDecimal();
        if (diff < 0) return -1;
        if (diff > 0) return 1;
        return 0;
    }
}

// Common tape measure denominators
const DENOMINATORS = [1, 2, 4, 8, 16, 32, 64];

// Generate a random fraction based on difficulty level
function generateRandomFraction(level = 1) {
    let maxDenominator;
    
    if (level <= 3) {
        // Easy: 1, 2, 4, 8, 16
        maxDenominator = 16;
    } else if (level <= 6) {
        // Medium: adds 32
        maxDenominator = 32;
    } else {
        // Hard: includes 64
        maxDenominator = 64;
    }

    const availableDenominators = DENOMINATORS.filter(d => d <= maxDenominator);
    const denominator = availableDenominators[Math.floor(Math.random() * availableDenominators.length)];
    const maxNumerator = denominator - 1;
    const numerator = Math.floor(Math.random() * maxNumerator) + 1;
    
    return new Fraction(numerator, denominator);
}

// Generate multiple unique fractions for ordering drill
function generateUniqueFractions(count, level) {
    const fractions = [];
    const seen = new Set();
    
    while (fractions.length < count) {
        const fraction = generateRandomFraction(level);
        const decimal = fraction.toDecimal();
        
        // Ensure no duplicates and meaningful differences
        let isUnique = true;
        for (const existing of fractions) {
            const diff = Math.abs(existing.toDecimal() - decimal);
            // Minimum gap based on level (smaller gaps at higher levels)
            const minGap = level <= 3 ? 0.01 : level <= 6 ? 0.005 : 0.0025;
            if (diff < minGap) {
                isUnique = false;
                break;
            }
        }
        
        if (isUnique) {
            fractions.push(fraction);
            seen.add(decimal);
        }
    }
    
    return fractions;
}

// Generate two fractions for comparison (ensures they're different)
function generateComparisonPair(level) {
    let fraction1, fraction2;
    let attempts = 0;
    
    do {
        fraction1 = generateRandomFraction(level);
        fraction2 = generateRandomFraction(level);
        attempts++;
        
        // Prevent trivial comparisons at higher levels
        if (level > 3) {
            const diff = Math.abs(fraction1.toDecimal() - fraction2.toDecimal());
            const minDiff = level <= 6 ? 0.01 : 0.005;
            if (diff < minDiff) {
                continue;
            }
        }
    } while (fraction1.equals(fraction2) && attempts < 50);
    
    return [fraction1, fraction2];
}

// Sort fractions by value
function sortFractions(fractions) {
    return [...fractions].sort((a, b) => a.compare(b));
}

// Check if fractions are in correct order
function isCorrectOrder(fractions) {
    for (let i = 0; i < fractions.length - 1; i++) {
        if (fractions[i].compare(fractions[i + 1]) > 0) {
            return false;
        }
    }
    return true;
}

// Add two fractions
function addFractions(f1, f2) {
    const lcm = (a, b) => {
        const gcd = (x, y) => y === 0 ? x : gcd(y, x % y);
        return (a * b) / gcd(a, b);
    };
    const commonDenom = lcm(f1.denominator, f2.denominator);
    const num1 = f1.numerator * (commonDenom / f1.denominator);
    const num2 = f2.numerator * (commonDenom / f2.denominator);
    return new Fraction(num1 + num2, commonDenom);
}

// Subtract two fractions
function subtractFractions(f1, f2) {
    const lcm = (a, b) => {
        const gcd = (x, y) => y === 0 ? x : gcd(y, x % y);
        return (a * b) / gcd(a, b);
    };
    const commonDenom = lcm(f1.denominator, f2.denominator);
    const num1 = f1.numerator * (commonDenom / f1.denominator);
    const num2 = f2.numerator * (commonDenom / f2.denominator);
    return new Fraction(num1 - num2, commonDenom);
}

// Find fraction between two fractions (average)
function fractionBetween(f1, f2) {
    const sum = addFractions(f1, f2);
    return new Fraction(sum.numerator, sum.denominator * 2);
}

// Convert mixed number to improper fraction
function mixedToImproper(whole, numerator, denominator) {
    return new Fraction(whole * denominator + numerator, denominator);
}

// Generate a mixed number
function generateMixedNumber(level) {
    const whole = Math.floor(Math.random() * 3) + 1; // 1-3 whole parts
    const fraction = generateRandomFraction(level);
    return { whole, numerator: fraction.numerator, denominator: fraction.denominator };
}

// Convert inches to feet and inches
function inchesToFeetInches(totalInches) {
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return { feet, inches };
}

export { 
    Fraction, 
    generateRandomFraction, 
    generateUniqueFractions, 
    generateComparisonPair, 
    sortFractions, 
    isCorrectOrder,
    addFractions,
    subtractFractions,
    fractionBetween,
    mixedToImproper,
    generateMixedNumber,
    inchesToFeetInches
};
