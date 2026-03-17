<div align="center">

# @lemon/write-helper

**Obsidian용 글쓰기 도우미 플러그인**

LLM 기반 태그 자동화 · 폼/인터랙티브 템플릿 · 파일 교정

[![Release](https://img.shields.io/badge/release-1.0.0-6c63ff?style=flat-square)](https://github.com/Lemon-Obsidian/write-helper/releases/latest)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.0%2B-7c3aed?style=flat-square&logo=obsidian&logoColor=white)](https://obsidian.md)
[![License](https://img.shields.io/github/license/Lemon-Obsidian/write-helper?style=flat-square&color=10b981)](LICENSE)

</div>

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🏷️ **LLM 태그 자동 생성** | 노트 저장 시 전체 내용을 LLM이 분석하여 태그 자동 생성. 전역 태그 목록을 참조해 재사용성 높은 태그 유지 |
| 🗂️ **전역 태그 관리** | vault 내 `.write-helper/tags.md`에 태그 목록 저장. UI에서 추가/삭제 가능 |
| 📋 **폼 기반 템플릿** | 필드(text/multiline/date/select/number)로 구성된 템플릿. 필드별 LLM 가공 + 미리보기 + 재생성 지원 |
| 🤖 **LLM 기반 템플릿** | 설정한 질문 순서대로 LLM이 멀티턴 대화로 노트 내용을 수집, 최종 정리 후 저장 |
| 🔍 **파일 교정** | 특정 폴더의 .md 파일을 템플릿 기준으로 검사. 누락 필드 표시 및 LLM 자동 채우기 지원 |
| ⚙️ **커스터마이징** | 태그 생성 프롬프트, OpenAI 모델, 플러그인 루트 폴더 경로 설정 가능 |

---

## 📦 설치

### BRAT 사용 (권장)

> 업데이트가 자동으로 적용됩니다.

1. [BRAT 플러그인](https://github.com/TfTHacker/obsidian42-brat) 설치
2. BRAT 설정 → **Add Beta plugin** 클릭
3. `https://github.com/Lemon-Obsidian/write-helper` 입력
4. **Add Plugin** 클릭 후 활성화

### 수동 설치

1. [최신 릴리즈](https://github.com/Lemon-Obsidian/write-helper/releases/latest)에서 `main.js`, `manifest.json`, `styles.css` 다운로드
2. vault의 `.obsidian/plugins/lemon-write-helper/` 폴더에 복사
3. Obsidian 설정 → 커뮤니티 플러그인 → **@lemon/write-helper** 활성화

---

## 🚀 시작하기

### 1. API 키 설정

설정 → **@lemon/write-helper** → OpenAI API 키 입력

### 2. 템플릿 생성

리본 아이콘(📋) 또는 커맨드 팔레트 → `템플릿 관리 열기`

**폼 기반 템플릿 예시 (`.write-helper/templates/daily.yaml`)**
```yaml
name: 일일 회고
type: form
fields:
  - id: date
    title: 날짜
    type: date
    required: true
  - id: content
    title: 오늘 한 일
    type: multiline
    required: true
    description: 자유롭게 적으세요
    llm_prompt: 아래 내용을 bullet point 형식의 업무 일지로 정리해주세요
  - id: mood
    title: 컨디션
    type: select
    required: false
    options:
      - 좋음
      - 보통
      - 나쁨
```

**LLM 기반 템플릿 예시 (`.write-helper/templates/meeting.yaml`)**
```yaml
name: 회의록
type: llm
system_prompt: 당신은 회의록 작성 도우미입니다. 질문을 통해 회의 내용을 정리해주세요.
question_flow:
  - 회의 참석자가 누구였나요?
  - 주요 안건은 무엇이었나요?
  - 각 안건에 대해 논의된 내용을 설명해주세요
  - 결정된 사항과 담당자가 있나요?
output_template: |
  # 회의록: {{date}}

  ## 참석자

  ## 안건 및 논의

  ## 결정 사항
```

### 3. 노트 작성

커맨드 팔레트 → `템플릿으로 새 노트 작성` → 템플릿 선택

### 4. 파일 교정

커맨드 팔레트 → `폴더 파일 교정` → 템플릿과 폴더 선택 후 검사

---

## 📁 데이터 구조

```
.write-helper/          # 플러그인 루트 폴더 (설정에서 변경 가능)
├── tags.md             # 전역 태그 목록
└── templates/
    ├── daily.yaml      # 폼 기반 템플릿
    └── meeting.yaml    # LLM 기반 템플릿
```

---

## ⌨️ 커맨드

| 커맨드 | 설명 |
|--------|------|
| `템플릿 관리 열기` | 템플릿 목록 보기/생성/편집/삭제 |
| `태그 관리 열기` | 전역 태그 목록 관리 |
| `템플릿으로 새 노트 작성` | 템플릿 선택 후 노트 작성 |
| `폴더 파일 교정` | 폴더 내 파일 템플릿 형식 검사 |

---

## 🛠️ 개발

```bash
# 의존성 설치
pnpm install

# 개발 모드 (파일 변경 감지)
pnpm dev

# 프로덕션 빌드
pnpm build
```

---

## 📄 라이선스

[MIT](LICENSE)
