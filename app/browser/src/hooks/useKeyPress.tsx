import { useEffect } from "react";

export const useKeypress = (key: string, action: () => void) => {
  useEffect(() => {
    const onKeyup = (e: KeyboardEvent) => {
      if (e.key === key) action();
    };
    globalThis.addEventListener("keyup", onKeyup);
    return () => globalThis.removeEventListener("keyup", onKeyup);
  }, [action]);
};
