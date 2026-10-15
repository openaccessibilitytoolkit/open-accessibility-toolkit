// Plain-English explanations and example fixes for the most common axe-core rules.
// Written for website owners, not accessibility experts: short sentences, no jargon,
// and a before/after code example for each. Rules not listed here fall back to
// axe-core's own wording in the report.

import type { NodeResult } from "axe-core";

export interface Explanation {
  /** Short plain-English heading, e.g. "Images need a text description". */
  title: string;
  /** What is wrong, in one or two sentences. */
  problem: string;
  /** Who runs into this problem. */
  affects: string;
  /** Steps to fix it, most common fix first. */
  fix: string[];
  /** Example code before and after the fix. */
  before: string;
  after: string;
}

export const EXPLANATIONS: Record<string, Explanation> = {
  "image-alt": {
    title: "Images need a text description",
    problem:
      "This image has no text description (called \"alt text\"). Screen readers have nothing to read out, so blind visitors miss what the image shows.",
    affects: "People who are blind or have low vision and use a screen reader.",
    fix: [
      "Add an alt attribute that says what the image shows or does, in a few words.",
      "If the image is a link or button, describe where it goes or what it does, not what it looks like.",
      "If the image is only decoration, use an empty alt (alt=\"\") so screen readers skip it.",
      "Don't start with \"image of\"; screen readers already say it is an image.",
    ],
    before: `<img src="cake.jpg">`,
    after: `<img src="cake.jpg" alt="Chocolate birthday cake with candles">`,
  },

  "link-name": {
    title: "Links need text that says where they go",
    problem:
      "This link has no text a screen reader can read out. This usually happens when a link contains only an image or an icon.",
    affects: "People who use a screen reader, and people who use voice control to say \"click\" plus the link name.",
    fix: [
      "If the link contains an image, give the image alt text that says where the link goes.",
      "If the link is an icon, add an aria-label that says where it goes.",
      "Avoid vague text like \"click here\"; say where the link goes instead.",
    ],
    before: `<a href="/menu"><img src="arrow.png"></a>`,
    after: `<a href="/menu"><img src="arrow.png" alt="See our menu"></a>`,
  },

  "button-name": {
    title: "Buttons need a name",
    problem:
      "This button has no text, so a screen reader just says \"button\" and the visitor can't tell what it does. This is common with icon-only buttons such as a magnifying glass or an X.",
    affects: "People who use a screen reader or voice control.",
    fix: [
      "Put visible text inside the button, such as \"Search\" or \"Subscribe\".",
      "For an icon-only button, add an aria-label that says what it does.",
    ],
    before: `<button type="submit"></button>
<button class="close-icon"></button>`,
    after: `<button type="submit">Subscribe</button>
<button class="close-icon" aria-label="Close"></button>`,
  },

  "input-button-name": {
    title: "Buttons need a name",
    problem:
      "This button has no text, so a screen reader just says \"button\" and the visitor can't tell what it does.",
    affects: "People who use a screen reader or voice control.",
    fix: ["Give the button a value that says what it does."],
    before: `<input type="submit">`,
    after: `<input type="submit" value="Send message">`,
  },

  "aria-command-name": {
    title: "Custom buttons and links need a name",
    problem:
      "This element is built to act like a button or link, but it has no text a screen reader can read out.",
    affects: "People who use a screen reader or voice control.",
    fix: [
      "Best: use a real <button> or <a> element with text inside.",
      "Otherwise, add text inside the element or an aria-label that says what it does.",
    ],
    before: `<div role="button" onclick="openCart()"><span class="cart-icon"></span></div>`,
    after: `<button type="button" onclick="openCart()" aria-label="Open shopping cart">
  <span class="cart-icon"></span>
</button>`,
  },

  label: {
    title: "Form fields need a label",
    problem:
      "This form field has no label connected to it. A screen reader announces it as just \"edit text\", so people don't know what to type. Placeholder text is not a good label: it disappears as soon as you start typing.",
    affects: "People who use a screen reader or voice control, and people with memory or thinking difficulties.",
    fix: [
      "Add a <label> element with for=\"...\" matching the field's id.",
      "Or wrap the field inside its <label>.",
      "If a visible label really isn't possible, add an aria-label.",
    ],
    before: `Email: <input type="email" name="email">`,
    after: `<label for="email">Email</label>
<input type="email" id="email" name="email">`,
  },

  "select-name": {
    title: "Drop-down lists need a label",
    problem:
      "This drop-down list has no label connected to it, so screen reader users don't know what they are choosing.",
    affects: "People who use a screen reader or voice control.",
    fix: ["Add a <label> element with for=\"...\" matching the drop-down's id."],
    before: `<select name="size">...</select>`,
    after: `<label for="size">Cake size</label>
<select id="size" name="size">...</select>`,
  },

  "input-image-alt": {
    title: "Image buttons need a text description",
    problem:
      "This button is an image with no alt text, so screen reader users can't tell what it does.",
    affects: "People who use a screen reader or voice control.",
    fix: ["Add an alt attribute that says what the button does."],
    before: `<input type="image" src="go.png">`,
    after: `<input type="image" src="go.png" alt="Search">`,
  },

  "color-contrast": {
    title: "Text is too faint to read easily",
    problem:
      "The text color is too close to its background color. Normal text needs a contrast ratio of at least 4.5 to 1. Large text (about 24px, or 19px bold) needs at least 3 to 1.",
    affects:
      "People with low vision or color blindness, older people, and anyone reading a phone in bright sunlight.",
    fix: [
      "Make the text darker, or the background lighter (or the other way round on dark designs).",
      "Check your colors with a free contrast checker, such as the WebAIM Contrast Checker.",
      "If the color comes from your brand, keep the brand color for large headings or decoration and use a darker shade for body text.",
    ],
    before: `<p style="color: #bbbbbb; background: #ffffff">Fresh bread every morning.</p>`,
    after: `<p style="color: #595959; background: #ffffff">Fresh bread every morning.</p>`,
  },

  "link-in-text-block": {
    title: "Links in text stand out only by color",
    problem:
      "This link sits inside a paragraph and looks different from the text around it only because of its color. People who can't see that color difference can't find the link.",
    affects: "People with color blindness or low vision.",
    fix: [
      "Underline links inside paragraphs. This is the simplest and most familiar fix.",
      "Or make the link color contrast at least 3 to 1 with the surrounding text, and add an underline on hover and keyboard focus.",
    ],
    before: `p a { color: #2a6ebb; text-decoration: none; }`,
    after: `p a { color: #2a6ebb; text-decoration: underline; }`,
  },

  "html-has-lang": {
    title: "The page doesn't say what language it is in",
    problem:
      "The page doesn't tell browsers its language. Screen readers may read it out with the wrong accent and pronunciation, and translation tools may guess wrong.",
    affects: "People who use a screen reader, and people who use translation or reading tools.",
    fix: ["Add a lang attribute to the <html> tag at the top of every page, such as lang=\"en\" for English."],
    before: `<html>`,
    after: `<html lang="en">`,
  },

  "html-lang-valid": {
    title: "The page's language code isn't valid",
    problem:
      "The page says what language it is in, but uses a code browsers don't recognize, so screen readers may still pronounce it wrongly.",
    affects: "People who use a screen reader.",
    fix: ["Use a standard language code, such as en, en-US, es, fr or de."],
    before: `<html lang="english">`,
    after: `<html lang="en">`,
  },

  "valid-lang": {
    title: "A language code isn't valid",
    problem:
      "Part of the page is marked as a different language, but the code used isn't recognized, so screen readers may pronounce it wrongly.",
    affects: "People who use a screen reader.",
    fix: ["Use a standard language code, such as en, es, fr or de."],
    before: `<p lang="spanish">Hola</p>`,
    after: `<p lang="es">Hola</p>`,
  },

  "document-title": {
    title: "The page needs a title",
    problem:
      "The page has no title. The title appears in the browser tab and in bookmarks, and it is the first thing a screen reader announces when the page opens.",
    affects: "People who use a screen reader, and anyone with many tabs open.",
    fix: [
      "Add a <title> inside <head> that says what this page is, then the site name.",
      "Give every page a different title.",
    ],
    before: `<head>
  <meta charset="utf-8">
</head>`,
    after: `<head>
  <meta charset="utf-8">
  <title>Contact us - Joe's Bakery</title>
</head>`,
  },

  "frame-title": {
    title: "Embedded content needs a title",
    problem:
      "This embedded frame (for example a map, video or booking form from another site) has no title, so screen reader users don't know what it contains before going in.",
    affects: "People who use a screen reader.",
    fix: ["Add a title attribute to the <iframe> that says what it contains."],
    before: `<iframe src="https://www.youtube.com/embed/abc123"></iframe>`,
    after: `<iframe src="https://www.youtube.com/embed/abc123"
        title="Video: how we bake our sourdough"></iframe>`,
  },

  list: {
    title: "A list contains things that aren't list items",
    problem:
      "This list (<ul> or <ol>) directly contains something other than list items (<li>). Screen readers may count the items wrongly or not announce it as a list.",
    affects: "People who use a screen reader.",
    fix: ["Make sure everything directly inside <ul> or <ol> is an <li>. Put other elements inside the <li>."],
    before: `<ul>
  <div>Bread</div>
  <div>Cakes</div>
</ul>`,
    after: `<ul>
  <li>Bread</li>
  <li>Cakes</li>
</ul>`,
  },

  listitem: {
    title: "A list item isn't inside a list",
    problem:
      "This list item (<li>) isn't inside a <ul> or <ol>, so screen readers can't announce it as part of a list.",
    affects: "People who use a screen reader.",
    fix: ["Wrap list items in a <ul> (bullet list) or <ol> (numbered list)."],
    before: `<div>
  <li>Bread</li>
  <li>Cakes</li>
</div>`,
    after: `<ul>
  <li>Bread</li>
  <li>Cakes</li>
</ul>`,
  },

  "aria-hidden-focus": {
    title: "Hidden content can still be reached with the keyboard",
    problem:
      "This content is hidden from screen readers (aria-hidden=\"true\") but contains links or buttons that keyboard users can still tab to. Screen reader users land on something that has no name or description.",
    affects: "People who use a screen reader or a keyboard.",
    fix: [
      "If the content should be hidden from everyone, add the inert attribute so nothing inside can be focused.",
      "If it should be usable, remove aria-hidden=\"true\".",
    ],
    before: `<div class="offscreen-menu" aria-hidden="true">
  <a href="/cart">Cart</a>
</div>`,
    after: `<div class="offscreen-menu" aria-hidden="true" inert>
  <a href="/cart">Cart</a>
</div>`,
  },

  "aria-required-attr": {
    title: "A custom control is missing required information",
    problem:
      "This element tells screen readers it is a special control (such as a checkbox, slider or tab) but leaves out information that control needs, such as whether the checkbox is ticked.",
    affects: "People who use a screen reader.",
    fix: [
      "Best: use the real HTML element instead, such as <input type=\"checkbox\">. It has everything built in.",
      "Otherwise, add the missing attribute named in the technical details below, and keep it updated as the control changes.",
    ],
    before: `<div role="checkbox">Email me offers</div>`,
    after: `<label><input type="checkbox" name="offers"> Email me offers</label>`,
  },

  "aria-valid-attr-value": {
    title: "An accessibility setting has a wrong value",
    problem:
      "This element has an accessibility setting (an aria-* attribute) with a value screen readers don't understand, or one that points to an id that doesn't exist on the page.",
    affects: "People who use a screen reader.",
    fix: [
      "Check the technical details below to see which setting is wrong.",
      "Use only allowed values, for example aria-expanded must be \"true\" or \"false\".",
      "If it refers to an id, make sure an element with that id exists on the page.",
    ],
    before: `<button aria-expanded="yes">Menu</button>`,
    after: `<button aria-expanded="false">Menu</button>`,
  },

  "aria-valid-attr": {
    title: "An accessibility setting is misspelled",
    problem:
      "This element has an aria-* attribute that doesn't exist, usually because of a typo, so it has no effect.",
    affects: "People who use a screen reader.",
    fix: ["Fix the spelling of the attribute named in the technical details below."],
    before: `<button aria-lable="Close"></button>`,
    after: `<button aria-label="Close"></button>`,
  },

  "aria-allowed-attr": {
    title: "An accessibility setting isn't allowed here",
    problem:
      "This element has an aria-* attribute that doesn't apply to this kind of element. Screen readers may ignore it or announce something confusing.",
    affects: "People who use a screen reader.",
    fix: [
      "Remove the attribute named in the technical details below.",
      "If you meant to build a special control, use the matching HTML element or role.",
    ],
    before: `<a href="/" aria-checked="true">Home</a>`,
    after: `<a href="/" aria-current="page">Home</a>`,
  },

  "aria-prohibited-attr": {
    title: "A label is used where screen readers ignore it",
    problem:
      "This element has an aria-label (or aria-labelledby), but it is a plain element like a <div> or <span>, where screen readers ignore labels. The label is not read out.",
    affects: "People who use a screen reader.",
    fix: [
      "Put the information in visible text instead.",
      "Or use an element where labels work, such as a <section>, a link or a button.",
    ],
    before: `<div aria-label="Opening hours">Mon-Fri 8am-5pm</div>`,
    after: `<section aria-labelledby="hours">
  <h2 id="hours">Opening hours</h2>
  <p>Mon-Fri 8am-5pm</p>
</section>`,
  },

  "aria-input-field-name": {
    title: "Custom input fields need a label",
    problem:
      "This element acts like an input field (for example a custom search box or combo box) but has no label a screen reader can read out.",
    affects: "People who use a screen reader or voice control.",
    fix: [
      "Best: use a real <input> with a <label>.",
      "Otherwise, add an aria-label or aria-labelledby that says what to enter.",
    ],
    before: `<div role="combobox" contenteditable="true"></div>`,
    after: `<div role="combobox" contenteditable="true" aria-label="Search products"></div>`,
  },

  "aria-toggle-field-name": {
    title: "Custom switches and checkboxes need a label",
    problem:
      "This element acts like a checkbox, switch or radio button but has no label a screen reader can read out.",
    affects: "People who use a screen reader or voice control.",
    fix: [
      "Best: use a real <input type=\"checkbox\"> or <input type=\"radio\"> with a <label>.",
      "Otherwise, put text inside the element or add an aria-label.",
    ],
    before: `<div role="switch" aria-checked="false"></div>`,
    after: `<div role="switch" aria-checked="false" tabindex="0">Dark mode</div>`,
  },

  "duplicate-id-aria": {
    title: "Two elements share the same id",
    problem:
      "An id that is used to connect a label or description is used more than once on this page, so screen readers may read out the wrong label.",
    affects: "People who use a screen reader.",
    fix: ["Give every element a unique id, and update the matching for=, aria-labelledby or aria-describedby."],
    before: `<label for="name">Your name</label> <input id="name">
<label for="name">Friend's name</label> <input id="name">`,
    after: `<label for="your-name">Your name</label> <input id="your-name">
<label for="friend-name">Friend's name</label> <input id="friend-name">`,
  },

  "meta-viewport": {
    title: "The page stops people from zooming in",
    problem:
      "The page tells phones not to let people zoom in (user-scalable=no or a low maximum-scale). People who need bigger text can't enlarge it.",
    affects: "People with low vision, and anyone reading small text on a phone.",
    fix: ["Remove user-scalable=no and maximum-scale from the viewport meta tag."],
    before: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`,
    after: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
  },

  "target-size": {
    title: "Links or buttons are too small or too close together",
    problem:
      "This link or button is smaller than 24 by 24 pixels and too close to its neighbors, so it is easy to tap or click the wrong one. Links inside a sentence of text don't count.",
    affects: "People with shaky hands or limited movement, and anyone using a phone.",
    fix: [
      "Make the clickable area at least 24 by 24 pixels, for example by adding padding.",
      "Or add more space between small links and buttons.",
    ],
    before: `.footer-links a { font-size: 12px; padding: 0; }`,
    after: `.footer-links a { font-size: 12px; display: inline-block; min-height: 24px; padding: 4px 6px; }`,
  },

  "role-img-alt": {
    title: "An element shown as an image has no description",
    problem:
      "This element is marked as an image (role=\"img\"), often a background image or icon, but has no text description.",
    affects: "People who are blind or have low vision and use a screen reader.",
    fix: [
      "Add an aria-label describing the image.",
      "If it is only decoration, remove role=\"img\" and add aria-hidden=\"true\" instead.",
    ],
    before: `<div role="img" class="team-photo"></div>`,
    after: `<div role="img" class="team-photo" aria-label="Our five bakers outside the shop"></div>`,
  },

  "svg-img-alt": {
    title: "A drawing (SVG) has no description",
    problem: "This SVG graphic is marked as an image but has no text description.",
    affects: "People who are blind or have low vision and use a screen reader.",
    fix: [
      "Add a <title> as the first thing inside the <svg>, or an aria-label on the <svg>.",
      "If it is only decoration, use aria-hidden=\"true\" instead of role=\"img\".",
    ],
    before: `<svg role="img" viewBox="0 0 100 40">...</svg>`,
    after: `<svg role="img" viewBox="0 0 100 40" aria-label="Joe's Bakery logo">...</svg>`,
  },

  "object-alt": {
    title: "Embedded objects need a text description",
    problem: "This embedded object (such as a PDF viewer or old plugin content) has no text alternative.",
    affects: "People who use a screen reader.",
    fix: ["Add an aria-label, a title, or fallback text inside the <object> that describes it."],
    before: `<object data="menu.pdf" type="application/pdf"></object>`,
    after: `<object data="menu.pdf" type="application/pdf" aria-label="Our menu">
  <a href="menu.pdf">Download our menu (PDF)</a>
</object>`,
  },

  "nested-interactive": {
    title: "A clickable element is inside another clickable element",
    problem:
      "This element is clickable and contains another clickable element, such as a button inside a link. Screen readers and keyboards can't reliably reach the inner one.",
    affects: "People who use a screen reader or a keyboard.",
    fix: ["Use only one clickable element. Style a single link or button to look how you want."],
    before: `<a href="/product/42"><button>Buy now</button></a>`,
    after: `<a href="/product/42" class="button">Buy now</a>`,
  },

  "autocomplete-valid": {
    title: "A form field has a wrong autocomplete value",
    problem:
      "This field's autocomplete setting isn't a value browsers recognize. Autocomplete lets browsers fill in details like name and email for people, which helps people who find typing hard.",
    affects: "People with memory, thinking or movement difficulties, and everyone filling in forms on a phone.",
    fix: ["Use a standard autocomplete value, such as name, email, tel, street-address or postal-code."],
    before: `<input type="email" id="email" autocomplete="mail">`,
    after: `<input type="email" id="email" autocomplete="email">`,
  },

  "scrollable-region-focusable": {
    title: "A scrolling area can't be reached with the keyboard",
    problem:
      "This box has its own scroll bar, but keyboard users can't move into it to scroll, so they can't read everything inside.",
    affects: "People who use a keyboard instead of a mouse.",
    fix: ["Add tabindex=\"0\" so the box can be focused, plus a role and label so screen readers know what it is."],
    before: `<div style="overflow: auto; height: 200px">...</div>`,
    after: `<div style="overflow: auto; height: 200px" tabindex="0" role="region" aria-label="Opening hours">...</div>`,
  },

  "video-caption": {
    title: "Videos need captions",
    problem: "This video has no captions, so people who can't hear the sound miss what is said.",
    affects: "People who are deaf or hard of hearing, and anyone watching with the sound off.",
    fix: [
      "Add a captions file (.vtt) with a <track kind=\"captions\"> element.",
      "Automatic captions are a start, but check and correct them; they often get words wrong.",
    ],
    before: `<video src="tour.mp4" controls></video>`,
    after: `<video src="tour.mp4" controls>
  <track kind="captions" src="tour.en.vtt" srclang="en" label="English">
</video>`,
  },

  bypass: {
    title: "There is no way to skip repeated menus",
    problem:
      "Keyboard and screen reader users have to go through the whole menu on every page before reaching the content, because the page has no \"skip\" link, headings or main area to jump to.",
    affects: "People who use a keyboard or a screen reader.",
    fix: [
      "Wrap the main content in a <main> element.",
      "Add a \"Skip to main content\" link as the first thing on the page.",
      "Use headings (<h1>, <h2>...) to mark sections.",
    ],
    before: `<body>
  <nav>...</nav>
  <div class="content">...</div>`,
    after: `<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <nav>...</nav>
  <main id="main">...</main>`,
  },

  "area-alt": {
    title: "Clickable areas of an image need a description",
    problem:
      "This image map has a clickable area with no text description, so screen reader users don't know where it goes.",
    affects: "People who use a screen reader.",
    fix: ["Add an alt attribute to each <area> that says where it goes."],
    before: `<area shape="rect" coords="0,0,80,40" href="/north">`,
    after: `<area shape="rect" coords="0,0,80,40" href="/north" alt="North branch">`,
  },
};

export function explain(ruleId: string): Explanation | undefined {
  return EXPLANATIONS[ruleId];
}

interface ContrastData {
  fgColor: string;
  bgColor: string;
  contrastRatio: number;
  expectedContrastRatio: string;
}

function isContrastData(data: unknown): data is ContrastData {
  const d = data as Partial<ContrastData> | null;
  return (
    typeof d?.fgColor === "string" &&
    typeof d.bgColor === "string" &&
    typeof d.contrastRatio === "number" &&
    typeof d.expectedContrastRatio === "string"
  );
}

/** A plain-English sentence about this specific element, when we can give one. */
export function elementDetail(ruleId: string, node: NodeResult): string | undefined {
  if (ruleId === "color-contrast") {
    const data = node.any.find((check) => isContrastData(check.data))?.data;
    if (isContrastData(data)) {
      return `Text color ${data.fgColor} on background ${data.bgColor} has a contrast of ${data.contrastRatio}:1. It needs at least ${data.expectedContrastRatio}.`;
    }
  }
  return undefined;
}
