import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const portableDir = path.join(rootDir, 'release', 'portable');
const metadataDir = path.join(rootDir, 'release', 'metadata');

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

function readChecksumInfo(checksumFilePath) {
  if (!fs.existsSync(checksumFilePath)) {
    throw new Error('체크섬 파일이 없습니다. release/metadata/portable-sha256.txt를 확인해 주세요.');
  }

  const raw = fs.readFileSync(checksumFilePath, 'utf8').trim();
  const [hash, ...nameParts] = raw.split(/\s+/);
  const fileName = nameParts.join(' ').trim();

  if (!hash || !fileName) {
    throw new Error('체크섬 파일 형식이 잘못되었습니다. "해시 파일명" 형식인지 확인해 주세요.');
  }

  return { hash, fileName };
}

function pickPortableExe() {
  if (!fs.existsSync(portableDir)) {
    throw new Error('release/portable 폴더가 없습니다. 먼저 npm run dist:portable를 실행해 주세요.');
  }

  const exeFiles = fs
    .readdirSync(portableDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /-portable-x64\.exe$/i.test(entry.name))
    .map((entry) => path.join(portableDir, entry.name));

  if (exeFiles.length === 0) {
    throw new Error('release/portable에서 포터블 EXE를 찾지 못했습니다.');
  }

  // 최신 파일 1개를 검증 대상으로 선택합니다.
  return exeFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

async function main() {
  const portableExePath = pickPortableExe();
  const portableExeName = path.basename(portableExePath);
  const checksumInfo = readChecksumInfo(path.join(metadataDir, 'portable-sha256.txt'));
  const actualHash = await sha256File(portableExePath);

  if (checksumInfo.fileName !== portableExeName) {
    throw new Error(
      `체크섬 대상 파일명이 다릅니다. 체크섬=${checksumInfo.fileName}, 실제=${portableExeName}`,
    );
  }

  if (checksumInfo.hash.toLowerCase() !== actualHash.toLowerCase()) {
    throw new Error('체크섬 검증 실패: 파일이 변경되었거나 메타정보가 오래되었습니다.');
  }

  const buildInfoPath = path.join(metadataDir, 'portable-build-info.json');
  if (!fs.existsSync(buildInfoPath)) {
    throw new Error('빌드 메타정보 파일이 없습니다. release/metadata/portable-build-info.json을 확인해 주세요.');
  }

  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  if (buildInfo.artifactFileName !== portableExeName) {
    throw new Error(
      `메타정보 파일명 불일치: metadata=${buildInfo.artifactFileName}, 실제=${portableExeName}`,
    );
  }

  console.log('[verifyPortableRelease] 포터블 배포본 검증 성공');
  console.log(`- 파일: ${path.relative(rootDir, portableExePath)}`);
  console.log(`- SHA-256: ${actualHash}`);
}

main().catch((error) => {
  console.error(`[verifyPortableRelease] 실패: ${error.message}`);
  process.exitCode = 1;
});
