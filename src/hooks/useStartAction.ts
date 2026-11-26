import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opens a page's EXISTING modal when the URL asks for it (`?start=<action>`), as the
 * Welcome modal does. The parameter is a fixed word only, never record data.
 * It stays in the URL while that modal is open (so a reload or remount reopens it)
 * and is removed when the modal closes.
 */
export function useStartAction(action: string, isOpen: boolean, open: () => void) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('start') === action;
  const wasOpen = useRef(false);

  useEffect(() => {
    if (requested && !isOpen && !wasOpen.current) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      if (requested) {
        setParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('start');
          return next;
        }, { replace: true });
      }
    }
  }, [isOpen, requested, setParams]);
}
