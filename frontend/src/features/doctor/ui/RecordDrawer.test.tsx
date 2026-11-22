import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import type { Role } from '@/shared/lib/roles';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { record, routes, userOf } from '../test-fixtures';
import { RecordDrawer } from './RecordDrawer';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

function signInAs(role: Role, id = 'u-doc') {
  useAuthStore
    .getState()
    .setSession({ user: userOf(role, { id }), accessToken: 'a', refreshToken: 'r' });
}

const png = (name = 'scan.png', bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' });

function open(recordId: string | null = 'r1', onClose = vi.fn()) {
  renderWithProviders(<RecordDrawer recordId={recordId} onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  signInAs('doctor');
  client.get.mockImplementation(routes({ '/medical-records/r1': record('r1', 'Ada Lovelace') }));
});

describe('RecordDrawer', () => {
  it('stays closed, and asks for nothing, until a record is chosen', () => {
    open(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });

  it('shows a skeleton while the record loads', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    open();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading the record/i })).toBeInTheDocument();
  });

  it('shows the whole record', async () => {
    open();

    const dialog = await screen.findByRole('dialog', { name: /ada lovelace/i });
    expect(dialog).toHaveTextContent('Hypertension');
    expect(dialog).toHaveTextContent('Headaches for two weeks');
    expect(dialog).toHaveTextContent('Start amlodipine, review in a fortnight');
    expect(dialog).toHaveTextContent('Amlodipine');
    expect(dialog).toHaveTextContent('5 mg');
    expect(dialog).toHaveTextContent('152/96');
    expect(dialog).toHaveTextContent('Advised less salt.');
    expect(dialog).toHaveTextContent('Dr Imani Khan');
  });

  // Whoever is reading, a section the doctor left empty is not drawn as a blank heading.
  it('leaves out sections the record does not have', async () => {
    client.get.mockImplementation(
      routes({
        '/medical-records/r1': record('r1', 'Ada Lovelace', {
          chiefComplaint: undefined,
          prescriptions: [],
          vitals: undefined,
          notes: undefined,
          followUpDate: null,
        }),
      })
    );
    open();

    await screen.findByRole('dialog', { name: /ada lovelace/i });
    expect(screen.queryByRole('heading', { name: 'Chief complaint' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Prescriptions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vitals' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Diagnosis' })).toBeInTheDocument();
  });

  it('opens attachments in a new tab without handing the page to them', async () => {
    client.get.mockImplementation(
      routes({
        '/medical-records/r1': record('r1', 'Ada Lovelace', {
          attachments: [{ url: 'https://files.example/xray.png', label: 'Chest x-ray' }],
        }),
      })
    );
    open();

    const link = await screen.findByRole('link', { name: /chest x-ray/i });
    expect(link).toHaveAttribute('href', 'https://files.example/xray.png');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows an error with a retry when the record cannot be loaded', async () => {
    client.get.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'boom', 500));
    open();

    expect(await screen.findByText(/couldn’t load this record/i)).toBeInTheDocument();

    client.get.mockResolvedValueOnce(record('r1', 'Ada Lovelace'));
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('dialog', { name: /ada lovelace/i })).toBeInTheDocument();
  });

  it('asks to close from the close button', async () => {
    const onClose = open();

    await screen.findByRole('dialog', { name: /ada lovelace/i });
    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('RecordDrawer attachments', () => {
  it('offers “Attach files” to the doctor who wrote the record', async () => {
    open();

    expect(await screen.findByRole('button', { name: /attach files/i })).toBeInTheDocument();
  });

  it('does not offer it to another doctor', async () => {
    signInAs('doctor', 'u-other-doc');
    open();

    await screen.findByRole('dialog', { name: /ada lovelace/i });
    expect(screen.queryByRole('button', { name: /attach files/i })).not.toBeInTheDocument();
  });

  it.each(['admin', 'manager'] as Role[])('does not offer it to a %s', async (role) => {
    signInAs(role, 'u-admin');
    open();

    await screen.findByRole('dialog', { name: /ada lovelace/i });
    expect(screen.queryByRole('button', { name: /attach files/i })).not.toBeInTheDocument();
  });

  it('uploads what was chosen, against this record', async () => {
    client.post.mockResolvedValue(record('r1', 'Ada Lovelace'));
    open();

    await screen.findByRole('button', { name: /attach files/i });
    await userEvent.upload(screen.getByLabelText(/choose files to attach/i), [png('a.png'), png('b.png')]);

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(client.post.mock.calls[0]![0]).toBe('/medical-records/r1/attachments');
    const body = client.post.mock.calls[0]![1] as FormData;
    expect(body.getAll('files')).toHaveLength(2);
  });

  it('turns six files away before anything is sent, and says why', async () => {
    open();

    await screen.findByRole('button', { name: /attach files/i });
    await userEvent.upload(
      screen.getByLabelText(/choose files to attach/i),
      Array.from({ length: 6 }, (_, i) => png(`s${i}.png`))
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick up to 5 files at a time.');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('turns a file over 5 MB away before anything is sent', async () => {
    open();

    await screen.findByRole('button', { name: /attach files/i });
    await userEvent.upload(screen.getByLabelText(/choose files to attach/i), png('huge.png', 5 * 1024 * 1024 + 1));

    expect(await screen.findByRole('alert')).toHaveTextContent('huge.png is larger than 5 MB.');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('turns a file that is not an image or PDF away', async () => {
    const user = userEvent.setup({ applyAccept: false });
    open();

    await screen.findByRole('button', { name: /attach files/i });
    await user.upload(
      screen.getByLabelText(/choose files to attach/i),
      new File(['x'], 'notes.docx', { type: 'application/msword' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('notes.docx is not an image or a PDF.');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('counts what is already attached against the 20-file ceiling', async () => {
    client.get.mockImplementation(
      routes({
        '/medical-records/r1': record('r1', 'Ada Lovelace', {
          attachments: Array.from({ length: 19 }, (_, i) => ({ url: `https://f.example/${i}.png` })),
        }),
      })
    );
    open();

    await screen.findByRole('button', { name: /attach files/i });
    await userEvent.upload(screen.getByLabelText(/choose files to attach/i), [png('a.png'), png('b.png')]);

    expect(await screen.findByRole('alert')).toHaveTextContent('room for 1 more file');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('keeps the drawer open and says the record is full when the server says so', async () => {
    client.post.mockRejectedValue(
      new ApiError('TOO_MANY_ATTACHMENTS', 'A record holds at most 20 attachments', 409)
    );
    open();

    await screen.findByRole('button', { name: /attach files/i });
    await userEvent.upload(screen.getByLabelText(/choose files to attach/i), png());

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.title)).toContain(
        'This record already holds the maximum of 20 attachments'
      )
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clears an earlier complaint once a good pick goes through', async () => {
    client.post.mockResolvedValue(record('r1', 'Ada Lovelace'));
    open();

    await screen.findByRole('button', { name: /attach files/i });
    const input = screen.getByLabelText(/choose files to attach/i);
    await userEvent.upload(input, png('huge.png', 5 * 1024 * 1024 + 1));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.upload(input, png('ok.png'));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
