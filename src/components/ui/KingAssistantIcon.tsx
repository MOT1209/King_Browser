import { MessageSquareText } from 'lucide-react';

interface KingAssistantIconProps {
  className?: string;
  size?: number;
  active?: boolean;
}

export function KingAssistantIcon({ className = '', size = 16, active = false }: KingAssistantIconProps) {
  return <MessageSquareText size={size} strokeWidth={active ? 2 : 1.75} className={`shrink-0 ${className}`} aria-hidden="true" />;
}
