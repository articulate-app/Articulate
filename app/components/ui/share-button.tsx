import { useState } from 'react';
import { Button } from './button';
import { Share2 } from 'lucide-react';

interface ShareButtonProps {
  url?: string;
  className?: string;
}

export function ShareButton({ url, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const shareUrl = url || window.location.href;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={className}
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy link'}
      aria-label="Share"
    >
      <Share2 className="w-4 h-4" />
    </Button>
  );
} 