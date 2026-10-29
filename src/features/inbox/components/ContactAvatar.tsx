// i18n-exempt: shows a photo or the contact's initials, no copy.
import { useState } from "react";
import type { Conversation } from "../../../types";

/** The contact's WhatsApp photo, or the coloured initials without one. */
export function ContactAvatar({
  conversation,
  photoUrl = conversation.photoUrl,
  large = false,
}: {
  conversation: Pick<Conversation, "accent" | "initials" | "photoUrl">;
  photoUrl?: string;
  large?: boolean;
}) {
  // A photo that fails to load (expired or removed) falls back to initials.
  const [failedUrl, setFailedUrl] = useState<string>();
  const showPhoto = Boolean(photoUrl) && photoUrl !== failedUrl;
  return (
    <div
      className={`conversation-avatar ${large ? "large" : ""} ${showPhoto ? "has-photo" : ""}`}
      style={
        showPhoto
          ? undefined
          : {
              background: `${conversation.accent}18`,
              color: conversation.accent,
            }
      }
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        conversation.initials
      )}
    </div>
  );
}
