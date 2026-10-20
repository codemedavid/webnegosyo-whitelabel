"""Cut Smarty, the hero owl (with its tablet and spark marks) out of the character sheet."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# The hero pose sits top-left on character-sheet.png. The crop's pixel grid IS the
# SVG viewBox (0 0 544 592), so every coordinate in segment.py is in these units.
CROP = (42, 70, 586, 662)  # x0, y0, x1, y1 on the sheet
SEEDS = [(330, 450), (540, 280), (560, 310)]  # (x, y) on the sheet: owl body + both spark marks
MIN_ALPHA = 40


def extract_smarty(sheet_path):
    sheet = np.array(Image.open(sheet_path).convert('RGBA'))
    pieces, _ = ndi.label(sheet[..., 3] > MIN_ALPHA, structure=np.ones((3, 3)))
    keep = np.isin(pieces, [pieces[y, x] for x, y in SEEDS])
    keep = ndi.binary_dilation(keep, iterations=2)  # keep the antialiased fringe
    owl = np.where(keep[..., None], sheet, 0).astype(np.uint8)
    x0, y0, x1, y1 = CROP
    return owl[y0:y1, x0:x1]
