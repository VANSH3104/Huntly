import { z } from "zod";

export const ApplicantProfileSchema = z.object({
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  fullName: z.string().default(""),
  email: z.string().email().or(z.string()).default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  country: z.string().default(""),
  linkedinUrl: z.string().default(""),
  githubUrl: z.string().default(""),
  portfolioUrl: z.string().default(""),
  websiteUrl: z.string().default(""),
  currentCompany: z.string().default(""),
  currentTitle: z.string().default(""),
  yearsOfExperience: z.number().default(1),
  authorizedToWork: z.boolean().default(true),
  requireSponsorship: z.boolean().default(false),
  noticePeriodDays: z.number().default(0),
  expectedSalary: z.string().default(""),
  gender: z.string().default("Decline to self-identify"),
  race: z.string().default("Decline to self-identify"),
  veteranStatus: z.string().default("I am not a protected veteran"),
  disabilityStatus: z.string().default("I do not have a disability"),
});

export type ApplicantProfile = z.infer<typeof ApplicantProfileSchema>;

export type ATSSystemType =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "bamboohr"
  | "smartrecruiters"
  | "workable"
  | "generic";

export type FormFieldCategory =
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "resume"
  | "cover_letter"
  | "linkedin"
  | "github"
  | "portfolio"
  | "location"
  | "city"
  | "state"
  | "country"
  | "work_authorization"
  | "sponsorship"
  | "salary"
  | "notice_period"
  | "gender"
  | "race"
  | "veteran"
  | "disability"
  | "consent"
  | "referral_source"
  | "custom_question"
  | "unknown";

export interface DetectedFormField {
  selector: string;
  category: FormFieldCategory;
  name: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: Array<{ label: string; value: string }>;
  currentValue?: string;
}

export interface FieldFillRecord {
  field: string;
  label: string;
  category: FormFieldCategory;
  value: string;
  type: "text" | "select" | "radio" | "checkbox" | "file" | "ai_generated";
}

export interface AutoApplyOptions {
  jobId: string;
  resumeId?: string;
  mode: "review" | "auto_submit";
  profileOverrides?: Partial<ApplicantProfile>;
  /** Submit even if required fields could not be filled (the user accepted the risk). */
  forceSubmit?: boolean;
  headless?: boolean;
  /** Open a visible browser and wait for the user when a site needs a login. */
  waitForLogin?: boolean;
}

export interface AutoApplyResult {
  jobId: string;
  title: string;
  company: string;
  url: string;
  atsType: ATSSystemType;
  status: "ready_for_review" | "submitted" | "needs_review" | "needs_login" | "skipped" | "already_applied" | "failed";
  /** Why the run stopped short of a confirmed submission. */
  reason?: string;
  unfilledFields?: string[];
  fieldsFilled: FieldFillRecord[];
  screenshotBase64?: string;
  screenshotPath?: string;
  confirmationMessage?: string;
  logs: string[];
  error?: string;
  applicationId?: string;
}
