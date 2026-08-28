export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'

export const PIECE_NAMES: Record<PieceType, string> = {
  k: 'King',
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
}
