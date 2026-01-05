// Ouroboros circular layout logic

class SnakeLayout {
    constructor(containerWidth = 800, containerHeight = 600, problemWidth = 90, problemHeight = 80) {
        this.containerWidth = containerWidth;
        this.containerHeight = containerHeight;
        this.problemWidth = problemWidth;
        this.problemHeight = problemHeight;
        this.circleSize = 12; // Fixed circle size for Ouroboros
    }

    // Set container dimensions (called from main.js with actual dimensions)
    setContainerDimensions(width, height) {
        this.containerWidth = width;
        this.containerHeight = height;
    }

    // Set problem dimensions (for mobile)
    setProblemDimensions(width, height) {
        this.problemWidth = width;
        this.problemHeight = height;
    }

    // Calculate positions for problems in a circle (20 problems)
    calculatePositions(problems) {
        const positions = [];
        
        // Use actual container dimensions, default to reasonable values if not set
        const width = this.containerWidth || 800;
        const height = this.containerHeight || 600;
        
        // Center of the container
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Calculate radius to fit problems nicely
        // Account for problem size and ensure they don't overlap
        // Use the smaller dimension to ensure circle fits
        const minDimension = Math.min(width, height);
        const problemDiagonal = Math.sqrt(this.problemWidth * this.problemWidth + this.problemHeight * this.problemHeight);
        const padding = 10; // Space between problems
        const radius = (minDimension - problemDiagonal - padding * 2) / 2;
        
        // Ensure minimum radius for visibility (smaller on mobile)
        const minRadius = minDimension < 400 ? 90 : 180;
        const finalRadius = Math.max(radius, minRadius);
        
        // 12 problems evenly spaced around circle
        // Start at top (270 degrees / -90 degrees) and go clockwise
        const angleStep = (2 * Math.PI) / this.circleSize;
        
        for (let i = 0; i < problems.length && i < this.circleSize; i++) {
            // Calculate angle: start at top (-90 degrees = 270 degrees)
            const angle = (i * angleStep) - (Math.PI / 2);
            
            // Calculate position - center the problem box on the circle point
            const x = centerX + finalRadius * Math.cos(angle) - (this.problemWidth / 2);
            const y = centerY + finalRadius * Math.sin(angle) - (this.problemHeight / 2);
            
            positions.push({
                x: x,
                y: y,
                angle: angle,
                index: i,
                circleIndex: i // Position in the circle (0-19)
            });
        }

        return positions;
    }

    // Apply aging multipliers - no longer needed for Ouroboros but kept for compatibility
    applyAging(problems) {
        // Reset all multipliers - aging handled differently in Ouroboros
        problems.forEach(p => {
            p.ageMultiplier = 1.0;
        });
        return problems;
    }

    // Check if we should shed problems - not used in Ouroboros (fixed 20 problems)
    shouldShed(problems) {
        return false; // Never shed in Ouroboros
    }

    // Shed problems - not used in Ouroboros
    shedProblems(problems) {
        return problems; // Never shed in Ouroboros
    }
}

export default SnakeLayout;
