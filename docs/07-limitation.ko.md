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

## 2. 핸들러 내에서 router.push/replace 사용 금지

**핸들러 내에서 `router.push()` 또는 `router.replace()`를 사용하는 것은 지원되지 않으며 예측 불가능한 동작을 유발합니다.**

### 왜 동작하지 않는가

핸들러가 `router.push('/new-page')`를 호출할 때:

1. 새 페이지(`/new-page`)는 일반적으로 **핸들러가 등록되어 있지 않습니다**
2. 새 페이지에서 뒤로가기를 누르면 **세션 토큰 불일치**가 발생합니다 (이전 세션과 새 세션의 히스토리 항목이 섞임)
3. 새 페이지에 핸들러가 없으면 네비게이션이 허용됩니다
4. 브라우저가 이전 세션의 **예상치 못한 히스토리 항목**으로 이동합니다

### 문제 시나리오 (새로고침 후)

```
1. Home → Page A (핸들러 있음)
2. Page A 새로고침
3. 뒤로가기 → 핸들러가 router.push('/new-page') 호출
4. /new-page에 도착 (핸들러 없음)
5. /new-page에서 뒤로가기
6. 예상: Page A로 돌아감
7. 실제: Home으로 이동 (또는 다른 예상치 못한 페이지)
```

이것이 발생하는 이유:
- 히스토리 스택에 새로고침 **이전**의 항목들이 존재합니다 (이전 세션 토큰)
- `/new-page`는 세션 토큰 불일치를 가로챌 핸들러가 없습니다
- 네비게이션이 예상 페이지 대신 이전 세션 항목으로 진행됩니다

### 근본 원인: 세션 토큰 격리

페이지 새로고침 후, 라이브러리는 새로운 세션 토큰을 생성합니다. 하지만:
- 이전 히스토리 항목들은 여전히 **이전 세션 토큰**을 가지고 있습니다
- `router.push()`로 추가된 새 페이지들은 **현재 세션 토큰**을 가집니다
- 핸들러가 없는 페이지들은 이 세션들을 구분할 수 없습니다
- 이로 인해 네비게이션이 이전 세션 히스토리로 "누출"됩니다

### 브라우저 뒤로가기 버튼 vs router.back() API

브라우저가 뒤로가기 버튼과 `history.back()` API를 처리하는 방식에는 중요한 차이가 있습니다:

| 네비게이션 방식 | 새로고침 후 동작 |
|-----------------|------------------|
| **브라우저 뒤로가기 버튼** | 항목을 건너뛰거나 popstate가 발생하지 않을 수 있음 (브라우저 보안 정책) |
| **`router.back()` / `history.back()` API** | 모든 히스토리 항목을 존중함 (정상 동작) |

**왜 이런 차이가 존재하는가:**

Chrome과 WebKit(Safari/iOS)은 **History Manipulation Intervention** 보안 기능을 구현합니다:

> "이 개입은 브라우저의 뒤로/앞으로 버튼이 사용자 활성화 없이 히스토리 항목을 추가하거나 사용자를 리다이렉트한 페이지를 건너뛰게 합니다."
> — [Chromium 문서](https://chromium.googlesource.com/chromium/src/+/refs/heads/lkgr/docs/history_manipulation_intervention.md)

**중요한 점은, 이 정책은 브라우저 UI 버튼에만 영향을 미치고 JavaScript API에는 영향을 미치지 않습니다:**

> "이것은 **브라우저 뒤로/앞으로 버튼에만 영향**을 미치며 `history.back()` 또는 `history.forward()` API에는 영향을 미치지 않습니다."

#### 새로고침 후 시나리오

```
새로고침 전:
- 모든 히스토리 항목이 사용자 상호작용으로 생성됨 ✅
- 브라우저가 이들을 "정당한" 것으로 취급

새로고침 후:
- 현재 페이지가 "새 문서 로드"
- 라이브러리가 URL 복원을 위해 history.go(1)을 호출할 때,
  이는 popstate 핸들러 내부에서 발생 (사용자 활성화 컨텍스트 없음)
- 브라우저가 후속 항목들을 "의심스러운" 것으로 취급할 수 있음
```

**결과:**
- `router.back()` 버튼 클릭 → 사용자 활성화 → API 호출 → 동작함 ✅
- 브라우저 뒤로가기 버튼 → 보안 정책 적용 → 항목을 건너뛰거나 실패할 수 있음 ❌

### iOS Safari 특정 이슈 (iOS 16+)

iOS Safari에는 추가적인 제한이 있습니다:

1. **스와이프 뒤로가기 제스처가 popstate를 발생시키지 않을 수 있음** ([WebKit Bug 248303](https://bugs.webkit.org/show_bug.cgi?id=248303))
   > "직접적인 사용자 상호작용 없이 추가된 히스토리 항목에 대해 스와이프 뒤로가기 제스처에서 popstate 이벤트가 발생하지 않습니다"

2. **네트워크 요청 중 popstate 이벤트가 손실됨** ([WebKit Bug 158489](https://bugs.webkit.org/show_bug.cgi?id=158489))
   - 이 이슈는 Chrome이나 Firefox에서는 발생하지 않습니다

3. **페이지 캐시 동작이 다름** ([WebKit Bug 145953](https://bugs.webkit.org/show_bug.cgi?id=145953))
   - pushState + 다른 곳으로 네비게이션 + 뒤로가기 후, Safari는 캐시에서 복원하는 대신 서버에서 페이지를 요청할 수 있습니다

### 브라우저 동작 요약

| 동작 | Chrome | Safari Desktop | iOS Safari |
|------|--------|----------------|------------|
| 사용자 활성화 없는 항목을 뒤로가기 버튼이 건너뜀 | ✅ | ✅ | ✅ |
| `history.back()` API가 모든 항목을 존중 | ✅ | ✅ | ✅ |
| 스와이프 뒤로가기에서 popstate (사용자 활성화 없음) | N/A | N/A | ❌ (iOS 16+) |
| 네트워크 요청 중 popstate 손실 | ❌ | ✅ | ✅ |
| `history.go()`가 비동기 | ✅ | ✅ | ✅ |

### 기술적 배경: history.go()는 비동기

MDN은 명시적으로 설명합니다:

> "이 메서드는 비동기입니다. 네비게이션이 완료되었을 때를 판단하려면 popstate 이벤트에 리스너를 추가하세요."
> — [MDN: History.go()](https://developer.mozilla.org/en-US/docs/Web/API/History/go)

이로 인해 타이밍 문제가 발생합니다:
```javascript
history.go(1);
// ❌ 이 코드는 go(1)이 완료되기 전에 실행됨
doSomething();

// ✅ 올바른 방법: popstate를 기다림
window.addEventListener('popstate', () => {
  doSomething();
});
history.go(1);
```

### 권장 패턴

핸들러 내에서 라우팅하는 대신, 다음 패턴을 사용하세요:

```typescript
// ✅ 좋음: 확인 다이얼로그 표시, 사용자가 결정
useRegisterBackNavigationHandler(() => {
  return window.confirm('저장되지 않은 변경사항이 있습니다. 그래도 나가시겠습니까?');
});

// ✅ 좋음: 오버레이/모달 닫고 네비게이션 차단
useRegisterBackNavigationHandler(() => {
  if (isModalOpen) {
    closeModal();
    return false; // 네비게이션 차단, 모달은 닫힘
  }
  return true; // 네비게이션 허용
});

// ❌ 나쁨: 핸들러 내에서 다른 페이지로 라우팅
useRegisterBackNavigationHandler(() => {
  router.push('/home'); // 이렇게 하지 마세요
  return false;
});
```

### 반드시 리다이렉트해야 하는 경우

사용 사례에서 반드시 뒤로가기 시 리다이렉트가 필요하다면, 다음을 인지하세요:
- 리다이렉트된 페이지에서의 후속 뒤로가기 네비게이션이 예상치 않게 동작할 수 있습니다
- 페이지 새로고침 후 브라우저 뒤로가기 버튼이 예상대로 동작하지 않을 수 있습니다
- `router.back()` API는 동작하지만 브라우저 뒤로가기 버튼은 동작하지 않을 수 있습니다
- 리다이렉트 후 사용자가 어디로 가는지 신경 쓰지 않는 경우에**만** 허용됩니다 (예: 퍼널 이탈 방지에서 앱을 떠나는 것이 허용되는 경우)

### 참고 자료

- [Chromium History Manipulation Intervention](https://chromium.googlesource.com/chromium/src/+/refs/heads/lkgr/docs/history_manipulation_intervention.md)
- [WebKit Bug 248303: 스와이프 뒤로가기에서 popstate가 발생하지 않음](https://bugs.webkit.org/show_bug.cgi?id=248303)
- [WebKit Bug 158489: 네트워크 요청 중 popstate 손실](https://bugs.webkit.org/show_bug.cgi?id=158489)
- [MDN: History.go()](https://developer.mozilla.org/en-US/docs/Web/API/History/go)
- [WHATWG HTML Issue #7832: History traversal user gesture](https://github.com/whatwg/html/issues/7832)

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
| 핸들러 내 router.push/replace | 예측 불가능한 네비게이션, 새로고침 후 브라우저 뒤로가기 버튼이 실패하지만 `router.back()`은 동작 | **사용 금지** - 다이얼로그 표시 또는 오버레이 닫기 권장 |
| 삼성 인터넷 "뒤로가기 리디렉션 차단" | 뒤로가기 차단 불가 | Fallback으로 오버레이 unmount |

### 핵심 요약

브라우저의 History API에는 우회할 수 없는 근본적인 보안 제한이 있습니다:

1. **브라우저 뒤로가기 버튼**은 히스토리 항목을 건너뛸 수 있는 보안 정책을 적용합니다
2. **`history.back()` API**는 모든 항목을 존중하지만 사용자 활성화 컨텍스트가 필요합니다
3. **페이지 새로고침 후**, 라이브러리는 핸들러가 없는 페이지에서 네비게이션을 신뢰성 있게 가로챌 수 없습니다
4. **iOS Safari**에는 popstate 이벤트에 대한 추가 제한이 있습니다

**가장 안전한 패턴**: 핸들러는 확인 다이얼로그 표시 또는 오버레이 닫기에만 사용하세요. 핸들러 내에서 라우팅을 수행하지 마세요.
