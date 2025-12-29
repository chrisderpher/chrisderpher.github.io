# Tape Measure Fraction Practice Game

A web-based game to help practice reading imperial tape measure fractions. Integrated into the portfolio website at [chrismurphy.org](http://chrismurphy.org).

## Features

- **8 Game Modes**:
  - **Ordering**: Arrange 5 fractions from smallest to largest
  - **Bigger/Smaller**: Rapid-fire comparison of two fractions
  - **To Decimal**: Convert fractions to decimal form
  - **Between Marks**: Find the fraction halfway between two marks
  - **Add/Subtract**: Calculate sum or difference of two fractions
  - **Mixed to Improper**: Convert mixed numbers to improper fractions
  - **Difference**: Find the difference between two fractions
  - **Inches to Feet**: Convert inches to feet and inches

- Progressive difficulty with leveling system
- Scoring with time bonuses and streak multipliers
- High score tracking (per mode and overall)
- Statistics tracking (accuracy, best streak)
- Website-themed background integration
- Mobile-friendly touch controls
- Close button to return to main website

## Accessing the Game

### Via Portfolio Website
1. Navigate to [chrismurphy.org](http://chrismurphy.org)
2. Click "Projects" in the navigation menu
3. Select "Fractions" from the dropdown

### Direct Access
Navigate to `fractions/index.html` or `fractions/` in your browser

## How to Play

1. Access the game via the portfolio website or directly
2. Press **SPACE** to choose a game mode
3. Select a mode by pressing **1-8** or clicking on a mode option
4. Follow on-screen instructions for each drill
5. Use keyboard controls or touch (on mobile) to answer
6. Try to achieve the highest score!
7. Click the **×** button in the top right to return to the main website

## Controls

### Navigation
- **SPACE**: Start / Return to menu
- **1-8**: Select game mode from menu
- **×**: Close button (top right) - Return to main website

### Game Controls
- **Numbers 1-5**: Select fractions in order (Ordering mode)
- **Arrow Keys (←/→)**: Indicate which fraction is bigger (Bigger/Smaller mode)
- **Enter**: Submit answer
- **Backspace**: Clear/undo input
- **Tab**: Switch between fields (Inches to Feet mode)
- **ESC**: Pause/Resume
- **?**: Show help

## Scoring

- **Base Points**: Varies by drill type (50-100 points)
- **Time Bonus**: Based on remaining time (decreases with level)
- **Level Multiplier**: +10% per level
- **Streak Bonus**: +5 points per streak (max 50 points)

### Example Score Calculation
```
Base Score: 100
Time Bonus: 50
Level Multiplier: 1.2 (level 3)
Streak Bonus: 25 (5 streak)
Final = (100 + 50) × 1.2 + 25 = 205 points
```

## Difficulty Progression

- **Levels**: Increase every 3 correct answers
- **Timer**: Decreases by 2 seconds per level (minimum varies by drill)
- **Fraction Complexity**: 
  - Levels 1-3: Denominators up to 16
  - Levels 4-6: Denominators up to 32
  - Levels 7+: Denominators up to 64
- **Time Bonus**: Decreases with level (multiplier: max(1, 10 - level))

## Game Modes Details

### Ordering
Arrange 5 fractions from smallest to largest by pressing numbers 1-5 in order.

### Bigger/Smaller
Rapid-fire comparison. Press ← if left is bigger, → if right is bigger.

### To Decimal
Type the decimal equivalent (e.g., 0.25 for 1/4) and press Enter.

### Between Marks
Find the fraction halfway between two given fractions. Type as fraction (e.g., 1/4) and press Enter.

### Add/Subtract
Calculate the sum or difference. Type answer as fraction (e.g., 3/4) and press Enter.

### Mixed to Improper
Convert mixed numbers to improper fractions. Type as fraction (e.g., 3/2 for 1 1/2) and press Enter.

### Difference
Find the difference between two fractions. Type as fraction and press Enter.

### Inches to Feet
Convert inches to feet and inches. Type feet and inches, press Tab to switch fields, Enter to submit.

## Technical Details

- **Architecture**: Modular ES6 classes
- **State Management**: Custom UI state manager
- **Data Persistence**: LocalStorage for scores and statistics
- **Styling**: CSS with backdrop filters matching portfolio theme
- **Responsive**: Mobile-friendly with touch support

## File Structure

```
fractions/
├── index.html      # Game entry point and UI structure
├── main.js         # Main game loop, rendering, input handling
├── game.js         # Game state, scoring, high scores
├── drills.js       # Drill implementations (8 modes)
├── fractions.js    # Fraction class and utility functions
├── ui.js           # UI state management
└── style.css       # Game styles with website theme integration
```

Enjoy practicing!
