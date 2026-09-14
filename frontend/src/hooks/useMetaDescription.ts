import { useEffect } from 'react';

export function useMetaDescription(description: string) {
  useEffect(() => {
    let metaDescription = document.querySelector('meta[name="description"]');
    const originalContent = metaDescription ? metaDescription.getAttribute('content') : '';

    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    
    metaDescription.setAttribute('content', description);

    return () => {
      if (metaDescription) {
        if (originalContent) {
          metaDescription.setAttribute('content', originalContent);
        } else {
          document.head.removeChild(metaDescription);
        }
      }
    };
  }, [description]);
}
