// ZX GPU: the Canvas 2D renderer, the fallback where WebGPU is missing. It draws the machine's
// screen (SPEC 10.2) back to front: border, paper, drawing layer, text, sprites, lower screen.
const css = (rgb, a = 1) => `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${a})`;

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.name = 'Canvas 2D';
    this.g = canvas.getContext('2d');
    const layer = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 192; return c; };
    this.paperC = layer(); this.inkC = layer(); this.loC = layer();
    this.paperD = new ImageData(256, 192); this.inkD = new ImageData(256, 192); this.loD = new ImageData(256, 192);
    this.spriteC = new Map();
    const p = document.createElement('canvas'); p.width = 8; p.height = 8;
    const pg = p.getContext('2d'); pg.fillStyle = '#000'; pg.fillRect(0, 0, 8, 8); pg.fillStyle = '#fff'; pg.fillRect(4, 0, 4, 4); pg.fillRect(0, 4, 4, 4);
    this.chequer = this.g.createPattern(p, 'repeat');
  }
  async init() { return true; }
  spriteCanvas(m, name) {
    let c = this.spriteC.get(name);
    if (!c) {
      const img = m.images[name];
      c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
      this.spriteC.set(name, c);
    }
    return c;
  }
  render(m) {
    const cv = this.canvas, g = this.g;
    const W = cv.width, H = cv.height, s = Math.min(W / 320, H / 240), ox = (W - 320 * s) / 2, oy = (H - 240 * s) / 2;
    if (m.textDirty) { m.rasterText(this.paperD.data, this.inkD.data); this.paperC.getContext('2d').putImageData(this.paperD, 0, 0); this.inkC.getContext('2d').putImageData(this.inkD, 0, 0); }
    if (m.loDirty) { m.rasterLo(this.loD.data); this.loC.getContext('2d').putImageData(this.loD, 0, 0); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.setTransform(s, 0, 0, s, ox, oy);
    g.fillStyle = css(m.borderRgb); g.fillRect(0, 0, 320, 240);
    g.save();
    g.translate(32, 24);
    g.beginPath(); g.rect(0, 0, 256, 192); g.clip();
    g.fillStyle = css(m.bg); g.fillRect(0, 0, 256, 192);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.paperC, 0, 0);
    // the drawing layer, scrolled with the text, under its own FXP transform
    const p = m.fx.props;
    g.save();
    g.translate(p.x, p.y - 8 * m.sr); g.rotate(p.rot * Math.PI / 180); g.scale(p.xs / 100, p.ys / 100);
    const layerAlpha = Math.max(0, Math.min(1, p.al / 100));
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const it of m.fx.items) {
      if (it.k === 'f') {
        const path = new Path2D();
        for (const pts of it.paths) { path.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]); path.closePath(); }
        g.globalAlpha = layerAlpha * Math.max(0, Math.min(1, it.a / 100));
        g.fillStyle = it.pat ? this.chequer : css(it.c);
        g.fill(path, 'evenodd');
      } else {
        g.globalAlpha = layerAlpha * Math.max(0, Math.min(1, it.a / 100));
        g.strokeStyle = css(it.c);
        g.lineWidth = it.w > 0 ? it.w : 1 / s;
        g.beginPath(); g.moveTo(it.pts[0], it.pts[1]);
        for (let i = 2; i < it.pts.length; i += 2) g.lineTo(it.pts[i], it.pts[i + 1]);
        g.stroke();
      }
    }
    g.restore();
    g.globalAlpha = 1;
    g.drawImage(this.inkC, 0, 0);
    for (const sp of m.sprites) {
      const img = m.images[sp.name];
      g.save();
      g.translate(sp.x, sp.y - 8 * m.sr); g.rotate(sp.rot * Math.PI / 180); g.scale(sp.xs / 100, sp.ys / 100);
      g.globalAlpha = Math.max(0, Math.min(1, sp.al / 100));
      g.imageSmoothingEnabled = img.emoji;
      g.drawImage(this.spriteCanvas(m, sp.name), img.emoji ? -img.w / 2 : 0, img.emoji ? -img.h / 2 : 0);
      g.restore();
    }
    g.globalAlpha = 1; g.imageSmoothingEnabled = false;
    g.drawImage(this.loC, 0, 0);
    g.restore();
  }
}
