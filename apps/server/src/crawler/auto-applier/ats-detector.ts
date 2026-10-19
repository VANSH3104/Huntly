import type { ATSSystemType } from "./types.js";

export function detectATS(url: string, htmlContent: string = ""): ATSSystemType {
  const lowerUrl = url.toLowerCase();
  const lowerHtml = htmlContent.toLowerCase();

  // 1. Greenhouse
  if (
    lowerUrl.includes("greenhouse.io") ||
    lowerUrl.includes("gh_jid") ||
    lowerUrl.includes("gh_src") ||
    lowerHtml.includes("id=\"greenhouse\"") ||
    lowerHtml.includes("grnhse_iframe") ||
    lowerHtml.includes("greenhouse-job")
  ) {
    return "greenhouse";
  }

  // 2. Lever
  if (
    lowerUrl.includes("lever.co") ||
    lowerHtml.includes("lever-form") ||
    lowerHtml.includes("data-qa=\"btn-apply\"") ||
    lowerHtml.includes("jobs.lever.co")
  ) {
    return "lever";
  }

  // 3. Ashby
  if (
    lowerUrl.includes("ashbyhq.com") ||
    lowerHtml.includes("ashby-job-posting") ||
    lowerHtml.includes("ashby_application_form")
  ) {
    return "ashby";
  }

  // 4. Workday
  if (
    lowerUrl.includes("myworkdayjobs.com") ||
    lowerUrl.includes("workday.com") ||
    lowerHtml.includes("workday")
  ) {
    return "workday";
  }

  // 5. BambooHR
  if (
    lowerUrl.includes("bamboohr.com") ||
    lowerHtml.includes("bamboohr")
  ) {
    return "bamboohr";
  }

  // 6. SmartRecruiters
  if (
    lowerUrl.includes("smartrecruiters.com") ||
    lowerHtml.includes("smartrecruiters")
  ) {
    return "smartrecruiters";
  }

  // 7. Workable
  if (
    lowerUrl.includes("workable.com") ||
    lowerHtml.includes("workable-job")
  ) {
    return "workable";
  }

  return "generic";
}
