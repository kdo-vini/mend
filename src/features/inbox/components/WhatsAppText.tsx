// i18n-exempt: renders message text authored by operators and customers, no UI copy.
import { Fragment, memo, useMemo, type ReactNode } from "react";
import {
  parseWhatsAppBlocks,
  parseWhatsAppInline,
  parseWhatsAppPreview,
  type WaInline,
} from "../whatsapp-markup";

type InlineMode = "message" | "plain" | "source";

function renderInline(nodes: WaInline[], mode: InlineMode): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.value}</Fragment>;
      case "link":
        if (mode === "message")
          return (
            <a
              key={index}
              href={node.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {node.label ?? node.raw}
            </a>
          );
        if (mode === "plain")
          return <Fragment key={index}>{node.label ?? node.raw}</Fragment>;
        return (
          <span key={index} className="wa-link">
            {node.raw}
          </span>
        );
      case "code":
      case "mono": {
        const body = (
          <code className={node.type === "mono" ? "wa-mono" : "wa-code"}>
            {node.value}
          </code>
        );
        if (mode !== "source") return <Fragment key={index}>{body}</Fragment>;
        return (
          <Fragment key={index}>
            <span className="wa-marker">{node.marker}</span>
            {body}
            <span className="wa-marker">{node.marker}</span>
          </Fragment>
        );
      }
      default: {
        const children = renderInline(node.children, mode);
        const body =
          node.type === "bold" ? (
            <strong>{children}</strong>
          ) : node.type === "italic" ? (
            <em>{children}</em>
          ) : (
            <s>{children}</s>
          );
        if (mode !== "source") return <Fragment key={index}>{body}</Fragment>;
        return (
          <Fragment key={index}>
            <span className="wa-marker">{node.marker}</span>
            {body}
            <span className="wa-marker">{node.marker}</span>
          </Fragment>
        );
      }
    }
  });
}

function renderLines(lines: WaInline[][], mode: InlineMode) {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {renderInline(line, mode)}
    </Fragment>
  ));
}

/**
 * A message body rendered like a WhatsApp bubble. Pass `links={false}` when
 * the text sits inside another interactive element (a media caption button).
 */
export const WhatsAppMessageText = memo(function WhatsAppMessageText({
  text,
  links = true,
}: {
  text: string;
  links?: boolean;
}) {
  const mode: InlineMode = links ? "message" : "plain";
  const blocks = useMemo(() => parseWhatsAppBlocks(text), [text]);
  return (
    <div className="message-wa-markup">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "gap":
            return <div key={index} className="wa-gap" aria-hidden="true" />;
          case "paragraph":
            return <p key={index}>{renderLines(block.lines, mode)}</p>;
          case "heading":
            return (
              <p key={index}>
                <strong>{renderInline(block.content, mode)}</strong>
              </p>
            );
          case "quote":
            return (
              <blockquote key={index}>
                {renderLines(block.lines, mode)}
              </blockquote>
            );
          case "codeblock":
            return (
              <pre key={index} className="wa-mono">
                {block.value}
              </pre>
            );
          case "bullets":
            return (
              <ul key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item, mode)}</li>
                ))}
              </ul>
            );
          case "numbered":
            return (
              <ol key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <span className="wa-list-number">{item.number}.</span>
                    <span>{renderInline(item.content, mode)}</span>
                  </li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
});

/** Single-line formatted text for the conversation list. */
export const WhatsAppPreviewText = memo(function WhatsAppPreviewText({
  text,
}: {
  text: string;
}) {
  return <>{renderInline(parseWhatsAppPreview(text), "plain")}</>;
});

/**
 * The composer text with its markers kept in place and the formatting
 * applied, laid behind a transparent textarea the way WhatsApp shows
 * formatting while typing. Styles must not change glyph widths, or the
 * caret drifts from the text (see `.composer-highlight`).
 */
export function WhatsAppComposerHighlight({ text }: { text: string }) {
  return (
    <>
      {renderInline(parseWhatsAppInline(text), "source")}
      {/* A trailing newline only takes up a line when something follows it. */}
      {"​"}
    </>
  );
}
