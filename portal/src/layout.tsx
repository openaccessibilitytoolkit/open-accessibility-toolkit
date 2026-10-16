// The page frame shared by every portal page. Accessible by design: real
// headings, a main landmark, visible focus, large text and click targets,
// and colours that pass WCAG 2.2 AA contrast. No JavaScript.

import type { Child } from "hono/jsx";

const styles = `
  :root { --text: #1a1a1a; --muted: #4a4a4a; --bg: #ffffff; --panel: #f3f4f6;
          --link: #0b57d0; --border: #6b6b6b; --error: #b3261e; --focus: #1a1a1a; }
  * { box-sizing: border-box; }
  body { font: 18px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text);
         background: var(--bg); margin: 0; }
  main { max-width: 40rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
  a { color: var(--link); }
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  .field { margin: 1.5rem 0; }
  label, legend { display: block; font-weight: 600; }
  .hint { color: var(--muted); margin: 0.25rem 0 0.5rem; }
  input[type=text], input[type=email], textarea {
    width: 100%; font: inherit; padding: 0.5rem; border: 2px solid var(--border); border-radius: 4px; }
  textarea { min-height: 9rem; }
  fieldset { border: 0; padding: 0; margin: 1.5rem 0; }
  .choice { display: flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; }
  .choice input { width: 1.5rem; height: 1.5rem; margin: 0; }
  .choice label { font-weight: normal; }
  button { font: inherit; font-weight: 600; color: #ffffff; background: #0b57d0; border: 0;
           border-radius: 4px; padding: 0.75rem 1.5rem; min-height: 2.75rem; cursor: pointer; }
  .error-summary { border: 4px solid var(--error); padding: 1rem 1.25rem; margin-bottom: 2rem; }
  .error-summary h2 { margin-top: 0; }
  .error-message { color: var(--error); font-weight: 600; margin: 0.25rem 0; }
  [aria-invalid=true] { border-color: var(--error); border-width: 3px; }
  .notice { background: var(--panel); padding: 1rem 1.25rem; }
  .reference { font-size: 1.5rem; font-weight: 700; }
  .trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
`;

export function Layout(props: { title: string; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{props.title}</title>
        {/* Our own fixed CSS, so it is safe to insert as-is; escaping would break the quotes in it. */}
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body>
        <main>{props.children}</main>
      </body>
    </html>
  );
}
