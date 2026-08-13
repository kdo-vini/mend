import { useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import { Select } from "../../../shared/ui/Select";

export const NEW_CHAT_DIALOG_ID = "inbox-new-chat";

export interface NewChatChannel {
  id: string;
  name: string;
}

export interface NewChatInput {
  channelId: string;
  phoneNumber: string;
  message: string;
}

/** Dial code, area code and subscriber number, within the E.164 maximum. */
const phoneDigits = { minimum: 10, maximum: 15 };

function hasDialableDigits(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return (
    digits.length >= phoneDigits.minimum && digits.length <= phoneDigits.maximum
  );
}

export function NewChatDialog({
  channels,
  submitting,
  onClose,
  onStart,
}: {
  channels: NewChatChannel[];
  submitting: boolean;
  onClose: () => void;
  onStart: (input: NewChatInput) => void;
}) {
  const { t } = useTranslation("inbox");
  const fieldId = useId();
  const phoneRef = useRef<HTMLInputElement>(null);
  const [pickedChannelId, setPickedChannelId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  // With a single connected channel there is nothing to choose, so the field
  // stays hidden and the only channel is used.
  const channelId =
    channels.find((channel) => channel.id === pickedChannelId)?.id ??
    channels[0]?.id ??
    "";
  const canStart =
    !submitting && hasDialableDigits(phoneNumber) && message.trim().length > 0;

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
          id={NEW_CHAT_DIALOG_ID}
          className="modal new-chat-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            phoneRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLButtonElement>(
                `[aria-controls="${NEW_CHAT_DIALOG_ID}"]`,
              )
              ?.focus();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!canStart) return;
              onStart({ channelId, phoneNumber, message });
            }}
          >
            <div className="modal-header">
              <div>
                <span className="page-kicker">{t("newChat.eyebrow")}</span>
                <DialogPrimitive.Title asChild>
                  <h2>{t("newChat.title")}</h2>
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t("newChat.close")}
                >
                  <X size={17} />
                </button>
              </DialogPrimitive.Close>
            </div>
            <div className="modal-body">
              {channels.length > 1 && (
                <div className="new-chat-field">
                  <span id={`${fieldId}-channel`}>{t("newChat.channel")}</span>
                  <Select
                    ariaLabel={t("newChat.channel")}
                    value={channelId}
                    options={channels.map((channel) => ({
                      value: channel.id,
                      label: channel.name,
                    }))}
                    onChange={setPickedChannelId}
                  />
                </div>
              )}
              <div className="new-chat-field">
                <label htmlFor={`${fieldId}-phone`}>{t("newChat.phone")}</label>
                <input
                  ref={phoneRef}
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
                <label htmlFor={`${fieldId}-message`}>
                  {t("newChat.message")}
                </label>
                <textarea
                  id={`${fieldId}-message`}
                  name="message"
                  rows={3}
                  maxLength={4_000}
                  value={message}
                  placeholder={t("newChat.messagePlaceholder")}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </div>
              <div className="modal-note">
                <Info size={14} aria-hidden="true" />
                <DialogPrimitive.Description>
                  {t("newChat.advisory")}
                </DialogPrimitive.Description>
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
                disabled={!canStart}
              >
                {submitting ? t("newChat.starting") : t("newChat.submit")}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
