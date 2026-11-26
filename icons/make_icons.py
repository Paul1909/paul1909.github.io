"""Paolo's Arcade icon kit: Candy Tile style. See STYLE-GUIDE.md.

  python3 icons/make_icons.py            # all apps
  python3 icons/make_icons.py swatch     # one app

Writes, per app: <slug>/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png,
apple-touch-icon.png, plus icons/<slug>.svg (square tile used on the homepage).
Also rebuilds icons/style-guide.png. Needs rsvg-convert.
To add an app: write a glyph function, add a row to APPS, run it, then check the 48 px look.
"""
import colorsys, math, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INK_DARK = '#1b1535'      # glyph ink on light tiles
INK_LIGHT = '#ffffff'     # glyph ink on everything else
ARCADE_BG = '#0a0716'     # coin rim
CYAN, PINK = '#3ef2ff', '#ff4fd8'

# ---------- colour ----------
def hex2rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
def rgb2hex(c): return '#%02x%02x%02x' % tuple(round(max(0, min(1, v)) * 255) for v in c)
def hls_shift(h, dh=0, dl=0, ds=0):
    hh, l, s = colorsys.rgb_to_hls(*hex2rgb(h))
    return rgb2hex(colorsys.hls_to_rgb((hh + dh / 360) % 1, max(0, min(1, l + dl)), max(0, min(1, s + ds))))
def lum(h):
    f = lambda v: v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4
    r, g, b = (f(v) for v in hex2rgb(h)); return .2126 * r + .7152 * g + .0722 * b
def contrast(a, b): la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + .05) / (lb + .05)
def palette(accent):
    top = hls_shift(accent, dl=+.05)
    mid = hls_shift(accent, dh=-4, dl=-.05)
    ink = INK_LIGHT if contrast(INK_LIGHT, mid) >= 2.2 else INK_DARK
    # light tiles (dark ink) darken less at the bottom, so yellows stay yellow instead of turning brown
    bottom = hls_shift(accent, dh=-8, dl=-.13 if ink == INK_LIGHT else -.07, ds=+.05)
    return top, bottom, mid, ink

# ---------- glyph helpers (k = ink, a = tile colour for cut-outs) ----------
def T(k, o=.18): return f'fill="#fff" fill-opacity="{o + .1:.2f}"'   # glass fill: always white, so it never goes muddy
def S(k, w): return f'stroke="{k}" stroke-width="{w}"'
def star(cx, cy, R, r, n, rot=-90):
    pts = []
    for i in range(2 * n):
        rad = R if i % 2 == 0 else r; t = math.radians(rot + i * 180 / n)
        pts.append(f'{cx + rad * math.cos(t):.1f},{cy + rad * math.sin(t):.1f}')
    return 'M' + ' L'.join(pts) + 'Z'
def spade(cx, cy, s):
    return (f'<g transform="translate({cx} {cy}) scale({s})"><path d="M0-60C30-22 62-2 42 30C27 50 6 42 0 28C-6 42-27 50-42 30C-62-2-30-22 0-60Z"/>'
            f'<path d="M0 18L18 62H-18Z"/></g>')
def record(k, a, cy, r=108):
    rings = ''.join(f'<circle cx="256" cy="{cy}" r="{rr}" fill="none" stroke="{a}" stroke-opacity=".45" stroke-width="5"/>' for rr in (r - 22, r - 40, r - 58))
    return (f'<circle cx="256" cy="{cy}" r="{r}" fill="{k}"/>{rings}'
            f'<circle cx="256" cy="{cy}" r="32" fill="{a}"/><circle cx="256" cy="{cy}" r="8" fill="{k}"/>')

# ---------- glyphs: live area = circle r 200 around (256,256), main stroke 22-24 ----------
def g_matrix(k, a):
    cols = ''
    for i, x in enumerate((206, 256, 306)):
        for j, y in enumerate((186, 222, 258, 294)):
            if (i + j) % 4 == 3: continue
            cols += f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y+16}" stroke="{k}" stroke-opacity="{1-.22*j:.2f}" stroke-width="20"/>'
    return (f'<path d="M168 132h176a40 40 0 0 1 40 40v128a40 40 0 0 1-40 40H236l-62 50v-50h-6a40 40 0 0 1-40-40V172a40 40 0 0 1 40-40z" {T(k)} {S(k,24)}/>' + cols)

def g_swatch(k, a):
    card = 'x="200" y="128" width="112" height="216" rx="20"'
    return (f'<rect {card} transform="rotate(-22 256 380)" {T(k,.22)} {S(k,20)}/>'
            f'<rect {card} transform="rotate(22 256 380)" {T(k,.22)} {S(k,20)}/>'
            f'<rect {card} fill="{k}"/>'
            f'<path d="M234 222a22 22 0 1 1 30 20c-8 4-8 9-8 18" fill="none" {S(a,16)}/><circle cx="256" cy="296" r="10" fill="{a}"/>')

def g_regions(k, a):
    return (f'<path d="M226 136L140 190L140 302L200 362L302 372L372 300L382 208L322 146Z" {T(k)} {S(k,22)}/>'
            f'<path d="M226 136L322 146L382 208L332 252L240 252Z" fill="{k}"/>'
            f'<path d="M240 252L140 302M240 252L252 366M332 252L372 300M332 252L302 372M226 136L240 252M240 252H332" fill="none" {S(k,16)}/>')

def g_globe(k, a):
    return (f'<circle cx="256" cy="256" r="150" {T(k)} {S(k,22)}/>'
            f'<ellipse cx="256" cy="256" rx="62" ry="150" fill="none" {S(k,14)} stroke-opacity=".6"/>'
            f'<path d="M106 256h300M126 186h260M126 326h260" {S(k,14)} stroke-opacity=".6"/>'
            f'<path d="M262 192l52-18 36 30-8 54-46 22-20-34-30-10z" fill="{k}" {S(k,10)}/>')

def g_suika(k, a):
    return (f'<path d="M140 176V352a28 28 0 0 0 28 28H344a28 28 0 0 0 28-28V176" fill="none" {S(k,22)}/>'
            f'<circle cx="300" cy="300" r="58" fill="{k}"/><circle cx="200" cy="320" r="40" fill="{k}"/>'
            f'<circle cx="236" cy="136" r="28" {T(k,.3)} {S(k,12)}/>'
            f'<path d="M310 268L278 312H326M310 268V334" fill="none" {S(a,13)}/>'
            f'<path d="M188 310a13 13 0 1 1 22 10L186 342H214" fill="none" {S(a,11)}/>')

def g_fruit(k, a):
    seeds = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="7" ry="12" fill="{a}"/>' for x, y in ((210, 236), (256, 248), (302, 236), (232, 278), (280, 278)))
    return (f'<rect x="128" y="128" width="256" height="256" rx="48" {T(k)} {S(k,18)}/>'
            f'<path d="M148 208A108 108 0 0 0 364 208" fill="none" {S(k,16)}/>'
            f'<path d="M166 208A90 90 0 0 0 346 208Z" fill="{k}"/>' + seeds)

def g_monster(k, a):
    return (f'<path d="M196 170L172 114L230 150M316 170L340 114L282 150" fill="{k}" {S(k,16)}/>'
            f'<path d="M150 266C150 186 196 150 256 150S362 186 362 266V356L326 330L291 356L256 330L221 356L186 330L150 356Z" {T(k,.25)} {S(k,22)}/>'
            f'<circle cx="256" cy="240" r="48" fill="{k}"/><circle cx="264" cy="246" r="19" fill="{a}"/>'
            f'<path d="M214 294Q256 322 298 294" fill="none" {S(k,14)}/>'
            f'<path d="M232 304l8 18 8-14M264 308l8 14 8-18" fill="{k}" {S(k,6)}/>')

def g_squish(k, a):
    return (f'<ellipse cx="256" cy="370" rx="132" ry="16" fill="{k}" fill-opacity=".25"/>'
            f'<path d="M178 156H334Q380 156 380 202Q380 250 334 250H300V300Q300 352 256 352Q212 352 212 300V250H178Q132 250 132 202Q132 156 178 156Z" fill="{k}"/>'
            f'<path d="M160 196Q166 178 190 176" fill="none" stroke="{a}" stroke-opacity=".7" stroke-width="12"/>'
            f'<path d="M212 166V244M300 166V244M222 254H290" fill="none" stroke="{a}" stroke-opacity=".35" stroke-width="6"/>'
            f'<circle cx="228" cy="208" r="13" fill="{a}"/><circle cx="284" cy="208" r="13" fill="{a}"/>'
            f'<path d="M244 236Q256 246 268 236" fill="none" {S(a,8)}/>')

def g_ball(k, a):
    return (f'<circle cx="256" cy="226" r="112" {T(k)} {S(k,22)}/>'
            f'<path d="{star(232, 206, 46, 12, 4)}" fill="{k}"/><path d="{star(296, 262, 22, 6, 4)}" fill="{k}"/>'
            f'<path d="M184 238A74 74 0 0 0 220 290" fill="none" {S(k,12)} stroke-opacity=".6"/>'
            f'<path d="M198 330H314L340 380H172Z" fill="{k}" {S(k,12)}/>')

def g_rally(k, a):
    return (f'<path d="{star(356, 176, 46, 22, 8)}" fill="{k}" fill-opacity=".9"/>'
            f'<path d="M96 230H134M86 266H122M100 302H124" {S(k,16)}/>'
            f'<path d="M140 316V282Q140 266 156 262L200 252L232 210Q240 200 254 200H316Q330 200 338 212L362 250Q384 256 384 276V316Z" fill="{k}"/>'
            f'<path d="M246 216H282V250H218Z M294 216H314Q322 216 326 224L342 250H294Z" fill="{a}"/>'
            + ''.join(f'<circle cx="{x}" cy="318" r="42" fill="{a}"/><circle cx="{x}" cy="318" r="32" fill="{k}"/><circle cx="{x}" cy="318" r="11" fill="{a}"/>' for x in (196, 330)))

def g_dsky(k, a):
    seg = ''.join(f'<rect x="{x}" y="170" width="34" height="54" rx="4" fill="none" {S(a,8)}/><line x1="{x}" y1="197" x2="{x+34}" y2="197" {S(a,8)}/>' for x in (180, 239, 298))
    keys = ''.join(f'<rect x="{166+c*49}" y="{262+r*50}" width="34" height="36" rx="8" fill="{k}" fill-opacity="{1 if (r,c)!=(1,3) else .45}"/>' for r in range(2) for c in range(4))
    return (f'<rect x="134" y="128" width="244" height="256" rx="32" {T(k)} {S(k,22)}/>'
            f'<rect x="162" y="156" width="188" height="82" rx="12" fill="{k}"/>' + seg + keys)

def g_bsb(k, a):
    stars = ''.join(f'<path d="{star(x, y, 20, 8.5, 5)}" fill="{k}" {S(k,4)}/>' for x, y in ((164, 168), (208, 140), (256, 128), (304, 140), (348, 168)))
    return record(k, a, 296, 104) + stars

def g_queen(k, a):
    return (record(k, a, 296, 104) +
            f'<path d="M190 176L200 116L232 148L256 104L280 148L312 116L322 176Z" fill="{k}" {S(k,10)}/>'
            f'<circle cx="256" cy="152" r="9" fill="{a}"/>')

def g_bess(k, a):
    ticks = 'M256 96V138M256 374V416M96 256H138M374 256H416'
    return (f'<circle cx="256" cy="256" r="146" fill="none" {S(k,14)} stroke-opacity=".6"/>'
            f'<path d="{ticks}" {S(k,20)}/>'
            f'<rect x="168" y="206" width="164" height="100" rx="18" {T(k,.22)} {S(k,22)}/>'
            f'<rect x="336" y="236" width="20" height="40" rx="6" fill="{k}"/>'
            f'<path d="M262 218L216 264H250L236 296L290 246H256L272 218Z" fill="{k}" {S(k,6)}/>')

def g_piano(k, a):
    keys = ''.join(f'<line x1="{x}" y1="250" x2="{x}" y2="354" {S(k,14)}/>' for x in (186, 256, 326))
    blk = ''.join(f'<rect x="{x}" y="166" width="40" height="104" rx="8" fill="{k}"/>' for x in (166, 236, 306))
    dots = ''.join(f'<circle cx="{x}" cy="316" r="14" fill="{k}"/>' for x in (151, 291))
    return f'<rect x="116" y="156" width="280" height="200" rx="28" {T(k)} {S(k,24)}/>' + keys + blk + dots

def g_cat(k, a):
    return (f'<path d="M186 196l-14-74 70 40M346 196l14-74-70 40" fill="{k}" fill-opacity=".25" {S(k,22)}/>'
            f'<ellipse cx="266" cy="262" rx="112" ry="100" {T(k,.25)} {S(k,22)}/>'
            f'<ellipse cx="226" cy="250" rx="14" ry="20" fill="{k}"/><ellipse cx="306" cy="250" rx="14" ry="20" fill="{k}"/>'
            f'<path d="M254 288h24l-12 14z" fill="{k}" {S(k,8)}/>'
            f'<path d="M132 298h-34M138 330h-50M150 362h-34" {S(k,18)}/>')

def g_d2r(k, a):
    chev = ''.join(f'<path d="M298 {y}L332 {y-34}L366 {y}" fill="none" {S(k,20)} stroke-opacity="{o}"/>' for y, o in ((196, 1), (246, .65), (296, .35)))
    return (f'<path d="M222 108L248 146V300H196V146Z" fill="{k}"/><line x1="222" y1="152" x2="222" y2="290" {S(a,7)}/>'
            f'<rect x="164" y="296" width="116" height="24" rx="10" fill="{k}"/>'
            f'<rect x="210" y="318" width="24" height="56" rx="6" fill="{k}"/><circle cx="222" cy="384" r="16" fill="{k}"/>' + chev)

def g_bridge(k, a):
    card = 'x="186" y="126" width="148" height="212" rx="22"'
    return (f'<rect {card} transform="rotate(-14 256 360)" {T(k,.22)} {S(k,20)}/>'
            f'<g transform="translate(24 10) rotate(10 256 360)"><rect {card} fill="{k}"/>'
            f'<g fill="{a}">{spade(260, 226, 1.05)}</g></g>')

def g_atomic(k, a):
    return (f'<path d="{star(256, 252, 172, 120, 12)}" fill="{k}" fill-opacity=".22"/>'
            f'<g fill="{k}"><circle cx="256" cy="180" r="38"/><rect x="218" y="216" width="76" height="20" rx="8"/>'
            f'<path d="M230 236C230 282 212 312 196 334H316C300 312 282 282 282 236Z"/><rect x="176" y="328" width="160" height="36" rx="14"/></g>')

def g_twist(k, a):
    out = ''
    for (x, y) in ((196, 196), (316, 196), (196, 316), (316, 316)):
        out += (f'<circle cx="{x}" cy="{y}" r="48" fill="{k}"/>' if (x, y) == (316, 316) else
                f'<circle cx="{x}" cy="{y}" r="46" {T(k,.22)} {S(k,16)}/>')
    return out + f'<circle cx="316" cy="316" r="68" fill="none" {S(k,8)} stroke-opacity=".55"/>'

def g_hockey(k, a):
    mallet = lambda y: f'<circle cx="256" cy="{y}" r="34" fill="{k}"/><circle cx="256" cy="{y}" r="15" fill="{a}"/><circle cx="256" cy="{y}" r="7" fill="{k}"/>'
    return (f'<rect x="150" y="112" width="212" height="288" rx="50" {T(k)} {S(k,20)}/>'
            f'<path d="M150 256H362" {S(k,10)} stroke-opacity=".6"/><circle cx="256" cy="256" r="34" fill="none" {S(k,10)} stroke-opacity=".6"/>'
            f'<path d="M222 112H290M222 400H290" {S(k,24)}/>' + mallet(176) + mallet(338) +
            f'<circle cx="306" cy="238" r="15" fill="{k}"/>')

def g_pong(k, a):
    return (f'<path d="M256 120v272" {S(k,12)} stroke-dasharray="20 22" stroke-opacity=".55"/>'
            f'<rect x="120" y="150" width="28" height="112" rx="14" fill="{k}"/><rect x="364" y="250" width="28" height="112" rx="14" fill="{k}"/>'
            f'<circle cx="302" cy="198" r="22" fill="{k}"/><path d="M276 214L214 252" {S(k,10)} stroke-opacity=".35"/>')

def g_dots(k, a):
    p = (156, 256, 356)
    lines = [((156,156),(256,156)),((256,156),(256,256)),((156,256),(256,256)),((156,156),(156,256)),
             ((256,256),(356,256)),((356,256),(356,356)),((256,356),(356,356)),((356,156),(356,256))]
    out = f'<rect x="156" y="156" width="100" height="100" {T(k,.35)}/>'
    out += ''.join(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" {S(k,18)}/>' for (x1, y1), (x2, y2) in lines)
    out += f'<line x1="256" y1="276" x2="256" y2="336" {S(k,12)} stroke-dasharray="2 22" stroke-opacity=".6"/>'
    return out + ''.join(f'<circle cx="{x}" cy="{y}" r="21" fill="{k}"/>' for x in p for y in p)

def g_scramble(k, a):
    W = 'M-32-22L-16 26L0-6L16 26L32-22'
    S_ = 'M24-16C18-30-26-30-26-10C-26 8 26 4 26 22C26 40-20 42-28 24'
    return (f'<g transform="translate(206 210) rotate(-10)"><rect x="-62" y="-62" width="124" height="124" rx="22" fill="{k}"/>'
            f'<path d="{W}" fill="none" {S(a,14)}/></g>'
            f'<g transform="translate(312 308) rotate(9)"><rect x="-62" y="-62" width="124" height="124" rx="22" {T(k,.25)} {S(k,18)}/>'
            f'<path d="{S_}" fill="none" {S(k,14)}/></g>')

def g_mandel(k, a):
    # The set's own silhouette: main cardioid, period-2 bulb, top/bottom bulbs and the antenna.
    S_, ox = 150, 256 + 0.86 * 150
    P = lambda x, y: f'{ox + x * S_:.1f},{256 - y * S_:.1f}'
    card = 'M' + ' L'.join(P(math.cos(t) / 2 - math.cos(2 * t) / 4, math.sin(t) / 2 - math.sin(2 * t) / 4)
                           for t in (i * 2 * math.pi / 120 for i in range(120))) + 'Z'
    disc = lambda x, y, r, o='': f'<circle cx="{ox + x * S_:.1f}" cy="{256 - y * S_:.1f}" r="{r * S_:.1f}" fill="{k}"{o}/>'
    halo = f'<circle cx="256" cy="256" r="176" {T(k,.12)}/>'
    return (halo + f'<path d="{card}" fill="{k}"/>' + disc(-1, 0, .262) + disc(-1.3107, 0, .0597) +
            disc(-0.1226, 0.7449, .104) + disc(-0.1226, -0.7449, .104) +
            f'<path d="M{P(-1.37, 0)} L{P(-1.96, 0)}" {S(k,12)}/>' + disc(-1.7549, 0, .028))

# slug, accent (same as the homepage card colour), glyph
APPS = [
    ('matrix-message', '#00ff41', g_matrix), ('swatch', '#ff7a9c', g_swatch),
    ('wire-regions', '#ffd400', g_regions), ('wire-atlas', '#ffd400', g_globe),
    ('number-suika', '#ffb74d', g_suika), ('fruit-2048', '#8fdc8f', g_fruit),
    ('personality-monsters', '#b06bff', g_monster), ('squishtris', '#ff5aa5', g_squish),
    ('accurate-horoscope', '#e2b866', g_ball), ('rally-havoc', '#ff7a00', g_rally),
    ('apollo-agc', '#6dff8e', g_dsky), ('backstreet-boys-name-that-tune', '#4f8bff', g_bsb),
    ('queen-name-that-tune', '#ffd23f', g_queen), ('call-of-bess', '#7bd88f', g_bess),
    ('piano-chords', '#a8322d', g_piano), ('whisker-rush', '#ff8a3d', g_cat),
    ('d2r-leveling-guide', '#c8a85a', g_d2r), ('bridge-school', '#d6ae58', g_bridge),
    ('atomic-chess', '#ffb347', g_atomic), ('finger-twist', '#ffe14a', g_twist),
    ('neon-ice-hockey', '#3ef2ff', g_hockey), ('neon-pong-duo', '#ff4fd8', g_pong),
    ('dots-and-lines', '#b6ff4a', g_dots), ('word-scramble-fun', '#03a9f4', g_scramble),
    ('mandelbrot-explorer', '#1fd1b9', g_mandel),
]

def build_svg(accent, glyph, rounded=True, coin=True):
    top, bottom, mid, ink = palette(accent)
    rx = 112 if rounded else 0
    clip = f'<clipPath id="c"><rect width="512" height="512" rx="{rx}"/></clipPath>'
    defs = (f'<defs>{clip}<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>'
            f'<linearGradient id="coin" x1="0" x2="1"><stop offset="0" stop-color="{CYAN}"/><stop offset="1" stop-color="{PINK}"/></linearGradient>'
            f'<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000" flood-opacity=".25"/></filter></defs>')
    body = (f'<g clip-path="url(#c)"><rect width="512" height="512" fill="url(#bg)"/>'
            f'<path d="M0 0H512V176C384 232 140 150 0 232Z" fill="#fff" fill-opacity=".10"/></g>'
            f'<g filter="url(#sh)" stroke-linecap="round" stroke-linejoin="round">{glyph(ink, mid)}</g>')
    if coin:
        body += f'<circle cx="436" cy="436" r="22" fill="{ARCADE_BG}"/><circle cx="436" cy="436" r="10" fill="url(#coin)"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{defs}{body}</svg>\n'

def png(svg_path, size, out):
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), svg_path, '-o', out], check=True)

NO_PWA = {'call-of-bess'}   # desktop-only, no manifest: gets icon.svg + apple-touch-icon.png only

def make(slug, accent, glyph, out_root=ROOT):
    app = os.path.join(out_root, slug); os.makedirs(app, exist_ok=True)
    tiles = os.path.join(out_root, 'icons'); os.makedirs(tiles, exist_ok=True)
    tmp = os.path.join(tiles, f'.{slug}-tmp.svg')
    icon = os.path.join(app, 'icon.svg')
    open(icon, 'w').write(build_svg(accent, glyph))                                  # favicon + "any" icons
    png(icon, 192, os.path.join(app, 'icon-192.png')); png(icon, 512, os.path.join(app, 'icon-512.png'))
    open(tmp, 'w').write(build_svg(accent, glyph, rounded=False, coin=False))        # Android maskable
    png(tmp, 512, os.path.join(app, 'icon-maskable-512.png'))
    open(tmp, 'w').write(build_svg(accent, glyph, rounded=False, coin=True))         # iOS rounds it itself
    png(tmp, 180, os.path.join(app, 'apple-touch-icon.png'))
    os.replace(tmp, os.path.join(tiles, f'{slug}.svg'))                              # homepage tile (CSS rounds it)
    if slug in NO_PWA:
        for f in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png'): os.remove(os.path.join(app, f))

def build_guide(path=os.path.join(ROOT, 'icons', 'style-guide.png')):
    """Visual style guide: anatomy of one icon plus the whole set. Rebuild after adding an app."""
    strip = lambda svg: svg.split('viewBox="0 0 512 512">', 1)[1].rsplit('</svg>', 1)[0]
    F = 'font-family="DejaVu Sans, sans-serif"'
    lab = lambda x, y, t, size=22, w='normal', c='#ece8ff', anchor='start': f'<text x="{x}" y="{y}" {F} font-size="{size}" font-weight="{w}" fill="{c}" text-anchor="{anchor}">{t}</text>'
    rows = (len(APPS) + 11) // 12
    W, H = 1600, 1000 + rows * 230 - 30
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="{ARCADE_BG}"/>',
           lab(60, 90, "Paolo's Arcade · App icon style guide", 44, 'bold'),
           lab(60, 132, 'Candy Tile: colour tile, one bold glyph, arcade coin. Generated by icons/make_icons.py', 24, c='#9a92c4')]
    slug, accent, glyph = next(a for a in APPS if a[0] == 'whisker-rush')
    out.append(f'<g transform="translate(80 190)">{strip(build_svg(accent, glyph))}'
               '<circle cx="256" cy="256" r="200" fill="none" stroke="#3ef2ff" stroke-width="3" stroke-dasharray="10 8"/>'
               '<circle cx="256" cy="256" r="172" fill="none" stroke="#ff4fd8" stroke-width="2" stroke-dasharray="4 6"/>'
               '<rect width="512" height="512" fill="none" stroke="#9a92c4" stroke-width="1.5" stroke-dasharray="3 5"/></g>')
    notes = [(CYAN, 'Safe circle r 200: nothing outside it (Android maskable crop)'),
             (PINK, 'Glyph sweet spot r 172: aim the main shape here'),
             ('#9a92c4', '512 × 512 canvas, corner radius 112 (22%)'),
             ('#ece8ff', 'Top: card colour +5% lightness · Bottom: −8° hue, −13% (−7% on light tiles)'),
             ('#ece8ff', 'White sheen over top third, 10%'),
             ('#ece8ff', 'Glyph: white ink, or #1b1535 when white contrast &lt; 2.2'),
             ('#ece8ff', 'Strokes 22–24 main, 14–18 detail, round caps and joins'),
             ('#ece8ff', 'Glass fill: white 28–45%. Cut-outs use the tile colour'),
             ('#ece8ff', 'Soft drop shadow under the glyph: y 12, blur 10, 25%'),
             ('#ece8ff', 'Arcade coin at (436,436): dark disc, cyan→pink core')]
    for i, (c, t) in enumerate(notes):
        y = 230 + i * 48
        out.append(f'<rect x="640" y="{y-18}" width="18" height="18" rx="4" fill="{c}"/>' + lab(672, y - 2, t, 23))
    out += [lab(640, 740, 'Do', 26, 'bold', '#b6ff4a'),
            lab(640, 776, 'One idea per icon, readable at 48 px · reuse the homepage card colour · max 2 characters', 21, c='#c9c3ea'),
            lab(640, 820, "Don't", 26, 'bold', '#ff6b81'),
            lab(640, 856, 'Words, photos, thin lines, more than one ink colour, art in the corners, emoji', 21, c='#c9c3ea'),
            lab(60, 960, 'The set', 30, 'bold')]
    for i, (slug, accent, glyph) in enumerate(APPS):
        x, y = 60 + (i % 12) * 126, 1000 + (i // 12) * 230
        tile = strip(build_svg(accent, glyph)).replace('id="', f'id="t{i}').replace('url(#', f'url(#t{i}')
        out.append(f'<g transform="translate({x} {y}) scale(0.207)">{tile}</g>')
        out.append(lab(x + 53, y + 132, slug.replace('-name-that-tune', '').replace('-leveling-guide', '')[:14], 13, c='#9a92c4', anchor='middle'))
    out.append('</svg>')
    tmp = path + '.svg'; open(tmp, 'w').write(''.join(out)); png_any(tmp, path); os.remove(tmp)

def png_any(svg_path, out):
    subprocess.run(['rsvg-convert', svg_path, '-o', out], check=True)

if __name__ == '__main__':
    want = set(sys.argv[1:])
    for slug, accent, glyph in APPS:
        if not want or slug in want:
            make(slug, accent, glyph); print('made', slug, palette(accent)[3])
    build_guide(); print('made icons/style-guide.png')
