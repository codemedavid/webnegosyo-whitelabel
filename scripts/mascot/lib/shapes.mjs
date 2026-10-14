import { symmetric } from './geometry.mjs'

// Outlines are drawn for the LEFT side only; the right side is mirrored.

export const HEAD_L = 'M 345,140 C 268,140 196,148 160,178 C 128,204 116,238 108,272 C 98,312 86,350 90,392 ' +
  'C 95,424 118,450 158,462 C 205,470 290,468 345,468'
export const HEAD = symmetric(HEAD_L)
export const MASK = symmetric(
  'M 345,264 C 336,246 322,222 300,208 C 268,192 218,197 189,216 C 158,236 132,272 127,320 ' +
  'C 120,372 134,416 172,442 C 212,461 286,466 345,466',
)
// Starts under the neckerchief, so red neck feathers (the torso) fill the V under the chin.
export const JACKET = symmetric(
  'M 345,526 C 300,518 232,496 184,486 C 160,506 146,600 150,668 C 156,720 200,756 260,764 ' +
  'C 290,768 318,769 345,769',
)
export const TORSO = symmetric(
  'M 345,450 C 250,450 168,470 158,560 C 140,630 160,710 205,750 C 245,770 300,772 345,772',
)

// Ear tuft = three feathers fanning up and out (drawn back to front).
export const TUFT_L = [
  [158, 242, 88, 208, 30],
  [174, 222, 96, 156, 36],
  [204, 198, 116, 112, 46],
]
// The solid base the tuft feathers grow from, so they read as one tuft.
export const TUFT_BASE_L = 'M 214,176 C 188,158 162,148 142,144 C 134,166 126,186 120,200 C 132,222 146,238 162,248 Z'

export const BROW_L = 'M 182,232 C 188,204 234,186 268,191 C 287,194 299,207 297,219 C 296,228 287,231 280,227 C 262,214 226,213 200,236 C 192,243 180,242 182,232 Z'

// Upper beak: a rounded hook between the eyes whose point overhangs the open mouth.
export const BEAK_UPPER = symmetric(
  'M 345,306 C 334,306 324,314 317,328 C 310,342 302,356 300,366 C 308,380 329,393 339,404 C 342,408 345,410 345,410',
)
// The open smile. Its top edge hides under the upper beak; only the corners poke out.
export const MOUTH = symmetric('M 345,386 C 328,382 310,376 291,372 C 297,404 318,428 345,431')
// The lower beak is a crescent lip under the smile: inner edge (mouth side) out to the
// corner, then the outer edge back to the axis.
export const BEAK_LOWER = symmetric(
  'M 345,426 C 322,425 304,404 296,378 C 294,372 288,372 288,378 C 294,414 316,442 345,443',
)

export const SCARF_BAND = symmetric(
  'M 345,514 C 320,506 290,494 254,479 C 230,472 200,466 176,466 C 160,472 150,488 156,500 C 200,508 252,522 302,536 C 324,540 345,540 345,540',
)
export const SCARF_KNOT = symmetric('M 345,499 C 324,498 312,503 308,512 C 302,528 308,548 324,555 C 333,558 345,558 345,558')
export const SCARF_TAIL = 'M 330,540 C 312,560 300,585 306,606 C 315,627 336,646 346,657 C 357,646 377,626 385,604 C 391,583 377,558 360,540 Z'

export const THIGH_L = 'M 222,742 C 214,768 222,794 240,806 C 248,800 256,810 264,810 C 272,802 282,810 290,804 ' +
  'C 300,796 308,800 312,790 C 324,776 328,758 326,742 Z'

export const WING_L = 'M 186,482 C 130,488 80,515 50,555 C 30,582 20,610 18,640 C 50,630 100,640 140,650 ' +
  'C 160,655 172,660 178,665 C 170,620 166,560 170,520 C 173,505 178,492 186,482 Z'
// Feathers hang straight down, fanned a little outward; tips staggered.
// Orange flight feathers, behind the wing (base → tip, width).
export const PRIMARIES_L = [
  [110, 590, 14, 702, 50],
  [128, 600, 56, 756, 56],
  [146, 610, 102, 768, 56],
  [162, 618, 140, 764, 52],
  [176, 626, 166, 738, 36],
]
// Red feathers over them, outer → inner (each overlaps the one before).
export const COVERTS_L = [
  [118, 518, 22, 640, 58],
  [134, 530, 62, 676, 60],
  [150, 540, 104, 704, 60],
  [164, 548, 142, 704, 54],
  [176, 560, 166, 692, 36],
]


// Soft feather texture on the red of the head (left side; mirrored). [x, y]
export const HEAD_FEATHERS_L = [
  [134, 246], [122, 280], [115, 316], [112, 352], [116, 386], [128, 414], [150, 438], [178, 452],
  [214, 160], [258, 154], [302, 152], [186, 182], [234, 178], [282, 176], [318, 196], [328, 226],
]
export const HEAD_FEATHERS_C = [[345, 162], [345, 196]]

export const TOES_L = [
  [232, 832, 150, 876, 52],
  [248, 834, 272, 884, 56],
  [240, 834, 206, 892, 60],
]
