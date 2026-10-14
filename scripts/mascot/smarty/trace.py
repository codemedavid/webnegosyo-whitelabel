"""Snap a part layer to the drawing's flat palette and trace it to SVG paths."""
import os
import re
import numpy as np
import vtracer
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SCALE = 4  # trace at 4x: smoother curves, then scale back to viewBox units

# The artist's flat colours (antialiasing blends are left out on purpose).
PALETTE = ['#FCF9F5', '#E9E1DE', '#EE0E17', '#D60D14', '#FCB119', '#FAC24E', '#FDDB8D', '#DD8C14',
           '#4F2606', '#834A09', '#B76C0B', '#2B0E05', '#17100C', '#F07070', '#F7ADAB',
           '#4C423E', '#7A706C', '#A19A97', '#C6C1BD']
PAL = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in PALETTE], float)
BROWNS = {'#4F2606', '#834A09', '#B76C0B'}
PINKS = {'#F07070', '#F7ADAB'}
WHITES = {'#FCF9F5', '#E9E1DE'}
INKS = {'#2B0E05', '#17100C'}
GREYS = {'#4C423E', '#7A706C', '#A19A97', '#C6C1BD'}  # only the tablet's small print
# A blend pixel may only snap to a colour its part really has (else red|white edges go pink).
EXCLUDE = {
    'tablet-arm': BROWNS | PINKS | {'#FAC24E'},
    'beak': BROWNS | {'#FCF9F5', '#E9E1DE'},
    'hat': BROWNS | PINKS | {'#EE0E17', '#D60D14'},
    'body': BROWNS, 'head': BROWNS | PINKS, 'wing-right': BROWNS | PINKS,
    'leg-left': BROWNS | PINKS | WHITES, 'leg-right': BROWNS | PINKS | WHITES,  # no white on the feet
    'brow-left': BROWNS | PINKS, 'brow-right': BROWNS | PINKS,
    'eye-left': PINKS | {'#FDDB8D', '#FAC24E'}, 'eye-right': PINKS | {'#FDDB8D', '#FAC24E'},
}
SCREEN = [(64, 291), (209, 270), (242, 459), (105, 484)]  # tablet screen (viewBox units)
MAJORITY_WINDOW = {'tablet-arm': 3}  # at 4x; wipes the blend bands between fills
DEFAULT_WINDOW = 7
EDGE_WINDOW = 5      # at 4x
EDGE_SPREAD = 36     # channel spread above which a pixel is an edge blend
EXACT = 24           # an edge pixel this close to a palette colour simply IS that colour
NEIGHBOURHOOD = 17   # at 4x: where an edge pixel looks for the flat colours it lies between
NO_SEAM = {'tablet-arm'}  # the seam stroke would bloat the tablet's small print
FINE = {'tablet-arm', 'beak', 'eye-left', 'eye-right'}
COARSE_OPTS = dict(filter_speckle=12, color_precision=8, layer_difference=1)
FINE_OPTS = dict(filter_speckle=6, color_precision=8, layer_difference=1)


def _distances(rgb, banned):
    d = ((rgb[:, :, None] - PAL[None, None]) ** 2).sum(-1)
    d[..., np.array([h in banned for h in PALETTE])] = np.inf
    return d


def screen_zone(h, w):
    """The tablet screen at 4x, as a mask."""
    zone = Image.new('L', (w, h), 0)
    ImageDraw.Draw(zone).polygon([(x * SCALE, y * SCALE) for x, y in SCREEN], fill=1)
    return np.array(zone, bool)


def _blends(rgb, solid):
    """Pixels on a colour edge (antialiasing), by the spread of colour around them."""
    spread = np.zeros(rgb.shape[:2])
    for ch in range(3):
        c = rgb[..., ch]
        spread = np.maximum(spread, ndi.maximum_filter(c, EDGE_WINDOW) - ndi.minimum_filter(c, EDGE_WINDOW))
    return solid & (spread > EDGE_SPREAD)


def _no_inbetweens(dist, solid, blend):
    """Snap, but an edge pixel may only take a colour found flat nearby: the blend between
    red and white must become red or white, never the pink or grey that lies between them."""
    idx = dist.argmin(-1)
    flat = solid & ~blend
    out = dist.copy()
    for k, hexcode in enumerate(PALETTE):
        if hexcode in INKS:  # ink is the darkest colour, never a blend between two others
            continue
        nearby = ndi.maximum_filter((idx == k) & flat, NEIGHBOURHOOD)
        out[blend & ~nearby & (dist[..., k] > EXACT ** 2), k] = np.inf
    dist = out
    choice = dist.argmin(-1)
    stuck = blend & np.isinf(dist.min(-1))  # nothing flat nearby: plain snap
    return np.where(stuck, idx, choice)


def flatten(a, name, collar):
    """Snap every pixel to the palette, then give each pixel its neighbourhood's majority."""
    solid = a[..., 3] > 0
    ys, xs = np.where(solid)
    y0, y1, x0, x1 = max(ys.min() - 8, 0), ys.max() + 9, max(xs.min() - 8, 0), xs.max() + 9
    rgb = a[y0:y1, x0:x1, :3].astype(float)
    dist = _distances(rgb, EXCLUDE.get(name, set()) | GREYS)
    c = collar[y0:y1, x0:x1]  # the collar shows the part behind: any colour but grey
    dist[c] = _distances(rgb, GREYS)[c]
    if name == 'tablet-arm':
        zone = screen_zone(*a.shape[:2])[y0:y1, x0:x1] & ~c
        dist[zone] = _distances(rgb, EXCLUDE[name])[zone]
    sol = solid[y0:y1, x0:x1]
    blend = _blends(rgb, sol)
    if name == 'tablet-arm':
        blend &= ~screen_zone(*a.shape[:2])[y0:y1, x0:x1]  # small print is all edge; leave it
    idx = _no_inbetweens(dist, sol, blend)
    best, arg = np.full(idx.shape, -1.0), np.zeros(idx.shape, int)
    for k in range(len(PAL)):
        share = ndi.uniform_filter(((idx == k) & sol).astype(float), MAJORITY_WINDOW.get(name, DEFAULT_WINDOW))
        better = share > best
        best[better] = share[better]
        arg[better] = k
    out = a.copy()
    out[y0:y1, x0:x1, :3] = np.where(sol[..., None], PAL[arg], 0).astype(np.uint8)
    # The collar has done its job (the part's own edge is now a smooth colour edge); what
    # is still collar-coloured goes, so the part ends at that edge and the part behind,
    # which runs on underneath, shows instead. Traced, the collar left a hairline ring.
    # Ink stays: it is the line the part sits on, which the part behind may not reach.
    ink = np.isin(arg, [PALETTE.index(h) for h in INKS])
    out[y0:y1, x0:x1, 3] = np.where(c & (arg == idx) & ~ink, 0, out[y0:y1, x0:x1, 3])
    return out


def _fmt(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def _paths(svg_text, seam):
    out = []
    pattern = r'<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"\s*/>'
    for d, fill, tx, ty in re.findall(pattern, svg_text):
        rgb = np.array([int(fill[i:i + 2], 16) for i in (1, 3, 5)], float)
        fill = PALETTE[int(((PAL - rgb) ** 2).sum(-1).argmin())]  # vtracer averages; snap back
        res, axis = [], 0
        for tok in re.findall(r'[MLCZ]|-?\d+(?:\.\d+)?', d):
            if tok in 'MLCZ':
                res.append(tok)
                axis = 0
                continue
            res.append(_fmt((float(tok) + (float(tx) if axis % 2 == 0 else float(ty))) / SCALE))
            axis += 1
        path = re.sub(r'([MLCZ]) ', r'\1', ' '.join(res)).replace(' Z', 'Z')
        stroke = f' stroke="{fill}"' if seam else ''  # see SEAM in build_smarty.py
        out.append((fill in INKS, f'<path fill="{fill}"{stroke} d="{path}"/>'))
    if seam:  # cutout shapes don't overlap, so ink may go last: no fill's seam stroke eats a thin line
        out.sort(key=lambda p: p[0])
    return [p for _, p in out]


def trace_layer(layer, collar, name, workdir):
    """layer: RGBA at viewBox scale -> list of <path> strings in viewBox units."""
    if not layer[..., 3].any():
        return []
    img = Image.fromarray(layer)
    big = np.array(img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS))
    big[..., 3] = np.where(big[..., 3] >= 128, 255, 0)
    collar_img = Image.fromarray((collar * 255).astype(np.uint8))
    big_collar = np.array(collar_img.resize((img.width * SCALE, img.height * SCALE), Image.BILINEAR)) > 127
    big = flatten(big, name, big_collar)
    src, dst = os.path.join(workdir, f'{name}.png'), os.path.join(workdir, f'{name}.svg')
    Image.fromarray(big).save(src)
    # Cutout: shapes never overlap, so no shape's antialiased edge shows the one under it
    # (stacked shapes share their outer edge and fringe it); the seam stroke closes the
    # joins. The tablet's small print keeps stacking, which needs no seam.
    vtracer.convert_image_to_svg_py(src, dst, colormode='color', mode='spline',
                                    hierarchical='stacked' if name in NO_SEAM else 'cutout',
                                    corner_threshold=60, length_threshold=6.0, max_iterations=10,
                                    splice_threshold=45, path_precision=2,
                                    **(FINE_OPTS if name in FINE else COARSE_OPTS))
    with open(dst) as f:
        return _paths(f.read(), seam=name not in NO_SEAM)
