// i18n-exempt: renders user-authored markdown; it owns no interface copy.
import { Fragment, type ReactNode } from "react";
import { parseBlocks, parseInline } from "./markdown";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((node, index) =>
        node.type === "strong" ? (
          <strong key={index}>{node.value}</strong>
        ) : (
          <Fragment key={index}>{node.value}</Fragment>
        ),
      )}
    </>
  );
}

/** Safe renderer for the markdown subset: React nodes only, never raw HTML. */
export function MarkdownView({ text }: { text: string }): ReactNode {
  const blocks = parseBlocks(text);
  return (
    <div className="clients-prose">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index}>
            {block.items.map((item, position) => (
              <li key={position}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            {block.lines.map((line, position) => (
              <Fragment key={position}>
                {position > 0 && <br />}
                <Inline text={line} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
