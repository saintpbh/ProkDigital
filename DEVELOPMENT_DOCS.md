# 집에서 개발 환경 설정 가이드 🏠

현재 '디지털 총회' 프로젝트는 로컬 서버 방식에서 **파이어베이스(Firebase) 서버리스 아키텍처**로 전환되었습니다. 집에서 작업을 이어가시려면 아래 단계를 따라주세요.

## 1. 코드 내려받기
- 이 리포지토리를 클론(`git clone`) 하거나 최신 상태를 `pull` 받으세요.

## 2. 필수 파일 복사 (보안상 Git에서 제외됨)
아래 파일들은 보안 및 용량 문제로 Git에 포함되지 않았습니다. 현재 사무실 PC의 아래 경로에서 파일을 복사해 집으로 가져가시거나 내용을 기록해 두세요.

- **파이어베이스 서비스 키**: `prok-ga-firebase-adminsdk-fbsvc-b88c438d41.json` (루트 폴더)
- **프론트엔드 환경 설정**: `frontend/.env`
- **백엔드 환경 설정**: `backend/.env`

## 3. 환경 변수 설정
`frontend/.env` 파일에 아래 파이어베이스 설정이 포함되어 있는지 확인하세요:
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=prok-ga.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prok-ga
...
```

## 4. 파이어베이스 CLI 로그인
터미널에서 아래 명령어로 로그인해야 배포가 가능합니다.
```powershell
npx firebase login
```
*참고: 이미 프로젝트가 **Blaze(종량제)** 요금제로 업그레이드 되어 있으며, `prok.oikos@gmail.com` 계정에 편집자 권한이 부여되어 있습니다.*

## 5. 실행 및 배포 명령어
- **개발 서버 실행 (프론트엔드)**: `cd frontend; npm run dev`
- **클라우드 함수 배포**: `npx firebase deploy --only functions`
- **호스팅 배포**: `npx firebase deploy --only hosting`

## 📝 현재 작업 진척도 (Phase 3 완료)
- [x] 프론트엔드 빌드 및 파이어베이스 호스팅 연결
- [x] 클라우드 함수(`validatePasscode`, `castVote`) 구현 및 배포
- [x] SPA 새로고침 시 404 방지 설정 (firebase.json)
- [ ] **Next Step**: `prok.or.kr` 도메인 연결 (A 레코드 설정 필요)
