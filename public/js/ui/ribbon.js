/**
 * Nastro tricolore che scorre lungo tutta la pagina, sul lato destro, come
 * nelle slide del corso: un fascio di fibre verdi, bianche e rosse che ondeggia
 * e si attorciglia (quando la larghezza del nastro cambia segno, l'ordine dei
 * colori si inverte: è la torsione).
 *
 * È un livello decorativo dietro ai contenuti: si ridisegna quando cambia
 * l'altezza della pagina, la larghezza della finestra o il tema.
 */
const NS = "http://www.w3.org/2000/svg";
const FIBERS = 96;          // fibre totali (un terzo per colore)
const STEP = 6;             // px tra due punti della curva

let layer, svg, raf = 0, lastKey = "";

export function mountRibbon() {
  if (layer) return;
  layer = document.createElement("div");
  layer.className = "ribbon-layer";
  layer.setAttribute("aria-hidden", "true");
  svg = document.createElementNS(NS, "svg");
  layer.append(svg);
  document.body.prepend(layer);

  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  new ResizeObserver(schedule).observe(document.body);
  window.addEventListener("resize", schedule);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { lastKey = ""; schedule(); });
  new MutationObserver(() => { lastKey = ""; schedule(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  schedule();
}

/** Generatore pseudo-casuale con seme fisso: le fibre restano uguali a ogni ridisegno. */
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function mix(a, b, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(" ")})`;
}

function draw() {
  const vw = document.documentElement.clientWidth;
  // altezza del body: il nastro è posizionato in assoluto e non la influenza
  // (lo scrollHeight invece lo includerebbe e non si ridurrebbe mai)
  const H = Math.ceil(Math.max(document.body.offsetHeight, window.innerHeight));
  const narrow = vw < 700;
  const W = narrow ? 110 : Math.round(Math.min(440, Math.max(240, vw * 0.28)));
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const colors = {
    green: [tok("--ribbon-green"), tok("--ribbon-green-deep")],
    white: [tok("--ribbon-white"), tok("--ribbon-white-deep")],
    red: [tok("--ribbon-red"), tok("--ribbon-red-deep")],
  };
  const key = [W, H, Object.values(colors).flat().join()].join("|");
  if (key === lastKey) return;
  lastKey = key;

  layer.style.height = `${H}px`;
  layer.style.width = `${W}px`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);

  // linea centrale: due armoniche per un andamento organico, non meccanico
  const L = narrow ? 900 : 1150;                     // lunghezza d'onda principale
  // (ampiezze scelte perché il nastro non tocchi mai il bordo sinistro del livello)
  const cx = (y) => W * 0.55 + W * 0.24 * Math.sin((2 * Math.PI * y) / L + 0.6)
                             + W * 0.05 * Math.sin((2 * Math.PI * y) / (L * 0.41) + 2.1);
  // semi-larghezza con segno: passando per lo zero il nastro si attorciglia
  const T = L * 1.55;
  const hw = (y) => W * 0.24 * (0.3 + 0.7 * Math.cos((2 * Math.PI * y) / T + 0.9));

  const rand = seeded(7);
  const paths = [];
  for (let i = 0; i < FIBERS; i++) {
    const s = -1 + (2 * (i + 0.5)) / FIBERS;         // posizione della fibra nel nastro, da -1 a 1
    const band = i < FIBERS / 3 ? "green" : i < (2 * FIBERS) / 3 ? "white" : "red";
    const local = ((i % (FIBERS / 3)) + 0.5) / (FIBERS / 3);   // 0..1 dentro la fascia
    const shade = Math.pow(Math.abs(local - 0.5) * 2, 1.6);     // più scuro verso i bordi della fascia
    const [base, deep] = colors[band];
    const color = mix(base, deep, Math.min(1, shade * 0.85 + rand() * 0.2));
    const amp = 0.6 + rand() * 1.6, freq = 180 + rand() * 260, ph = rand() * 6.28;
    const width = 0.9 + rand() * 1.2;
    const opacity = 0.55 + rand() * 0.45;

    let d = "";
    for (let y = -40; y <= H + 40; y += STEP) {
      const dx = (cx(y + 1) - cx(y - 1)) / 2;        // pendenza, per spostarsi lungo la normale
      const n = Math.hypot(1, dx);
      const off = s * hw(y) + amp * Math.sin(y / freq + ph);
      const x = cx(y) + (off * 1) / n;
      const yy = y - (off * dx) / n;
      d += `${d ? "L" : "M"}${x.toFixed(1)} ${yy.toFixed(1)}`;
    }
    paths.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-opacity="${opacity.toFixed(2)}" stroke-linecap="round"/>`);
  }
  svg.innerHTML = paths.join("");
}
