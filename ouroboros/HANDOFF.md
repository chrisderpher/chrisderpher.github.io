# Ouroboros - Handoff Note

**One-liner:** Web-based multiplication speed drill (0-10 × 0-10) with snake visualization, progressive difficulty, and tail aging mechanics.

**Goal:** Practice multiplication tables in a timed, continuous session where problems expire and the snake tail ages faster when >12 problems.

**Current status:** Core gameplay functional. Recent fixes: position stability (problems no longer shift during play), tail aging only applies to problems that have started expiring. Integrated into portfolio site dropdown menu.

**Architecture (tiny):** ES6 modules, vanilla JS. Game state in `Game` class, UI state in `UIManager`, problem generation in `Problem` class, snake layout/aging in `SnakeLayout` class. RequestAnimationFrame game loop.

**Key files:**
- `ouroboros/index.html` → Entry point, screen structure
- `ouroboros/main.js` → Game loop, rendering, input handling
- `ouroboros/game.js` → Core game state, scoring, level progression
- `ouroboros/problems.js` → Problem generation (0-10 × 0-10)
- `ouroboros/snake.js` → Snake layout calculation, tail aging logic
- `ouroboros/ui.js` → UI state management (start/playing/paused/game-over/help)
- `ouroboros/style.css` → ASCII aesthetic, backdrop-filter theming to match portfolio
- `index.html` (root) → Portfolio site with Projects dropdown linking to Ouroboros

**Important constraints:**
- Must serve via HTTP (ES6 modules). Use `python -m http.server 8001` or similar.
- Positions are fixed per problem (stored in `problem.position`) and never recalculated for existing problems.
- Problems only start expiring when they become current (`expirationStartedAt`).
- Tail aging (0.25x per extra problem) only applies to problems that have started expiring.
- Game over when current problem expires.
- Background theming must match portfolio site (blurry image + overlay).

**How to run:**
1. `cd chrisderpher.github.io-master`
2. `python -m http.server 8001`
3. Navigate to `http://localhost:8001/ouroboros/`

**How to test:**
- Start game (Space), answer problems (type numbers, Enter to submit)
- Verify problems don't move while typing
- Verify tail aging indicator (⚡) appears on problems when snake >12
- Verify wrong answers cause timeout and reset streak
- Verify game ends when current problem expires
- Verify positions remain fixed when problems are removed/shed

**Known issues / TODOs:**
- None currently. Position stability and tail aging were just fixed.

**Next steps (ordered):**
1. Test gameplay flow end-to-end
2. Verify tail aging visualization is clear
3. Consider adding difficulty presets or customization options
4. Consider adding problem format toggle (vertical vs inline) if user requests
