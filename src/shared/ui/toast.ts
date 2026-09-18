/**
 * Toasts announce two different outcomes. The tone decides both the icon and
 * how assistive technology announces it: a failure rendered as a success
 * confirms the opposite of what happened.
 */
export type ToastTone = "success" | "error";

export interface Toast {
  message: string;
  tone: ToastTone;
}
