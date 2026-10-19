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
