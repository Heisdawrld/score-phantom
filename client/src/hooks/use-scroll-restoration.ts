import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

/**
 * A hook that saves the scroll position of a specific page to sessionStorage
 * and restores it when the user navigates back.
 * @param pageKey - A unique identifier for the page
 * @param isReady - Only restore scroll once the data is fully loaded and DOM is ready
 */
export function useScrollRestoration(pageKey: string, isReady: boolean = true) {
  const [location] = useLocation();
  const scrollPosRef = useRef<number>(0);

  useEffect(() => {
    if (!isReady) return;

    // 1. Restore scroll position
    const savedPosition = sessionStorage.getItem(`scroll_pos_${pageKey}`);
    if (savedPosition && parseInt(savedPosition, 10) > 0) {
      const pos = parseInt(savedPosition, 10);
      const timeouts: NodeJS.Timeout[] = [];
      
      // Cancel restoration if the user starts scrolling/interacting manually
      const cancelRestoration = () => {
        timeouts.forEach(clearTimeout);
      };
      
      window.addEventListener('touchstart', cancelRestoration, { once: true, passive: true });
      window.addEventListener('wheel', cancelRestoration, { once: true, passive: true });
      window.addEventListener('mousedown', cancelRestoration, { once: true, passive: true });

      // Use multiple attempts to ensure DOM has painted the loaded data 
      // and combat React 18 layout shifts or image loading
      [10, 50, 150, 300, 500, 800].forEach(delay => {
        timeouts.push(setTimeout(() => {
          window.requestAnimationFrame(() => {
            window.scrollTo({
              top: pos,
              behavior: 'instant',
            });
          });
        }, delay));
      });

      return () => {
        cancelRestoration();
        window.removeEventListener('touchstart', cancelRestoration);
        window.removeEventListener('wheel', cancelRestoration);
        window.removeEventListener('mousedown', cancelRestoration);
      };
    }
  }, [pageKey, isReady, location]);

  useEffect(() => {
    if (!isReady) return;

    // 2. Track scroll position continuously
    const handleScroll = () => {
      scrollPosRef.current = window.scrollY;
      // Also save to session storage immediately in case of a hard refresh
      sessionStorage.setItem(`scroll_pos_${pageKey}`, window.scrollY.toString());
    };

    // Throttle the scroll listener slightly for performance
    let isScrolling: any;
    const throttledScroll = () => {
      window.clearTimeout(isScrolling);
      isScrolling = setTimeout(handleScroll, 100);
    };

    window.addEventListener('scroll', throttledScroll);

    // Cleanup: save the final scroll position right before unmounting
    return () => {
      window.removeEventListener('scroll', throttledScroll);
      window.clearTimeout(isScrolling);
      // Only save if we actually scrolled down, to prevent overwriting with 0 during navigation transitions
      if (scrollPosRef.current > 0) {
        sessionStorage.setItem(`scroll_pos_${pageKey}`, scrollPosRef.current.toString());
      }
    };
  }, [pageKey, isReady]);
}