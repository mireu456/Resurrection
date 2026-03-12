const fs = require('fs');
const path = require('path');

/**
 * electron-builder afterPack 훅
 * 패키징 후 불필요한 대용량 파일을 제거하여 인스톨러 크기 감소
 */
exports.default = async function(context) {
  const appOutDir = context.appOutDir;

  const filesToRemove = [
    // Chromium 라이선스 파일 (8.7MB) - 배포 시 불필요
    'LICENSES.chromium.html',
  ];

  for (const file of filesToRemove) {
    const filePath = path.join(appOutDir, file);
    if (fs.existsSync(filePath)) {
      const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
      fs.rmSync(filePath, { recursive: true, force: true });
      console.log(`  afterPack: 제거됨 ${file} (${sizeMB} MB)`);
    }
  }
};
