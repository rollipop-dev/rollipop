import { Download, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { getDevServerResourceUrl } from '../../lib/api';
import { Button } from '../ui/button';

export function DownloadFileButton({
  href,
  fileName,
  label,
}: {
  href: string | undefined;
  fileName: string;
  label: string;
}) {
  const [downloading, setDownloading] = useState(false);

  if (href == null) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Download className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
    );
  }

  const download = async () => {
    if (downloading) return;

    setDownloading(true);

    try {
      const response = await fetch(getDevServerResourceUrl(href));
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.style.display = 'none';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download file');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" disabled={downloading} onClick={download}>
      {downloading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
