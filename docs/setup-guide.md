# Set up your free accessibility portal

This guide walks you through getting your own **Open Accessibility Toolkit portal**: a
free place where visitors can report accessibility problems with your website, and
where you keep a dated record of every report and what you did about it.

You don't need to know how to code. Follow the steps in order.

> **What the portal does and doesn't do.** It gives visitors an easy way to tell you
> about problems, emails you when they do, and hosts an honest accessibility statement
> for your website. It does **not** make your website "compliant" by itself. Only fixing
> the problems on your website does that.

**Contents**

1. [Before you start](#1-before-you-start)
2. [Create three free accounts](#2-create-three-free-accounts)
3. [Get your Resend key](#3-get-your-resend-key)
4. [Create your portal with one button](#4-create-your-portal-with-one-button)
5. [Log in and add your website](#5-log-in-and-add-your-website)
6. [Add the footer links to your website](#6-add-the-footer-links-to-your-website)
7. [Verify your domain in Resend](#7-verify-your-domain-in-resend)
8. [Check your setup](#8-check-your-setup)
9. [If something goes wrong](#9-if-something-goes-wrong)

---

## 1. Before you start

**You'll need:**

- About **30 minutes**.
- An email address you check. Ideally use your business email, such as
  `you@yourbusiness.com`.
- A way to edit your website, such as your WordPress, Squarespace, Wix or Shopify login.
- For step 7, a login to wherever your **domain name** is managed (GoDaddy, Namecheap,
  Squarespace, Cloudflare and so on). If someone else manages your website, they can
  do step 7 for you.

**It costs nothing.** Everything runs on the free plans of Cloudflare, Resend and
GitHub. Their free limits are far more than a small business needs. Nobody will ask
for a card.

**Tip:** if you already use any of these services for something else, do these steps
in a **private browser window** (in Chrome or Edge, press Ctrl+Shift+N; on a Mac,
Cmd+Shift+N). That keeps your other logins out of the way.

## 2. Create three free accounts

Use the same email address for all three.

1. **GitHub** at [github.com/signup](https://github.com/signup). This is where your
   copy of the portal is kept. Turn on two-factor login when it asks.
2. **Cloudflare** at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
   This runs your portal. If it asks you to add a website or pick a plan, skip it or
   choose **Free**.
3. **Resend** at [resend.com/signup](https://resend.com/signup). This sends the emails.
   Stay on the **Free** plan.

Remember which email address you used for **Resend**. Until step 7 is done, Resend
only sends emails to that address.

## 3. Get your Resend key

The portal needs a "key" from Resend to send emails. It's like a password, so keep it
private.

1. In Resend, click **API Keys** in the menu, then **Create API Key**.
2. **Name:** `Accessibility portal`.
3. **Permission:** the dropdown may start on **Full access**. Change it to **Sending
   access**. The portal only needs to send emails, and a sending-only key can't do any
   harm if it ever leaks.
4. Click **Create**, then **copy the key** straight away. It starts with `re_`, and
   Resend only shows it once. Paste it somewhere safe for the next step, such as a note
   you'll delete afterwards.

Never post the key in a chat, an email or a public place. If it leaks, delete it in
Resend and create a new one.

## 4. Create your portal with one button

1. Click this button:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/tree/main/portal)

   If the button doesn't take you to a page called **"Set up your application"** (for
   example, Cloudflare asks you to log in and then shows its home page instead), simply
   click the button again.

2. Log in to **Cloudflare** if it asks.
3. **Connect GitHub.** Under **Git account**, click **New GitHub connection**. It's the
   left button with the cat logo. The one next to it is **GitLab**, a different website.
   - GitHub asks to **Install & Authorize Cloudflare Workers and Pages** on your
     account. Keep **All repositories** selected (Cloudflare needs it to create your
     copy) and click **Install & Authorize**.
   - **Don't create a repository on GitHub yourself.** Cloudflare creates it for you.
   - If you end up on a page called **"Select a repository"**, don't pick anything.
     Click the Deploy button above again instead.
4. Back on **"Set up your application"**, fill it in from top to bottom:
   - **Git account:** choose your GitHub account from the list.
   - Tick **Create private Git repository**. Your copy doesn't need to be public.
   - **Project name** and **database:** leave them as they are. Cloudflare creates the
     database for you.
   - The setting boxes below come **pre-filled with hidden examples** (you'll only see
     dots). For each one you change, click in the box, press **Ctrl+A** (Cmd+A on a Mac),
     press **Delete**, then type or paste:
     - **ADMIN_EMAILS:** your email address. This is who can log in to your portal. To
       let more people in, separate the addresses with commas.
     - **RESEND_API_KEY:** paste the key from step 3.
     - **EMAIL_FROM:** leave it as it is for now. You'll change it in step 7.
     - **TIME_ZONE:** leave it, or type your own time zone, like `America/Chicago`,
       `America/Los_Angeles` or `Europe/London`.
5. Click **Deploy**. It takes a minute or two.
6. When it's finished, the last lines show your portal's address, ending in
   **`.workers.dev`**. **Write it down.** We'll call it *your portal address*.

You can find it again any time: in Cloudflare, go to **Workers & Pages** and click your
portal. The address is shown there.

## 5. Log in and add your website

1. Go to *your portal address* followed by **`/admin`**, for example
   `https://open-a11y-portal.yourname.workers.dev/admin`.
2. Type the email from **ADMIN_EMAILS** and click **Email me a login link**.
3. Open the email, click the link, then click **Log me in**. The link works once and
   expires after 15 minutes, so use it soon.
   - Until step 7 is done, this email only arrives if your login email is the same one
     you used for Resend.
4. Click **Websites**, then **Add a website**, and fill in the form:
   - your organization's name and website address
   - the email for accessibility problems (shown on your statement; new reports are
     emailed there)
   - how many working days you take to reply
   - optionally, problems you already know about, one per line
5. Click **Add website**. The next page shows your **accessibility statement** link, your
   **report form** link, and the **footer code** for step 6.

## 6. Add the footer links to your website

These are two plain links: **"Accessibility statement"** and **"Report an accessibility
problem"**. You only add them once. When you change anything in your portal, the pages
they open update by themselves.

On your website's page in the portal, select all of the **footer code** and copy it.
Then:

- **WordPress:** edit your footer (Appearance, then Editor or Widgets), add a **Custom
  HTML** block, and paste the code.
- **Squarespace:** edit the footer, add a **Code** block, and paste the code.
- **Wix:** edit the footer and add two text links: "Accessibility statement" linking to
  your statement link, and "Report an accessibility problem" linking to your report form
  link (both are shown on your website's page in the portal).
- **Shopify:** go to **Content**, then **Menus**, open your footer menu, and add the same
  two links as for Wix.
- **Your own HTML:** paste the code into your footer.

Menu names change from time to time, so look for something similar if yours differs.
Then publish your website.

## 7. Verify your domain in Resend

Until you do this, Resend only delivers emails to the address you signed up to Resend
with. That means **visitors don't get their confirmation email**. Doing this step fixes
that, and makes your emails less likely to land in spam.

"Verifying your domain" means proving to Resend that you own `yourbusiness.com`, by
adding a few lines of settings (called **DNS records**) wherever your domain is managed.
It sounds technical, but it's mostly copying and pasting. If someone manages your
website or domain for you, send them this step.

1. In Resend, go to **Domains**, then **Add Domain**, and type your domain, such as
   `yourbusiness.com`.
2. Resend shows a short list of records, each with a **type**, a **name** and a **value**.
3. Find where your domain is managed. It's usually where you bought it: GoDaddy,
   Namecheap, Squarespace Domains, Cloudflare, Google (now Squarespace), Wix, and so on.
   Resend has step-by-step instructions for most of them; search for your provider's
   name in [Resend's knowledge base](https://resend.com/docs/knowledge-base/introduction).
4. Add each record exactly as Resend shows it. Copy and paste; don't retype.
5. Back in Resend, click **Verify**. It can take from a few minutes to a few hours.
6. When Resend shows your domain as **Verified**, change your sending address:
   in **Cloudflare**, go to **Workers & Pages**, click your portal, then **Settings**,
   then **Variables and Secrets**. Edit **EMAIL_FROM** to something like
   `Your Business <accessibility@yourbusiness.com>`, using your verified domain, and save.

## 8. Check your setup

In your portal, click **Check my setup**. It shows, in plain words, what's done and what
needs attention:

- whether you can log in and who else can
- whether email is connected, with a **Send me a test email** button
- whether you're still on Resend's test address (step 7)
- whether your website is added
- whether the **footer links are really on your website's home page**

Fix anything marked **Needs attention**, and you're done. 🎉

## 9. If something goes wrong

**I didn't get the login email.**
Check your spam folder. Until step 7 is done, the email only reaches the address you
signed up to Resend with. Also check your email is listed in **ADMIN_EMAILS** in
Cloudflare (Workers & Pages, your portal, Settings, Variables and Secrets).

**The login link says it doesn't work.**
Links work once and expire after 15 minutes. Ask for a new one.

**The portal says "This portal isn't set up yet".**
Its database wasn't finished. In Cloudflare, open your portal and look at the latest
deployment's log for an error. The quickest fix is usually to deploy again: in your
GitHub copy, make any small change (such as adding a line to its README), and Cloudflare
deploys it again automatically.

**The test email says Resend didn't accept my key.**
Create a new key in Resend (step 3), then in Cloudflare edit **RESEND_API_KEY** under
Variables and Secrets and paste the new key.

**Visitors aren't getting a confirmation email.**
Finish step 7, then change **EMAIL_FROM**.

**I'm setting up a second portal in the same Cloudflare account.**
Give it a different **project name**, and make sure it gets its **own database**:
Cloudflare may connect the new copy to the first portal's database because they share a
name. After it's created, check under your Worker's **Bindings** that **DB** points to a
database with the new name. If not, ask a developer to set `database_name` and
`database_id` in the copy's `wrangler.jsonc`.

**I want more people to be able to log in.**
In Cloudflare, edit **ADMIN_EMAILS** and add their addresses, separated by commas.

**For developers.** You can set the portal up from the command line instead; see
[portal/README.md](../portal/README.md). On Windows, if PowerShell blocks `npx`, type
`npx.cmd`. If `wrangler login` can't reach `localhost` afterwards, use
`wrangler login --device`.
