# Technical Documentation

## Architecture Overview

This portfolio website combines a static site template with a custom interactive game, using modern web technologies and ES6 modules.

## Portfolio Site Architecture

### Navigation System
- **Hash-based routing**: Uses `location.hash` for navigation
- **Article system**: Each section (Intro, Projects, Resume, Contact) is an article with unique ID
- **Transition animations**: Smooth fade transitions between articles
- **Dropdown menu**: Custom JavaScript implementation for Projects dropdown

### Key Files
- `index.html`: Main portfolio structure
- `assets/js/main.js`: Navigation logic, article transitions, Projects dropdown handler
- `assets/css/main.css`: Styling with background layers and responsive design

### Background System
The site uses a layered background approach:
- `#bg:after`: Base background image (`bg.jpg`) with scale transform
- `#bg:before`: Overlay pattern (`overlay.png`) with gradient
- Both layers use pseudo-elements for layering and transitions

## Fractions Game Architecture

### Module Structure

#### `fractions.js`
- **Fraction class**: Core fraction representation with comparison, arithmetic, and conversion methods
- **Utility functions**: Generation, sorting, and manipulation of fractions
- **Exports**: All functions and classes needed by other modules

#### `drills.js`
- **Base Drill class**: Abstract class defining drill interface
- **8 Drill implementations**: Each mode extends the base class
  - `OrderingDrill`: Fraction ordering challenge
  - `BiggerSmallerDrill`: Rapid comparison
  - `ToDecimalDrill`: Decimal conversion
  - `BetweenMarksDrill`: Midpoint calculation
  - `AddSubtractDrill`: Arithmetic operations
  - `MixedToImproperDrill`: Mixed number conversion
  - `DifferenceDrill`: Subtraction challenge
  - `InchesToFeetDrill`: Unit conversion
- **Drill registry**: `DRILLS` array and `DRILL_NAMES` mapping

#### `game.js`
- **Game class**: Main game state management
  - Score, level, lives, streak tracking
  - High score persistence (LocalStorage)
  - Statistics tracking
  - Mode selection
  - Time limit calculation (varies by drill)
- **Score calculation**: Level multipliers, streak bonuses, time bonuses

#### `ui.js`
- **UI_STATE constants**: State enumeration
- **UIManager class**: State machine for UI transitions
- **States**: START, MODE_SELECTION, PLAYING, PAUSED, GAME_OVER, HELP

#### `main.js`
- **Game loop**: `requestAnimationFrame`-based update loop
- **Rendering**: Drill-specific render functions
- **Input handling**: Keyboard and touch event management
- **Screen management**: Show/hide different game screens
- **High score display**: Updates mode-specific and overall scores

### Data Flow

```
User Input → main.js → game.js → drills.js
                ↓
         UI Updates → Rendering
                ↓
         Score Calculation → LocalStorage
```

### State Management

1. **UI State**: Managed by `UIManager` class
2. **Game State**: Managed by `Game` class
3. **Drill State**: Managed by individual drill instances
4. **Persistence**: LocalStorage for high scores and statistics

### Integration Points

#### Portfolio to Game
- **Navigation**: Dropdown menu links to `fractions/index.html`
- **Styling**: Game uses same background images (`../images/bg.jpg`, `../images/overlay.png`)
- **Theme**: Game CSS matches portfolio transparency and backdrop filters

#### Game to Portfolio
- **Close button**: Links back to `../index.html`
- **Navigation**: Available on start screen and mode selection screen

## Styling Architecture

### Portfolio Site
- **Template**: Dimension by HTML5 UP
- **CSS Structure**: Modular SCSS files compiled to `main.css`
- **Responsive**: Breakpoint-based media queries
- **Background**: Layered pseudo-elements with transitions

### Fractions Game
- **Base**: Transparent backgrounds with backdrop filters
- **Theme Integration**: Uses portfolio background images
- **Responsive**: Mobile-first approach with media queries
- **Transitions**: Smooth animations for state changes

## Data Persistence

### LocalStorage Keys
- `tapeMeasureHighScores`: JSON object with mode-specific and overall high scores
- `tapeMeasureStats`: JSON object with best streak, total games, accuracy

### Score Key Format
Mode names are converted to lowercase alphanumeric keys:
- "Ordering" → "ordering"
- "Bigger/Smaller" → "biggermall"
- "To Decimal" → "todecimal"
- etc.

## Browser Compatibility

### Requirements
- ES6 module support
- LocalStorage API
- CSS backdrop-filter (with graceful degradation)
- requestAnimationFrame

### Tested Browsers
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Performance Considerations

- **Game loop**: Uses `requestAnimationFrame` for smooth 60fps updates
- **Rendering**: Only updates when drill state changes
- **LocalStorage**: Async writes, doesn't block game loop
- **Background images**: Fixed positioning, hardware-accelerated transforms

## Future Enhancements

Potential improvements:
- Additional game modes
- Multiplayer/leaderboard system
- More detailed statistics
- Export/import save data
- Accessibility improvements (ARIA labels, keyboard navigation)

## Development Notes

### Adding New Drill Modes
1. Create new drill class extending `Drill` in `drills.js`
2. Implement required methods: `start()`, `handleInput()`, `getDisplayData()`
3. Add to `DRILLS` array and `DRILL_NAMES` mapping
4. Add render function in `main.js`
5. Add mode option in `index.html`
6. Update help text and instructions

### Modifying Scoring
- Base points: Set in drill constructor (`basePoints`)
- Time bonus: Calculated in `Drill.calculateScore()`
- Level multiplier: Applied in `Game.handleAnswer()`
- Streak bonus: Applied in `Game.handleAnswer()`

### Styling Changes
- Background: Modify `#bg` styles in `style.css`
- Game elements: Update transparency and backdrop-filter values
- Colors: Adjust rgba values for consistency
