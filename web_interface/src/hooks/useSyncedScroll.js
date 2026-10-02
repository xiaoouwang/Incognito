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

    let left = null;
    let right = null;
    let frame = 0;

    function onLeftScroll() {
      if (syncing.current || !left || !right) {
        return;
      }
      syncing.current = true;
      syncScrollPosition(left, right);
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    }

    function onRightScroll() {
      if (syncing.current || !left || !right) {
        return;
      }
      syncing.current = true;
      syncScrollPosition(right, left);
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    }

    function detach() {
      if (left) {
        left.removeEventListener("scroll", onLeftScroll);
      }
      if (right) {
        right.removeEventListener("scroll", onRightScroll);
      }
      left = null;
      right = null;
    }

    function attach() {
      const nextLeft = leftRef.current;
      const nextRight = rightRef.current;
      if (!nextLeft || !nextRight) {
        return false;
      }
      if (nextLeft === left && nextRight === right) {
        return true;
      }
      detach();
      left = nextLeft;
      right = nextRight;
      left.addEventListener("scroll", onLeftScroll, { passive: true });
      right.addEventListener("scroll", onRightScroll, { passive: true });
      return true;
    }

    function ensureAttached() {
      if (!attach()) {
        frame = requestAnimationFrame(ensureAttached);
      }
    }

    ensureAttached();

    return () => {
      cancelAnimationFrame(frame);
      detach();
    };
  }, [leftRef, rightRef, enabled]);
}
