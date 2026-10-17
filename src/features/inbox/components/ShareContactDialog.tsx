import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";

export const SHARE_CONTACT_DIALOG_ID = "inbox-share-contact";

export interface ShareContactInput {
  fullName: string;
  /** Digits only, with the country code. */
  phoneNumber: string;
  organization?: string;
}

/** Dial code, area code and subscriber number, within the E.164 maximum. */
const phoneDigits = { minimum: 10, maximum: 15 };

export function ShareContactDialog({
  onClose,
  onShare,
}: {
  onClose: () => void;
  onShare: (input: ShareContactInput) => void;
}) {
  const { t } = useTranslation("inbox");
  const fieldId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [organization, setOrganization] = useState("");
  const digits = phoneNumber.replace(/\D/g, "");
  const canShare =
    fullName.trim().length > 0 &&
    digits.length >= phoneDigits.minimum &&
    digits.length <= phoneDigits.maximum;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-backdrop" />
        <DialogPrimitive.Content
          id={SHARE_CONTACT_DIALOG_ID}
          className="modal new-chat-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLButtonElement>(
                `[aria-controls="${SHARE_CONTACT_DIALOG_ID}"]`,
              )
              ?.focus();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!canShare) return;
              onShare({
                fullName: fullName.trim(),
                phoneNumber: digits,
                ...(organization.trim()
                  ? { organization: organization.trim() }
                  : {}),
              });
            }}
          >
            <div className="modal-header">
              <div>
                <span className="page-kicker">{t("shareContact.eyebrow")}</span>
                <DialogPrimitive.Title asChild>
                  <h2>{t("shareContact.title")}</h2>
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t("shareContact.close")}
                >
                  <X size={17} />
                </button>
              </DialogPrimitive.Close>
            </div>
            <div className="modal-body">
              <div className="new-chat-field">
                <label htmlFor={`${fieldId}-name`}>
                  {t("shareContact.name")}
                </label>
                <input
                  ref={nameRef}
                  id={`${fieldId}-name`}
                  name="fullName"
                  maxLength={120}
                  autoComplete="off"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
              <div className="new-chat-field">
                <label htmlFor={`${fieldId}-phone`}>
                  {t("shareContact.phone")}
                </label>
                <input
                  id={`${fieldId}-phone`}
                  name="phoneNumber"
                  type="tel"
                  inputMode="tel"
                  maxLength={40}
                  autoComplete="off"
                  aria-describedby={`${fieldId}-phone-hint`}
                  value={phoneNumber}
                  placeholder={t("newChat.phonePlaceholder")}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                />
                <span className="new-chat-hint" id={`${fieldId}-phone-hint`}>
                  {t("newChat.phoneHint")}
                </span>
              </div>
              <div className="new-chat-field">
                <label htmlFor={`${fieldId}-organization`}>
                  {t("shareContact.organization")}
                </label>
                <input
                  id={`${fieldId}-organization`}
                  name="organization"
                  maxLength={120}
                  autoComplete="off"
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="button button-ghost"
                type="button"
                onClick={onClose}
              >
                {t("common:actions.cancel")}
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={!canShare}
              >
                {t("shareContact.submit")}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
