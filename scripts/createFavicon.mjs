/**
 * favicon_resurrection.png를 파비콘용으로 변환하는 스크립트
 * - 투명 여백 트림 후 최소 패딩(1px)만 유지
 * - favicon.ico, favicon-16x16.png, favicon-32x32.png, favicon-48x48.png
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const INPUT = path.join(ASSETS_DIR, 'favicon_resurrection.png');
const OUTPUT_ICO = path.join(ASSETS_DIR, 'favicon.ico');
const SIZES = [16, 32, 48];
const MIN_PADDING = 1; // 최소 여백 (픽셀)

async function getTrimmedSquareBuffer() {
  // 1. 투명 여백 트림
  const { data, info } = await sharp(INPUT)
    .trim({ threshold: 5 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels = 4 } = info;

  // 2. 정사각형으로 만들기 (최소 패딩만 추가)
  const maxDim = Math.max(w, h);
  const padW = maxDim - w;
  const padH = maxDim - h;
  const left = Math.floor(padW / 2) + MIN_PADDING;
  const right = padW - Math.floor(padW / 2) + MIN_PADDING;
  const top = Math.floor(padH / 2) + MIN_PADDING;
  const bottom = padH - Math.floor(padH / 2) + MIN_PADDING;

  return sharp(data, { raw: { width: w, height: h, channels } })
    .extend({
      top,
      bottom,
      left,
      right,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function createFavicon() {
  if (!fs.existsSync(INPUT)) {
    console.error('입력 파일 없음:', INPUT);
    process.exit(1);
  }

  const trimmedSquarePng = await getTrimmedSquareBuffer();
  const basePipeline = () => sharp(trimmedSquarePng);

  // 256x256 (png-to-ico용)
  const square256 = path.join(ASSETS_DIR, 'favicon_256_temp.png');
  await basePipeline().resize(256, 256).toFile(square256);

  for (const size of SIZES) {
    const buf = await basePipeline().resize(size, size).toBuffer();
    const pngPath = path.join(ASSETS_DIR, `favicon-${size}x${size}.png`);
    fs.writeFileSync(pngPath, buf);
    console.log(`생성: favicon-${size}x${size}.png`);
  }

  const ico = await pngToIco(square256);
  fs.unlinkSync(square256);
  fs.writeFileSync(OUTPUT_ICO, ico);
  console.log('생성: favicon.ico');
  console.log('완료.');
}

createFavicon().catch((err) => {
  console.error(err);
  process.exit(1);
});
