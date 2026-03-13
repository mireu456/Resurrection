# 무설치 포터블 배포 가이드

이 문서는 리저렉션 앱을 **무설치 단일 EXE**로 배포할 때 사용하는 실무 절차를 정리한 문서입니다.

## 1. 기본 배포(서명 없이)
1. 포터블 배포 + 검증 + 릴리즈 노트 초안 생성
   - `npm run dist`
2. 결과물 확인
   - EXE: `release/portable/*.exe`
   - 체크섬: `release/metadata/portable-sha256.txt`
   - 빌드 정보: `release/metadata/portable-build-info.json`
   - 릴리즈 노트: `release/notes/RELEASE_NOTES_v버전_날짜.md`

## 2. 코드 서명 배포
코드 서명은 배포 파일의 신뢰도를 높이고, Windows 경고를 줄이는 데 도움이 됩니다.

### 2-1. 환경 변수 설정 (PowerShell)
아래 두 방식 중 하나를 선택합니다.

1) Windows 전용 키 사용
- `$env:WIN_CSC_LINK='C:\\cert\\codesign.pfx'`
- `$env:WIN_CSC_KEY_PASSWORD='인증서비밀번호'`

2) 공통 키 사용
- `$env:CSC_LINK='C:\\cert\\codesign.pfx'`
- `$env:CSC_KEY_PASSWORD='인증서비밀번호'`

### 2-2. 서명 배포 실행
- `npm run dist:portable:signed`

이 명령은 다음을 순서대로 수행합니다.
1. 코드 서명 환경 변수 검사
2. 포터블 EXE 패키징
3. 체크섬/메타데이터 검증
4. 릴리즈 노트 템플릿 생성

## 3. 단일 단계 명령 요약
- 포터블 패키징만: `npm run dist:portable`
- 포터블 검증만: `npm run dist:portable:verify`
- 릴리즈 노트만 생성: `npm run release:notes`
- 전체 릴리즈 흐름: `npm run dist`

## 4. 배포 전 최종 체크
1. 관리자 권한 없이 EXE 실행 가능
2. 앱 재실행 후 AppData 설정/레이아웃 유지
3. 저장/복원/트레이 핵심 기능 스모크 테스트 통과
4. 체크섬 파일과 실제 EXE 파일명이 일치
5. (서명 배포 시) 릴리즈 노트의 코드 서명 상태가 `유효한 코드 서명`인지 확인
