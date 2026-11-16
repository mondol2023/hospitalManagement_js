import { Camera } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';

import { initials } from '@/shared/lib/format';
import { Button } from '@/shared/ui';

import { validateAvatar } from '../model/profile-forms';
import { useUploadAvatar } from '../model/use-profile';

/**
 * Profile photo, with the picture and the way to change it together.
 *
 * Only patients get this — the backend exposes `PUT /patients/me/avatar` and
 * nothing for staff — so the page renders it for patients alone rather than
 * offering a button that 403s.
 */
export function AvatarUploader({ name, src }: { name: string; src?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const [problem, setProblem] = useState<string | null>(null);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input either way, so choosing the same file again fires `change`.
    event.target.value = '';
    if (!file) return;

    const message = validateAvatar(file);
    setProblem(message);
    if (!message) upload.mutate(file);
  };

  return (
    <div className="flex items-center gap-4">
      {src ? (
        <img src={src} alt="" className="h-16 w-16 rounded-full border border-line object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft font-display text-lg font-bold text-brand"
        >
          {initials(name)}
        </span>
      )}

      <div className="flex flex-col items-start gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label="Profile photo file"
          tabIndex={-1}
          onChange={onChange}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={upload.isPending}
          leadingIcon={<Camera className="h-4 w-4" aria-hidden="true" />}
          onClick={() => inputRef.current?.click()}
        >
          {src ? 'Change photo' : 'Add photo'}
        </Button>
        {problem ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {problem}
          </p>
        ) : (
          <p className="text-xs text-muted">JPEG, PNG, WebP or GIF, up to 5 MB.</p>
        )}
      </div>
    </div>
  );
}
