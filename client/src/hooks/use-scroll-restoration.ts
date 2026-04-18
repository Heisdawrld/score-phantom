import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * A hook that saves the scroll position of a specific page to sessionStorage
 * and restores it when the user navigates back.
 */
export function useScrollRestoration(pageKey: string) {
  const [location] = useLocation();

  useEffect(() => {
    // 1. Restore scroll position when the component mounts
    const savedPosition = sessionStorage.getItem(`scroll_pos_${pageKey}`);
    if (savedPosition) {
      // Use a slight timeout to ensure the DOM has rendered before scrolling
      setTimeout(() => {
        window.scrollTo({
          top: parseInt(savedPosition, 10),
          behavior: 'instant',
        });
      }, 50);
    }

    // 2. Track scroll position continuously while on the page
    const handleScroll = () => {
      sessionStorage.setItem(`scroll_pos_${pageKey}`, window.scrollY.toString());
    };

    // Throttle the scroll listener slightly for performance
    let isScrolling: any;
    const throttledScroll = () => {
      window.clearTimeout(isScrolling);
      isScrolling = setTimeout(handleScroll, 100);
    };

    window.addEventListener('scroll', throttledScroll);

    // Cleanup
    return () => {
      window.removeEventListener('scroll', throttledScroll);
      window.clearTimeout(isScrolling);
    };
  }, [pageKey, location]);
}