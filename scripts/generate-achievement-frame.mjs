/**
 * Generates shared/assets/certificate-achievement-frame.png
 * Landscape A4 ratio (~297:210) ornate gold border, cream center, no text.
 */
import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../shared/assets/certificate-achievement-frame.png');

const W = 1485;
const H = 1050;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const cream = '#FDFBF2';
const gold = '#C5A059';
const goldDark = '#8B6914';
const goldLight = '#E8D5A8';

ctx.fillStyle = cream;
ctx.fillRect(0, 0, W, H);

function drawFloralBand(y, height) {
  const grad = ctx.createLinearGradient(0, y, 0, y + height);
  grad.addColorStop(0, goldLight);
  grad.addColorStop(0.5, gold);
  grad.addColorStop(1, goldLight);
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, W, height);

  ctx.strokeStyle = goldDark;
  ctx.lineWidth = 1;
  for (let x = 20; x < W - 20; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, y + height / 2);
    ctx.bezierCurveTo(x + 8, y + 4, x + 16, y + height - 4, x + 24, y + height / 2);
    ctx.bezierCurveTo(x + 32, y + 4, x + 40, y + height - 4, x + 48, y + height / 2);
    ctx.stroke();
  }
}

drawFloralBand(0, 52);
drawFloralBand(H - 52, 52);

const inset = 36;
ctx.strokeStyle = gold;
ctx.lineWidth = 2;
ctx.strokeRect(inset, inset + 40, W - inset * 2, H - inset * 2 - 80);

ctx.lineWidth = 0.8;
ctx.strokeRect(inset + 8, inset + 48, W - (inset + 8) * 2, H - (inset + 8) * 2 - 96);

function cornerOrnament(x, y, flipX, flipY) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.lineTo(0, 0);
  ctx.lineTo(40, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, 12, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

cornerOrnament(inset + 12, inset + 52, false, false);
cornerOrnament(W - inset - 12, inset + 52, true, false);
cornerOrnament(inset + 12, H - inset - 52, false, true);
cornerOrnament(W - inset - 12, H - inset - 52, true, true);

ctx.strokeStyle = gold;
ctx.lineWidth = 1.5;
for (let i = 0; i < 5; i++) {
  const y = H * 0.35 + i * (H * 0.08);
  ctx.beginPath();
  ctx.moveTo(W - inset - 4, y);
  ctx.lineTo(W - inset - 18, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(inset + 4, y);
  ctx.lineTo(inset + 18, y);
  ctx.stroke();
}

const buf = canvas.toBuffer('image/png');
writeFileSync(OUT, buf);
console.log('Wrote', OUT);
