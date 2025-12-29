# Ouroboros - Architecture & Design Handoff

## One-liner

Web-based multiplication speed drill (0-10 × 0-10) with circular track visualization (12 problems in a fixed circle), progressive difficulty, and state-based tail eating mechanics where fast players can "eat" their tail before it expires for bonus points.

## Core loop

1. Player presses SPACE to start → `Game.start()` initializes 12 problems in circle
2. Game loop runs via `requestAnimationFrame` → `gameLoop()` calls `game.update()` and `updateUI()`
3. `Game.update()`: checks expiration, removes expired problems (except current), ensures 12 problems exist
4. Player types numbers → `handleInput()` captures 0-9, Backspace
5. Player presses Enter → `submitAnswer()` validates answer
6. If correct: mark answered, calculate score, move `currentProblemIndex` forward (wraps at 12), check `checkTailEaten()`, spawn new problem at current position, start expiration
7. If wrong: apply timeout penalty, reset streak
8. `checkTailEaten()`: if `currentProblemIndex === tail.index && now < tail.expiresAt` → award bonus, replace tail
9. Render: `renderSnake()` shows current problem + 3 ahead + answered/expiring behind
10. Repeat until current problem expires → `endGame()`

## Key mechanics

### Question spawning + expiration

- **Spawning**: Problems spawn when needed (game start, after answer, when expired problem replaced)
- **Expiration time**: Level-based, Level 1: 18s, Level 2: 14s, Levels 3-7: 10s down to 6s (decreases by 1s per level), Level 8+: 6s down to 2.5s minimum (decreases by 2s per level)
- **Expiration model**: `expiresAt = now + expirationTime` (set when problem becomes current via `startExpiration()`)
- **Expiration check**: `isExpired()` returns `now >= expiresAt`
- **Invariant**: Problems only start expiring when they become `currentProblem` (not when spawned)

### Circular track / "snake" behavior

- **Fixed circle**: Exactly 12 problems arranged in a circle (indices 0-11)
- **Position calculation**: `SnakeLayout.calculatePositions()` arranges problems evenly around circle (18° per problem, starting at top)
- **Progression**: Player moves forward sequentially: `currentProblemIndex = (currentProblemIndex + 1) % 12`
- **Position storage**: Each problem has `position = {x, y, angle, index, circleIndex}` set once, never recalculated
- **Display**: Shows 3 problems ahead, answered/expiring problems behind (up to 10 behind, prioritizing expiring)

### Tail definition + "eat tail" bonus rule

- **Tail**: Oldest answered problem where `now < problem.expiresAt` (found by `getTailProblem()` comparing `spawnedAt`)
- **Tail eating trigger**: When `currentProblemIndex === tail.index && now < tail.expiresAt` (hard state check in `checkTailEaten()`)
- **Bonus calculation**: `50 base + (timeRemaining * 5)` points per second remaining
- **After eating**: Replace tail problem with new problem, update `currentProblem` reference if needed
- **Design decision**: State-based check (no speed prediction needed) - either you reached it before expiry or you didn't

### Scoring, streaks, difficulty scaling

- **Base points**: 10 per correct answer
- **Speed bonus**: `Math.floor(timeRemaining * 2)` points
- **Streak bonus**: `Math.min(streak, 50)` points (capped at 50)
- **Level multiplier**: `1 + (level - 1) * 0.05` (5% per level)
- **Streak multiplier**: 1.2x when `consecutiveCorrect % 10 === 0` (every 10th correct answer)
- **Final score**: `(basePoints + speedBonus + streakBonus) * levelMultiplier * streakMultiplier`
- **Difficulty**: Level up every 8 correct answers, expiration time follows tiered progression (18s→14s→10s-6s→6s-2.5s)
- **Wrong answer penalty**: 2s timeout + 0.3s per level, resets streak and `consecutiveCorrect`

## Architecture overview

### Major modules

- **`Game` class** (`game.js`): Core game state, scoring, level progression, tail detection, problem management
- **`Problem` class** (`problems.js`): Problem data model, expiration logic, time calculations
- **`SnakeLayout` class** (`snake.js`): Circular layout calculation, position assignment
- **`UIManager` class** (`ui.js`): UI state machine (START/PLAYING/PAUSED/GAME_OVER/HELP)
- **`main.js`**: Game loop, rendering, input handling, DOM manipulation
- **`index.html`**: Screen structure (start/game/pause/game-over/help)
- **`style.css`**: Visual styling, ASCII aesthetic, backdrop-filter theming

### Responsibilities

- **Game**: State management, game rules, tail eating logic, level progression
- **Problem**: Expiration tracking, time remaining calculations, level up recalculation
- **SnakeLayout**: Geometric positioning, circle radius calculation
- **UIManager**: Screen state transitions
- **main.js**: Rendering pipeline, input coordination, visual feedback

## Data model

### Problem entity

```javascript
{
  multiplicand: number,        // 0-10
  multiplier: number,          // 0-10
  answer: number,              // multiplicand * multiplier
  createdAt: timestamp,       // When Problem object was created
  spawnedAt: timestamp,        // When problem was placed in circle (set by initializeProblem)
  expiresAt: timestamp | null, // Absolute expiration time (set when becomes current)
  levelAtSpawn: number,        // Level when problem was spawned
  expirationTime: number,      // Expiration duration in seconds (level-based)
  position: {x, y, angle, index, circleIndex} | null, // Fixed circle position
  answered: boolean            // Whether player answered this problem
}
```

**Invariants**:
- `expiresAt === null` until problem becomes current (via `startExpiration()`)
- `position` is set once per problem, never recalculated for existing problems
- `spawnedAt` is set when problem is initialized, used to find oldest tail

### Game state

```javascript
{
  score: number,
  level: number,
  streak: number,
  bestStreak: number,
  consecutiveCorrect: number,  // For streak multiplier (every 10 = 1.2x)
  correctAnswers: number,
  totalQuestions: number,
  problems: Problem[],         // Fixed array of 12 problems
  currentProblemIndex: number,  // 0-11, wraps around
  currentProblem: Problem,     // Reference to current problem (fixes answer box bug)
  circleSize: 12,              // Fixed circle size
  gameOver: boolean,
  paused: boolean,
  pauseStartTime: timestamp | null,
  totalPauseDuration: number,  // Total ms paused (for pause handling)
  wrongAnswerTimeout: boolean,
  wrongAnswerTimeoutEnd: timestamp,
  answersPerLevel: 10,
  answersThisLevel: number
}
```

**Invariants**:
- `problems.length === 12` (always maintained)
- `currentProblemIndex` always valid (0-11)
- `currentProblem` reference matches `problems[currentProblemIndex]`
- Only current problem has `expiresAt !== null` (others haven't started expiring)

## State machine

### Game states (via `UIManager`)

- **START**: Initial screen, shows instructions, high score, press SPACE to start
- **PLAYING**: Active gameplay, game loop running, accepting input
- **PAUSED**: Game paused (ESC), expiration timers extended, no input processing
- **GAME_OVER**: Current problem expired, shows final stats, press SPACE to return
- **HELP**: Help screen overlay (press ? to toggle)

### Transitions

- START → PLAYING: SPACE pressed, `game.start()` called
- PLAYING → PAUSED: ESC pressed, `togglePause()` extends `expiresAt` timestamps
- PAUSED → PLAYING: ESC pressed, resume game loop
- PLAYING → GAME_OVER: Current problem expires (`isExpired()` returns true)
- PLAYING → HELP: ? pressed (toggle)
- Any → START: SPACE from pause/game-over screens

## Timing model

### Expiration timestamps

- **Model**: Absolute timestamps (`expiresAt = now + expirationTime * 1000`)
- **When set**: `startExpiration()` called when problem becomes current
- **Expiration check**: `isExpired()` uses `Date.now() >= expiresAt` (no drift, direct comparison)
- **Time remaining**: `getTimeRemaining()` calculates `(expiresAt - Date.now()) / 1000`

### Pause handling

- **On pause**: Record `pauseStartTime = Date.now()`
- **On resume**: Calculate `pauseDuration = Date.now() - pauseStartTime`, extend all `expiresAt` by `pauseDuration`
- **Result**: Expiration timers effectively pause (expiresAt extended by pause time)

### Level up timing

- **On level up**: Recalculate `expiresAt` for all problems via `recalculateExpiresAt()`
- **Logic**: Maintains same remaining time: `newExpiresAt = now + timeRemaining * 1000`
- **Rationale**: Keeps relative progress, adjusts to new expiration duration

### Wrong answer timeout

- **Duration**: `2 + (level * 0.3)` seconds
- **Behavior**: Problems continue expiring during timeout (adds pressure)
- **Implementation**: `wrongAnswerTimeoutEnd = Date.now() + duration`, checked in `update()`

## Algorithms / logic

### Tail detection (`getTailProblem()`)

```javascript
// Find oldest answered problem that hasn't expired
for each problem in problems:
  if problem.answered && !problem.isExpired():
    if oldestTail is null OR problem.spawnedAt < oldestTail.spawnedAt:
      oldestTail = problem
      oldestIndex = index
return {problem: oldestTail, index: oldestIndex} or null
```

**Complexity**: O(n) where n = 12 (circle size)

### Tail eating check (`checkTailEaten()`)

```javascript
tail = getTailProblem()
if tail && currentProblemIndex === tail.index && Date.now() < tail.expiresAt:
  eatTail(tail)  // Award bonus, replace problem
```

**Design**: Hard state check - no speed prediction, just "did you land on it before it expired?"

### Problem spawning policy

- **Initial**: Generate 12 problems at game start
- **After answer**: Replace problem at `currentProblemIndex` with new one
- **On expiration**: Replace expired problem (except current) with new one
- **Level-based difficulty**: Early levels (≤3) prefer 2-10 range, later levels all 0-10 fair game

### Fairness edge cases

- **Level up during expiration**: `recalculateExpiresAt()` maintains remaining time, adjusts to new duration
- **Pause during expiration**: All `expiresAt` extended by pause duration
- **Tail expires exactly when reached**: Check is `now < expiresAt` (strict), so if exactly equal, tail is not eaten
- **Multiple problems with same spawnedAt**: First one found wins (shouldn't happen in practice due to sequential spawning)

## UI/Rendering design

### Layout

- **Circle representation**: Problems positioned absolutely using `position: absolute` with calculated `{x, y}` from circle math
- **Current problem**: Highlighted with blue border, scale 1.05, z-index 10
- **Yellow highlighting**: Applied to current problem when `isOnTail()` returns true (on tail and not expired)
- **Time bars**: Visual progress bars at bottom of problem boxes, color-coded (blue/yellow/red based on time remaining)
- **Display filtering**: Shows current + 3 ahead + answered/expiring behind (prioritizes expiring problems)

### Visual feedback

- **Correct answer**: Green ">>> CORRECT! <<<" message for 500ms
- **Wrong answer**: Red ">>> WRONG! Correct: X (Ys timeout) <<<" during timeout
- **Tail eating**: No explicit feedback yet (bonus added silently)
- **Expired problems**: Grayed out (opacity 0.3), red border
- **Behind problems**: Reduced opacity (0.6)

### Accessibility

- **Keyboard-only**: All controls via keyboard (0-9, Enter, Backspace, ESC, SPACE, ?)
- **Focus management**: Input field auto-focused on current problem
- **Screen reader**: ASCII text, semantic HTML structure
- **Visual indicators**: Color-coded time bars, clear problem highlighting

## Files map

### Entry point
- `ouroboros/index.html`: HTML structure, screen definitions, links to main.js

### Core game logic
- `ouroboros/game.js`: **Start here** - Game class, state management, tail eating, scoring
- `ouroboros/problems.js`: Problem class, expiration logic, problem generation
- `ouroboros/snake.js`: Circular layout calculation, position assignment

### UI/Rendering
- `ouroboros/main.js`: **Start here** - Game loop, rendering, input handling
- `ouroboros/ui.js`: UI state machine (simple state tracker)
- `ouroboros/style.css`: Visual styling, layout, animations

### Integration
- `index.html` (root): Portfolio site with Projects dropdown linking to Ouroboros

## Testing checklist

1. **Basic gameplay**: Start game, answer problems, verify progression
2. **Tail eating**: Answer fast enough to reach tail before expiration, verify bonus awarded
3. **Yellow highlighting**: Verify current problem turns yellow when on tail
4. **Expiration**: Verify problems expire and are replaced
5. **Level up**: Answer 10 correct, verify expiration time decreases, expiresAt recalculates
6. **Pause/resume**: Pause game, verify expiration pauses, resume and verify continues
7. **Wrong answer**: Verify timeout penalty, streak reset
8. **Circle completion**: Verify player wraps from index 11 to 0
9. **Position stability**: Verify problems don't move when others are removed/replaced

### Linting

No linter configured. Code uses ES6 modules, vanilla JavaScript.

## Known issues + TODOs

### High priority

- **Tail eating feedback**: No visual/audio feedback when tail is eaten (bonus added silently)
- **Level up expiration recalculation**: Current implementation maintains remaining time, but may not match intended behavior (verify if should recalculate from spawnedAt)

### Medium priority

- **Problem position stability**: Positions are fixed, but verify edge cases when problems are replaced
- **Pause handling**: Verify pause duration calculation is accurate across multiple pause/resume cycles
- **Tail detection edge case**: What if multiple problems have identical `spawnedAt`? (shouldn't happen, but consider)

### Low priority / Future enhancements

- **Difficulty presets**: Allow player to choose starting difficulty
- **Problem format toggle**: Vertical vs inline display option
- **Sound effects**: Audio feedback for correct/wrong/tail eating
- **Statistics**: Track average answer time, tail eating frequency
- **Accessibility**: Add ARIA labels, keyboard navigation improvements

### Design decisions documented

- **State-based tail eating**: No speed prediction needed - hard state check proves you were fast enough
- **Fixed circle size (12)**: Tunable difficulty - bigger N = must answer faster to catch tail
- **Pause extends expiresAt**: Simpler than tracking pause duration in expiration calculations
- **Current problem reference tracking**: Fixes answer box bug where problem numbers change during typing
- **Position never recalculated**: Once set, positions stay fixed to prevent visual shifting
