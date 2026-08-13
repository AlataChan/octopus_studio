import { memo, useEffect, useState } from "react";
import { renderSafeMarkdown } from "@/utils/chat/markdown";

function MarkdownMessage({ text = "", className = "" }) {
  const [html, setHtml] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setHtml(null);

    renderSafeMarkdown(text)
      .then((renderedHtml) => {
        if (isMounted) setHtml(renderedHtml);
      })
      .catch(() => {
        if (isMounted) setHtml(null);
      });

    return () => {
      isMounted = false;
    };
  }, [text]);

  if (html === null) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    />
  );
}

export default memo(MarkdownMessage);
