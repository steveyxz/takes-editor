import type { PieceType } from './pieces'

export const MIN_SIZE = 3
export const MAX_SIZE = 8

export type Square = PieceType | null

export interface Board {
  width: number
  height: number
  /** Row-major, index 0 is the top-left square. */
  squares: Square[]
}

export interface Move {
  from: number
  to: number
}

const PIECE_LETTERS = 'kqrbnp'

export function isPieceType(ch: string): ch is PieceType {
  return PIECE_LETTERS.includes(ch)
}

export function emptyBoard(width: number, height: number): Board {
  return { width, height, squares: Array<Square>(width * height).fill(null) }
}

export function resizeBoard(board: Board, width: number, height: number): Board {
  const next = emptyBoard(width, height)
  for (let r = 0; r < Math.min(height, board.height); r++) {
    for (let c = 0; c < Math.min(width, board.width); c++) {
      next.squares[r * width + c] = board.squares[r * board.width + c]
    }
  }
  return next
}

export function countPieces(board: Board): number {
  return board.squares.reduce<number>((n, s) => (s ? n + 1 : n), 0)
}

/** Square name in algebraic notation, e.g. the top-left square of a 4x4 board is a4. */
export function squareName(board: Board, index: number): string {
  const file = index % board.width
  const rank = board.height - Math.floor(index / board.width)
  return `${String.fromCharCode(97 + file)}${rank}`
}

/* ------------------------------------------------------------------ FEN */

export function toFen(board: Board): string {
  const ranks: string[] = []
  for (let r = 0; r < board.height; r++) {
    let rank = ''
    let gap = 0
    for (let c = 0; c < board.width; c++) {
      const piece = board.squares[r * board.width + c]
      if (piece) {
        if (gap) rank += String(gap)
        gap = 0
        rank += piece
      } else {
        gap++
      }
    }
    if (gap) rank += String(gap)
    ranks.push(rank)
  }
  return `${ranks.join('/')} w - - 0 1`
}

export type FenResult = { ok: true; board: Board } | { ok: false; error: string }

export function fromFen(input: string): FenResult {
  const placement = input.trim().split(/\s+/)[0]
  if (!placement) return { ok: false, error: 'FEN is empty' }

  const rows = placement.split('/')
  const height = rows.length
  if (height < MIN_SIZE || height > MAX_SIZE) {
    return { ok: false, error: `Board must have ${MIN_SIZE}-${MAX_SIZE} ranks` }
  }

  const parsed: Square[][] = []
  for (const row of rows) {
    const squares: Square[] = []
    for (const ch of row) {
      const lower = ch.toLowerCase()
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) squares.push(null)
      } else if (isPieceType(lower)) {
        squares.push(lower)
      } else {
        return { ok: false, error: `Unexpected character "${ch}"` }
      }
    }
    parsed.push(squares)
  }

  const width = Math.max(...parsed.map((row) => row.length))
  if (width < MIN_SIZE || width > MAX_SIZE) {
    return { ok: false, error: `Board must be ${MIN_SIZE}-${MAX_SIZE} files wide` }
  }
  if (parsed.some((row) => row.length !== width)) {
    return { ok: false, error: 'Ranks have different lengths' }
  }

  return { ok: true, board: { width, height, squares: parsed.flat() } }
}

/* -------------------------------------------------------------- movement */

const RAYS: Record<'r' | 'b' | 'q', [number, number][]> = {
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  q: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
}

const KNIGHT_STEPS: [number, number][] = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
]

/**
 * Squares the piece on `from` could capture on. Every move must be a capture and
 * a king may never be captured, so only occupied, non-king squares are returned.
 */
export function captureTargets(board: Board, from: number): number[] {
  const piece = board.squares[from]
  if (!piece) return []

  const { width, height, squares } = board
  const row = Math.floor(from / width)
  const col = from % width
  const targets: number[] = []

  const consider = (r: number, c: number): boolean => {
    if (r < 0 || r >= height || c < 0 || c >= width) return false
    const target = squares[r * width + c]
    if (!target) return true
    if (target !== 'k') targets.push(r * width + c)
    return false
  }

  if (piece === 'p') {
    consider(row - 1, col - 1)
    consider(row - 1, col + 1)
  } else if (piece === 'n') {
    for (const [dr, dc] of KNIGHT_STEPS) consider(row + dr, col + dc)
  } else if (piece === 'k') {
    for (const [dr, dc] of RAYS.q) consider(row + dr, col + dc)
  } else {
    for (const [dr, dc] of RAYS[piece]) {
      let r = row + dr
      let c = col + dc
      while (consider(r, c)) {
        r += dr
        c += dc
      }
    }
  }
  return targets
}

export function allMoves(board: Board): Move[] {
  const moves: Move[] = []
  for (let from = 0; from < board.squares.length; from++) {
    if (!board.squares[from]) continue
    for (const to of captureTargets(board, from)) moves.push({ from, to })
  }
  return moves
}

export function applyMove(board: Board, move: Move): Board {
  const squares = board.squares.slice()
  squares[move.to] = squares[move.from]
  squares[move.from] = null
  return { ...board, squares }
}

/* ---------------------------------------------------------------- solver */

const key = (board: Board) => board.squares.map((s) => s ?? '.').join('')

export type SolveResult =
  | { status: 'solved'; solution: Move[] }
  | { status: 'unsolvable' }
  | { status: 'gave-up' }
  | { status: 'empty' }

/** Positions the search may visit before giving up, to keep the UI responsive. */
const SEARCH_LIMIT = 400_000

/** Depth-first search for a sequence of captures leaving exactly one piece. */
export function solve(board: Board): SolveResult {
  const total = countPieces(board)
  if (total === 0) return { status: 'empty' }
  if (total === 1) return { status: 'solved', solution: [] }

  const seen = new Set<string>()
  const path: Move[] = []

  const search = (current: Board, remaining: number): boolean => {
    if (remaining === 1) return true
    if (seen.size >= SEARCH_LIMIT) return false
    const k = key(current)
    if (seen.has(k)) return false
    seen.add(k)
    for (const move of allMoves(current)) {
      path.push(move)
      if (search(applyMove(current, move), remaining - 1)) return true
      path.pop()
    }
    return false
  }

  if (search(board, total)) return { status: 'solved', solution: path }
  return seen.size >= SEARCH_LIMIT ? { status: 'gave-up' } : { status: 'unsolvable' }
}

/* ------------------------------------------------------------- generator */

const NON_KING: PieceType[] = ['q', 'r', 'b', 'n', 'p']
const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

/**
 * Builds a map by running the game backwards: start from the single surviving piece and
 * repeatedly un-capture, which guarantees the result has at least one solution.
 */
export function generateSolvable(
  width: number,
  height: number,
  pieces: number,
  withKing: boolean,
): Board {
  const board = emptyBoard(width, height)
  const size = width * height
  board.squares[Math.floor(Math.random() * size)] = withKing ? 'k' : pick(NON_KING)

  for (let placed = 1; placed < pieces; placed++) {
    let done = false
    for (let attempt = 0; attempt < 400 && !done; attempt++) {
      const occupied = board.squares.flatMap((piece, i) => (piece ? [i] : []))
      const empty = board.squares.flatMap((piece, i) => (piece ? [] : [i]))
      if (empty.length === 0) return board

      const to = pick(occupied)
      const from = pick(empty)
      const victim = pick(NON_KING)

      const previous = board.squares.slice()
      previous[from] = board.squares[to]
      previous[to] = victim
      if (captureTargets({ width, height, squares: previous }, from).includes(to)) {
        board.squares[from] = previous[from]
        board.squares[to] = victim
        done = true
      }
    }
    if (!done) return board
  }
  return board
}

export function describeMove(board: Board, move: Move): string {
  const piece = board.squares[move.from]
  const captured = board.squares[move.to]
  const prefix = piece === 'p' ? '' : (piece ?? '').toUpperCase()
  return `${prefix}${squareName(board, move.from)}x${(captured ?? '').toUpperCase()}${squareName(board, move.to)}`
}
