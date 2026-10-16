// Checks what a visitor typed into the report form. Pure functions, easy to test.

/** The fixed choices for "How were you using the site?". */
export const ASSISTIVE_TECH = {
  "screen-reader": "A screen reader",
  keyboard: "Keyboard only, no mouse",
  zoom: "Zoom or a screen magnifier",
  voice: "Voice control",
  other: "Something else",
} as const;

export type AssistiveTech = keyof typeof ASSISTIVE_TECH;

export interface ReportInput {
  description: string;
  page: string;
  email: string;
  assistiveTech: AssistiveTech[];
}

export interface FieldError {
  /** The id of the form field, so the error summary can link to it. */
  field: "description" | "page" | "email";
  message: string;
}

export const LIMITS = { description: 5000, page: 500, email: 254 };

type FormValue = string | File | (string | File)[] | undefined;

function text(value: FormValue): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

function list(value: FormValue): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.filter((v): v is string => typeof v === "string");
}

export function isEmail(value: string): boolean {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) && value.length <= LIMITS.email;
}

export function validateReport(form: Record<string, FormValue>): { values: ReportInput; errors: FieldError[] } {
  const values: ReportInput = {
    description: text(form.description),
    page: text(form.page),
    email: text(form.email),
    assistiveTech: [...new Set(list(form.assistive))].filter(
      (v): v is AssistiveTech => Object.hasOwn(ASSISTIVE_TECH, v),
    ),
  };
  const errors: FieldError[] = [];
  if (!values.description) {
    errors.push({ field: "description", message: "Please tell us what went wrong." });
  } else if (values.description.length > LIMITS.description) {
    errors.push({
      field: "description",
      message: `Please keep your description under ${LIMITS.description} characters.`,
    });
  }
  if (values.page.length > LIMITS.page) {
    errors.push({ field: "page", message: `Please keep the page under ${LIMITS.page} characters.` });
  }
  if (values.email && !isEmail(values.email)) {
    errors.push({ field: "email", message: "Please check your email address, like name@example.com, or leave it empty." });
  }
  return { values, errors };
}
