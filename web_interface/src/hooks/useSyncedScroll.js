import { useEffect, useRef } from "react";

function syncScrollPosition(source, target) {
  const sourceMax = source.scrollHeight - source.clientHeight;
  const targetMax = target.scrollHeight - target.clientHeight;

  if (sourceMax <= 0) {
    target.scrollTop = 0;
    return;
  }

  const ratio = source.scrollTop / sourceMax;
  target.scrollTop = ratio * Math.max(targetMax, 0);
}

export function useSyncedScroll(leftRef, rightRef, enabled) {
  const syncing = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) {
      return undefined;
    }

    function onLeftScroll() {
      if (syncing.current) {
        return;
      }
      syncing.current = true;
      syncScrollPosition(left, right);
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    }

    function onRightScroll() {
      if (syncing.current) {
        return;
      }
      syncing.current = true;
      syncScrollPosition(right, left);
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    }

    left.addEventListener("scroll", onLeftScroll, { passive: true });
    right.addEventListener("scroll", onRightScroll, { passive: true });

    return () => {
      left.removeEventListener("scroll", onLeftScroll);
      right.removeEventListener("scroll", onRightScroll);
    };
  }, [leftRef, rightRef, enabled]);
}
