# 모니터 컨텍스트 복원 개편 v2 작업 목록

## 구현 작업
1. `Settings.lastRestoredByMonitorKey`, `Layout.monitorContext`, 확장된 `WindowInfo`를 저장 스키마에 반영한다.
2. `lastLayoutId`는 레거시 fallback 전용으로 유지하고, 앱 시작 시 설정 데이터를 안전하게 정규화한다.
3. 연결된 모니터 세트를 기준으로 strict/fuzzy 키를 만드는 모니터 컨텍스트 유틸을 추가한다.
4. 레이아웃 저장 시점에 `monitorContext`를 함께 저장한다.
5. 복원 성공 시 단일 포인터 대신 모니터 키 맵을 갱신하도록 바꾼다.
6. 자동 복원 대상 조회 순서를 strict -> fuzzy -> 레거시 fallback(맵이 비어 있을 때만)으로 적용한다.
7. 복원 흐름을 `manual`/`auto` 모드로 분리하고 모드별 정책에 맞게 복원 시도를 수행한다.
8. 확인 다이얼로그를 트레이 풍선 팝업으로 교체한다(`클릭=복원`, 그 외=취소).
9. 자동 복원을 비침습 정책으로 고정한다(포커스 탈취/앱 실행 유발 금지).
10. 모니터 이벤트에 디바운스, 동일 키 중복 억제, in-flight 가드, latest-only 처리를 추가한다.
11. 복원 매칭을 점수 기반 + 재시도 + 창 단위 상태/실패 사유 추적으로 고도화한다.
12. 운영 가시성을 위해 복원 실패 로그를 구조화한다.

## 검증 체크리스트
1. 모니터 순서가 바뀌어도 strict/fuzzy 키 일관성이 유지되는지 확인한다.
2. 레거시 + 신규 설정 데이터 공존 시 신규 우선 + fallback 동작이 맞는지 확인한다.
3. 모니터 컨텍스트별로 기대한 레이아웃이 자동 복원되는지 확인한다.
4. 트레이 확인 상태 분기(클릭, 닫힘/만료, 표시 실패)가 의도대로 동작하는지 확인한다.
5. 자동 복원 중 포그라운드 활성화 회귀가 없는지 확인한다.
6. 다중 창/유사 제목 상황에서 오매칭 없이 실패 사유가 정확히 기록되는지 확인한다.
7. `npm run build`(Vite + TypeScript) 검증이 통과하는지 확인한다.

## 무설치(포터블 EXE) 배포 전환

### 구현 작업
1. `electron-builder.yml`의 Windows 타깃을 `nsis`에서 `portable(x64)`로 전환한다.
2. 아티팩트 파일명을 `제품명-버전-portable-x64.exe` 규칙으로 고정한다.
3. 배포 산출물 디렉토리를 `release/staging`, `release/portable`, `release/metadata` 3단계로 표준화한다.
4. `npm run dist:portable` 스크립트를 추가해 빌드 + 포터블 패키징 + 산출물 정리(복사/체크섬 생성)를 자동화한다.
5. `npm run dist:portable:verify` 스크립트를 추가해 EXE/체크섬/빌드 메타정보 정합성을 검증한다.
6. 배포 정책을 `무설치 전용`, `단일 EXE`, `AppData 저장 유지`, `수동 배포` 기준으로 문서화한다.
7. PRD 내 기존 NSIS 설치형 문구를 포터블 배포 기준으로 정합성 있게 수정한다.
8. 코드 서명 전용 배포 커맨드(`npm run dist:portable:signed`)와 인증서 환경 변수 검사 스크립트를 추가한다.
9. 릴리즈 노트 템플릿 자동 생성 스크립트(`npm run release:notes`)를 추가한다.

### 수동 배포 체크리스트
1. `npm run build`가 성공하는지 확인한다.
2. `npm run dist:portable` 실행 후 `release/portable/*.exe`가 생성되는지 확인한다.
3. `release/metadata/portable-sha256.txt`, `release/metadata/portable-build-info.json` 생성 여부를 확인한다.
4. `npm run dist:portable:verify`가 성공하는지 확인한다.
5. 관리자 권한 없이 EXE가 실행되는지 확인한다.
6. 앱을 종료 후 다시 실행해도 AppData 기반 설정/레이아웃이 유지되는지 확인한다.
7. `npm run dist:portable:signed` 실행 시 환경 변수 누락을 정확히 감지하는지 확인한다.
8. 릴리즈 노트(`release/notes/*.md`)가 자동 생성되고 서명 상태가 기입되는지 확인한다.
