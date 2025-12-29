# Ouroboros - Handoff Note

**One-liner:** Web-based multiplication speed drill (0-10 × 0-10) with circular track visualization (12 problems in a fixed circle), progressive difficulty, and tail eating mechanics.

**Goal:** Practice multiplication tables in a timed, continuous session where problems expire in a circular track. Answer fast enough to "eat" your tail (oldest answered problem) before it expires for bonus points.

**Current status:** Core gameplay functional. Recent fixes: position stability (problems no longer shift during play), circular track implementation with tail eating bonus. Integrated into portfolio site dropdown menu.

**Architecture (tiny):** ES6 modules, vanilla JS. Game state in `Game` class, UI state in `UIManager`, problem generation in `Problem` class, circular layout in `SnakeLayout` class. RequestAnimationFrame game loop.

**Key files:**
- `ouroboros/index.html` → Entry point, screen structure
- `ouroboros/main.js` → Game loop, rendering, input handling
- `ouroboros/game.js` → Core game state, scoring, level progression
- `ouroboros/problems.js` → Problem generation (0-10 × 0-10)
- `ouroboros/snake.js` → Circular layout calculation, position assignment
- `ouroboros/ui.js` → UI state management (start/playing/paused/game-over/help)
- `ouroboros/style.css` → ASCII aesthetic, backdrop-filter theming to match portfolio
- `index.html` (root) → Portfolio site with Projects dropdown linking to Ouroboros

**Important constraints:**
- Positions are fixed per problem (stored in `problem.position`) and never recalculated for existing problems.
- Problems only start expiring when they become the current problem (via `startExpiration()`).
- Tail eating: If you reach your oldest answered problem before it expires, you get bonus points (50 base + time remaining × 5 per second).
- Level up every 8 correct answers.
- Expiration times: Level 1: 18s, Level 2: 14s, Levels 3-7: 10s down to 6s, Level 8+: down to 2.5s minimum.
- Game over when current problem expires.
- Background theming must match portfolio site (blurry image + overlay).

**How to test:**
- Start game (Space), answer problems (type numbers, Enter to submit)
- Verify problems don't move while typing
- Verify tail eating: Answer fast enough to reach oldest answered problem before it expires (current problem turns yellow when on tail)
- Verify wrong answers cause timeout and reset streak
- Verify game ends when current problem expires
- Verify positions remain fixed when problems are removed/replaced
- Verify level up occurs every 8 correct answers

**Known issues / TODOs:**
- Tail eating feedback: Bonus is added silently (no visual/audio feedback yet)

**Next steps (ordered):**
1. Test gameplay flow end-to-end
2. Add visual/audio feedback for tail eating bonus
3. Consider adding difficulty presets or customization options
4. Consider adding problem format toggle (vertical vs inline) if user requests
