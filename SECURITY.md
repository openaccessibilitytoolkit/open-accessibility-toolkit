# Security

Thank you for helping keep Open Accessibility Toolkit and the people who use it safe.

## Reporting a security problem

**Please don't report security problems in public issues.** Report them privately instead:

1. Go to the project's [**Security** tab](https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/security).
2. Click **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what someone could do with it.

Only the project's maintainers can see your report. We'll reply as soon as we can,
usually within a week, and keep you updated until it's fixed. If you'd like to be
credited when the fix is announced, say so in your report.

## What a good report includes

- **Steps we can follow to see the problem ourselves**: a working example (proof of
  concept), not just a description of what might be possible.
- **Which part is affected** (the portal, the command-line scanner, the statement
  generator, or the GitHub Action) and which version or commit you tested.
- **What someone could actually do with it**, such as reading other people's reports or
  logging in without permission.

## Automated tools and AI

You're welcome to use scanners and AI tools to help with your research. If you did,
please say so in your report and tell us which ones.

We can't accept reports made entirely by automated tools or AI without a person checking
them. A report needs to show a real problem in this project's code that you've confirmed
yourself. Raw scanner output (for example, a list of missing headers with no
demonstrated effect) isn't enough on its own.

## Rules for testing

- **Test on your own copy**: run the portal on your computer, or deploy your own copy to
  Cloudflare. Please don't test against the live demo or anyone else's portal.
- **No flooding or slowing things down**: don't send large numbers of reports, login
  emails or requests, and don't try to overload any service.
- **Don't look at, change or keep other people's data.** If you come across someone
  else's information by accident, stop, don't share it, and tell us in your report.
- **Give us time to fix it before going public.** Please keep the details private until
  a fix is released, or for 90 days after your report, whichever comes first. If we need
  longer, we'll explain why and agree a date with you.

## What this covers

- The **portal** (`portal/`): the self-hosted report form, accessibility statement and
  owner pages that run on Cloudflare.
- The **command-line scanner** and **statement generator** (`src/`).
- The **GitHub Action** (`action.yml`) and the portal's **Update my portal** button
  (`portal/.github/workflows/update-portal.yml`).

Problems with Cloudflare, Resend or GitHub themselves should go to those companies.

## Which versions get fixes

The latest version only: the `main` branch, and the newest `v1` release of the
command-line tool and GitHub Action. Older releases don't get separate fixes.

## How fixes reach people

- Fixes are made on `main` and announced as a
  [GitHub release](https://github.com/openaccessibilitytoolkit/open-accessibility-toolkit/releases).
  Watch the project for **Releases** to hear about them.
- **Portal owners** get a fix by pressing **Update my portal** in their own copy on
  GitHub. See
  [Keep your portal safe and up to date](docs/setup-guide.md#9-keep-your-portal-safe-and-up-to-date).
- **GitHub Action users** who use `@v1` get it automatically, because the `v1` tag is
  moved to each new `v1` release.
- **Command-line users** get it by installing the latest version.
