#!/usr/bin/env python3
"""
Builds Smarty, the SmartMenu mascot (a flat, cel-style owl): the hero pose from
character-sheet.png, holding the tablet with a thumbs up, as a rigged SVG for animation:

    public/assistant/smarty.svg

The drawing is traced, not redrawn, so its shapes match the sheet; it is split into
parts first (segment.py) so each part can move without opening holes. The viewBox
(0 0 544 592) is the crop's pixel grid on the sheet (extract.py). On the way it is
cleaned up, not copied blindly:
  - outlines are slimmed to about half their drawn weight (thin.py);
  - edge pixels snap only to colours flat nearby, so no grey/pink rings (trace.py);
  - shapes are traced as non-overlapping cutouts with a SEAM stroke, so no hairlines;
  - the palette is swapped for brighter twins (VIVID).

    pip install vtracer pillow numpy scipy
    python3 scripts/mascot/smarty/build_smarty.py

Rig: every part is <g id="X" class="s-X"> with its pivot set inline as
transform-origin and no transform attribute (same contract as build-owl-svg.mjs).
Parts flagged hidden start at opacity 0 — expression variants a state reveals.
"""
import os
import re
import sys
import tempfile
import numpy as np
from scipy.ndimage import binary_dilation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import extract_smarty  # noqa: E402
from segment import segment, poly, W, H  # noqa: E402
from thin import slim_outlines  # noqa: E402
from trace import trace_layer, SCREEN  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
SHEET = os.path.join(HERE, 'character-sheet.png')
OUT = os.path.join(ROOT, 'public/assistant/smarty.svg')

INK = '#2B0E05'
# Measured on the drawing: bounding boxes of each iris, pupil and highlight.
IRIS = {
    'left': dict(cx=238, cy=223.5, rx=33, ry=34.5, px=238, py=223.5, prx=24, pry=26.5, hx=248.5, hy=208, hr=8.3),
    'right': dict(cx=357.5, cy=237, rx=30.5, ry=34, px=356.5, py=237, prx=23.5, pry=26, hx=367, hy=222, hr=8),
}
EYE = {'left': (228, 215, 40), 'right': (369, 229, 40)}  # centre x, y and half-width for the swaps

# Pivots (viewBox units). None = a plain container.
RIG = {
    'figure': (280, 578), 'shadow': (280, 561), 'leg-left': (195, 505), 'leg-right': (352, 512),
    'upper': (290, 520), 'body': (290, 520), 'wing-right': (398, 362), 'head': (292, 338),
    'head-base': None, 'brow-left': (232, 143), 'brow-right': (382, 156),
    'eye-left': (228, 215), 'iris-left': (238, 223), 'eye-right': (369, 229), 'iris-right': (357, 237),
    'eye-closed-left': (228, 222), 'eye-closed-right': (369, 236),
    'eye-happy-left': (228, 215), 'eye-happy-right': (369, 229),
    'beak': (294, 232), 'beak-closed': (294, 232), 'hat': (305, 104), 'tablet-arm': (120, 400),
    'sparks': (505, 222), 'fx': None, 'fx-dots': (470, 46), 'fx-sweat': (102, 176), 'fx-zz': (490, 46),
    'fx-confetti': (280, 120),
}
HIDDEN = {'eye-closed-left', 'eye-closed-right', 'eye-happy-left', 'eye-happy-right', 'beak-closed',
          'fx-dots', 'fx-sweat', 'fx-zz', 'fx-confetti'}
TABLET_BEZEL = 16  # px around the screen polygon that slim_outlines leaves alone
# Traced paths are stroked in their own fill this wide, so the antialiased edges of
# abutting shapes overlap instead of letting the background show through as hairlines.
SEAM = 0.6
# The sheet's colours are a little dull; the traced palette is snapped to these
# brighter twins as the last step (keys: the sheet's colours, as trace.py snaps them).
VIVID = {
    '#EE0E17': '#FF1220', '#D60D14': '#DB0019',                          # reds
    '#FCB119': '#FFB400', '#FAC24E': '#FFC93C', '#FDDB8D': '#FFE38F', '#DD8C14': '#F58A00',  # golds
    '#4F2606': '#4A1E00', '#834A09': '#8A4500', '#B76C0B': '#CC7000',    # browns
    '#F07070': '#FF5A6A', '#F7ADAB': '#FFA0A8',                          # tongue
    '#FCF9F5': '#FFFCF8', '#E9E1DE': '#F2E4E0',                          # whites
    '#4B250A': '#3F1C00', '#74400D': '#7A3A00', '#AD650C': '#C46A00', '#CF8A28': '#F2A21C',  # iris
    '#8ED3F5': '#5CC8FF',                                                # sweat drop
}
STATES_CSS = os.path.join(HERE, 'smarty-states.css')


def g(part, *children):
    attrs = [f'id="{part}"', f'class="s-{part}"']
    pivot = RIG[part]
    if pivot:
        attrs.append(f'style="transform-origin:{pivot[0]}px {pivot[1]}px"')
    if part in HIDDEN:
        attrs.append('opacity="0"')
    return f'<g {" ".join(attrs)}>\n' + '\n'.join(c for c in children if c) + '\n</g>'


def iris(side):
    i = IRIS[side]
    return '\n'.join([
        f'<ellipse cx="{i["cx"]}" cy="{i["cy"]}" rx="{i["rx"]}" ry="{i["ry"]}" fill="url(#smarty-iris)"/>',
        f'<ellipse cx="{i["px"]}" cy="{i["py"]}" rx="{i["prx"]}" ry="{i["pry"]}" fill="#17100C"/>',
        f'<circle class="s-glint" cx="{i["hx"]}" cy="{i["hy"]}" r="{i["hr"]}" fill="#FFFFFF"/>',
    ])


def stroke(d, width=5):  # matches the slimmed outlines
    return f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{width}" stroke-linecap="round"/>'


def closed_eye(side):
    x, y, w = EYE[side]
    return stroke(f'M{x - w},{y + 4} Q{x},{y + 26} {x + w},{y + 4}')


def happy_eye(side):
    x, y, w = EYE[side]
    return stroke(f'M{x - w + 6},{y + 16} Q{x},{y - 22} {x + w - 6},{y + 16}', 5.5)


def closed_beak():
    """The beak with the mouth shut; the traced beak (open, smiling) hides when this shows."""
    return '\n'.join([
        '<path fill="#FCB119" d="M298,219 C284,221 266,240 256,256 C263,268 279,284 292,298 '
        'C304,284 321,272 334,265 C328,247 314,222 298,219Z"/>',
        '<path fill="#DD8C14" d="M266,266 C276,276 286,288 292,298 C300,288 314,276 326,268 '
        'C314,272 302,278 293,286 C285,280 276,272 266,266Z"/>',
        '<ellipse cx="292" cy="236" rx="11" ry="6" fill="#FDDB8D" transform="rotate(-24 292 236)"/>',
        f'<path d="M268,262 Q293,276 322,266" fill="none" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>',
    ])


def thought_dots():
    return '\n'.join(
        f'<circle class="s-dot" cx="{x}" cy="{y}" r="{r}" fill="#FCF9F5" stroke="{INK}" stroke-width="3"/>'
        for x, y, r in [(440, 62, 7), (470, 44, 9), (504, 22, 11)])


def sweat_drop():
    return '\n'.join([
        f'<path d="M102,158 C96,168 90,178 90,186 C90,194 95,199 102,199 C109,199 114,194 114,186 '
        f'C114,178 108,168 102,158Z" fill="#8ED3F5" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>',
        '<ellipse cx="97.5" cy="185" rx="3" ry="5" fill="#FFFFFF"/>',
    ])


def sleepy_z():
    def z(x, y, size, cls):
        d = f'M{x},{y} h{size} l{-size},{size} h{size}'
        return (f'<g class="{cls}"><path d="{d}" fill="none" stroke="#FCF9F5" stroke-width="{size / 4 + 4:.1f}" '
                f'stroke-linecap="round" stroke-linejoin="round"/><path d="{d}" fill="none" stroke="{INK}" '
                f'stroke-width="{size / 4:.1f}" stroke-linecap="round" stroke-linejoin="round"/></g>')
    return '\n'.join([z(446, 70, 16, 's-z1'), z(474, 34, 22, 's-z2'), z(508, -6, 28, 's-z3')])


CONFETTI = [  # x, y, shape, colour — scattered over the head; they fall when celebrating
    (70, 40, 'r', '#EE0E17'), (120, -10, 'c', '#FCB119'), (165, 30, 'r', '#FCB119'), (205, -30, 'c', '#EE0E17'),
    (250, 10, 'r', '#FDDB8D'), (300, -40, 'r', '#EE0E17'), (345, 20, 'c', '#FCB119'), (390, -20, 'r', '#FCB119'),
    (430, 35, 'c', '#EE0E17'), (470, -5, 'r', '#FDDB8D'), (515, 50, 'r', '#EE0E17'), (35, 110, 'c', '#FCB119'),
    (520, 130, 'c', '#FCB119'), (150, 80, 'c', '#FDDB8D'),
]


def confetti():
    out = []
    for i, (x, y, shape, fill) in enumerate(CONFETTI):
        piece = (f'<rect x="{x - 4}" y="{y - 8}" width="8" height="16" rx="2" fill="{fill}" stroke="{INK}" stroke-width="1.8"/>'
                 if shape == 'r' else
                 f'<circle cx="{x}" cy="{y}" r="6" fill="{fill}" stroke="{INK}" stroke-width="1.8"/>')
        out.append(f'<g class="s-piece" style="--i:{i}">{piece}</g>')
    return '\n'.join(out)


def white_under_iris(layer, side):
    """The traced eye runs plain white where the drawn iris sits, so the iris can move."""
    i = IRIS[side]
    yy, xx = np.mgrid[:H, :W]
    inside = ((xx + .5 - i['cx']) / (i['rx'] + 2)) ** 2 + ((yy + .5 - i['cy']) / (i['ry'] + 2)) ** 2 <= 1
    out = layer.copy()
    out[inside & (layer[..., 3] > 0)] = [252, 249, 245, 255]
    return out


def main():
    # The tablet's bezel and small print are a device, not a drawn outline: left as drawn.
    drawing = slim_outlines(extract_smarty(SHEET), keep=binary_dilation(poly(SCREEN), iterations=TABLET_BEZEL))
    layers, sparks, shadow = segment(drawing)
    for side in ('left', 'right'):
        layer, collar = layers[f'eye-{side}']
        layers[f'eye-{side}'] = (white_under_iris(layer, side), collar)

    with tempfile.TemporaryDirectory() as work:
        art = {name: '\n'.join(trace_layer(layer, collar, name, work)) for name, (layer, collar) in layers.items()}
        art['sparks'] = '\n'.join(trace_layer(sparks, np.zeros((H, W), bool), 'sparks', work))

    ys, xs = np.nonzero(shadow)
    shadow_el = (f'<ellipse id="shadow" class="s-shadow" style="transform-origin:{RIG["shadow"][0]}px '
                 f'{RIG["shadow"][1]}px" cx="{(xs.min() + xs.max() + 1) / 2}" cy="{(ys.min() + ys.max() + 1) / 2}" '
                 f'rx="{(xs.max() - xs.min() + 1) / 2}" ry="{(ys.max() - ys.min() + 1) / 2}" fill="#E8E2E0"/>')

    head = g('head',
             g('head-base', art['head']),
             g('brow-left', art['brow-left']), g('brow-right', art['brow-right']),
             g('eye-left', art['eye-left'], g('iris-left', iris('left'))),
             g('eye-right', art['eye-right'], g('iris-right', iris('right'))),
             g('eye-closed-left', closed_eye('left')), g('eye-closed-right', closed_eye('right')),
             g('eye-happy-left', happy_eye('left')), g('eye-happy-right', happy_eye('right')),
             g('beak', art['beak']), g('beak-closed', closed_beak()), g('hat', art['hat']))
    upper = g('upper', g('body', art['body']), g('wing-right', art['wing-right']), head,
              g('tablet-arm', art['tablet-arm']))
    effects = g('fx', g('fx-dots', thought_dots()), g('fx-sweat', sweat_drop()), g('fx-zz', sleepy_z()),
                g('fx-confetti', confetti()))
    figure = g('figure', shadow_el, g('leg-left', art['leg-left']), g('leg-right', art['leg-right']), upper,
            g('sparks', art['sparks']), effects)
    with open(STATES_CSS) as f:
        states_css = f.read().strip()
    # Inlined into HTML, an SVG <style> is parsed as markup, so its CSS must hold no angle brackets.
    assert '<' not in states_css and '>' not in states_css, 'smarty-states.css must not contain < or >'

    rig_list = '\n'.join(
        f'      {k:<18} ' + (f'pivot {v[0]} {v[1]}' if v else '(container)') + (', starts hidden' if k in HIDDEN else '')
        for k, v in RIG.items())
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" class="smarty" data-state="idle" viewBox="0 0 {W} {H}" width="{W}" height="{H}" stroke-width="{SEAM}" stroke-linejoin="round" role="img" aria-labelledby="smarty-title" overflow="visible">
<title id="smarty-title">Smarty, the SmartMenu mascot</title>
<!--
  GENERATED by scripts/mascot/smarty/build_smarty.py from character-sheet.png
  and smarty-states.css — edit those, not this file.

  Every rigged part is <g id="X" class="s-X"> with its pivot as an inline
  transform-origin; no rigged group carries a transform attribute. Parts:
{rig_list}

  States: set data-state on the <svg> to idle | happy | thinking | waiting |
  sorry | celebrating | sleeping (animations in smarty-states.css, embedded below).
-->
<style>
{states_css}
</style>
<defs>
<linearGradient id="smarty-iris" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#4B250A"/><stop offset=".45" stop-color="#74400D"/><stop offset=".8" stop-color="#AD650C"/><stop offset="1" stop-color="#CF8A28"/>
</linearGradient>
</defs>
{figure}
</svg>
'''
    svg = re.sub(r'#[0-9A-Fa-f]{6}\b', lambda m: VIVID.get(m.group(0).upper(), m.group(0)), svg)
    with open(OUT, 'w') as f:
        f.write(svg)
    print(f'wrote {OUT} ({len(svg) // 1024} KB, {svg.count("<path")} paths)')


if __name__ == '__main__':
    main()
