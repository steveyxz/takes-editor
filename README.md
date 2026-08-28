# takes editor

A map editor for solitaire chess puzzles in the style of
[takes.clevergoat.com](https://takes.clevergoat.com/).

In a solitaire chess puzzle all pieces belong to the same side, **every move must be a
capture**, and a valid puzzle can be reduced to exactly one remaining piece. A king can never
be captured, so if one is on the board it has to make the final take.

## What you can do

- Drag pieces from the tray onto the board, drag pieces around to rearrange, right-click to clear.
- Resize the board between 3x3 and 8x8.
- Read/write the position as FEN; the URL always carries the current `?fen=` so a position is
  shared by copying the link.
- **Check solvability** runs a depth-first search over capture sequences and prints a full
  solution, or tells you the map is impossible.
- **Play test** mode lets you solve your own map with undo/restart.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

Piece artwork is the Cburnett chess set from Wikimedia Commons (CC BY-SA 3.0), recoloured to a
single side.
