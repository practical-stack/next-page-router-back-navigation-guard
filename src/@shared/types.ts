export interface BackNavigationParams {
  to: string;
}

export type BackNavigationCallback = (
  params: BackNavigationParams
) => boolean | Promise<boolean>;

export interface HandlerDef {
  id: string;
  callback: BackNavigationCallback;
  override: boolean;
  overridePriority: 0 | 1 | 2 | 3;
  once: boolean;
}
