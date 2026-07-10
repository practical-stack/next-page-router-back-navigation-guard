import { HandlerDef } from "../@shared/types";

/**
 * handler를 우선순위에 따라 정렬한다.
 * override handler는 overridePriority가 낮은 순서대로 먼저 실행한다(낮을수록 우선순위가 높다).
 * non-override handler는 override handler 다음에 실행한다.
 */
export function sortHandlersByPriority(handlers: HandlerDef[]): HandlerDef[] {
  return [...handlers].sort((left, right) => {
    if (left.override !== right.override) {
      return left.override ? -1 : 1;
    }

    return left.override ? left.overridePriority - right.overridePriority : 0;
  });
}
