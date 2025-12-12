# Chris Murphy - Personal Portfolio Website

Live site: [chrismurphy.org](http://chrismurphy.org)

A personal portfolio website featuring professional information, projects, and an interactive Fractions practice game. Built on the Dimension template by HTML5 UP.

## Features

### Portfolio Sections
- **Intro**: Professional background and interests
- **Projects**: Interactive dropdown menu with project links
  - Fractions game (interactive tape measure fraction practice)
  - Placeholder for future projects
- **Resume**: Professional experience, education, certifications, and technical skills
- **Contact**: Contact form and social links

### Fractions Game
An interactive web-based game for practicing imperial tape measure fractions with 8 different drill modes:
- Ordering fractions
- Bigger/Smaller comparisons
- Decimal conversions
- Between marks calculations
- Addition/Subtraction
- Mixed to improper conversions
- Difference calculations
- Inches to feet conversions

**Features:**
- Progressive difficulty system
- Scoring with time bonuses and streak multipliers
- High score tracking (per mode and overall)
- Statistics tracking
- Responsive design with website-themed background
- Mobile-friendly touch controls

## Project Structure

```
chrisderpher.github.io-master/
├── index.html              # Main portfolio page
├── assets/                 # CSS, JavaScript, fonts
│   ├── css/
│   ├── js/
│   └── webfonts/
├── images/                 # Images and backgrounds
│   ├── bg.jpg              # Main background image
│   ├── overlay.png         # Background overlay pattern
│   └── [other images]
├── fractions/              # Fractions game
│   ├── index.html          # Game entry point
│   ├── main.js             # Main game logic and UI
│   ├── game.js             # Game state management
│   ├── drills.js           # Drill implementations
│   ├── fractions.js        # Fraction utility functions
│   ├── ui.js               # UI state management
│   ├── style.css           # Game styles
│   └── README.md           # Game-specific documentation
├── _config.yml             # Jekyll configuration
├── README.md               # This file
└── README.txt              # Brief project description
```

## Getting Started

### Accessing the Game

1. Navigate to the main portfolio page
2. Click "Projects" in the navigation menu
3. Select "Fractions" from the dropdown
4. Or navigate directly to `fractions/index.html`

## Technologies

- **HTML5**: Semantic markup
- **CSS3**: Styling with backdrop filters and gradients
- **JavaScript (ES6 Modules)**: 
  - Vanilla JS for the Fractions game
  - jQuery for portfolio site interactions
- **LocalStorage**: Game score and statistics persistence
- **Responsive Design**: Mobile-friendly layouts

## Game Details

The Fractions game is a fully-featured educational tool with:
- 8 different drill modes for comprehensive practice
- Progressive difficulty that adapts to skill level
- Comprehensive scoring system with bonuses
- Persistent high scores and statistics
- Seamless integration with the portfolio site's design

See [fractions/README.md](fractions/README.md) for detailed game documentation.

## Credits

- **Template**: [Dimension](https://html5up.net/dimension) by HTML5 UP
- **License**: CCA 3.0 (see LICENSE.txt)
- **Fractions Game**: Custom implementation

## Contact

Chris Murphy, CCNP, ITILv4f  
Email: Chris@ChrisMurphy.org  
Website: [chrismurphy.org](http://chrismurphy.org)

---

*If you're here, it's because you know what you're doing - and I admire that. Let's talk.*

