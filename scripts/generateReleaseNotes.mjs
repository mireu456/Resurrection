import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const portableDir = path.join(rootDir, 'release', 'portable');
const metadataDir = path.join(rootDir, 'release', 'metadata');
const notesDir = path.join(rootDir, 'release', 'notes');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readChecksumInfo(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const [hash, ...nameParts] = raw.split(/\s+/);
  const fileName = nameParts.join(' ').trim();

  if (!hash || !fileName) {
    throw new Error('portable-sha256.txt 형식이 올바르지 않습니다.');
  }

  return { hash, fileName };
}

function formatDateForFileName(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function makeUniqueFilePath(basePath) {
  if (!fs.existsSync(basePath)) {
    return basePath;
  }

  const parsed = path.parse(basePath);
  let index = 1;
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    index += 1;
  }
}

function escapeSingleQuotedPowerShell(value) {
  return value.replace(/'/g, "''");
}

function runPowerShell(command) {
  const candidates = [
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'powershell',
    'pwsh',
  ];

  const executable = candidates.find((candidate) => {
    // PATH 명령(예: powershell/pwsh)은 마지막 fallback으로 항상 시도합니다.
    if (!candidate.includes('\\')) {
      return true;
    }
    return fs.existsSync(candidate);
  });

  return execFileSync(
    executable,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      encoding: 'utf8',
    },
  ).trim();
}

function readCodeSignatureInfo(exePath) {
  const escapedPath = escapeSingleQuotedPowerShell(exePath);

  try {
    const status = runPowerShell(
      `(Get-AuthenticodeSignature -LiteralPath '${escapedPath}').Status.ToString()`,
    );

    if (status === 'NotSigned') {
      return {
        Status: status,
        StatusMessage: '디지털 서명이 적용되지 않았습니다.',
        Subject: null,
        Issuer: null,
        NotAfter: null,
      };
    }

    const certRaw = runPowerShell(`
$cert = (Get-AuthenticodeSignature -LiteralPath '${escapedPath}').SignerCertificate
if ($null -eq $cert) {
  '{}'
} else {
  [PSCustomObject]@{
    Subject = $cert.Subject
    Issuer = $cert.Issuer
    NotAfter = $cert.NotAfter.ToString('yyyy-MM-dd HH:mm:ss')
  } | ConvertTo-Json -Compress
}
`.trim());

    const certInfo = certRaw ? JSON.parse(certRaw) : {};
    return {
      Status: status || 'Unknown',
      StatusMessage: status === 'Valid' ? '유효한 코드 서명입니다.' : '코드 서명 상태 확인 필요',
      Subject: certInfo.Subject ?? null,
      Issuer: certInfo.Issuer ?? null,
      NotAfter: certInfo.NotAfter ?? null,
    };
  } catch {
    // 서명 정보 조회에 실패해도 릴리즈 노트 생성을 막지 않습니다.
    return {
      Status: 'Unknown',
      StatusMessage: '코드 서명 상태 조회 실패',
      Subject: null,
      Issuer: null,
      NotAfter: null,
    };
  }
}

function toKoreanSignatureLabel(status) {
  if (status === 'Valid') {
    return '유효한 코드 서명';
  }

  if (status === 'NotSigned') {
    return '서명되지 않음';
  }

  return `확인 필요 (${status})`;
}

function main() {
  const buildInfoPath = path.join(metadataDir, 'portable-build-info.json');
  const checksumPath = path.join(metadataDir, 'portable-sha256.txt');

  if (!fs.existsSync(buildInfoPath) || !fs.existsSync(checksumPath)) {
    throw new Error(
      '배포 메타데이터가 없습니다. 먼저 `npm run dist:portable`를 실행해 주세요.',
    );
  }

  const buildInfo = readJson(buildInfoPath);
  const checksum = readChecksumInfo(checksumPath);
  const artifactPath = path.join(rootDir, buildInfo.outputPath);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`배포 EXE를 찾지 못했습니다: ${buildInfo.outputPath}`);
  }

  const stat = fs.statSync(artifactPath);
  const signature = readCodeSignatureInfo(artifactPath);

  fs.mkdirSync(notesDir, { recursive: true });

  const now = new Date();
  const dateText = formatDateForFileName(now);
  const baseFilePath = path.join(
    notesDir,
    `RELEASE_NOTES_v${buildInfo.version}_${dateText}.md`,
  );
  const noteFilePath = makeUniqueFilePath(baseFilePath);

  // 초안 템플릿은 자동 기입 가능한 값과 수동 작성 항목을 함께 제공합니다.
  const template = `# 리저렉션 v${buildInfo.version} 릴리즈 노트 (${dateText})

## 1) 릴리즈 정보
- 생성 시각(UTC): ${buildInfo.generatedAt}
- 배포 정책: ${buildInfo.releasePolicy}
- 데이터 저장 위치: ${buildInfo.dataStorage}

## 2) 배포 아티팩트
- 파일명: ${buildInfo.artifactFileName}
- 파일 경로: ${buildInfo.outputPath}
- 파일 크기: ${stat.size.toLocaleString()} bytes
- SHA-256: \`${checksum.hash}\`

## 3) 코드 서명 정보
- 서명 상태: ${toKoreanSignatureLabel(signature.Status)}
- 상세 상태: ${signature.StatusMessage ?? '-'}
- 인증서 주체(Subject): ${signature.Subject ?? '-'}
- 인증서 발급자(Issuer): ${signature.Issuer ?? '-'}
- 인증서 만료일: ${signature.NotAfter ?? '-'}

## 4) 변경 사항 요약 (수동 작성)
- [ ] 핵심 기능 변경점 3~5개를 작성한다.
- [ ] 사용자 관점에서 바뀐 점을 한 줄씩 작성한다.
- [ ] 주의가 필요한 변경(브레이킹/권한/환경)을 명시한다.

## 5) 검증 결과 (수동 작성)
- [ ] 관리자 권한 없이 실행 확인
- [ ] 앱 재실행 후 설정/레이아웃 유지 확인
- [ ] 핵심 흐름(저장/복원/트레이) 스모크 테스트 확인

## 6) 배포 메모 (수동 작성)
- [ ] 배포 채널(사내/외부)과 배포 일시 기록
- [ ] 롤백 기준 및 연락 경로 기록
`;

  fs.writeFileSync(noteFilePath, template, 'utf8');

  console.log('[generateReleaseNotes] 릴리즈 노트 템플릿 생성 완료');
  console.log(`- 파일: ${path.relative(rootDir, noteFilePath)}`);
}

try {
  main();
} catch (error) {
  console.error(`[generateReleaseNotes] 실패: ${error.message}`);
  process.exitCode = 1;
}
