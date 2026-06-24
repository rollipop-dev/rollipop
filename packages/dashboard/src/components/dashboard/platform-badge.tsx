import { Badge } from '../ui/badge';

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <Badge variant="outline" className="bg-background text-foreground">
      <PlatformIcon platform={platform} />
      {platform}
    </Badge>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'ios') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <path
          fill="currentColor"
          d="M16.4 13.2c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.8-1.4-.1-2.6.8-3.3.8s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 7 1.1 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8 2-.1 2.9-1.4c.9-1.3 1.2-2.6 1.2-2.7 0 0-2.8-1.1-2.8-4.5ZM14.2 6.5c.7-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.7-1.3Z"
        />
      </svg>
    );
  }

  if (platform === 'android') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <path
          fill="currentColor"
          d="M17.6 9H6.4C5.6 9 5 9.6 5 10.4V17c0 .8.6 1.4 1.4 1.4h.8v2.1c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-2.1h5.2v2.1c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-2.1h.8c.8 0 1.4-.6 1.4-1.4v-6.6c0-.8-.6-1.4-1.4-1.4ZM7.4 7.4h9.2c-.3-1.2-1.1-2.2-2.2-2.8l.8-1.4c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-.8 1.4c-.5-.2-1-.3-1.6-.3s-1.1.1-1.6.3l-.8-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6l.8 1.4C8.5 5.2 7.7 6.2 7.4 7.4Zm2.5-1.2c-.3 0-.5-.2-.5-.5s.2-.5.5-.5.5.2.5.5-.2.5-.5.5Zm4.2 0c-.3 0-.5-.2-.5-.5s.2-.5.5-.5.5.2.5.5-.2.5-.5.5ZM3.5 10c-.6 0-1.1.5-1.1 1.1v4.5c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-4.5c0-.6-.5-1.1-1.1-1.1Zm17 0c-.6 0-1.1.5-1.1 1.1v4.5c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-4.5c0-.6-.5-1.1-1.1-1.1Z"
        />
      </svg>
    );
  }

  return null;
}
