import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { useContext } from "react";
import { HandlerDef } from "./@shared/types";
import { DEBUG } from "./@shared/debug";
import { sortHandlersByPriority } from "./useInterceptPopState.helper/sort-handlers";
import {
  newToken,
  setupHistoryAugmentationOnce,
} from "./useInterceptPopState.helper/history-augmentation";
import type { RenderedState } from "./useInterceptPopState.helper/types";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";

/**
 * Popstate Interception Hook
 *
 * Handles back navigation interception for Next.js Pages Router.
 * Based on https://github.com/vercel/next.js/discussions/47020#discussioncomment-7826121
 * See docs/HISTORY_API_HACKS.md for detailed explanation.
 *
 * Key concepts:
 * - Token mismatch: Refresh or external domain entry (token missing or different)
 *   → Restore URL with history.go(1), allow with history.back()
 * - Internal navigation: Normal back navigation within app
 *   → Restore URL with history.go(-delta), allow with popstate dispatch
 *
 * @module useInterceptPopState
 */

const renderedStateRef: { current: RenderedState } = {
  current: { index: -1, token: "" },
};

/**
 * Hook that intercepts popstate events and runs registered handlers before navigation.
 *
 * @param params.handlerMap - Map of registered navigation handlers
 * @param params.preRegisteredHandler - Optional handler that runs before all others
 */
export function useInterceptPopState({
  handlerMap,
  preRegisteredHandler,
}: {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}) {
  const pagesRouter = useContext(RouterContext);

  useIsomorphicLayoutEffect(() => {
    const { writeState } = setupHistoryAugmentationOnce({ renderedStateRef });

    const handlePopState = createHandlePopState(
      handlerMap,
      writeState,
      preRegisteredHandler
    );

    if (pagesRouter) {
      pagesRouter.beforePopState(() => handlePopState(history.state));

      return () => {
        pagesRouter.beforePopState(() => true);
      };
    }
  }, [pagesRouter, preRegisteredHandler]);
}

// ============================================================================
// Navigation State Parsing
// ============================================================================

interface ParsedNavigationState {
  token: string | undefined;
  nextIndex: number;
}

function parseNavigationState(nextState: any = {}): ParsedNavigationState {
  return {
    token: nextState.__next_session_token,
    nextIndex: Number(nextState.__next_navigation_stack_index) || 0,
  };
}

function hasTokenMismatch(token: string | undefined, currentToken: string): boolean {
  return !token || token !== currentToken;
}

// ============================================================================
// Interception State
// ============================================================================

interface InterceptionState {
  // URL 복원 중인지 (history.go(1) 호출 후 발생하는 popstate 무시용)
  isRestoringUrl: boolean;
  // 핸들러가 네비게이션을 승인했는지 (다음 popstate에서 통과시킬지)
  isNavigationConfirmed: boolean;
}

function createInterceptionContext() {
  let state: InterceptionState = {
    isRestoringUrl: false,
    isNavigationConfirmed: false,
  };

  return {
    get: () => ({ ...state }),

    // URL 복원 상태
    // → true: history.go(1) 호출 직전 (다음 popstate 무시 필요)
    // → false: 복원 완료 후
    setRestoringUrl: (value: boolean) => {
      state = { ...state, isRestoringUrl: value };
    },

    // 네비게이션 승인 상태
    // → true: 핸들러가 true 반환 후, history.go/back 호출 직전
    // → false: 다음 popstate에서 확인 후 소비
    setNavigationConfirmed: (value: boolean) => {
      state = { ...state, isNavigationConfirmed: value };
    },

    // 네비게이션 승인 상태를 읽고 소비 (읽은 후 false로 리셋)
    consumeNavigationConfirmation: () => {
      const wasConfirmed = state.isNavigationConfirmed;
      state = { ...state, isNavigationConfirmed: false };
      return wasConfirmed;
    },
  };
}

// ============================================================================
// Handler Execution
// ============================================================================

interface HandlerContext {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}

async function runHandlerChain(
  context: HandlerContext,
  to: string
): Promise<boolean> {
  const { handlerMap, preRegisteredHandler } = context;

  // 1. Run preRegisteredHandler first (highest priority)
  if (preRegisteredHandler) {
    const shouldContinue = preRegisteredHandler();
    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by preRegisteredHandler`);
      return false;
    }
  }

  // 2. Run the first handler by priority
  const sortedHandlers = sortHandlersByPriority([...handlerMap.values()]);
  const firstHandler = sortedHandlers[0];

  if (firstHandler) {
    const shouldContinue = await firstHandler.callback({ to });

    // Handle once option - delete after execution
    if (firstHandler.once) {
      handlerMap.delete(firstHandler.id);
    }

    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by handler`);
      return false;
    }
  }

  return true;
}

function hasRegisteredHandlers(handlerMap: Map<string, HandlerDef>): boolean {
  return handlerMap.size > 0;
}

// ============================================================================
// Rendered State Computation (Pure Functions)
// ============================================================================

function computeRenderedState(token: string | undefined, nextIndex: number): RenderedState {
  return {
    token: token || newToken(),
    index: token ? nextIndex : 0,
  };
}

function computeRenderedStateWithIndex(current: RenderedState, nextIndex: number): RenderedState {
  return { ...current, index: nextIndex };
}

// ============================================================================
// Popstate Handler Factory
// ============================================================================

function createHandlePopState(
  handlerMap: Map<string, HandlerDef>,
  writeState: () => void,
  preRegisteredHandler?: () => boolean
) {
  const interception = createInterceptionContext();
  const handlerContext: HandlerContext = { handlerMap, preRegisteredHandler };

  return (nextState: any = {}): boolean => {
    const { token, nextIndex } = parseNavigationState(nextState);
    const state = interception.get();
    const isTokenMismatch = hasTokenMismatch(token, renderedStateRef.current.token!);
    const delta = nextIndex - renderedStateRef.current.index;

    // ========================================
    // 이미 승인된 네비게이션
    // ========================================
    if (state.isNavigationConfirmed) {
      if (DEBUG) console.log(`[Confirmed] Navigation confirmed by handler`);
      interception.consumeNavigationConfirmation();
      renderedStateRef.current = computeRenderedState(token, nextIndex);
      writeState();
      return true;
    }

    // ========================================
    // Token Mismatch (새로고침, 외부 진입)
    // ========================================
    if (isTokenMismatch) {
      // URL 복원 중 → 무시
      if (state.isRestoringUrl) {
        if (DEBUG) console.log(`[TokenMismatch] Ignoring (restoring URL)`);
        interception.setRestoringUrl(false);
        return false;
      }

      if (DEBUG) console.log(`[TokenMismatch] Detected (current: ${renderedStateRef.current.token}, next: ${token})`);

      // 핸들러 없음 → 허용
      if (!hasRegisteredHandlers(handlerMap)) {
        renderedStateRef.current = computeRenderedState(token, nextIndex);
        writeState();
        return true;
      }

      // URL 복원 후 핸들러 실행
      if (DEBUG) console.log(`[TokenMismatch] Restoring URL with history.go(1)`);
      interception.setRestoringUrl(true);
      window.history.go(1);

      setTimeout(async () => {
        interception.setRestoringUrl(false);
        const shouldNavigate = await runHandlerChain(handlerContext, "");
        if (shouldNavigate) {
          if (DEBUG) console.log(`[TokenMismatch] Handler confirmed`);
          renderedStateRef.current = computeRenderedState(token, nextIndex);
          writeState();
          interception.setNavigationConfirmed(true);
          window.history.back();
        } else {
          if (DEBUG) console.log(`[TokenMismatch] Handler blocked`);
        }
      }, 0);
      return false;
    }

    // ========================================
    // Internal Navigation (일반 뒤로/앞으로)
    // ========================================

    // delta === 0: 복원으로 발생한 중복 popstate → 무시
    if (delta === 0) {
      if (DEBUG) console.log(`[Internal] Ignoring (delta is 0)`);
      interception.setRestoringUrl(false);
      return false;
    }

    // 앞으로 가기 → 항상 허용
    if (delta > 0) {
      if (DEBUG) console.log(`[Internal] Forward navigation (delta: ${delta})`);
      renderedStateRef.current = computeRenderedStateWithIndex(renderedStateRef.current, nextIndex);
      return true;
    }

    if (DEBUG) console.log(`[Internal] Back navigation (delta: ${delta})`);

    // 핸들러가 이미 승인함 → 통과
    if (interception.consumeNavigationConfirmation()) {
      if (DEBUG) console.log(`[Internal] Already confirmed`);
      renderedStateRef.current = computeRenderedStateWithIndex(renderedStateRef.current, nextIndex);
      return true;
    }

    // 핸들러 없음 → 허용
    if (!hasRegisteredHandlers(handlerMap)) {
      if (DEBUG) console.log(`[Internal] No handlers`);
      renderedStateRef.current = computeRenderedStateWithIndex(renderedStateRef.current, nextIndex);
      return true;
    }

    // URL 복원 후 핸들러 실행
    if (DEBUG) console.log(`[Internal] Restoring URL with history.go(${-delta})`);
    window.history.go(-delta);

    (async () => {
      const to = location.pathname + location.search;
      const shouldNavigate = await runHandlerChain(handlerContext, to);
      if (shouldNavigate) {
        if (DEBUG) console.log(`[Internal] Handler confirmed`);
        interception.setNavigationConfirmed(true);
        window.history.go(delta);
      } else {
        if (DEBUG) console.log(`[Internal] Handler blocked`);
      }
    })();
    return false;
  };
}
