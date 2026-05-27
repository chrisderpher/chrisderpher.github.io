# Morse Code Trainer

A self-contained Morse code visualizer and trainer modeled after the look of a physical Morse Code Gadget PCB: black card, gold traces, a dichotomic letter tree, and LED-style nodes that light up as you key.

## Overview

Press and hold the **KEY** button (or **SPACE**) to send a tone. Short presses become dots, long presses become dashes, brief silence commits the letter, longer silence inserts a word space. The tree on the card lights up the node that matches your in-progress code, and the live stream + decoded text strip update in real time.

## How It Works

- One dit unit = `1200 / WPM` ms (standard PARIS formula).
- Press shorter than 2 dits = dot, longer = dash.
- Silence over 2 dits commits the letter.
- Silence over 5 dits also inserts a word space.
- Codes with no English letter (e.g. `..--`) decode as `?`.

## Controls

- **SPACE** (hold) / **KEY** button / tap on touch: send signal
- **Speed slider**: 5-25 WPM (default 10)
- **Audio toggle**: turn the buzzer on/off
- **Clear**: reset stream, decoded text, and classifier buffer
- **ESC**: clear (same as Clear button)
- **?**: open/close help

## Project Structure

```
morse/
├── index.html     # Shell, screens, and trainer markup
├── style.css      # PCB / gold-trace styling and tree layout
├── main.js        # Input wiring, screen transitions, render glue
├── morse.js       # Code tables, dichotomic tree, timing classifier
├── audio.js       # Web Audio sine-tone buzzer
└── ui.js          # Tiny screen state machine
```

## Notes

- Tree shows depths 1-4 (the 26 English letters). Digits 0-9 are still decoded by the classifier, they just don't appear on the visible card.
- The classifier emits events (`symbol`, `letter`, `word`, `bufferChange`) so a future game layer can subscribe without touching the renderer.
