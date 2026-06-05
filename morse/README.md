# morse

Morse code visualizer and trainer. Dichotomic letter tree, live dot/dash stream, optional Web Audio buzzer, streak mode.

Timing: one dit = `1200 / WPM` ms. Press < 2 dits = dot, longer = dash. Silence > 2 dits commits the letter, > 5 dits inserts a word space.

## Controls

- SPACE (hold) / KEY button / tap - send signal
- Speed slider - 5-25 WPM
- Audio toggle - buzzer on/off
- Clear / ESC - reset stream
- ? - help

Best streak persists in LocalStorage.
