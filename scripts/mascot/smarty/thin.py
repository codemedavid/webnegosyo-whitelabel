"""Slim the drawing's outlines before it is segmented and traced.

The sheet's ink lines are heavy. Working at SCALE x, each stroke keeps its centre
line and taper but is eroded from both sides by (1 - RATIO) of its LOCAL half-width
(the deepest ink nearby, smoothed), so tapers stay tapered and edges stay smooth: a
threshold on a distance field, not a per-pixel decision.

The ink given up, and the antialiasing band that used to fringe it, are repainted
from the nearest pixel beyond that band: the fill on each side of the line, or
transparency at the silhouette. Doing this once on the whole drawing (not per part)
means a line between two parts gives each side back its own colour.

Round blobs (the chest buttons, pupils) are not strokes and keep their size, and
nothing in `keep` (the tablet's small print) is touched.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SCALE = 4
INK_MAX_CHANNEL = 72  # same rule as segment.py: brightest channel below this = ink
RATIO = 0.5           # new half-width / old half-width
MIN_HALF_WIDTH = 5    # at SCALE x: strokes this thin (eyelid tips, tapers) stay as they are
REACH = 29            # at SCALE x: window for a stroke's local half-width
BAND = 6              # at SCALE x: the antialiasing band around ink, which never donates colour
BLOB = 9              # a component with area < BLOB * half-width^2 is a blob, not a stroke


def _resize(a, size, resample):
    return np.array(Image.fromarray(a).resize(size, resample))


def _strokes(ink):
    """Ink minus the round blobs."""
    labels, n = ndi.label(ink)
    if not n:
        return ink
    depth = ndi.distance_transform_edt(ink)
    idx = range(1, n + 1)
    area = ndi.sum(ink, labels, idx)
    half = ndi.maximum(depth, labels, idx)
    blob = np.concatenate([[False], np.asarray(area) < BLOB * np.square(half)])
    return ink & ~blob[labels]


def _slim(big, keep):
    solid = big[..., 3] > 127
    ink = solid & (big[..., :3].max(-1) < INK_MAX_CHANNEL)
    strokes = _strokes(ink) & ~keep
    depth = ndi.distance_transform_edt(strokes)
    half = ndi.gaussian_filter(ndi.grey_dilation(depth, size=REACH), REACH / 3)
    target = np.maximum(half * RATIO, np.minimum(half, MIN_HALF_WIDTH))
    # A thin line next to a thick one borrows its neighbour's half-width; the centre line
    # (ridge of the distance field) and MIN_HALF_WIDTH around it are never given up.
    ridge = strokes & (depth >= ndi.maximum_filter(depth, 3))
    core = ndi.distance_transform_edt(~ridge) < MIN_HALF_WIDTH
    freed = strokes & ~core & (depth <= half - target)

    near_ink = ndi.distance_transform_edt(~ink)
    clear = big[..., 3] == 0
    # Only the band along an edge that moved; a thin line left as drawn keeps its own blend.
    near_freed = ndi.distance_transform_edt(~freed) <= BAND if freed.any() else np.zeros_like(freed)
    band = ~ink & ~clear & ~keep & (near_ink <= BAND) & near_freed
    donor = (clear | (near_ink > BAND)) & ~freed
    _, (ny, nx) = ndi.distance_transform_edt(~donor, return_indices=True)
    repaint = freed | band
    out = big.copy()
    out[repaint] = big[ny[repaint], nx[repaint]]
    return out, repaint


def slim_outlines(a, keep=None):
    """a: RGBA drawing; keep: same-size mask left untouched. Returns a new RGBA array."""
    h, w = a.shape[:2]
    big = _resize(a, (w * SCALE, h * SCALE), Image.LANCZOS)
    big_keep = np.zeros(big.shape[:2], bool) if keep is None else _resize(
        (keep * 255).astype(np.uint8), (w * SCALE, h * SCALE), Image.NEAREST) > 0
    slim, repaint = _slim(big, big_keep)
    # Only pixels the slimming touched change; the round trip through SCALE x would soften the rest.
    touched = _resize((repaint * 255).astype(np.uint8), (w, h), Image.BOX) > 0
    return np.where(touched[..., None], _resize(slim, (w, h), Image.BOX), a)
