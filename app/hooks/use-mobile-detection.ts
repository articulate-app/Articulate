import { useEffect, useState } from 'react';

export function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function checkMobile() {
      // Check if window is available (SSR safety)
      if (typeof window === 'undefined') return;
      
      // Use both media query and window width for better detection
      const mediaQuery = window.matchMedia('(max-width: 768px)');
      const isMobileView = mediaQuery.matches || window.innerWidth < 768;
      
      setIsMobile(isMobileView);
    }

    // Check on mount
    checkMobile();

    // Listen for resize events
    window.addEventListener('resize', checkMobile);
    
    // Listen for media query changes
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    mediaQuery.addEventListener('change', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQuery.removeEventListener('change', checkMobile);
    };
  }, []);

  return isMobile;
} 