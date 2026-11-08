'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.common;

// A password field with a show/hide toggle; props (id, aria-*) go to the input so FormControl works.
export const PasswordInput = React.forwardRef(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} className={cn('pe-12', className)} {...props} />
      <div className="absolute inset-y-0 end-1 flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={visible ? COPY.hidePassword : COPY.showPassword}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
