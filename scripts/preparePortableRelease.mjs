import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const stagingDir = path.join(rootDir, 'release', 'staging');
const portableDir = path.join(rootDir, 'release', 'portable');
const metadataDir = path.join(rootDir, 'release', 'metadata');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readProductNameFromBuilder(builderConfigPath) {
  const config = fs.readFileSync(builderConfigPath, 'utf8');
  const productNameLine = config
    .split(/\r?\n/)
    .find((line) => line.trimStart().startsWith('productName:'));

  if (!productNameLine) {
    throw new Error('electron-builder.yml에서 productName을 찾지 못했습니다.');
  }

  // productName: 값 형태에서 값만 안전하게 추출합니다.
  return productNameLine.split(':').slice(1).join(':').trim().replace(/^["']|["']$/g, '');
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function pickPortableArtifact(expectedFilePath) {
  if (fs.existsSync(expectedFilePath)) {
    return expectedFilePath;
  }

  // 아티팩트명이 바뀌어도 복구할 수 있도록, 포터블 EXE 패턴으로 보조 탐색합니다.
  const candidates = fs
    .readdirSync(stagingDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /-portable-x64\.exe$/i.test(entry.name))
    .map((entry) => path.join(stagingDir, entry.name));

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length === 0) {
    throw new Error('release/staging에서 포터블 EXE를 찾지 못했습니다.');
  }

  throw new Error(
    `release/staging에 포터블 EXE가 ${candidates.length}개 존재합니다. 아티팩트명을 확인해 주세요.`,
  );
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  return hash.digest('hex');
}

async function main() {
  if (!fs.existsSync(stagingDir)) {
    throw new Error('release/staging 폴더가 없습니다. 먼저 포터블 빌드를 실행해 주세요.');
  }

  const packageJson = readJson(path.join(rootDir, 'package.json'));
  const productName = readProductNameFromBuilder(path.join(rootDir, 'electron-builder.yml'));
  const expectedFileName = `${productName}-${packageJson.version}-portable-x64.exe`;
  const sourceFilePath = pickPortableArtifact(path.join(stagingDir, expectedFileName));
  const sourceFileName = path.basename(sourceFilePath);

  ensureDirectory(portableDir);
  ensureDirectory(metadataDir);

  const targetFilePath = path.join(portableDir, sourceFileName);
  fs.copyFileSync(sourceFilePath, targetFilePath);

  const sha256 = await sha256File(targetFilePath);
  const generatedAt = new Date().toISOString();

  // 배포 검증 자동화를 위해 체크섬 파일을 고정 위치에 저장합니다.
  fs.writeFileSync(
    path.join(metadataDir, 'portable-sha256.txt'),
    `${sha256}  ${sourceFileName}\n`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(metadataDir, 'portable-build-info.json'),
    JSON.stringify(
      {
        generatedAt,
        productName,
        version: packageJson.version,
        artifactFileName: sourceFileName,
        sourcePath: path.relative(rootDir, sourceFilePath).replace(/\\/g, '/'),
        outputPath: path.relative(rootDir, targetFilePath).replace(/\\/g, '/'),
        sha256,
        releasePolicy: 'portable-only',
        dataStorage: 'AppData',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`[preparePortableRelease] 포터블 산출물 정리 완료`);
  console.log(`- 원본: ${path.relative(rootDir, sourceFilePath)}`);
  console.log(`- 배포본: ${path.relative(rootDir, targetFilePath)}`);
  console.log(`- 체크섬: release/metadata/portable-sha256.txt`);
  console.log(`- 메타정보: release/metadata/portable-build-info.json`);
}

main().catch((error) => {
  console.error(`[preparePortableRelease] 실패: ${error.message}`);
  process.exitCode = 1;
});
