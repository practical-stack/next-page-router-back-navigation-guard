import React, { createContext, useState } from "react";
import { useInterceptPopState } from "./useInterceptPopState";
import { HandlerDef } from "./@shared/types";

export const BackNavigationHandlerContext = createContext<
  Map<string, HandlerDef> | undefined
>(undefined);
BackNavigationHandlerContext.displayName = "BackNavigationHandlerContext";

export interface BackNavigationHandlerProviderProps {
  children: React.ReactNode;
  preRegisteredHandler?: () => boolean;
}

export function BackNavigationHandlerProvider({
  children,
  preRegisteredHandler,
}: BackNavigationHandlerProviderProps) {
  const [handlerMap] = useState(() => new Map<string, HandlerDef>());

  useInterceptPopState({ handlerMap, preRegisteredHandler });

  return (
    <BackNavigationHandlerContext.Provider value={handlerMap}>
      {children}
    </BackNavigationHandlerContext.Provider>
  );
}
