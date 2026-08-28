import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChessPiece } from './ChessPiece'
import { PIECE_NAMES } from './pieces'
import type { PieceType } from './pieces'
import {
  MAX_SIZE,
  MIN_SIZE,
  applyMove,
  captureTargets,
  countPieces,
  describeMove,
  emptyBoard,
  fromFen,
  generateSolvable,
  resizeBoard,
  solve,
  squareName,
  toFen,
} from './chess'
import type { Board, Move, SolveResult } from './chess'
import './App.css'

const PALETTE: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p']
const DEFAULT_FEN = '2k1/3n/1p1n/2b1 w - - 0 1'

type Tool = PieceType | 'erase'
type Mode = 'edit' | 'play'

function initialBoard(): Board {
  const fromUrl = new URLSearchParams(window.location.search).get('fen')
  const parsed = fromFen(fromUrl ?? DEFAULT_FEN)
  if (parsed.ok) return parsed.board
  const fallback = fromFen(DEFAULT_FEN)
  return fallback.ok ? fallback.board : emptyBoard(4, 4)
}

export default function App() {
  const [board, setBoard] = useState<Board>(initialBoard)
  const [tool, setTool] = useState<Tool>('q')
  const [mode, setMode] = useState<Mode>('edit')
  const [fenDraft, setFenDraft] = useState<string | null>(null)
  const [fenError, setFenError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [history, setHistory] = useState<Board[]>([])
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [genPieces, setGenPieces] = useState(5)
  const [genKing, setGenKing] = useState(true)
  const playStart = useRef<Board>(board)

  const fen = useMemo(() => toFen(board), [board])
  const pieceCount = countPieces(board)

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('fen', fen)
    window.history.replaceState(null, '', url)
  }, [fen])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const update = useCallback((next: Board) => {
    setBoard(next)
    setSolveResult(null)
    setSelected(null)
    setFenDraft(null)
    setFenError(null)
  }, [])

  const setSquare = (index: number, piece: PieceType | null) => {
    const squares = board.squares.slice()
    squares[index] = piece
    update({ ...board, squares })
  }

  const enterPlay = () => {
    playStart.current = board
    setHistory([])
    setSelected(null)
    setSolveResult(null)
    setMode('play')
  }

  const exitPlay = () => {
    setBoard(playStart.current)
    setHistory([])
    setSelected(null)
    setMode('edit')
  }

  const playMove = (move: Move) => {
    setHistory((h) => [...h, board])
    setBoard(applyMove(board, move))
    setSelected(null)
    setFenDraft(null)
  }

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h
      setBoard(h[h.length - 1])
      setSelected(null)
      return h.slice(0, -1)
    })
  }

  const restart = () => {
    setBoard(playStart.current)
    setHistory([])
    setSelected(null)
  }

  const targets = useMemo(
    () => (selected === null ? [] : captureTargets(board, selected)),
    [board, selected],
  )

  const handleSquareClick = (index: number) => {
    if (mode === 'play') {
      if (selected !== null && targets.includes(index)) {
        playMove({ from: selected, to: index })
        return
      }
      setSelected(board.squares[index] && index !== selected ? index : null)
      return
    }
    if (tool === 'erase') {
      setSquare(index, null)
      return
    }
    setSquare(index, board.squares[index] === tool ? null : tool)
  }

  const handleDrop = (index: number, payload: string) => {
    if (payload.startsWith('palette:')) {
      const piece = payload.slice(8)
      if (mode === 'edit') setSquare(index, piece as PieceType)
      return
    }
    const from = Number(payload.slice(6))
    if (Number.isNaN(from) || from === index) return
    if (mode === 'play') {
      if (captureTargets(board, from).includes(index)) playMove({ from, to: index })
      return
    }
    const squares = board.squares.slice()
    squares[index] = squares[from]
    squares[from] = null
    update({ ...board, squares })
  }

  const applyFenDraft = () => {
    const parsed = fromFen(fenDraft ?? fen)
    if (!parsed.ok) {
      setFenError(parsed.error)
      return
    }
    setMode('edit')
    update(parsed.board)
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setToast(`${label} copied`)
    } catch {
      setToast('Copy failed — select the text manually')
    }
  }

  const won = mode === 'play' && pieceCount === 1
  const stuck = mode === 'play' && !won && !hasAnyMove(board)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <ChessPiece type="n" size={26} />
          </span>
          <h1>takes editor</h1>
        </div>
        <span className="tagline">solitaire chess map editor</span>
      </header>

      <main className="layout">
        <section className="board-column">
          <div className="mode-switch">
            <button
              type="button"
              className={mode === 'edit' ? 'chip active' : 'chip'}
              onClick={exitPlay}
            >
              Edit
            </button>
            <button
              type="button"
              className={mode === 'play' ? 'chip active' : 'chip'}
              onClick={enterPlay}
            >
              Play test
            </button>
          </div>

          <div
            className="board"
            style={{ gridTemplateColumns: `repeat(${board.width}, 1fr)` }}
            role="grid"
            aria-label={`${board.width}x${board.height} solitaire chess board`}
          >
            {board.squares.map((piece, index) => {
              const row = Math.floor(index / board.width)
              const col = index % board.width
              const dark = (row + col) % 2 === 0
              const classes = ['sq', dark ? 'dark' : 'light']
              if (selected === index) classes.push('selected')
              if (targets.includes(index)) classes.push('target')
              return (
                <button
                  type="button"
                  key={index}
                  className={classes.join(' ')}
                  role="gridcell"
                  aria-label={`${squareName(board, index)}${piece ? ` ${PIECE_NAMES[piece]}` : ' empty'}`}
                  onClick={() => handleSquareClick(index)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    if (mode === 'edit') setSquare(index, null)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleDrop(index, event.dataTransfer.getData('text/plain'))
                  }}
                >
                  {piece && (
                    <span
                      className="piece"
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData('text/plain', `board:${index}`)
                      }
                    >
                      <ChessPiece type={piece} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {mode === 'play' ? (
            <div className="play-bar">
              <button type="button" className="btn" onClick={undo} disabled={history.length === 0}>
                Undo
              </button>
              <button type="button" className="btn" onClick={restart}>
                Restart
              </button>
              <span className={won ? 'verdict win' : stuck ? 'verdict lose' : 'verdict'}>
                {won ? 'Solved — one piece left!' : stuck ? 'No captures left' : `${pieceCount} pieces`}
              </span>
            </div>
          ) : (
            <p className="hint">
              Drag pieces from the tray onto the board, drag them around to rearrange, or
              right-click a square to clear it.
            </p>
          )}
        </section>

        <section className="side">
          {mode === 'edit' && (
            <div className="card">
              <h2>Pieces</h2>
              <div className="palette">
                {PALETTE.map((piece) => (
                  <button
                    type="button"
                    key={piece}
                    className={tool === piece ? 'tile active' : 'tile'}
                    title={PIECE_NAMES[piece]}
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData('text/plain', `palette:${piece}`)
                    }
                    onClick={() => setTool(piece)}
                  >
                    <ChessPiece type={piece} size={36} />
                  </button>
                ))}
                <button
                  type="button"
                  className={tool === 'erase' ? 'tile active' : 'tile'}
                  title="Erase"
                  onClick={() => setTool('erase')}
                >
                  <span className="erase">✕</span>
                </button>
              </div>

              <h2>Board size</h2>
              <div className="sizes">
                <label>
                  Files
                  <input
                    type="number"
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    value={board.width}
                    onChange={(event) =>
                      update(resizeBoard(board, clamp(event.target.value, board.width), board.height))
                    }
                  />
                </label>
                <label>
                  Ranks
                  <input
                    type="number"
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    value={board.height}
                    onChange={(event) =>
                      update(resizeBoard(board, board.width, clamp(event.target.value, board.height)))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => update(emptyBoard(board.width, board.height))}
                >
                  Clear board
                </button>
              </div>

              <h2>Generate</h2>
              <div className="sizes">
                <label>
                  Pieces
                  <input
                    type="number"
                    min={2}
                    max={board.width * board.height}
                    value={genPieces}
                    onChange={(event) => setGenPieces(Number(event.target.value) || 2)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={genKing}
                    onChange={(event) => setGenKing(event.target.checked)}
                  />
                  With king
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    update(
                      generateSolvable(
                        board.width,
                        board.height,
                        Math.min(genPieces, board.width * board.height),
                        genKing,
                      ),
                    )
                  }
                >
                  Random solvable map
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <h2>FEN</h2>
            <textarea
              className={fenError ? 'fen error' : 'fen'}
              value={fenDraft ?? fen}
              spellCheck={false}
              onChange={(event) => setFenDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyFenDraft()
                }
              }}
            />
            {fenError && <p className="error-text">{fenError}</p>}
            <div className="row">
              <button type="button" className="btn primary" onClick={applyFenDraft}>
                Load FEN
              </button>
              <button type="button" className="btn" onClick={() => copy(fen, 'FEN')}>
                Copy FEN
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => copy(window.location.href, 'Link')}
              >
                Copy link
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Validate</h2>
            <button type="button" className="btn primary wide" onClick={() => setSolveResult(solve(board))}>
              Check solvability
            </button>
            {solveResult && <SolveReport board={board} result={solveResult} />}
          </div>
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}

      <footer className="foot">
        Every move must be a capture · a king can never be captured, so it has to make the last
        take · a valid map ends with exactly one piece.
      </footer>
    </div>
  )
}

function solutionLines(board: Board, solution: Move[]): string[] {
  const lines: string[] = []
  let current = board
  for (const move of solution) {
    lines.push(describeMove(current, move))
    current = applyMove(current, move)
  }
  return lines
}

function SolveReport({ board, result }: { board: Board; result: SolveResult }) {
  if (result.status === 'empty') return <p className="verdict">Board is empty.</p>
  if (result.status === 'gave-up') {
    return <p className="verdict">Too many positions to search — try a smaller map.</p>
  }
  if (result.status === 'unsolvable') {
    return <p className="verdict lose">Unsolvable — no capture sequence leaves one piece.</p>
  }
  if (result.solution.length === 0) return <p className="verdict win">Already a single piece.</p>

  const lines = solutionLines(board, result.solution)
  return (
    <>
      <p className="verdict win">Solvable in {result.solution.length} takes.</p>
      <ol className="solution">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </>
  )
}

function hasAnyMove(board: Board): boolean {
  return board.squares.some((piece, index) => piece && captureTargets(board, index).length > 0)
}

function clamp(value: string, fallback: number): number {
  const n = Number(value)
  if (Number.isNaN(n)) return fallback
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)))
}
