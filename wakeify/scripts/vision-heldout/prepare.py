#!/usr/bin/env python3
"""
Builds the HELD-OUT evaluation set for the photo matcher.

These photos were never used while choosing features, weights or thresholds
(the calibration set lives in src/vision/__fixtures__ and comes from
scikit-image / matplotlib). They are downloaded from the OpenCV repositories:
  - opencv_extra/testdata/stitching: real multi-shot panoramas of the same
    scene with a moved camera (genuine "retake from a slightly different spot")
  - opencv/samples/data: stereo pairs, viewpoint pairs and unrelated photos

Usage:  python3 scripts/vision-heldout/prepare.py <out_dir>
Needs:  pip install pillow numpy
"""
import os, sys, urllib.request
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'heldout-data'
ST = 'https://raw.githubusercontent.com/opencv/opencv_extra/4.x/testdata/stitching/'
SD = 'https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/'
FILES = [ST + f for f in [
    'a1.png', 'a2.png', 'a3.png', 'b1.png', 'b2.png', 's1.jpg', 's2.jpg',
    *[f'boat{i}.jpg' for i in range(1, 7)], *[f'budapest{i}.jpg' for i in range(1, 7)],
    *[f'newspaper{i}.jpg' for i in range(1, 5)]]] + [SD + f for f in [
    'graf1.png', 'graf3.png', 'aero1.jpg', 'aero3.jpg', 'box.png', 'box_in_scene.png',
    'Blender_Suzanne1.jpg', 'Blender_Suzanne2.jpg', 'aloeL.jpg', 'aloeR.jpg',
    'left01.jpg', 'right01.jpg', 'left02.jpg', 'right02.jpg',
    'baboon.jpg', 'fruits.jpg', 'home.jpg', 'building.jpg', 'butterfly.jpg', 'orange.jpg',
    'apple.jpg', 'board.jpg', 'starry_night.jpg', 'messi5.jpg', 'sudoku.png', 'HappyFish.jpg',
    'chicky_512.png', 'smarties.png', 'stuff.jpg', 'pic1.png', 'notes.png']]

W = 128  # the app downsizes to 128 px wide before analysis (src/services/photo.ts)


def save(im, path):
    im = im.convert('RGB')
    h = max(1, round(im.height * W / im.width))
    im.resize((W, h), Image.BILINEAR).save(path, quality=90)


def crop(im, fx, fy, fw, fh):
    w, h = im.size
    return im.crop((int(w * fx), int(h * fy), int(w * (fx + fw)), int(h * (fy + fh))))


def main():
    os.makedirs(os.path.join(OUT, 'raw'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'fx'), exist_ok=True)
    rng = np.random.default_rng(7)
    for url in FILES:
        name = ('st_' if '/stitching/' in url else 'sd_') + url.rsplit('/', 1)[1]
        raw = os.path.join(OUT, 'raw', name)
        if not os.path.exists(raw):
            urllib.request.urlretrieve(url, raw)
        n = name.rsplit('.', 1)[0]
        im = Image.open(raw).convert('RGB')
        fx = lambda v: os.path.join(OUT, 'fx', f'{n}__{v}.jpg')
        save(im, fx('ref'))
        # Synthetic "next morning" variants — identical protocol to the calibration set.
        save(crop(im, 0.08, 0.05, 0.88, 0.9), fx('shift'))
        save(ImageEnhance.Brightness(im).enhance(0.6), fx('dark'))
        save(ImageEnhance.Contrast(ImageEnhance.Brightness(im).enhance(1.3)).enhance(0.85), fx('bright'))
        save(im.rotate(7, resample=Image.BILINEAR).crop(
            (int(im.width * .06), int(im.height * .06), int(im.width * .94), int(im.height * .94))), fx('rot'))
        a = np.asarray(im.filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32) + rng.normal(0, 10, (im.height, im.width, 3))
        save(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), fx('noise'))
        c = ImageEnhance.Brightness(crop(im, 0.0, 0.08, 0.9, 0.9).rotate(-4, resample=Image.BILINEAR)).enhance(0.75)
        save(Image.blend(c, Image.new('RGB', c.size, (255, 200, 150)), 0.12), fx('combo'))
    print('prepared', len(FILES), 'photos in', OUT)


if __name__ == '__main__':
    main()
