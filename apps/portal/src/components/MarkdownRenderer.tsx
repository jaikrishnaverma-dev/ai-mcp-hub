import { useMemo } from "react";
import { marked } from "marked";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Configure marked with GFM and line breaks
marked.setOptions({
  gfm: true,
  breaks: true,
});

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      const parsed = marked.parse(content);
      return typeof parsed === "string" ? parsed : "";
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div
      className={`prose-chat w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
