"""
Split the flat owl into rig parts.

Every opaque pixel gets exactly one part. Rough polygons say where each part is;
the drawing itself says where the edges are:
  - a flat colour area bounded by ink goes wholly to the part covering >= 90% of it,
    otherwise it is cut by the polygons (only taking the colour families in CUT);
  - ink (outlines, pupils, buttons) goes to the front-most part next to it whose
    polygon contains it, so a front part owns the outline it shares with a back part;
  - brows are just the biggest ink stroke in their box.

Each part's layer also gets:
  - an UNDERLAP: the area of its polygon hidden by parts in front, filled from its
    own flat interior, so moving a front part never opens a hole;
  - a 2px COLLAR of the part behind, so its own edge is traced from the drawing's
    smooth colour edge (trace.py then drops what is still collar-coloured, keeping
    any ink there: the outline the front part sits on).
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

W, H = 544, 592


def poly(points):
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).polygon(points, fill=1)
    return np.array(mask, bool)


def ellipse(cx, cy, rx, ry):
    yy, xx = np.mgrid[:H, :W]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


# Back to front. 'region' = polygon snapped to the drawing; 'ink' = a dark stroke in the box.
# The irises are drawn as shapes (build_smarty.py), so the eye layers run white under them.
PARTS = [
    ('leg-left', 'region', poly([(112, 478), (272, 478), (272, 590), (105, 590)])),
    ('leg-right', 'region', poly([(286, 478), (445, 478), (445, 590), (286, 590)])),
    ('body', 'region', poly([(132, 318), (448, 318), (452, 470), (390, 505), (350, 520), (300, 526),
                             (250, 517), (190, 496), (132, 470)])),
    ('wing-right', 'region', poly([(383, 337), (430, 352), (467, 318), (470, 258), (514, 254), (538, 300),
                                   (538, 420), (512, 445), (500, 472), (470, 503), (440, 508), (398, 507),
                                   (392, 497), (401, 483), (407, 437), (405, 400), (389, 361), (381, 348)])),
    ('head', 'region', poly([(105, 40), (505, 40), (505, 200), (480, 236), (469, 248), (461, 274), (450, 298),
                             (440, 322), (388, 344), (330, 351), (290, 351), (250, 346), (200, 331),
                             (160, 311), (100, 270)])),
    ('brow-left', 'ink', poly([(178, 118), (275, 118), (275, 164), (178, 164)])),
    ('brow-right', 'ink', poly([(338, 134), (428, 134), (428, 175), (338, 175)])),
    ('eye-left', 'region', ellipse(228, 215, 52, 50)),
    ('eye-right', 'region', ellipse(369, 229, 51, 48)),
    ('beak', 'region', poly([(298, 217), (283, 225), (266, 244), (253, 257), (257, 267), (265, 286),
                             (279, 308), (292, 318), (306, 306), (319, 283), (327, 273), (335, 266),
                             (331, 257), (319, 237), (307, 221)])),
    ('hat', 'region', poly([(195, 99), (197, 80), (220, 55), (260, 38), (282, 33), (282, 6), (338, 6),
                            (338, 33), (370, 45), (398, 70), (417, 112), (415, 127), (380, 120),
                            (300, 107), (240, 104)])),
    ('tablet-arm', 'region', poly([(49, 279), (216, 254), (224, 261), (254, 468), (250, 477), (104, 500),
                                   (106, 522), (60, 526), (3, 505), (3, 400), (40, 361), (60, 354)])),
]
NAMES = [name for name, _, _ in PARTS]
Z = {name: z for z, name in enumerate(NAMES)}

# Flat colour families sampled from the drawing (k-means over its opaque pixels).
FAMILIES = {
    'white': ['#fcf8f3', '#fdfcfc', '#e9e1de', '#c6c1bd'],
    'red': ['#ee0e17', '#d60d14', '#9a0f0f', '#ee3c39'],
    'yellow': ['#fcb119', '#fddb8d', '#fac24e', '#dd8c14'],
    'ink': ['#2b0e05', '#160b07', '#201614', '#4c423e', '#600a08'],
    'brown': ['#4f2606', '#b76c0b', '#834a09'],
    'pink': ['#f07070', '#f7adab'],
    'grey': ['#7a706c', '#a19a97'],
}
FAMILY_INDEX = {name: i for i, name in enumerate(FAMILIES)}
# Families a polygon may cut out of an area it shares (no part listed = any family).
CUT = {'beak': ['yellow', 'pink', 'red'], 'tablet-arm': [], 'hat': ['yellow'],
       'eye-left': ['white', 'brown', 'grey'], 'eye-right': ['white', 'brown', 'grey']}
INK_MAX_CHANNEL = 72   # brightest channel below this = ink
INK_REACH = {'tablet-arm': 12}  # the tablet frame is ~9px of ink around the screen
DEFAULT_INK_REACH = 6
MAJORITY = 0.9
SEED_EROSION = 3
COLLAR = 2
SHADOW_RIM = 8
SHADOW_TOP = 540


def colour_families(rgb):
    centres, owner = [], []
    for i, hexes in enumerate(FAMILIES.values()):
        for h in hexes:
            centres.append([int(h[j:j + 2], 16) for j in (1, 3, 5)])
            owner.append(i)
    d2 = ((rgb[:, :, None, :] - np.array(centres)[None, None]) ** 2).sum(-1)
    return np.array(owner)[d2.argmin(-1)]


def shadow_mask(rgb, solid):
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    grey = solid & (np.abs(rgb[..., 0] - rgb[..., 2]) < 16) & (lum > 195) & (lum < 240)
    grey[:525] = False
    pieces, n = ndi.label(grey)
    sizes = ndi.sum(grey, pieces, range(1, n + 1))
    shadow = np.isin(pieces, [i + 1 for i, s in enumerate(sizes) if s > 40])
    # Its soft rim (and the blend where a foot meets it) is shadow too, not a sliver of foot.
    pale = solid & (rgb.max(-1) - rgb.min(-1) < 64) & (lum > 150)  # light and greyish; feet are gold
    pale[:SHADOW_TOP] = False  # the body's white is pale too
    return shadow | (ndi.binary_dilation(shadow, iterations=SHADOW_RIM) & pale)


def spark_mask(solid):
    pieces, n = ndi.label(solid, structure=np.ones((3, 3)))
    main = np.argmax(ndi.sum(solid, pieces, range(1, n + 1))) + 1
    return solid & (pieces != main)


def label_areas(open_area, family):
    coarse = np.full((H, W), -1)
    cut = np.full((H, W), -1)
    for name, kind, mask in PARTS:
        if kind != 'region':
            continue
        coarse[mask] = Z[name]
        fams = CUT.get(name)
        cut[mask if fams is None else mask & np.isin(family, [FAMILY_INDEX[f] for f in fams])] = Z[name]

    label = np.full((H, W), -1)
    for f in range(len(FAMILIES)):
        pieces, _ = ndi.label(open_area & (family == f))
        for i, box in enumerate(ndi.find_objects(pieces), 1):
            piece = pieces[box] == i
            votes = coarse[box][piece]
            votes = votes[votes >= 0]
            if votes.size == 0:
                continue
            counts = np.bincount(votes, minlength=len(NAMES))
            view = label[box]
            view[piece] = counts.argmax() if counts.max() >= MAJORITY * votes.size else cut[box][piece]
    return label


def label_ink(label, ink):
    raw = {name: mask for name, _, mask in PARTS}
    best = np.full((H, W), -1)
    fallback = np.full((H, W), -1)
    for z, name in enumerate(NAMES):
        near = ndi.binary_dilation(label == z, iterations=INK_REACH.get(name, DEFAULT_INK_REACH)) & ink
        fallback[near] = z
        best[near & raw[name]] = z
    out = label.copy()
    out[ink] = np.where(best[ink] >= 0, best[ink], fallback[ink])
    for name, kind, mask in PARTS:
        if kind == 'ink':
            strokes, n = ndi.label(ink & mask)
            if n:
                out[strokes == np.argmax(ndi.sum(ink & mask, strokes, range(1, n + 1))) + 1] = Z[name]
    return out


def segment(owl):
    """owl: RGBA crop -> (layers {name: (rgba, collar_mask)}, sparks rgba, shadow mask)."""
    im = owl.astype(np.int32)
    rgb, alpha = im[..., :3], im[..., 3]
    solid = alpha > 8
    ink = solid & (rgb.max(2) < INK_MAX_CHANNEL)
    family = colour_families(rgb)
    shadow = shadow_mask(rgb, solid)
    sparks = spark_mask(solid)

    label = label_areas(solid & ~ink & ~shadow & ~sparks, family)
    label = label_ink(label, ink & ~sparks)
    rest = solid & (label < 0) & ~shadow & ~sparks
    if rest.any():
        _, (iy, ix) = ndi.distance_transform_edt(label < 0, return_indices=True)
        label[rest] = label[iy[rest], ix[rest]]

    flat = solid & ~ink
    raw = {name: mask for name, _, mask in PARTS}
    layers = {}
    for name, kind, mask in PARTS:
        z = Z[name]
        own = label == z
        under = (mask & (label > z)) if kind == 'region' else np.zeros_like(own)
        if name == 'head':  # the face runs on behind the brows
            under |= np.isin(label, [Z['brow-left'], Z['brow-right']]) & (raw['brow-left'] | raw['brow-right'])
        layer = np.zeros((H, W, 4), np.uint8)
        layer[own] = owl[own]
        collar = ndi.binary_dilation(own, iterations=COLLAR) & ~own & (label >= 0) & (label < z)
        layer[collar, :3] = owl[collar, :3]
        layer[collar, 3] = 255
        seed = ndi.binary_erosion(own & flat, iterations=SEED_EROSION)
        if seed.sum() < 50:
            seed = own & flat
        if under.any() and seed.any():
            _, (iy, ix) = ndi.distance_transform_edt(~seed, return_indices=True)
            layer[under, :3] = owl[iy[under], ix[under], :3]
            layer[under, 3] = 255
        layers[name] = (layer, collar)

    spark_layer = np.zeros((H, W, 4), np.uint8)
    spark_layer[sparks] = owl[sparks]
    return layers, spark_layer, shadow
