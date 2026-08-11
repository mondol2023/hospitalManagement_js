import { createContext, useContext } from 'react';

/**
 * The wiring behind `<Field>`, kept out of the component file.
 *
 * Not an arbitrary split: a module that exports both a component and a hook
 * loses fast refresh, so every edit to `Field.tsx` would remount the form and
 * throw away whatever the user had typed into it.
 */
export interface FieldContextValue {
  controlId: string;
  describedBy: string | undefined;
  invalid: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Read by the controls, so they inherit `id`, `aria-describedby` and
 * `aria-invalid` from the field they sit in. Null outside a `<Field>`, which is
 * legitimate — a bare `<Input>` is still a valid input.
 */
export function useFieldControl(): FieldContextValue | null {
  return useContext(FieldContext);
}
