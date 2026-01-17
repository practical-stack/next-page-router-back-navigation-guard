# 한계

`next-page-router-back-navigation-guard`의 알려진 한계와 동작하지 않는 케이스를 설명합니다.

---

## 1. 동일 App 내 History가 필요

**동일한 App 내에서 뒤로 갈 수 있는 브라우저 history가 존재하는 경우**에만 정상 동작합니다.

### 동작하지 않는 케이스

| 케이스 | 설명 |
|--------|------|
| 외부에서 직접 진입 | 다른 App/도메인에서 넘어온 첫 페이지에서 오버레이를 띄운 후 뒤로가기 |
| 새 탭에서 직접 열기 | 브라우저에서 해당 페이지가 완전히 첫 페이지인 경우 |
| 북마크/링크로 직접 접근 | URL을 직접 입력하거나 북마크로 접근한 경우 |

https://github.com/user-attachments/assets/b819ea8f-ea66-49c1-96fe-226afa8854f6

### 왜 동작하지 않는가?

이 라이브러리는 `history.go(1)`을 사용하여 뒤로가기를 차단합니다. 하지만 앞으로 갈 history가 없으면 `history.go(1)`이 무시됩니다.

```
[외부 사이트] → [현재 페이지 (오버레이 열림)]
                      ↑
                뒤로가기 시 앞으로 갈 history가 없음
```

### 왜 이것이 브라우저의 근본적인 한계인가

이것은 라이브러리 설계 결함이 아닌 브라우저의 근본적인 보안 제한입니다. 사용자가 외부 소스에서 앱으로 진입할 때(예: 다른 웹사이트의 링크 클릭 또는 URL 직접 입력), 진입 페이지에서 뒤로가기 버튼을 차단할 수 없는 이유는 다음과 같습니다:

1. **브라우저의 세션 히스토리는 네비게이션 목적으로 다른 origin 간에 공유됩니다** — JavaScript는 보안 제한으로 인해 다른 origin의 히스토리 항목에 접근하거나 조작할 수 없습니다.

2. **페이지가 외부에서 진입한 "첫 페이지"인지 감지하는 신뢰할 수 있는 방법이 없습니다** — `history.length`를 확인할 수 있지만, 다른 웹사이트에서 왔을 때 `history.length`가 1로 리셋되지 않기 때문에 신뢰할 수 없습니다.

3. **JavaScript는 세션 히스토리를 지우거나 뒤로/앞으로 네비게이션을 비활성화할 수 없습니다** — MDN 문서에 명시된 대로: "권한이 없는 코드에서 세션 히스토리를 지우거나 뒤로/앞으로 네비게이션을 비활성화할 방법이 없습니다."

### 참고 자료

- [MDN Web Docs - Window.history](https://developer.mozilla.org/en-US/docs/Web/API/Window/history): "보안상의 이유로 History 객체는 권한이 없는 코드가 세션 히스토리의 다른 페이지 URL에 접근하는 것을 허용하지 않습니다... 권한이 없는 코드에서 세션 히스토리를 지우거나 뒤로/앞으로 네비게이션을 비활성화할 방법이 없습니다."
- `history.length === 1` 체크는 진입 페이지 감지에 신뢰할 수 없습니다: "`history.length === 1` 체크는 확실히 부적절합니다. 다른 웹사이트에서 왔을 경우 `history.length`가 1이 아니기 때문입니다."

### 해결 방법

이 케이스를 해결하려면 오버레이를 열 때마다 history를 추가하는 방식으로 설계를 변경해야 합니다. (현재 버전 범위 밖)

---

## 2. 핸들러 내에서 router.push/replace 사용 시 히스토리 이슈 (Chrome 전용)

핸들러 내에서 `router.push()` 또는 `router.replace()`를 호출하면 **Chrome에서만 히스토리 스택이 꼬이는 문제**가 발생합니다. Safari에서는 정상 동작합니다.

### 문제 상황

```
1. 외부 페이지 → Page A → Page B (정상 이동)
2. Page B에서 뒤로가기
3. 핸들러가 router.push('/home')으로 Home 페이지로 리다이렉트
4. Home 페이지에서 뒤로가기
5. 예상: Page B 또는 Page A로 이동
6. 실제: 외부 페이지로 이탈 (앱 밖으로 나감)
```

#### 예상 동작 (Safari)
https://github.com/user-attachments/assets/7bca4852-ec3f-4da1-950a-c8fac1b25d45

#### 이슈 (Chrome)
https://github.com/user-attachments/assets/dd8b6d81-0c7b-499b-bfb3-525f634fdaa7

### 영향받는 코드

```typescript
useRegisterBackNavigationHandler(
  async () => {
    router.push('/home'); // 리다이렉트 후 히스토리가 꼬임
    return false;
  },
  { once: true }
);
```

### 브라우저별 동작

| 브라우저 | 이슈 발생 여부 |
|----------|---------------|
| Chrome (Windows) | 발생 |
| Mac Chrome | 발생 |
| Android Chrome | 미확인 |
| Mac Safari | 정상 동작 |
| iOS Safari | 정상 동작 |

> **Note**: Safari에서는 이 이슈가 발생하지 않습니다. Chrome 계열 브라우저에서만 확인된 문제입니다.

### 허용 가능한 케이스

**뒤로가기 시 특정 페이지로 리다이렉트**하는 용도로 사용할 때는 이 한계를 받아들일 수 있습니다:

```typescript
// 퍼널 이탈 방지: 뒤로가기 시 홈으로 리다이렉트
useRegisterBackNavigationHandler(
  async () => {
    router.push('/home');
    return false;
  },
  { once: true }
);
```

이 패턴의 의도는 사용자가 **이전 퍼널 단계로 돌아가지 못하게 막는 것**입니다. 리다이렉트된 페이지에서 다시 뒤로가기 시 앱 외부로 나가더라도, 원래 목적(특정 페이지를 뒤로가기로 다시 도달하지 못하게하는 것)은 달성되므로 이 한계를 수용할 수 있습니다.

---

## 3. 삼성 인터넷 브라우저 "뒤로가기 리디렉션 차단" 기능

| 문제 | 원인 |
|------|------|
| 뒤로가기 차단 불가 | 개인정보 설정의 "뒤로가기 리디렉션 차단" 기능이 `history.go(1)` / `history.go(delta)` 호출을 차단 |

삼성 인터넷 브라우저는 개인정보 설정에 **"뒤로가기 리디렉션 차단"** 기능이 있으며, **기본적으로 활성화**되어 있습니다. 이 기능이 활성화되면 라이브러리가 URL 복원을 위해 사용하는 `history.go(1)` 또는 `history.go(delta)` 호출이 차단되어 뒤로가기 차단이 동작하지 않습니다.

### Fallback 동작

삼성 인터넷 브라우저에서는 **뒤로가기를 막지 않는 대신 오버레이를 모두 unmount**하여 의도치 않은 에러를 방지합니다.

> **Note**: Fallback 시 `close` 대신 `unmountAll`을 사용하는 이유는, 뒤로가기 후 남아있는 오버레이 컴포넌트가 의도치 않은 에러를 발생시킬 수 있기 때문입니다.

### 참고 자료

- [Samsung Internet 11.2 adds option to prevent sites that stop you from going back (XDA Developers)](https://www.xda-developers.com/samsung-internet-11213-adds-option-prevent-sites-stop-going-back/)
- [How to Block Backward redirections - Samsung Manual (TechBone)](https://www.techbone.net/samsung/user-manual/block-backward-redirections)
- [삼성인터넷의 숨은 기능 - 리디렉션 차단 (Samsung Community Korea)](https://r1.community.samsung.com/t5/%EA%B8%B0%ED%83%80/tips-%EC%82%BC%EC%84%B1%EC%9D%B8%ED%84%B0%EB%84%B7%EC%9D%98-%EC%88%A8%EC%9D%80-%EA%B8%B0%EB%8A%A5-%EB%A6%AC%EB%94%94%EB%A0%89%EC%85%98-%EC%B0%A8%EB%8B%A8-amp-%EC%9B%B9%EC%82%AC%EC%9D%B4%ED%8A%B8%EC%97%90%EC%84%9C-%EA%B8%80%EA%BC%B4-%EC%82%AC%EC%9A%A9%ED%95%98%EA%B8%B0/td-p/10140484)

---

## 요약

| 한계 | 영향 | 대응 |
|------|------|------|
| 동일 App 내 History 필요 | 외부 진입 시 동작 안 함 | 사용자에게 안내 또는 별도 처리 필요 |
| 핸들러 내 router.push/replace | 히스토리 꼬임 (Chrome 전용, Safari 정상) | 퍼널 이탈 방지 목적이면 한계 수용 |
| 삼성 인터넷 "뒤로가기 리디렉션 차단" | 뒤로가기 차단 불가 | Fallback으로 오버레이 unmount |
