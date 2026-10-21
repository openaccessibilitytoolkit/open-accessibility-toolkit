// The page frame shared by every portal page. Accessible by design: real
// headings, a main landmark, visible focus, large text and click targets,
// and colours that pass WCAG 2.2 AA contrast. No JavaScript.
//
// Colour never carries meaning on its own: every status badge and message
// also has a text label.

import type { Child } from "hono/jsx";

const styles = `
  :root {
    --text: #1c2430; --muted: #4a5565; --bg: #f4f6f8; --surface: #ffffff; --panel: #eef2f5;
    --line: #d5dbe2; --border: #6b7584;
    --brand: #0d5c73; --brand-dark: #083f50; --brand-tint: #e2eff3;
    --link: #0b5572; --focus: #0b3d91;
    --error: #b3261e; --error-tint: #fdecea; --ok: #1e6b34; --ok-tint: #e6f4ea;
    --warn: #7a4300; --warn-tint: #fdf0d5; --info: #1a4f9c; --info-tint: #e4edfb;
    --radius: 12px; --shadow: 0 1px 2px rgb(16 24 40 / 6%), 0 2px 6px rgb(16 24 40 / 8%);
  }
  * { box-sizing: border-box; }
  body { font: 18px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
         color: var(--text); background: var(--bg); margin: 0; }
  main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
  main.wide { max-width: 68rem; }
  h1 { font-size: 2.25rem; line-height: 1.2; letter-spacing: -0.01em; margin: 0 0 1rem; }
  h2 { font-size: 1.4rem; line-height: 1.3; margin: 2.5rem 0 0.75rem; }
  .card > h2:first-child { margin-top: 0; }
  .lead { font-size: 1.15rem; color: var(--muted); margin: 0 0 2rem; }
  a { color: var(--link); text-underline-offset: 0.15em; }
  a:hover { color: var(--brand-dark); text-decoration-thickness: 2px; }
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

  /* Header */
  .site-header { background: var(--brand-dark); color: #ffffff; }
  .site-header .bar { max-width: 68rem; margin: 0 auto; padding: 0.5rem 1rem; display: flex; flex-wrap: wrap;
                      gap: 0.25rem 1.5rem; align-items: center; }
  .site-header :focus-visible { outline-color: #ffffff; }
  .brand { display: inline-flex; align-items: center; gap: 0.6rem; min-height: 2.75rem; color: #ffffff;
           font-weight: 700; font-size: 1.1rem; text-decoration: none; margin: 0 auto 0 0; }
  .brand svg { flex: none; }
  .brand small { display: block; font-size: 0.8rem; font-weight: 400; color: #d3e6ec; line-height: 1.2; }
  .site-header nav { flex-basis: 100%; border-top: 1px solid rgb(255 255 255 / 18%); padding: 0.4rem 0 0.1rem; }
  .site-header nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .site-header nav a, .site-header .link-button {
    display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0.25rem 0.75rem; border-radius: 8px;
    color: #ffffff; text-decoration: none; font-weight: 500; }
  .site-header nav a:hover, .site-header .link-button:hover { background: rgb(255 255 255 / 12%); color: #ffffff; }
  .site-header nav a[aria-current] { background: rgb(255 255 255 / 16%); text-decoration: underline;
                                          text-decoration-thickness: 2px; text-underline-offset: 0.35em; }
  .account { display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.5rem; }
  .account .who { color: #d3e6ec; font-size: 0.9rem; }
  .account form { margin: 0; }
  .site-header .link-button { background: none; border: 2px solid rgb(255 255 255 / 55%); font-size: 0.95rem; }

  /* Cards and panels */
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
          box-shadow: var(--shadow); padding: 1.5rem; margin: 0 0 1.5rem; }
  .card > :last-child { margin-bottom: 0; }
  .notice { background: var(--brand-tint); border-left: 6px solid var(--brand); border-radius: 8px;
            padding: 1rem 1.25rem; }
  .saved { background: var(--ok-tint); border: 1px solid #b7dcc1; border-left: 6px solid var(--ok);
           border-radius: 8px; padding: 0.75rem 1.25rem; margin-bottom: 1.5rem; }
  .saved p { margin: 0.25rem 0; }
  .error-summary { background: var(--error-tint); border: 4px solid var(--error); border-radius: 8px;
                   padding: 1rem 1.25rem; margin-bottom: 2rem; }
  .error-summary h2 { margin-top: 0; font-size: 1.25rem; }
  .error-summary a { color: var(--error); font-weight: 600; }
  .reference { display: inline-block; font-size: 1.5rem; font-weight: 700; letter-spacing: 0.04em;
               background: var(--brand-tint); color: var(--brand-dark); border-radius: 8px; padding: 0 0.6rem; }

  /* Forms */
  .field { margin: 1.5rem 0; }
  .field-status { margin: 0.5rem 0; }
  .field:first-child { margin-top: 0; }
  label, legend { display: block; font-weight: 600; }
  .hint { color: var(--muted); margin: 0.25rem 0 0.5rem; }
  input[type=text], input[type=email], input[type=url], input[type=number], textarea, select {
    width: 100%; font: inherit; color: var(--text); background: var(--surface); padding: 0.6rem 0.75rem;
    border: 2px solid var(--border); border-radius: 8px; }
  input[type=text]:focus-visible, input[type=email]:focus-visible, input[type=url]:focus-visible, input[type=number]:focus-visible,
  textarea:focus-visible, select:focus-visible {
    border-color: var(--focus); }
  textarea { min-height: 9rem; resize: vertical; }
  input[type=number] { max-width: 8rem; }
  textarea[readonly] { background: var(--panel); font-family: ui-monospace, Consolas, monospace; font-size: 0.9rem; }
  select { width: auto; max-width: 100%; min-height: 2.75rem; padding: 0.4rem 0.75rem; }
  fieldset { border: 0; padding: 0; margin: 1.5rem 0; }
  fieldset.nested { margin: 0.75rem 0 0 2.25rem; }
  fieldset.nested legend { font-weight: normal; }
  .choice { display: flex; align-items: center; gap: 0.75rem; min-height: 2.75rem; }
  .choice input { width: 1.5rem; height: 1.5rem; margin: 0; accent-color: var(--brand); flex: none; }
  .choice label { font-weight: normal; }
  .error-message { color: var(--error); font-weight: 600; margin: 0.25rem 0; }
  input[aria-invalid=true], textarea[aria-invalid=true] { border-color: var(--error); border-width: 3px; }
  .trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }

  /* Buttons */
  button { font: inherit; font-weight: 600; color: #ffffff; background: var(--brand); border: 2px solid var(--brand);
           border-radius: 8px; padding: 0.6rem 1.5rem; min-height: 2.75rem; cursor: pointer; }
  button:hover { background: var(--brand-dark); border-color: var(--brand-dark); }
  [hidden] { display: none !important; }
  .secondary-button { background: var(--surface, #ffffff); color: var(--brand); padding: 0.35rem 0.9rem;
                      min-height: 2.25rem; font-size: 0.95rem; }
  .secondary-button:hover { color: #ffffff; }
  .copy-status { color: #1e6b34; font-weight: 600; }
  .danger { background: var(--error); border-color: var(--error); }
  .danger:hover { background: #8c1d17; border-color: #8c1d17; }
  .secondary { background: none; color: var(--link); text-decoration: underline; padding: 0.75rem 0; border: 0; }
  .link-button { background: none; color: var(--link); font-weight: normal; text-decoration: underline;
                 padding: 0.5rem 0; border: 0; }

  /* Inbox */
  .counts { list-style: none; padding: 0; margin: 0 0 1.5rem; display: grid; gap: 1rem;
            grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
  .counts li { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
               box-shadow: var(--shadow); padding: 0.75rem 1.25rem; border-top: 6px solid var(--line); }
  .counts strong { display: block; font-size: 2rem; line-height: 1.2; }
  .counts .new { border-top-color: var(--info); }
  .counts .in_progress { border-top-color: #b36b00; }
  .counts .fixed { border-top-color: var(--ok); }
  .filters { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end; margin: 0 0 1.5rem; }
  .filters > div { min-width: 0; max-width: 100%; }
  .card.table-card { padding: 0; overflow-x: auto; }
  .table-card table { min-width: 54rem; }
  /* A table inside a card: fits the card, and scrolls sideways only on narrow screens. */
  .table-scroll { overflow-x: auto; margin: 0 -0.25rem; }
  .table-scroll table { min-width: 30rem; }
  .table-scroll td { overflow-wrap: anywhere; }
  table { border-collapse: collapse; width: 100%; }
  caption { text-align: left; font-weight: 600; padding: 1rem 1.25rem 0.75rem; }
  th, td { text-align: left; vertical-align: top; padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--line); }
  thead th { background: var(--panel); font-size: 0.95rem; border-bottom: 2px solid var(--border); }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: #f8fafb; }
  td a { display: inline-block; min-height: 1.5rem; font-weight: 600; }
  .nowrap { white-space: nowrap; }
  .badge { display: inline-block; white-space: nowrap; font-size: 0.9rem; font-weight: 600; line-height: 1.4;
           padding: 0.15rem 0.65rem; border-radius: 999px; border: 1px solid currentColor; }
  .badge.new { color: var(--info); background: var(--info-tint); }
  .badge.in_progress { color: var(--warn); background: var(--warn-tint); }
  .badge.fixed { color: var(--ok); background: var(--ok-tint); }
  .pager { display: flex; gap: 1rem; flex-wrap: wrap; }

  /* One report */
  dl.details { display: grid; grid-template-columns: max-content 1fr; gap: 0.75rem 1.5rem; margin: 0; }
  dl.details dt { font-weight: 600; color: var(--muted); }
  dl.details dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .timeline { list-style: none; margin: 0; padding: 0 0 0 1.5rem; border-left: 3px solid var(--line); }
  .timeline li { position: relative; padding: 0 0 1rem; }
  .timeline li::before { content: ""; position: absolute; left: calc(-1.5rem - 9px); top: 0.45em; width: 15px;
                         height: 15px; border-radius: 50%; background: var(--surface); border: 3px solid var(--brand); }
  .timeline time { display: block; font-weight: 600; font-size: 0.95rem; color: var(--muted); }

  /* Check my setup */
  .checks { list-style: none; padding: 0; }
  .checks > li { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
               box-shadow: var(--shadow); padding: 1rem 1.25rem; margin-bottom: 0.75rem; }
  .checks .hint { margin-bottom: 0; }
  .status { display: inline-block; font-size: 0.9rem; padding: 0.1rem 0.65rem; border-radius: 999px;
            border: 1px solid currentColor; margin-right: 0.25rem; }
  .status.done { color: var(--ok); background: var(--ok-tint); }
  .status.attention { color: var(--error); background: var(--error-tint); }
  .status.unknown { color: var(--muted); background: var(--panel); }

  /* Page sections */
  .narrow { max-width: 46rem; }
  .card.warning { border-top: 6px solid var(--error); }
  .card.success { border-top: 6px solid var(--ok); }
  .page-title { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0 1rem;
                margin-bottom: 1rem; }
  .page-title h1 { margin: 0; }
  .button-link { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0.6rem 1.5rem;
                 border-radius: 8px; background: var(--brand); color: #ffffff; font-weight: 600; text-decoration: none; }
  .button-link:hover { background: var(--brand-dark); color: #ffffff; }
  .url-list { padding-left: 1.25rem; }
  .url-list a { overflow-wrap: anywhere; }
  .prose h2 { margin-top: 2rem; }
  .prose h1 { font-size: 2rem; }
  .report-layout { display: grid; gap: 0 1.5rem; align-items: start; }
  .card details { border-color: var(--line); }
  .impact { display: inline-block; font-size: 0.9rem; font-weight: 700; padding: 0.1rem 0.65rem; border-radius: 999px; }
  .impact.critical, .impact.serious { color: var(--error); background: var(--error-tint); }
  .impact.moderate { color: #6b4200; background: #fff1cc; }
  .impact.minor { color: var(--muted); background: var(--panel); }
  .problem h3 { margin-top: 0; }
  .problem details { margin-top: 0.75rem; }
  /* Code examples wrap instead of scrolling, so keyboard users never need to scroll inside them. */
  .problem pre { background: var(--panel); border-radius: 8px; padding: 0.75rem 1rem; margin-top: 0;
                 white-space: pre-wrap; overflow-wrap: anywhere; }
  .card details li { overflow-wrap: anywhere; }
  .code-label { font-weight: 600; margin-bottom: 0.25rem; }
  .found-list code { overflow-wrap: anywhere; font-size: 0.9rem; }
  .found-list ul { padding-left: 1.25rem; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
                     clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  @media (min-width: 60rem) {
    .report-layout { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
                     grid-template-areas: "details update" "timeline update" "timeline delete"; }
    .details-card { grid-area: details; } .update-card { grid-area: update; }
    .timeline-card { grid-area: timeline; } .delete-card { grid-area: delete; }
  }

  details { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.5rem 1.25rem; }
  summary { cursor: pointer; font-weight: 600; min-height: 2.75rem; display: flex; align-items: center; }

  @media (max-width: 40rem) {
    h1 { font-size: 1.75rem; }
    .card { padding: 1.25rem 1rem; }
    dl.details { grid-template-columns: 1fr; gap: 0.25rem; }
    dl.details dd { margin-bottom: 0.75rem; }
  }
`;

/** A simple mark for the header: a speech bubble with a tick, for "we hear you and fix it". */
function Mark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="28" height="23" rx="7" fill="#ffffff" />
      <path d="M9 25 L9 30 L15 25 Z" fill="#ffffff" />
      <path d="M10 14 L14.5 18.5 L22.5 9.5" fill="none" stroke="#0d5c73" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** The header bar: a wordmark, then anything else (navigation, who is logged in). */
export function SiteHeader(props: { name: string; subtitle?: string; href?: string; children?: Child }) {
  const wordmark = (
    <>
      <Mark />
      <span>
        {props.name}
        {props.subtitle && <> <small>{props.subtitle}</small></>}
      </span>
    </>
  );
  return (
    <header class="site-header">
      <div class="bar">
        {props.href ? (
          <a class="brand" href={props.href}>
            {wordmark}
          </a>
        ) : (
          <p class="brand">{wordmark}</p>
        )}
        {props.children}
      </div>
    </header>
  );
}

export function Layout(props: { title: string; children: Child; header?: Child; wide?: boolean }) {
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
        {props.header}
        <main class={props.wide ? "wide" : undefined}>{props.children}</main>
      </body>
    </html>
  );
}
