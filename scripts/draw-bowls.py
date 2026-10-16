"""Generates the illustrated top-down bowl SVGs used until real photos are uploaded.
Run: python3 scripts/draw-bowls.py"""
import math, random, os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "images", "bowls")
os.makedirs(OUT, exist_ok=True)

def leaf(x, y, r, rot, c1="#4C9A2A", c2="#7DBE45"):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})">'
            f'<path d="M0 {-r} C{r*0.9} {-r*0.5} {r*0.9} {r*0.5} 0 {r} C{-r*0.9} {r*0.5} {-r*0.9} {-r*0.5} 0 {-r}Z" fill="{c1}"/>'
            f'<path d="M0 {-r*0.9} C{r*0.5} {-r*0.3} {r*0.4} {r*0.4} 0 {r*0.85}" fill="{c2}" opacity=".9"/>'
            f'<path d="M0 {-r*0.85} L0 {r*0.85}" stroke="#2F6B1C" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></g>')

def tomato(x, y, r, rot):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})">'
            f'<path d="M{-r} 0 A{r} {r} 0 0 1 {r} 0Z" fill="#E4472B"/>'
            f'<path d="M{-r*0.75} -2 A{r*0.75} {r*0.75} 0 0 1 {r*0.75} -2Z" fill="#F2775C"/>'
            + "".join(f'<circle cx="{(i-1)*r*0.38:.1f}" cy="{-r*0.35:.1f}" r="{r*0.09:.1f}" fill="#FCE3A0"/>' for i in range(3)) + '</g>')

def cucumber(x, y, r):
    return (f'<g transform="translate({x:.1f} {y:.1f})"><circle r="{r}" fill="#3E8E3A"/><circle r="{r*0.82}" fill="#CFE8A9"/>'
            f'<circle r="{r*0.42}" fill="#B6DA86"/>'
            + "".join(f'<circle cx="{math.cos(a)*r*0.25:.1f}" cy="{math.sin(a)*r*0.25:.1f}" r="{r*0.07:.1f}" fill="#F3F8E4"/>' for a in [0, 2.1, 4.2]) + '</g>')

def carrot(x, y, l, rot):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})"><rect x="{-l/2}" y="-4" width="{l}" height="8" rx="4" fill="#F08A24"/>'
            f'<rect x="{-l/2+3}" y="-1.5" width="{l-6}" height="2.5" rx="1.2" fill="#F7B267"/></g>')

def chicken(x, y, r, rot):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})"><path d="M{-r} {-r*0.5} Q0 {-r*1.1} {r} {-r*0.4} Q{r*1.2} {r*0.5} {r*0.2} {r*0.7} Q{-r*1.1} {r*0.9} {-r} {-r*0.5}Z" fill="#C9874B"/>'
            f'<path d="M{-r*0.6} {-r*0.3} L{r*0.6} {-r*0.1} M{-r*0.5} {r*0.2} L{r*0.5} {r*0.35}" stroke="#8E5528" stroke-width="2.4" stroke-linecap="round"/></g>')

def paneer(x, y, s, rot):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})"><rect x="{-s/2}" y="{-s/2}" width="{s}" height="{s}" rx="4" fill="#FFF4D6"/>'
            f'<rect x="{-s/2}" y="{-s/2}" width="{s}" height="{s*0.3}" rx="4" fill="#E9B86A" opacity=".75"/></g>')

def egg(x, y, r, rot):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})"><ellipse rx="{r*1.25}" ry="{r}" fill="#FFFDF6" stroke="#EDE3CB" stroke-width="1.5"/>'
            f'<circle cx="{r*0.1}" r="{r*0.55}" fill="#F5B82E"/><circle cx="{r*0.25}" cy="{-r*0.15}" r="{r*0.18}" fill="#FAD776"/></g>')

def cube(x, y, s, rot, fill, hi):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f})"><rect x="{-s/2}" y="{-s/2}" width="{s}" height="{s}" rx="5" fill="{fill}"/>'
            f'<rect x="{-s/2+3}" y="{-s/2+3}" width="{s*0.45}" height="{s*0.25}" rx="2" fill="{hi}" opacity=".7"/></g>')

def seed(x, y, rot, c):
    return f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="3.2" ry="1.8" transform="rotate({rot:.0f} {x:.1f} {y:.1f})" fill="{c}"/>'

def onion(x, y, r):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="none" stroke="#B565A7" stroke-width="3"/><circle cx="{x:.1f}" cy="{y:.1f}" r="{r*0.6}" fill="none" stroke="#D8A3CF" stroke-width="2.2"/>'

def bowl(content, bowl_color, rim, plate):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
<circle cx="200" cy="208" r="188" fill="{plate}"/>
<ellipse cx="206" cy="222" rx="168" ry="164" fill="#000" opacity=".08"/>
<circle cx="200" cy="200" r="164" fill="{bowl_color}"/>
<circle cx="200" cy="200" r="150" fill="{rim}"/>
<circle cx="200" cy="200" r="140" fill="#FBF6E9"/>
<clipPath id="in"><circle cx="200" cy="200" r="136"/></clipPath>
<g clip-path="url(#in)">{content}</g>
<path d="M88 120 A140 140 0 0 1 170 64" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".55"/>
</svg>'''

def scatter(n, rnd, rmin=10, rmax=118, gap=26):
    pts = []
    tries = 0
    while len(pts) < n and tries < 4000:
        tries += 1
        a = rnd.uniform(0, math.tau); d = math.sqrt(rnd.uniform((rmin/rmax)**2, 1)) * rmax
        x, y = 200 + math.cos(a)*d, 200 + math.sin(a)*d
        if all((x-px)**2 + (y-py)**2 > gap**2 for px, py in pts):
            pts.append((x, y))
    return pts

def greens_base(rnd, n=60):
    out = ['<circle cx="200" cy="200" r="140" fill="#6FB43F"/>']
    for x, y in scatter(n, rnd, 0, 132, 15):
        out.append(leaf(x, y, rnd.uniform(22, 32), rnd.uniform(0, 360), rnd.choice(["#4C9A2A", "#5FAF33", "#3F8A25"]), rnd.choice(["#7DBE45", "#94CF5C"])))
    return "".join(out)

def make(name, fn, bowl_color, rim, plate, seed_=7):
    rnd = random.Random(seed_)
    with open(os.path.join(OUT, f"{name}.svg"), "w") as f:
        f.write(bowl(fn(rnd), bowl_color, rim, plate))

def non_veg(r):
    s = greens_base(r)
    pts = scatter(26, r, 0, 118, 22)
    for i, (x, y) in enumerate(pts):
        k = i % 6
        s += [chicken(x, y, r.uniform(20, 24), r.uniform(0, 360)), tomato(x, y, 19, r.uniform(0, 360)), cucumber(x, y, 16),
              carrot(x, y, 34, r.uniform(0, 180)), chicken(x, y, 21, r.uniform(0, 360)), onion(x, y, 13)][k]
    return s

def paneer_bowl(r):
    s = greens_base(r)
    for i, (x, y) in enumerate(scatter(26, r, 0, 118, 22)):
        k = i % 5
        s += [paneer(x, y, 29, r.uniform(0, 90)), cucumber(x, y, 16), paneer(x, y, 27, r.uniform(0, 90)), carrot(x, y, 34, r.uniform(0, 180)), tomato(x, y, 18, r.uniform(0, 360))][k]
    return s

def hair_bowl(r):
    s = greens_base(r, 50)
    fruits = [("#E4472B", "#F49A88"), ("#F5B82E", "#FBD978"), ("#7A3E9D", "#B07CCB"), ("#F08A24", "#F7B267")]
    for i, (x, y) in enumerate(scatter(24, r, 0, 118, 22)):
        f, h = fruits[i % 4]
        s += cube(x, y, 20, r.uniform(0, 90), f, h) if i % 3 else cucumber(x, y, 12)
    for _ in range(140):
        a = r.uniform(0, math.tau); d = r.uniform(0, 120)
        s += seed(200 + math.cos(a)*d, 200 + math.sin(a)*d, r.uniform(0, 180), r.choice(["#3B2A1A", "#C8A26A", "#6B8E23", "#F2E6C9"]))
    for x, y in scatter(8, r, 20, 100):
        s += f'<path transform="translate({x:.0f} {y:.0f}) rotate({r.uniform(0,360):.0f})" d="M-8 -5 Q0 -11 8 -5 Q10 4 0 7 Q-10 4 -8 -5Z" fill="#B9834B"/>'
    return s

def fruit_bowl(r):
    s = '<rect width="400" height="400" fill="#F7D9A8"/>'
    fruits = [("#E8365A", "#F7849A"), ("#F5B82E", "#FBD978"), ("#F08A24", "#F7B267"), ("#9BC53D", "#C5E383"), ("#FDF1C4", "#FFFFFF"), ("#E4472B", "#F49A88")]
    for i, (x, y) in enumerate(scatter(60, r, 0, 134, 17)):
        f, h = fruits[i % len(fruits)]
        s += cube(x, y, r.uniform(20, 26), r.uniform(0, 90), f, h)
    for x, y in scatter(5, r, 30, 110):
        s += leaf(x, y, 10, r.uniform(0, 360), "#3F8A25", "#7DBE45")
    return s

def egg_bowl(r):
    s = greens_base(r)
    for i, (x, y) in enumerate(scatter(26, r, 0, 118, 22)):
        k = i % 5
        s += [egg(x, y, 21, r.uniform(0, 360)), cucumber(x, y, 16), tomato(x, y, 18, r.uniform(0, 360)), egg(x, y, 20, r.uniform(0, 360)), carrot(x, y, 34, r.uniform(0, 180))][k]
    for _ in range(26):
        a = r.uniform(0, math.tau); d = r.uniform(0, 120)
        x, y = 200 + math.cos(a)*d, 200 + math.sin(a)*d
        s += f'<rect x="{x:.0f}" y="{y:.0f}" width="9" height="9" rx="2" transform="rotate({r.uniform(0,90):.0f} {x:.0f} {y:.0f})" fill="#E2B66B"/>'
    return s

make("high-protein-non-veg-salad", non_veg, "#C9472E", "#E4472B", "#FBE3DC", 3)
make("high-protein-paneer-bowl", paneer_bowl, "#D9761A", "#F08A24", "#FDEBD6", 5)
make("hair-fall-control-bowl", hair_bowl, "#2E7D32", "#4C9A2A", "#E3F1D2", 11)
make("fruits-bowl", fruit_bowl, "#B0275F", "#C22E6B", "#FBE0EA", 13)
make("egg-crunch-salad", egg_bowl, "#D99A12", "#F5B82E", "#FDF0CC", 17)
make("hero", non_veg, "#1F6B3A", "#2E8A4C", "#00000000", 21)
print("ok")
