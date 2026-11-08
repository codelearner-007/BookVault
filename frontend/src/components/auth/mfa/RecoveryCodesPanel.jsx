'use client';

import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.enrol;
const COPIED_MS = 2000;

function downloadText(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Recovery codes, shown once: copy, download, then the one primary to confirm they are saved.
export function RecoveryCodesPanel({ codes, onDone, doneLabel = COPY.codesSaved }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div className="grid gap-5">
      <div>
        <p className="font-semibold">{COPY.codesTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.codesText}</p>
      </div>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-control bg-muted px-5 py-4 font-mono text-sm tabular-nums" aria-label={COPY.codesTitle}>
        {codes.map((code) => (
          <li key={code} className="select-all">{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
          <Copy aria-hidden="true" />
          {copied ? COPY.copied : COPY.copyCodes}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => downloadText(COPY.codesFile, text)}>
          <Download aria-hidden="true" />
          {COPY.download}
        </Button>
      </div>
      <Button type="button" className="w-full" onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
