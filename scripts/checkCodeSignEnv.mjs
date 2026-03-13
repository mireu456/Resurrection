import fs from 'node:fs';

const ENV_GROUPS = [
  {
    linkKey: 'WIN_CSC_LINK',
    passwordKey: 'WIN_CSC_KEY_PASSWORD',
    name: 'WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD (Windows 전용)',
  },
  {
    linkKey: 'CSC_LINK',
    passwordKey: 'CSC_KEY_PASSWORD',
    name: 'CSC_LINK / CSC_KEY_PASSWORD (공통)',
  },
];

function looksLikeLocalPath(value) {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  // URL/데이터 URI는 로컬 경로 검사 대상에서 제외합니다.
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('base64:')
  ) {
    return false;
  }

  // Windows 절대 경로(C:\...), 상대 경로(./, ../), 루트 경로(/)를 로컬 파일로 판단합니다.
  return (
    /^[a-zA-Z]:[\\/]/.test(normalized) ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    normalized.startsWith('.\\') ||
    normalized.startsWith('..\\')
  );
}

function formatMaskedLink(value) {
  if (!value) {
    return '(없음)';
  }

  if (value.length <= 12) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

function main() {
  const matchedGroup = ENV_GROUPS.find(
    (group) => process.env[group.linkKey] && process.env[group.passwordKey],
  );

  if (!matchedGroup) {
    console.error('[checkCodeSignEnv] 코드 서명 환경 변수가 준비되지 않았습니다.');
    console.error('- 아래 둘 중 한 조합을 설정한 뒤 다시 실행해 주세요.');
    for (const group of ENV_GROUPS) {
      console.error(`  - ${group.name}`);
    }
    console.error('');
    console.error('PowerShell 예시:');
    console.error("$env:WIN_CSC_LINK='C:\\cert\\codesign.pfx'");
    console.error("$env:WIN_CSC_KEY_PASSWORD='비밀번호'");
    console.error('npm run dist:portable:signed');
    process.exitCode = 1;
    return;
  }

  const linkValue = process.env[matchedGroup.linkKey];
  if (looksLikeLocalPath(linkValue) && !fs.existsSync(linkValue)) {
    console.error(`[checkCodeSignEnv] 서명 인증서 파일을 찾지 못했습니다: ${linkValue}`);
    process.exitCode = 1;
    return;
  }

  console.log('[checkCodeSignEnv] 코드 서명 환경 변수 확인 완료');
  console.log(`- 사용 키: ${matchedGroup.name}`);
  console.log(`- 인증서 링크: ${formatMaskedLink(linkValue)}`);
}

main();
