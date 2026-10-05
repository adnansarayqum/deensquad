import { startTransition, type FormEvent } from "react";

/**
 * onSubmit for a form whose action is a useActionState dispatch. React 19 clears an uncontrolled form
 * after its action finishes, even when the action returned an error, so a parent who mistyped one field
 * would lose everything. This sends the same FormData without that automatic reset; each form clears
 * itself on success. Keep `action={run}` on the form too, so a submit before hydration still works.
 */
export function submitKeepingInput(run: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = submitter?.getAttribute("name") ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
    startTransition(() => run(formData));
  };
}
