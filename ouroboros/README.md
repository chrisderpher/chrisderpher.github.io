# Ouroboros - Multiplication Speed Drill

A web-based multiplication speed drill game (0-10 × 0-10) featuring a circular track visualization, progressive difficulty, and a unique "tail eating" mechanic where fast players can catch and eat their tail for bonus points.

## Game Overview

Race around a circular track of 12 multiplication problems! Answer correctly to move forward, but be careful—problems expire faster as you level up. The ultimate challenge: answer fast enough to catch and "eat" your tail (the oldest answered problem) before it expires for massive bonus points!

## Key Features

- **Circular Track**: 12 problems arranged in a fixed circle—you move sequentially around the track
- **Tail Eating Mechanic**: Answer fast enough to reach your oldest answered problem before it expires for bonus points
- **Progressive Difficulty**: Expiration time starts at 18 seconds (Level 1), decreases to 14s (Level 2), then 10s down to 6s (Levels 3-7), and finally down to 2.5s minimum (Level 8+)
- **Smart Scoring**: Base points + speed bonus + streak bonus + level multiplier + streak multiplier
- **Visual Feedback**: Color-coded time bars, yellow highlighting when on tail, clear problem states

## 🎯 How to Play

1. **Start the game**: Press **SPACE** to begin
2. **Answer problems**: Type the answer to the current problem (highlighted in blue) and press **Enter**
3. **Move forward**: After a correct answer, you automatically move to the next problem in the circle
4. **Watch the timer**: Each problem has a countdown timer—answer before it expires!
5. **Eat your tail**: Answer fast enough to reach your oldest answered problem before it expires for bonus points (the current problem will turn yellow when you're on your tail)
6. **Level up**: Every 8 correct answers increases your level and decreases expiration time
7. **Game over**: The game ends when the current problem expires

## Controls

- **0-9**: Enter numbers for your answer
- **Enter**: Submit answer
- **Backspace**: Clear/delete last digit
- **ESC**: Pause/Resume game
- **SPACE**: Start game / Return to menu (from pause/game-over screens)
- **?**: Toggle help screen

## 📊 Scoring System

Your score for each correct answer is calculated as:

```
Final Score = (Base Points + Speed Bonus + Streak Bonus) × Level Multiplier × Streak Multiplier
```

### Score Components

- **Base Points**: 10 points per correct answer
- **Speed Bonus**: `Math.floor(timeRemaining × 2)` points (faster = more points)
- **Streak Bonus**: `Math.min(streak, 50)` points (capped at 50)
- **Level Multiplier**: `1 + (level - 1) × 0.05` (5% bonus per level)
- **Streak Multiplier**: 1.2× when you hit every 10th correct answer in a row

### Tail Eating Bonus

When you successfully eat your tail (reach it before it expires):
- **Base bonus**: 50 points
- **Time bonus**: `timeRemaining × 5` points per second remaining
- Example: 3 seconds remaining = 50 + (3 × 5) = 65 bonus points

### Example Score Calculation

```
Level 4, Streak 15, 4 seconds remaining, 10th correct answer in streak:

Base Points: 10
Speed Bonus: 8 (4 seconds × 2)
Streak Bonus: 15
Level Multiplier: 1.15 (1 + (4-1) × 0.05)
Streak Multiplier: 1.2 (every 10th answer)

Final = (10 + 8 + 15) × 1.15 × 1.2 = 33 × 1.15 × 1.2 = 45.54 ≈ 45 points
```

## Difficulty Progression

- **Level 1**: 18 seconds per problem
- **Level 2**: 14 seconds
- **Level 3**: 10 seconds
- **Level 4**: 9 seconds
- **Level 5**: 8 seconds
- **Level 6**: 7 seconds
- **Level 7**: 6 seconds
- **Level 8+**: Decreases by 2s per level (4s, 2.5s minimum)
- **Level Up**: Every 8 correct answers

## 🐍 Tail Eating Mechanic

The "tail" is your oldest answered problem that hasn't expired yet. Here's how it works:

1. **Tail Definition**: The oldest problem you've answered (based on when it was spawned)
2. **Eating Trigger**: When you reach the tail's position (`currentProblemIndex === tail.index`) AND it hasn't expired yet (`now < tail.expiresAt`)
3. **Visual Indicator**: The current problem turns **yellow** when you're on your tail
4. **Bonus**: Award massive bonus points based on time remaining
5. **Replacement**: After eating, the tail is replaced with a new problem

**Strategy Tip**: Answer quickly to catch up to your tail before it expires!

## Penalties

- **Wrong Answer**: 
  - Timeout: 2 seconds + (level × 0.3s)
  - Streak resets to 0
  - Correct answer is shown during timeout
  - Problems continue expiring during timeout (adds pressure!)
- **Expired Problem**: 
  - Non-current problems: Removed automatically
  - Current problem: **GAME OVER**

## 🎨 Visual Indicators

- **Blue border + scale**: Current problem (the one you're answering)
- **Yellow border**: Current problem when you're on your tail (eat it fast!)
- **Time bars**: Color-coded progress bars (blue → yellow → red as time runs out)
- **Grayed out**: Expired problems (opacity 0.3, red border)
- **Reduced opacity**: Problems behind you (0.6 opacity)
- **Green message**: ">>> CORRECT! <<<" for 500ms after correct answer
- **Red message**: ">>> WRONG! Correct: X (Ys timeout) <<<" during timeout

## Project Structure

```
ouroboros/
├── index.html      # Game entry point and UI structure
├── main.js         # Game loop, rendering, input handling
├── game.js         # Game state, scoring, tail eating logic
├── problems.js     # Problem generation and expiration logic
├── snake.js        # Circular layout calculation
├── ui.js           # UI state management
└── style.css       # Visual styling with ASCII aesthetic
```

## Game Mechanics Deep Dive

### Circular Track

- Exactly 12 problems arranged in a circle (indices 0-11)
- Problems are positioned evenly around the circle (18° per problem)
- You move forward sequentially: `(currentProblemIndex + 1) % 12`
- Positions are fixed once set—problems don't move when others are replaced

### Expiration System

- Problems only start expiring when they become the current problem
- Expiration time is level-based and set when a problem becomes current
- Pausing extends all expiration timers (timers effectively pause)
- Level ups recalculate expiration times while maintaining relative progress

### Display Logic

- Shows: Current problem + 3 problems ahead + answered/expiring problems behind
- Prioritizes showing expiring problems behind you (up to 10 behind)
- Problems that are far behind or expired are hidden

## 🎯 Tips for High Scores

1. **Speed is key**: Faster answers = more speed bonus points
2. **Maintain streaks**: Streak bonus caps at 50, but streak multiplier (every 10th) is huge
3. **Eat your tail**: The tail eating bonus can be massive—aim for it!
4. **Watch the timer**: Yellow highlighting shows when you're on your tail
5. **Level up wisely**: Higher levels = more multiplier but less time

## Known Issues

- **Tail eating feedback**: Bonus is added silently (no visual/audio feedback yet)
- See `ARCHITECTURE.md` for technical details and known issues

## 📚 Additional Documentation

- **ARCHITECTURE.md**: Complete technical architecture and design documentation
- **HANDOFF.md**: Development handoff notes (if present)

---

**Enjoy the speed drill!**
