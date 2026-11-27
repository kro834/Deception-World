"""Rough layout sketches of the three UI directions (lead's own drawing, not the designers' work)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SP = '/tmp/claude-0/-home-user-Deception-World/e3b46e06-f0d8-552d-88dc-50400a3b44dc/scratchpad'
S = 2                      # draw at 2x of CSS px
W, H = 390 * S, 844 * S
FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf'
def f(px): return ImageFont.truetype(FONT, int(px * S))

GOLD = (227, 170, 112); GOLD_D = (155, 102, 61); INK = (7, 8, 12); TEXT = (232, 234, 244); DIM = (150, 156, 178)
CYAN = (86, 220, 255); MAG = (240, 96, 200); SILVER = (222, 226, 238)

def backdrop(w, h, cx=0.5, cy=0.46):
    im = Image.new('RGB', (w, h), (11, 13, 20))
    px = im.load()
    c0, c1 = (35, 42, 64), (11, 13, 20)
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            dx = (x / w - cx) / 0.62; dy = (y / h - cy) / 0.56
            t = min(1.0, (dx * dx + dy * dy) ** 0.5)
            col = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
            px[x, y] = col; px[min(x + 1, w - 1), y] = col; px[x, min(y + 1, h - 1)] = col; px[min(x + 1, w - 1), min(y + 1, h - 1)] = col
    return im

def figure(height):
    src = Image.open(f'{SP}/shots/r03/front.png').convert('RGB').crop((235, 55, 665, 835))
    w = int(src.width * height / src.height)
    src = src.resize((w, height), Image.LANCZOS)
    mask = Image.new('L', src.size, 0)
    d = ImageDraw.Draw(mask); m = int(height * 0.06)
    d.rectangle((m, m, w - m, height - m), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(m * 0.6))
    return src, mask

def thumb(name, size):
    im = Image.open(f'{SP}/shots/r03/{name}.png').convert('RGB')
    w, h = im.size
    box = {'front': (250, 60, 650, 460), 'rear': (250, 60, 650, 460), 'side': (250, 100, 650, 500)}.get(name, (150, 130, 750, 730))
    return im.crop(box).resize((size, size), Image.LANCZOS)

VIEWS = [('front', '正面'), ('rear', '背面'), ('side', '側面'), ('face', '顔'), ('chest', '胸の炉'), ('belt', 'ベルト'), ('belt-rear', 'ベルト背面')]

def reset_icon(d, cx, cy, r, col, w):
    d.arc((cx - r, cy - r, cx + r, cy + r), start=40, end=330, fill=col, width=w)
    import math
    a = math.radians(330); x = cx + r * math.cos(a); y = cy + r * math.sin(a)
    d.polygon([(x - r * 0.55, y - r * 0.15), (x + r * 0.35, y - r * 0.55), (x + r * 0.3, y + r * 0.45)], fill=col)

def rr(d, box, r, **kw): d.rounded_rectangle(box, radius=r, **kw)

def phone_a():
    im = backdrop(W, H, 0.5, 0.42)
    fig, mask = figure(int(600 * S)); im.paste(fig, ((W - fig.width) // 2, int(92 * S)), mask)
    d = ImageDraw.Draw(im, 'RGBA')
    d.text((20 * S, 58 * S), '装甲戦士', font=f(22), fill=TEXT)
    d.line((20 * S, 88 * S, 60 * S, 88 * S), fill=GOLD, width=2 * S)
    rr(d, (W - 118 * S, 54 * S, W - 16 * S, 90 * S), 18 * S, fill=(14, 16, 24, 210), outline=(227, 170, 112, 150), width=S)
    d.text((W - 67 * S, 72 * S), '◇ 高精細', font=f(13), fill=GOLD, anchor='mm')
    rr(d, (W - 60 * S, 640 * S, W - 16 * S, 684 * S), 22 * S, fill=(14, 16, 24, 215), outline=(255, 255, 255, 40), width=S)
    reset_icon(d, W - 38 * S, 662 * S, 9 * S, TEXT, 2 * S)
    d.text((W // 2, 668 * S), 'ドラッグで回転 · ピンチで拡大', font=f(11.5), fill=(200, 204, 222, 190), anchor='mm')
    rr(d, (10 * S, 696 * S, W - 10 * S, 810 * S), 22 * S, fill=(12, 14, 21, 225), outline=(255, 255, 255, 34), width=S)
    x = 22 * S
    for i, (key, name) in enumerate(VIEWS):
        t = thumb(key, 58 * S)
        m = Image.new('L', t.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, t.width, t.height), radius=12 * S, fill=255)
        im.paste(t, (x, 708 * S), m)
        d = ImageDraw.Draw(im, 'RGBA')
        if i == 0: rr(d, (x - 3 * S, 705 * S, x + 61 * S, 769 * S), 14 * S, outline=GOLD, width=2 * S)
        d.text((x + 29 * S, 786 * S), name, font=f(10.5), fill=GOLD if i == 0 else DIM, anchor='mm')
        x += 68 * S
    d.rounded_rectangle((W // 2 - 60 * S, 832 * S, W // 2 + 60 * S, 836 * S), radius=2 * S, fill=(255, 255, 255, 120))
    return im

def chamfer(d, box, c, **kw):
    x0, y0, x1, y1 = box
    d.polygon([(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)], **kw)

def phone_b():
    im = backdrop(W, H, 0.5, 0.42)
    fig, mask = figure(int(560 * S)); im.paste(fig, ((W - fig.width) // 2, int(104 * S)), mask)
    d = ImageDraw.Draw(im, 'RGBA')
    for (x, y, sx, sy) in [(14, 100, 1, 1), (376, 100, -1, 1), (14, 650, 1, -1), (376, 650, -1, -1)]:
        d.line((x * S, y * S, (x + 26 * sx) * S, y * S), fill=CYAN, width=2 * S)
        d.line((x * S, y * S, x * S, (y + 26 * sy) * S), fill=CYAN, width=2 * S)
    chamfer(d, (14 * S, 50 * S, 190 * S, 90 * S), 9 * S, fill=(232, 236, 246, 240))
    d.text((26 * S, 70 * S), '装甲戦士', font=f(19), fill=(12, 14, 22), anchor='lm')
    d.line((112 * S, 62 * S, 112 * S, 78 * S), fill=(12, 14, 22), width=S)
    d.text((120 * S, 70 * S), '3Dビューア', font=f(10.5), fill=(40, 44, 60), anchor='lm')
    chamfer(d, (W - 150 * S, 54 * S, W - 14 * S, 88 * S), 8 * S, fill=(10, 12, 18, 235), outline=(86, 220, 255, 200))
    chamfer(d, (W - 147 * S, 57 * S, W - 84 * S, 85 * S), 6 * S, fill=CYAN)
    d.text((W - 115 * S, 71 * S), '標準', font=f(12), fill=(8, 10, 16), anchor='mm')
    d.text((W - 50 * S, 71 * S), '高精細', font=f(12), fill=DIM, anchor='mm')
    d.text((22 * S, 112 * S), '視点  正面', font=f(11), fill=CYAN)
    # driver-style selector plate
    chamfer(d, (10 * S, 668 * S, W - 10 * S, 812 * S), 16 * S, fill=(226, 230, 240, 245))
    chamfer(d, (18 * S, 676 * S, W - 18 * S, 760 * S), 12 * S, fill=(10, 12, 20, 255))
    x0, x1, y = 44 * S, W - 44 * S, 706 * S
    for i in range(x0, x1, 2):
        t = (i - x0) / (x1 - x0)
        d.line((i, y, i + 2, y), fill=tuple(int(CYAN[k] + (MAG[k] - CYAN[k]) * t) for k in range(3)), width=3 * S)
    for i, (key, name) in enumerate(VIEWS):
        x = x0 + (x1 - x0) * i / 6
        if i == 0:
            d.polygon([(x, y - 14 * S), (x + 10 * S, y), (x, y + 14 * S), (x - 10 * S, y)], fill=CYAN, outline=(255, 255, 255))
        else:
            d.polygon([(x, y - 7 * S), (x + 5 * S, y), (x, y + 7 * S), (x - 5 * S, y)], fill=(10, 12, 20), outline=(200, 210, 230))
        d.text((x, 738 * S), name, font=f(9.5 if len(name) > 3 else 11), fill=CYAN if i == 0 else (190, 196, 214), anchor='mm')
    chamfer(d, (22 * S, 768 * S, 150 * S, 804 * S), 8 * S, fill=(14, 16, 26))
    reset_icon(d, 50 * S, 786 * S, 7 * S, TEXT, 2 * S); d.text((98 * S, 786 * S), 'リセット', font=f(13), fill=TEXT, anchor='mm')
    chamfer(d, (W - 190 * S, 768 * S, W - 22 * S, 804 * S), 8 * S, fill=(14, 16, 26))
    d.text((W - 106 * S, 786 * S), '高精細に切替', font=f(13), fill=MAG, anchor='mm')
    d.text((W // 2, 654 * S), 'ドラッグで回転 · ピンチで拡大', font=f(11), fill=(180, 230, 245, 170), anchor='mm')
    return im

def phone_c():
    im = Image.new('RGB', (W, H), (13, 15, 22))
    d = ImageDraw.Draw(im, 'RGBA')
    line = (227, 170, 112, 150)
    d.rectangle((14 * S, 52 * S, W - 14 * S, 104 * S), outline=line, width=S)
    d.line((120 * S, 52 * S, 120 * S, 104 * S), fill=line, width=S); d.line((W - 96 * S, 52 * S, W - 96 * S, 104 * S), fill=line, width=S)
    d.text((24 * S, 62 * S), '設定資料', font=f(10), fill=DIM); d.text((24 * S, 80 * S), '3Dモデル', font=f(13), fill=TEXT)
    d.text((132 * S, 62 * S), '名称', font=f(10), fill=DIM); d.text((132 * S, 78 * S), '装甲戦士', font=f(20), fill=GOLD)
    d.text((W - 86 * S, 62 * S), '図版', font=f(10), fill=DIM); d.text((W - 86 * S, 80 * S), '01 – 07', font=f(13), fill=TEXT)
    st = (14 * S, 116 * S, W - 14 * S, 560 * S)
    plate = backdrop(st[2] - st[0], st[3] - st[1], 0.5, 0.46); im.paste(plate, (st[0], st[1]))
    fig, mask = figure(int(410 * S)); im.paste(fig, ((W - fig.width) // 2, int(132 * S)), mask)
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle(st, outline=line, width=S)
    for (x, y) in [(st[0], st[1]), (st[2], st[1]), (st[0], st[3]), (st[2], st[3])]:
        d.line((x - 7 * S, y, x + 7 * S, y), fill=GOLD, width=S); d.line((x, y - 7 * S, x, y + 7 * S), fill=GOLD, width=S)
    d.text((st[0] + 10 * S, st[1] + 10 * S), '図01　正面', font=f(12), fill=GOLD)
    d.text((st[2] - 10 * S, st[3] - 12 * S), 'ドラッグで回転 · ピンチで拡大', font=f(10), fill=DIM, anchor='rm')
    d.rectangle((14 * S, 570 * S, 190 * S, 606 * S), outline=line, width=S); reset_icon(d, 66 * S, 588 * S, 7 * S, TEXT, 2 * S); d.text((112 * S, 588 * S), 'リセット', font=f(13), fill=TEXT, anchor='mm')
    d.rectangle((200 * S, 570 * S, W - 14 * S, 606 * S), outline=line, width=S); d.text(((200 * S + W - 14 * S) // 2, 588 * S), '◇ 高精細に切替', font=f(13), fill=GOLD, anchor='mm')
    d.text((14 * S, 622 * S), '図版一覧', font=f(11), fill=DIM); d.line((70 * S, 628 * S, W - 14 * S, 628 * S), fill=(255, 255, 255, 40), width=S)
    cw = (W - 14 * S * 2 - 10 * S * 2) // 3
    for i, (key, name) in enumerate(VIEWS[:6]):
        cx = 14 * S + (i % 3) * (cw + 10 * S); cy = 640 * S + (i // 3) * (cw + 34 * S)
        t = thumb(key, cw); im.paste(t, (cx, cy)); d = ImageDraw.Draw(im, 'RGBA')
        d.rectangle((cx, cy, cx + cw, cy + cw), outline=GOLD if i == 0 else line, width=(2 if i == 0 else 1) * S)
        d.text((cx + 2 * S, cy + cw + 6 * S), f'図{i + 1:02d}', font=f(9.5), fill=DIM); d.text((cx + 34 * S, cy + cw + 5 * S), name, font=f(11.5), fill=GOLD if i == 0 else TEXT)
    fade = Image.new('RGBA', (W, 70 * S), (0, 0, 0, 0)); fd = ImageDraw.Draw(fade)
    for y in range(70 * S): fd.line((0, y, W, y), fill=(13, 15, 22, int(255 * y / (70 * S))))
    im.paste(fade, (0, H - 70 * S), fade)
    ImageDraw.Draw(im).text((W // 2, H - 16 * S), '↓ スクロール', font=f(10.5), fill=DIM, anchor='mm')
    return im

def frame(im):
    out = Image.new('RGB', (W + 28 * S, H + 28 * S), (30, 32, 40))
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, W, H), radius=44 * S, fill=255)
    out.paste(im, (14 * S, 14 * S), m)
    d = ImageDraw.Draw(out); d.rounded_rectangle((W // 2 - 46 * S + 14 * S, 24 * S, W // 2 + 46 * S + 14 * S, 50 * S), radius=13 * S, fill=(0, 0, 0))
    return out

phones = [('A　イマーシブ・ショーケース', phone_a()), ('B　ドライバー HUD', phone_b()), ('C　設定資料', phone_c())]
pw, ph = W + 28 * S, H + 28 * S
gap, head, foot = 36 * S, 96 * S, 30 * S
sheet = Image.new('RGB', (pw * 3 + gap * 4, ph + head + foot + 54 * S), (18, 19, 25))
d = ImageDraw.Draw(sheet)
d.text((gap, 26 * S), 'UI の方向 3案（構成ラフ：私が描いた見取り図です。実際のデザインは担当が制作中）', font=f(17), fill=(236, 238, 246))
for i, (label, im) in enumerate(phones):
    x = gap + i * (pw + gap)
    sheet.paste(frame(im), (x, head))
    d.text((x + pw // 2, head + ph + 30 * S), label, font=f(20), fill=GOLD, anchor='mm')
sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
sheet.save(f'{SP}/logs/ui-directions-sketch.png')
print(sheet.size)
