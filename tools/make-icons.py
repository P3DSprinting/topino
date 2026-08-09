"""Genera le icone PNG della PWA disegnandole con Pillow.

Il disegno ricalca la sagoma SVG dello splash, così l'icona sulla home
e la schermata di avvio sono riconoscibilmente la stessa cosa.
Le icone maskable tengono il soggetto dentro l'80% centrale: Android
ritaglia i bordi in forme diverse a seconda del launcher.
"""
from PIL import Image, ImageDraw

BG   = (14, 17, 22)
BODY = (95, 242, 160)
EAR  = (95, 242, 160, 150)
DARK = (14, 17, 22)

SS = 4  # supersampling: disegno grande e riduco, così i bordi restano puliti


def draw_mouse(size: int, safe: float) -> Image.Image:
    S = size * SS
    img = Image.new("RGBA", (S, S), BG + (255,))
    d = ImageDraw.Draw(img, "RGBA")

    # il soggetto vive dentro un quadrato ridotto e centrato
    box = S * safe
    ox = oy = (S - box) / 2
    u = box / 120.0                      # unità: la sagoma è pensata su griglia 120x70
    def P(x, y): return (ox + x * u, oy + (y + 25) * u)

    def ellipse(cx, cy, rx, ry, fill):
        d.ellipse([*P(cx - rx, cy - ry), *P(cx + rx, cy + ry)], fill=fill)

    # coda
    d.arc([*P(78, 12), *P(126, 52)], start=200, end=25,
          fill=BODY + (190,), width=int(3.6 * u))
    # orecchie
    ellipse(30, 26, 13, 13, EAR)
    ellipse(78, 26, 10, 10, EAR)
    # ruote
    ellipse(38, 60, 6.5, 6.5, BODY + (95,))
    ellipse(66, 60, 6.5, 6.5, BODY + (95,))
    # corpo
    ellipse(52, 42, 34, 20, BODY + (240,))
    # occhio
    ellipse(22, 40, 3.4, 3.4, DARK + (255,))

    return img.resize((size, size), Image.LANCZOS).convert("RGB")


if __name__ == "__main__":
    import pathlib
    out = pathlib.Path(__file__).resolve().parent.parent / "app" / "icons"
    out.mkdir(parents=True, exist_ok=True)

    for size in (192, 512):
        draw_mouse(size, 0.82).save(out / f"icon-{size}.png")
        draw_mouse(size, 0.62).save(out / f"icon-{size}-maskable.png")
    draw_mouse(180, 0.82).save(out / "apple-touch-icon.png")
    print("icone scritte in", out)
