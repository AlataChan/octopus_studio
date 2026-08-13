let markdownRendererPromise;
let domPurifyPromise;

async function createMarkdownRenderer() {
  const [
    { encode: HTMLEncode },
    { default: markdownIt },
    { staticHljs: hljs },
    { v4 },
  ] = await Promise.all([
    import("he"),
    import("markdown-it"),
    import("./hljs"),
    import("uuid"),
  ]);

  const markdown = markdownIt({
    html: false,
    typographer: true,
    highlight: function (code, lang) {
      const uuid = v4();
      if (lang && hljs.getLanguage(lang)) {
        try {
          return (
            `<div class="allm-w-full allm-rounded-lg allm-bg-[#1e1e1e] allm-font-mono allm-text-sm allm-text-[#d4d4d4] allm-mb-4 allm-relative">
            <div class="allm-absolute allm-top-0 allm-left-0 allm-right-0 allm-flex allm-items-center allm-justify-between allm-px-4 allm-py-1 allm-text-xs allm-font-sans allm-bg-[#2d2d2d] allm-rounded-t-lg">
              <span class="allm-text-xs allm-text-[#858585] allm-font-medium">${lang}</span>
              <button data-code-snippet data-code="code-${uuid}" class="allm-border-none allm-min-w-[52px] allm-h-[22px] allm-flex allm-items-center allm-justify-center allm-gap-x-1 allm-bg-[#ffffff14] allm-text-[#858585] hover:allm-text-white hover:allm-bg-[#ffffff20] allm-px-1.5 allm-rounded allm-transition-colors allm-cursor-pointer">
                <svg class="allm-h-3 allm-w-3" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24"><path d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.912 4.895 3 6 3h8c1.105 0 2 .912 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.088 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z"/></svg>
                <span class="allm-text-xs">Copy</span>
              </button>
            </div>
            <div class="allm-overflow-x-auto allm-max-w-full">
              <pre class="allm-px-4 -allm-mt-10 allm-whitespace-pre-wrap allm-break-words"><code class="allm-max-w-full allm-inline-block">` +
            hljs.highlight(code, { language: lang, ignoreIllegals: true })
              .value +
            "</code></pre></div></div>"
          );
        } catch (__) {}
      }

      return (
        `<div class="allm-w-full allm-rounded-lg allm-bg-[#1e1e1e] allm-font-mono allm-text-sm allm-text-[#d4d4d4] allm-mb-4 allm-relative">
        <div class="allm-absolute allm-top-0 allm-left-0 allm-right-0 allm-flex allm-items-center allm-justify-between allm-px-4 allm-py-1 allm-text-xs allm-font-sans allm-bg-[#2d2d2d] allm-rounded-t-lg">
          <span class="allm-text-xs allm-text-[#858585] allm-font-medium">plaintext</span>
          <button data-code-snippet data-code="code-${uuid}" class="allm-border-none allm-min-w-[52px] allm-h-[22px] allm-flex allm-items-center allm-justify-center allm-gap-x-1 allm-bg-[#ffffff14] allm-text-[#858585] hover:allm-text-white hover:allm-bg-[#ffffff20] allm-px-1.5 allm-rounded allm-transition-colors allm-cursor-pointer">
            <svg class="allm-h-3 allm-w-3" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24"><path d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.912 4.895 3 6 3h8c1.105 0 2 .912 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.088 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z"/></svg>
            <span class="allm-text-xs">Copy</span>
          </button>
        </div>
        <div class="allm-overflow-x-auto allm-max-w-full">
          <pre class="allm-px-4 -allm-mt-10 allm-whitespace-pre-wrap allm-break-words"><code class="allm-max-w-full allm-inline-block">` +
        HTMLEncode(code) +
        "</code></pre></div></div>"
      );
    },
  })
    // Enable <ol> and <ul> items to not assume an HTML structure so we can keep numbering from responses.
    .disable("list");

  // Custom renderer rule to make links open in new tab
  markdown.renderer.rules.link_open = (tokens, idx) => {
    const token = tokens[idx];
    const href = token.attrs.find((attr) => attr[0] === "href");
    return `<a href="${href[1]}" target="_blank" rel="noopener noreferrer">`;
  };

  return (text = "") => markdown.render(text);
}

function getMarkdownRenderer() {
  if (!markdownRendererPromise) {
    markdownRendererPromise = createMarkdownRenderer();
  }
  return markdownRendererPromise;
}

function getDOMPurify() {
  if (!domPurifyPromise) {
    domPurifyPromise = import("./purify").then((module) => module.default);
  }
  return domPurifyPromise;
}

export default async function renderMarkdown(text = "") {
  const render = await getMarkdownRenderer();
  return render(text);
}

export async function renderSafeMarkdown(text = "") {
  const [html, DOMPurify] = await Promise.all([
    renderMarkdown(text),
    getDOMPurify(),
  ]);
  return DOMPurify.sanitize(html);
}
