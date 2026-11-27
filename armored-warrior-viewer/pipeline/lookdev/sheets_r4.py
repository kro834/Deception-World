# Round-4 comparison sheets and before / after crops. Run with: python3 -I pipeline/lookdev/sheets_r4.py <scratchpad>
import os, sys
from PIL import Image, ImageDraw

SP = sys.argv[1].rstrip('/') + '/shots/'
R4 = SP + 'lookdev-r4/'
os.makedirs(R4 + 'before-after', exist_ok=True)


def row(out, items, height=None, max_width=2400, scale=1):
    """items: [(label, path, crop-or-None)] -> one row, labelled."""
    tiles = []
    for label, path, crop in items:
        if not os.path.exists(path):
            print('missing', path)
            continue
        im = Image.open(path).convert('RGB')
        if crop:
            im = im.crop(crop)
        if scale != 1:
            im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        tiles.append((label, im))
    if not tiles:
        return
    height = height or max(im.height for _, im in tiles)
    tiles = [(label, im if im.height == height else im.resize((int(im.width * height / im.height), height), Image.LANCZOS)) for label, im in tiles]
    width = sum(im.width for _, im in tiles) + 4 * (len(tiles) - 1)
    sheet = Image.new('RGB', (width, height + 18), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    x = 0
    for label, im in tiles:
        sheet.paste(im, (x, 18))
        draw.text((x + 4, 3), label, fill=(255, 235, 120))
        x += im.width + 4
    if sheet.width > max_width:
        sheet = sheet.resize((max_width, int(sheet.height * max_width / sheet.width)), Image.LANCZOS)
    sheet.save(out)
    print(os.path.relpath(out, SP), sheet.size)


body = ['front', 'q34', 'side', 'rear34', 'rear']
close = ['face', 'chest', 'belt', 'belt-rear']
for name in ['standard', 'standard-restrained', 'shadow-mask', 'shadow-parts', 'shadow-off', 'detail']:
    row(R4 + 'sheet-%s-body.png' % name, [(v, R4 + '%s/%s.png' % (name, v), None) for v in body], max_width=2000)
    row(R4 + 'sheet-%s-closeups.png' % name, [(v, R4 + '%s/%s.png' % (name, v), None) for v in close], max_width=2000)

# the shadow layer per camera: round 3 | layer off | layer on | the mask alone | its parts
for v in body + close:
    row(R4 + 'shadow-%s.png' % v, [
        ('round 3 (judge frame)', SP + 'r03/%s.png' % v, None),
        ('round 4, shadow layer off', R4 + 'shadow-off/%s.png' % v, None),
        ('round 4', R4 + 'standard/%s.png' % v, None),
        ('shadow mask (?debug=9)', R4 + 'shadow-mask/%s.png' % v, None),
        ('band R / cast G / inner B (?debug=10)', R4 + 'shadow-parts/%s.png' % v, None),
    ], max_width=2400)

# the two armour settings side by side
for v in ['front', 'q34', 'rear', 'chest', 'belt']:
    row(R4 + 'armour-%s.png' % v, [
        ('armor.lit #2b3040 (L* 20, default)', R4 + 'standard/%s.png' % v, None),
        ('armor.lit #212532 (L* 15, restrained)', R4 + 'standard-restrained/%s.png' % v, None),
    ], max_width=1800)

BA = R4 + 'before-after/'
# a. halo on the silhouette
for name, v, crop in [('a-halo-beltrear', 'belt-rear', (430, 150, 830, 550)), ('a-halo-rear', 'rear', (520, 230, 820, 530)),
                      ('a-halo-belt', 'belt', (0, 300, 300, 700)), ('a-halo-rear34', 'rear34', (480, 200, 780, 600)),
                      ('a-halo-chest', 'chest', (0, 0, 300, 400))]:
    row(BA + name + '.png', [('round 3', SP + 'r03/%s.png' % v, crop), ('round 4', R4 + 'standard/%s.png' % v, crop)], scale=2, max_width=2400)
row(BA + 'a-halo-phone-beltrear.png', [('round 3, phone viewport', SP + 'lookdev-r3/mobile/belt-rear.png', (0, 200, 856, 1300)),
                                       ('round 4, phone viewport', R4 + 'mobile/belt-rear.png', (0, 200, 856, 1300))], max_width=1720)
# b. sharpening
for name, v, crop in [('b-sharp-chest', 'chest', (250, 330, 650, 730)), ('b-sharp-belt-right', 'belt', (650, 100, 900, 500)),
                      ('b-sharp-belt-left', 'belt', (0, 100, 250, 500))]:
    row(BA + name + '.png', [('round 3', SP + 'r03/%s.png' % v, crop), ('round 4, sharpening off', R4 + 'sharpen-off/%s.png' % v, crop),
                             ('round 4', R4 + 'standard/%s.png' % v, crop)], scale=2, max_width=2400)
# c. streaks / the flattening pass
for name, v, crop in [('c-streaks-rear', 'rear', (280, 400, 620, 740)), ('c-streaks-rear34', 'rear34', (250, 380, 590, 720)),
                      ('c-streaks-beltrear-shoulder', 'belt-rear', (0, 0, 340, 340)), ('c-streaks-beltrear-right', 'belt-rear', (560, 0, 900, 340)),
                      ('c-streaks-chest', 'chest', (250, 330, 650, 730))]:
    row(BA + name + '.png', [('round 3', SP + 'r03/%s.png' % v, crop), ('round 4, flattening pass off', R4 + 'brush-off/%s.png' % v, crop),
                             ('round 4', R4 + 'standard/%s.png' % v, crop)], scale=2, max_width=2400)

# phone viewport
row(R4 + 'sheet-mobile.png', [(v, R4 + 'mobile/%s.png' % v, None) for v in ['front', 'q34', 'side', 'rear34', 'rear', 'face', 'chest', 'belt', 'belt-rear']], max_width=2400)
row(R4 + 'sheet-mobile-shadow.png', [(v, R4 + 'mobile-shadow-mask/%s.png' % v, None) for v in ['front', 'q34', 'rear', 'chest']] , max_width=2000)
for v in ['front', 'q34', 'rear', 'chest']:
    row(R4 + 'mobile-vs-desktop-mask-%s.png' % v, [('desktop mask', R4 + 'shadow-mask/%s.png' % v, None), ('phone mask', R4 + 'mobile-shadow-mask/%s.png' % v, None)], height=862, max_width=1800)
row(R4 + 'sheet-mobile-armour.png', [('%s L*20' % v, R4 + 'mobile/%s.png' % v, None) for v in ['front', 'chest']] + [('%s L*15' % v, R4 + 'mobile-restrained/%s.png' % v, None) for v in ['front', 'chest']], max_width=2000)
# motion: three frames two degrees apart, torso crop
row(R4 + 'sheet-motion.png', [('%s' % m, R4 + 'motion/%s.png' % m, (250, 130, 650, 630)) for m in ['m0', 'm1', 'm2']], scale=2, max_width=2400)
row(R4 + 'sheet-motion-mask.png', [('%s' % m, R4 + 'motion/%s.png' % m, None) for m in ['m0', 'm1', 'm2']], max_width=2400)
