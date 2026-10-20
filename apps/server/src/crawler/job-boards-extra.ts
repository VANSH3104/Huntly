/**
 * Wave-2 sources: more key-less boards and feeds, India/internship sources, more ATS families,
 * and key-gated APIs that switch on when their env vars are set.
 */

import {
  type BoardJob, type BoardSource, type FetchOpts, type Sweeper,
  getJson, getText, postJson, decodeEntities, htmlToText, rssTag, rssItems, toDate, relativeDate, positive,
  isRemoteText, remoteWithin, titleCaseSlug, mapPool, fetchPages, nextPage, atsSweep, countryFromCode,
  salaryFromText, levelFromYears, PER_COMPANY_CAP,
} from "./job-boards-shared.js";

const pagesFor = (limit: number, perPage: number, max: number) =>
  Array.from({ length: Math.max(1, Math.min(max, Math.ceil(limit / perPage))) }, (_, i) => i + 1);

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function firstAlternative(keywords: string | undefined): string | undefined {
  return keywords?.split(",").map(k => k.trim()).find(Boolean);
}

// ─── Remote job boards (RSS / embedded JSON / HTML) ─────────────

async function fetchJobspresso({ limit }: FetchOpts): Promise<BoardJob[]> {
  return fetchPages("jobspresso", pagesFor(limit, 20, 5), 3, async page => {
    const xml = await getText(`https://jobspresso.co/feed/?post_type=job_listing&paged=${page}`, "application/rss+xml");
    return rssItems(xml).map(item => {
      // dc:creator is "Company<br>⚲&nbsp;Location".
      const [company = "", place = ""] = decodeEntities(rssTag(item, "dc:creator")).split(/<br\s*\/?>/i);
      const location = place.replace(/^[\s⚲]+/, "").trim();
      const link = rssTag(item, "link");
      return {
        board: "jobspresso",
        externalId: link,
        title: decodeEntities(rssTag(item, "title")),
        companyName: company.trim() || "Unknown",
        location: location || "Remote",
        remote: true,
        url: link,
        description: htmlToText(rssTag(item, "content:encoded") || rssTag(item, "description")),
        tags: [...item.matchAll(/<category><!\[CDATA\[(.*?)\]\]><\/category>/g)].map(m => decodeEntities(m[1]!)),
        postedAt: toDate(rssTag(item, "pubDate")),
      };
    });
  });
}

async function fetchAuthenticJobs({ limit }: FetchOpts): Promise<BoardJob[]> {
  return fetchPages("authenticjobs", pagesFor(limit, 10, 5), 3, async page => {
    const xml = await getText(`https://authenticjobs.com/feed/?post_type=job_listing&paged=${page}`, "application/rss+xml");
    return rssItems(xml).map(item => {
      const title = decodeEntities(rssTag(item, "title"));
      const link = rssTag(item, "link");
      // The feed has no company field; the permalink slug is "<company>-<title>".
      const slug = link.match(/\/job\/\d+\/([^/]+)/)?.[1] ?? "";
      const titleSlug = slugify(title);
      const companySlug = slug.endsWith(titleSlug) ? slug.slice(0, -titleSlug.length).replace(/-$/, "") : "";
      const description = htmlToText(rssTag(item, "content:encoded") || rssTag(item, "description"));
      return {
        board: "authenticjobs",
        externalId: link,
        title,
        companyName: companySlug ? titleCaseSlug(companySlug) : "Unknown",
        location: isRemoteText(title, description.slice(0, 600)) ? "Remote" : "Unspecified",
        remote: isRemoteText(title),
        url: link,
        description,
        tags: [],
        postedAt: toDate(rssTag(item, "pubDate")),
      };
    });
  });
}

async function fetchNoDesk(_opts: FetchOpts): Promise<BoardJob[]> {
  const xml = await getText("https://nodesk.co/remote-jobs/index.xml", "application/rss+xml");
  return rssItems(xml).map(item => {
    const raw = decodeEntities(rssTag(item, "title"));
    const at = raw.lastIndexOf(" at ");
    const link = rssTag(item, "link");
    return {
      board: "nodesk",
      externalId: link,
      title: at > 0 ? raw.slice(0, at) : raw,
      companyName: at > 0 ? raw.slice(at + 4) : "Unknown",
      location: "Remote",
      remote: true,
      url: link,
      description: htmlToText(rssTag(item, "description")),
      tags: [],
      postedAt: toDate(rssTag(item, "pubDate")),
    };
  });
}

function preloadedState<T>(html: string, marker: string): T | undefined {
  const start = html.indexOf(marker);
  if (start < 0) return undefined;
  const end = html.indexOf("</script>", start);
  return JSON.parse(html.slice(start + marker.length, end).trim().replace(/;$/, "")) as T;
}

/** "19 Oct" with no year: this year, or last year when that would be in the future. */
function dayMonth(text: string | undefined): Date | undefined {
  if (!text) return undefined;
  const d = toDate(`${text} ${new Date().getFullYear()}`);
  if (d && d.getTime() > Date.now() + 86_400_000) d.setFullYear(d.getFullYear() - 1);
  return d;
}

async function fetchJustRemote(_opts: FetchOpts): Promise<BoardJob[]> {
  const html = await getText("https://justremote.co/remote-jobs", "text/html");
  type Job = {
    id: number; title: string; company_name: string; job_type?: string; date?: string; category?: string; href: string;
    remote_type?: string; job_country?: string | null; location_restrictions?: string[];
  };
  const state = preloadedState<{ jobsState?: { entity?: { all?: Job[] } } }>(html, "window.__PRELOADED_STATE__ = ");
  return (state?.jobsState?.entity?.all ?? []).map(j => {
    const restrictions = j.location_restrictions ?? [];
    return {
      board: "justremote",
      externalId: String(j.id),
      title: j.title,
      companyName: j.company_name,
      location: remoteWithin(restrictions),
      country: restrictions.length === 1 ? restrictions[0] : j.job_country ?? undefined,
      remote: true,
      url: `https://justremote.co/${j.href}`,
      description: [j.title, j.company_name, j.category, j.remote_type].filter(Boolean).join(" · "),
      employmentType: j.job_type,
      tags: j.category ? [j.category] : [],
      postedAt: dayMonth(j.date),
    };
  });
}

function textOf(html: string, re: RegExp): string {
  return htmlToText(html.match(re)?.[1] ?? "");
}

async function fetchRemote100k({ limit }: FetchOpts): Promise<BoardJob[]> {
  // The cards endpoint returns 15 server-rendered cards per offset.
  return fetchPages("remote100k", pagesFor(limit, 15, 10).map(p => (p - 1) * 15), 3, async offset => {
    const data = await getJson<{ html: string }>(`https://remote100k.com/api/jobs/cards?timeframe=recent&offset=${offset}`);
    return data.html.split(/<a href="\/remote-job\//).slice(1).map(card => {
      const slug = card.slice(0, card.indexOf('"'));
      const desktop = card.slice(card.indexOf("job-card-desktop-header"));
      const meta = [...desktop.matchAll(/<i class="bi bi-([a-z-]+)"><\/i>\s*([^<]+)</g)].map(m => ({ icon: m[1]!, text: decodeEntities(m[2]!).replace(/\s+/g, " ").trim() }));
      const by = (icon: string) => meta.find(m => m.icon === icon)?.text;
      const location = (by("geo-alt") ?? "Remote").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").replace(/\s+/g, " ").trim();
      const salary = by("coin") ?? "";
      const pay = salaryFromText(salary);
      const days = Number(card.match(/data-days="(\d+)"/)?.[1]);
      const title = textOf(desktop, /job-card-desktop-title[^>]*>([\s\S]*?)<\/h3>/);
      return {
        board: "remote100k",
        externalId: slug,
        title,
        companyName: textOf(desktop, /job-card-desktop-company[^>]*>([\s\S]*?)<\/p>/) || "Unknown",
        location,
        remote: true,
        url: `https://remote100k.com/remote-job/${slug}`,
        description: [title, by("briefcase"), location, salary].filter(Boolean).join(" · "),
        employmentType: by("clock"),
        tags: by("briefcase") ? [by("briefcase")!] : [],
        salaryMin: pay?.min,
        salaryMax: pay?.max,
        salaryCurrency: pay?.currency,
        postedAt: Number.isFinite(days) ? new Date(Date.now() - days * 86_400_000) : undefined,
      };
    });
  });
}

const REMOTELEAF_PAGES = ["/", "/jobs/in-india/", "/jobs/software-engineer/", "/jobs/full-time/", "/jobs/senior/", "/jobs/in-united-states/"];

async function fetchRemoteLeaf(_opts: FetchOpts): Promise<BoardJob[]> {
  return fetchPages("remoteleaf", REMOTELEAF_PAGES, 3, async path => {
    const html = await getText(`https://remoteleaf.com${path}`, "text/html");
    return html.split(/<div class="card bg-base-100 mb-4/).slice(1).map(card => {
      const link = card.match(/<h3[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const pill = (prefix: string) => card.match(new RegExp(`<a href="/jobs/${prefix}[^"]*"[^>]*>[\\s\\S]*?<span[^>]*>([^<]+)</span>`))?.[1]?.trim();
      const location = pill("in-") ?? "Remote";
      const salary = textOf(card, /font-bold text-success">([\s\S]*?)<\/span>/);
      const pay = salaryFromText(salary);
      const apply = card.match(/<a href="(https?:[^"]+)"[^>]*>\s*Apply/)?.[1];
      const path = link?.[1] ?? "";
      return {
        board: "remoteleaf",
        externalId: path,
        title: htmlToText(link?.[2] ?? ""),
        companyName: htmlToText(card.match(/<a href="\/company\/[^"]+\/" class="relative z-10 inline-flex[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "") || "Unknown",
        location: `Remote (${location})`,
        remote: true,
        url: apply ?? `https://remoteleaf.com${path}`,
        description: textOf(card, /<p class="text-base-content\/90 text-sm line-clamp-2[^"]*">([\s\S]*?)<\/p>/),
        employmentType: card.match(/<a href="\/jobs\/(full-time|part-time|contract|internship|freelance)\/"/)?.[1],
        tags: [pill("senior"), pill("mid-level"), pill("junior")].filter((t): t is string => !!t),
        salaryMin: pay?.min,
        salaryMax: pay?.max,
        salaryCurrency: pay?.currency,
        postedAt: relativeDate(card.match(/<span class="text-sm font-medium text-base-content\/90">([^<]*ago)<\/span>/)?.[1]),
        experienceLevel: card.match(/<a href="\/jobs\/(senior|mid-level|junior|entry-level|lead|executive)\/"/)?.[1],
      };
    }).filter(j => j.title && j.externalId);
  });
}

async function fetchLandingJobs({ limit }: FetchOpts): Promise<BoardJob[]> {
  type Job = {
    id: number; title: string; url: string; type?: string; remote?: boolean; currency_code?: string;
    gross_salary_low?: number | null; gross_salary_high?: number | null; tags?: string[]; published_at?: string;
    role_description?: string; main_requirements?: string; nice_to_have?: string;
    locations?: Array<{ city?: string; country_code?: string }>;
  };
  return fetchPages("landingjobs", pagesFor(limit, 50, 6).map(p => (p - 1) * 50), 3, async offset => {
    const data = await getJson<Job[]>(`https://landing.jobs/api/v1/jobs?limit=50&offset=${offset}`);
    return data.map(j => {
      const loc = j.locations?.[0];
      const country = countryFromCode(loc?.country_code);
      const place = (j.locations ?? []).map(l => [l.city, countryFromCode(l.country_code)].filter(Boolean).join(", ")).join("; ");
      return {
        board: "landingjobs",
        externalId: String(j.id),
        title: j.title,
        companyName: titleCaseSlug(j.url.match(/\/at\/([^/]+)/)?.[1] ?? "unknown"),
        location: place || (j.remote ? "Remote" : "Unspecified"),
        country,
        city: loc?.city,
        remote: !!j.remote,
        url: j.url,
        description: htmlToText([j.role_description, j.main_requirements, j.nice_to_have].filter(Boolean).join("\n")),
        employmentType: j.type,
        tags: j.tags ?? [],
        salaryMin: positive(j.gross_salary_low),
        salaryMax: positive(j.gross_salary_high),
        salaryCurrency: positive(j.gross_salary_low) || positive(j.gross_salary_high) ? j.currency_code : undefined,
        postedAt: toDate(j.published_at),
      };
    });
  });
}

// ─── Hacker News / YC ───────────────────────────────────────────

async function fetchHackerNewsJobs({ limit }: FetchOpts): Promise<BoardJob[]> {
  const ids = await getJson<number[]>("https://hacker-news.firebaseio.com/v0/jobstories.json");
  const items = await mapPool(ids.slice(0, Math.min(200, limit)), 8, id =>
    getJson<{ id: number; title?: string; url?: string; text?: string; time?: number } | null>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      .catch(() => null));
  return items.filter((i): i is NonNullable<typeof i> => !!i?.title).map(i => {
    const title = decodeEntities(i.title!);
    // "Evidence (YC S21) Is Hiring Software Engineers" / "Acme is hiring a founding engineer".
    const m = title.match(/^(.*?)\s*(?:\((YC [A-Z]\d{2})\))?\s+(?:is|are)\s+hiring\b\s*(?:an?\s+)?(.*)$/i);
    const company = (m?.[1] ?? title.split(/\s[-–|:]\s/)[0] ?? title).trim();
    const role = m?.[3]?.replace(/^(for\s+)?/i, "").trim();
    const text = htmlToText(i.text);
    return {
      board: "hackernews",
      externalId: String(i.id),
      title: role ? role.charAt(0).toUpperCase() + role.slice(1) : title,
      companyName: company,
      location: isRemoteText(title, text) ? "Remote" : "Unspecified",
      remote: isRemoteText(title),
      url: i.url || `https://news.ycombinator.com/item?id=${i.id}`,
      description: [title, m?.[2] ? `Y Combinator ${m[2]} company.` : "", text].filter(Boolean).join("\n\n"),
      tags: m?.[2] ? [m[2]] : [],
      postedAt: toDate(i.time),
    };
  });
}

type YcPosting = {
  id: number; title: string; url: string; location?: string; type?: string; prettyRole?: string; roleSpecificType?: string;
  salaryRange?: string; equityRange?: string; minExperience?: string; visa?: string; skills?: Array<string | { name?: string }>;
  companyName: string; companyBatchName?: string; companyOneLiner?: string; companyUrl?: string; createdAt?: string;
};

async function ycPage(path: string): Promise<{ postings: YcPosting[]; roles: string[] }> {
  const html = await getText(`https://www.ycombinator.com${path}`, "text/html");
  const raw = html.match(/data-page="([^"]+)"/)?.[1];
  if (!raw) return { postings: [], roles: [] };
  const props = (JSON.parse(decodeEntities(raw)) as { props?: { jobPostings?: YcPosting[]; jobRoles?: Array<{ slug: string }> } }).props;
  return { postings: props?.jobPostings ?? [], roles: (props?.jobRoles ?? []).map(r => r.slug) };
}

async function fetchYCombinator(_opts: FetchOpts): Promise<BoardJob[]> {
  const first = await ycPage("/jobs");
  // Each page shows 20 postings; the per-role pages surface different ones.
  const rest = await fetchPages("ycombinator", first.roles.map(r => `/jobs/role/${r}`), 3, async path => {
    const { postings } = await ycPage(path);
    return postings.map(ycJob);
  }).catch(() => [] as BoardJob[]);
  return [...first.postings.map(ycJob), ...rest];
}

function ycJob(p: YcPosting): BoardJob {
  const pay = p.salaryRange ? salaryFromText(p.salaryRange) : undefined;
  const years = Number(p.minExperience?.match(/\d+/)?.[0]);
  const skills = (p.skills ?? []).map(s => (typeof s === "string" ? s : s.name ?? "")).filter(Boolean);
  const location = p.location || "Unspecified";
  return {
    board: "ycombinator",
    externalId: String(p.id),
    title: p.title,
    companyName: p.companyName,
    companyUrl: p.companyUrl ? `https://www.ycombinator.com${p.companyUrl}` : undefined,
    location,
    remote: isRemoteText(location),
    url: `https://www.ycombinator.com${p.url}`,
    description: [
      `${p.companyName} (Y Combinator ${p.companyBatchName ?? ""}) — ${p.companyOneLiner ?? ""}`,
      [p.prettyRole, p.roleSpecificType, p.salaryRange, p.equityRange && `equity ${p.equityRange}`, p.minExperience && `${p.minExperience} experience`, p.visa].filter(Boolean).join(" · "),
    ].join("\n"),
    employmentType: p.type,
    tags: [p.prettyRole, p.roleSpecificType, ...skills].filter((t): t is string => !!t),
    salaryMin: pay?.min,
    salaryMax: pay?.max,
    salaryCurrency: pay?.currency,
    postedAt: relativeDate(p.createdAt),
    experienceLevel: Number.isFinite(years) ? levelFromYears(years) : undefined,
  };
}

// ─── Internships / new grad / India ─────────────────────────────

type SimplifyListing = {
  id: string; company_name: string; title: string; url: string; locations?: string[]; terms?: string[]; category?: string;
  active?: boolean; is_visible?: boolean; date_posted?: number; sponsorship?: string; degrees?: string[]; company_url?: string;
};

function simplifyBoard(board: string, repo: string, kind: "internship" | "newgrad") {
  return async ({ limit }: FetchOpts): Promise<BoardJob[]> => {
    // ~13 MB of JSON, so it gets a longer timeout than the API boards.
    const all = await getJson<SimplifyListing[]>(`https://raw.githubusercontent.com/SimplifyJobs/${repo}/dev/.github/scripts/listings.json`, { timeoutMs: 90_000 });
    const live = all.filter(l => l.active && l.is_visible !== false).sort((a, b) => (b.date_posted ?? 0) - (a.date_posted ?? 0));
    // Keyword filtering happens later in fetchBoard; keep a wide window so it has something to filter.
    return live.slice(0, Math.max(limit * 10, 500)).map(l => {
      const location = (l.locations ?? []).join("; ") || "Unspecified";
      return {
        board,
        externalId: l.id,
        title: l.title,
        companyName: l.company_name,
        companyUrl: l.company_url,
        location,
        remote: isRemoteText(location),
        url: l.url,
        description: [
          `${l.title} at ${l.company_name}`,
          l.terms?.length ? `Terms: ${l.terms.join(", ")}` : "",
          l.category ? `Category: ${l.category}` : "",
          l.degrees?.length ? `Degrees: ${l.degrees.join(", ")}` : "",
          l.sponsorship ? `Sponsorship: ${l.sponsorship}` : "",
          "Listed by SimplifyJobs on GitHub.",
        ].filter(Boolean).join("\n"),
        employmentType: kind === "internship" ? "internship" : "full-time",
        tags: [l.category, ...(l.terms ?? [])].filter((t): t is string => !!t),
        postedAt: toDate(l.date_posted),
        experienceLevel: kind === "internship" ? "INTERNSHIP" : "ENTRY",
      };
    });
  };
}

function internshalaPay(text: string): { min?: number; max?: number } {
  // Indian digit grouping ("4,20,000 - 4,60,000"); stipends are monthly and get annualised to match salary filters.
  const nums = [...text.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)].map(m => Number(m[0]));
  if (nums.length === 0) return {};
  const factor = /month/i.test(text) ? 12 : /week/i.test(text) ? 52 : 1;
  return { min: positive((nums[0] ?? 0) * factor), max: positive((nums[1] ?? nums[0] ?? 0) * factor) };
}

async function fetchInternshala({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  const kw = firstAlternative(keywords);
  const kinds = ["internships", "jobs"] as const;
  const pages = pagesFor(limit, 40, 3);
  const urls = kinds.flatMap(kind => pages.map(p =>
    `https://internshala.com/${kind}/${kw ? `keywords-${encodeURIComponent(slugify(kw))}/` : ""}${p > 1 ? `page-${p}/` : ""}`));
  return fetchPages("internshala", urls, 3, async url => {
    const html = await getText(url, "text/html");
    return html.split(/<div class="container-fluid individual_internship /).slice(1).map(card => {
      const id = card.match(/internshipId="(\d+)"/)?.[1] ?? "";
      const isJob = /employment_type="job"/.test(card);
      const href = card.match(/<a class="job-title-href"[^>]*href="([^"]+)"/)?.[1] ?? "";
      const location = htmlToText(card.match(/class="row-1-item\s+locations">([\s\S]*?)<\/(?:div|p)>/)?.[1] ?? "").replace(/\s*,\s*/g, ", ");
      const payText = htmlToText(card.match(/ic-16-money"><\/i>\s*(?:<span class="desktop">[\s\S]*?<\/span>\s*)?<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
      const pay = internshalaPay(payText);
      const experience = htmlToText(card.match(/ic-16-briefcase"><\/i>\s*<span>([\s\S]*?)<\/span>/)?.[1] ?? "");
      const skills = [...card.matchAll(/<div class='job_skill'>([^<]+)<\/div>/g)].map(m => decodeEntities(m[1]!).trim());
      const remote = /work from home|remote/i.test(location);
      return {
        board: "internshala",
        externalId: id,
        title: htmlToText(card.match(/<a class="job-title-href"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ""),
        companyName: htmlToText(card.match(/<p class="company-name">([\s\S]*?)<\/p>/)?.[1] ?? "") || "Unknown",
        location: location || "India",
        country: "India",
        remote,
        url: `https://internshala.com${href}`,
        description: [
          htmlToText(card.match(/<div class="text">([\s\S]*?)<\/div>/)?.[1] ?? ""),
          payText && `${isJob ? "Salary" : "Stipend"}: ${payText}`,
          experience && `Experience: ${experience}`,
          skills.length ? `Skills: ${skills.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
        employmentType: isJob ? "full-time" : "internship",
        tags: skills,
        salaryMin: pay.min,
        salaryMax: pay.max,
        salaryCurrency: pay.min ? "INR" : undefined,
        postedAt: relativeDate(card.match(/ic-16-reschedule"><\/i><span>([^<]+)</)?.[1]),
        experienceLevel: isJob ? (/no experience|fresher|0\s*-/i.test(experience) ? "ENTRY" : levelFromYears(Number(experience.match(/\d+/)?.[0]))) : "INTERNSHIP",
      };
    }).filter(j => j.externalId && j.title);
  });
}

const CUTSHORT_CATEGORIES = [
  "python-jobs", "java-jobs", "javascript-jobs", "reactjs-jobs", "nodejs-jobs", "devops-jobs",
  "software-architecture-jobs", "machine-learning-jobs", "data-analytics-jobs", "android-jobs", "golang-jobs", "aws-jobs",
];

async function fetchCutshort({ keywords }: FetchOpts): Promise<BoardJob[]> {
  const kw = firstAlternative(keywords);
  const categories = kw ? [`${slugify(kw)}-jobs`, ...CUTSHORT_CATEGORIES.slice(0, 3)] : CUTSHORT_CATEGORIES;
  type Job = {
    _id: string; publicUrl: string; headline: string; allSkills?: string[]; locations?: string[]; locationsText?: string;
    salaryRange?: { currency?: string; min?: number; max?: number; hideSalary?: boolean };
    companyDetails?: { name?: string }; expRange?: { min?: number; max?: number }; sanitizedComment?: string;
    roleTypes?: string[]; remoteType?: string; jobFactSummary?: { postedDate?: string };
  };
  return fetchPages("cutshort", categories, 4, async category => {
    const html = await getText(`https://cutshort.io/jobs/${category}`, "text/html");
    const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (!raw) return [];
    const queries = (JSON.parse(raw) as { props?: { pageProps?: { dehydratedState?: { queries?: Array<{ state?: { data?: any } }> } } } })
      .props?.pageProps?.dehydratedState?.queries ?? [];
    const jobs: Job[] = queries.flatMap(q => q.state?.data?.data?.pageData?.jobs ?? []);
    return jobs.map(j => {
      const remote = /remote_(only|okay)/.test(j.remoteType ?? "");
      const showPay = !j.salaryRange?.hideSalary;
      return {
        board: "cutshort",
        externalId: j._id,
        title: j.headline,
        companyName: j.companyDetails?.name ?? "Unknown",
        location: [j.locationsText || (j.locations ?? []).join(", "), remote ? "Remote" : ""].filter(Boolean).join(" · ") || "India",
        country: "India",
        city: j.locations?.[0],
        remote,
        url: j.publicUrl,
        description: htmlToText(j.sanitizedComment),
        employmentType: j.roleTypes?.[0]?.replace(/_/g, " "),
        tags: j.allSkills ?? [],
        salaryMin: showPay ? positive(j.salaryRange?.min) : undefined,
        salaryMax: showPay ? positive(j.salaryRange?.max) : undefined,
        salaryCurrency: showPay && positive(j.salaryRange?.max) ? j.salaryRange?.currency : undefined,
        postedAt: toDate(j.jobFactSummary?.postedDate),
        experienceLevel: levelFromYears(j.expRange?.min),
      };
    });
  });
}

// ─── ATS families ───────────────────────────────────────────────

// Verified live (non-empty) on 2026-10-19: [tenant, wd host, career site, display name].
const WORKDAY_TENANTS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["nvidia", "wd5", "NVIDIAExternalCareerSite", "NVIDIA"], ["adobe", "wd5", "external_experienced", "Adobe"],
  ["intel", "wd1", "External", "Intel"], ["cisco", "wd5", "Cisco_Careers", "Cisco"],
  ["mastercard", "wd1", "CorporateCareers", "Mastercard"], ["paypal", "wd1", "jobs", "PayPal"],
  ["amgen", "wd1", "Careers", "Amgen"], ["broadcom", "wd1", "External_Career", "Broadcom"],
  ["accenture", "wd103", "AccentureCareers", "Accenture"], ["snapchat", "wd1", "snap", "Snap"],
  ["zoom", "wd5", "Zoom", "Zoom"], ["crowdstrike", "wd5", "crowdstrikecareers", "CrowdStrike"],
  ["motorolasolutions", "wd5", "Careers", "Motorola Solutions"], ["sonyglobal", "wd1", "SonyGlobalCareers", "Sony"],
  ["chevron", "wd5", "jobs", "Chevron"], ["disney", "wd5", "disneycareer", "Disney"],
  ["kla", "wd1", "Search", "KLA"], ["analogdevices", "wd1", "External", "Analog Devices"],
  ["athenahealth", "wd1", "External", "athenahealth"],
];
const WORKDAY_BY_TENANT = new Map(WORKDAY_TENANTS.map(t => [t[0], t]));

const sweepWorkday: Sweeper = async (tenant, keywords) => {
  const [, host, site, name] = WORKDAY_BY_TENANT.get(tenant)!;
  const base = `https://${tenant}.${host}.myworkdayjobs.com`;
  type Resp = { total?: number; jobPostings?: Array<{ title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }> };
  const out: NonNullable<Resp["jobPostings"]> = [];
  // Workday caps a page at 20; two pages cover the per-company cap.
  for (const offset of [0, 20]) {
    const data = await nextPage(postJson<Resp>(`${base}/wday/cxs/${tenant}/${site}/jobs`,
      { limit: 20, offset, searchText: firstAlternative(keywords) ?? "", appliedFacets: {} }), out.length, `workday/${tenant}`);
    if (!data?.jobPostings?.length) break;
    out.push(...data.jobPostings);
    if ((data.total ?? 0) <= offset + 20) break;
  }
  type Detail = { jobPostingInfo?: {
    jobDescription?: string; location?: string; additionalLocations?: string[]; timeType?: string; startDate?: string;
    country?: { descriptor?: string }; jobRequisitionLocation?: { country?: { alpha2Code?: string } };
  } };
  // The listing has no description or job type; one detail call per kept posting fills them in.
  const details = await mapPool(out.slice(0, PER_COMPANY_CAP), 4, j =>
    getJson<Detail>(`${base}/wday/cxs/${tenant}/${site}${j.externalPath}`).then(d => d.jobPostingInfo).catch(() => undefined));
  return out.map((j, i) => {
    const info = details[i];
    // "3 Locations" says nothing; the path's first segment ("/job/Bangalore-India/...") is the primary location.
    const pathLoc = j.externalPath.split("/")[2]?.replace(/-/g, " ") ?? "";
    const listed = !j.locationsText || /^\d+ Locations?$/i.test(j.locationsText) ? pathLoc : j.locationsText;
    const location = info?.location ? [info.location, ...(info.additionalLocations ?? [])].join("; ") : listed;
    const description = htmlToText(info?.jobDescription);
    return {
      board: "workday",
      externalId: `${tenant}:${j.bulletFields?.[0] ?? j.externalPath}`,
      title: j.title,
      companyName: name,
      companyUrl: `${base}/${site}`,
      location: location || "Unspecified",
      remote: isRemoteText(location, j.title),
      country: countryFromCode(info?.jobRequisitionLocation?.country?.alpha2Code) ?? info?.country?.descriptor,
      url: `${base}/${site}${j.externalPath}`,
      description: description || [j.title, name, location].filter(Boolean).join(" · "),
      employmentType: info?.timeType,
      tags: [],
      postedAt: relativeDate(j.postedOn) ?? toDate(info?.startDate),
    };
  });
};

const TEAMTAILOR_SLUGS = [
  "storytel", "lunar", "anyfin", "qliro", "instabee", "karma", "detectify", "polestar", "funnel", "kambi",
  "remarkable", "carla", "quinyx", "matsmart", "tibber", "schibsted",
];

const sweepTeamtailor: Sweeper = async slug => {
  const xml = await getText(`https://${slug}.teamtailor.com/jobs.rss`, "application/rss+xml");
  return rssItems(xml).map(item => {
    const city = decodeEntities(rssTag(item, "tt:city"));
    const country = decodeEntities(rssTag(item, "tt:country"));
    const status = rssTag(item, "remoteStatus");
    const location = decodeEntities(rssTag(item, "tt:name")) || [city, country].filter(Boolean).join(", ");
    const link = rssTag(item, "link");
    return {
      board: "teamtailor",
      externalId: rssTag(item, "guid") || link,
      title: decodeEntities(rssTag(item, "title")),
      companyName: decodeEntities(rssTag(item, "company_name")) || titleCaseSlug(slug),
      companyUrl: `https://${slug}.teamtailor.com`,
      location: [location, status === "hybrid" ? "Hybrid" : status === "fully" ? "Remote" : ""].filter(Boolean).join(" · ") || "Unspecified",
      country: country || undefined,
      city: city || undefined,
      remote: status === "fully",
      url: link,
      description: htmlToText(rssTag(item, "description")),
      tags: [rssTag(item, "tt:department"), rssTag(item, "tt:role")].map(decodeEntities).filter(Boolean),
      postedAt: toDate(rssTag(item, "pubDate")),
    };
  });
};

const BAMBOOHR_SLUGS = ["canopy", "neighbor", "kiln", "scribd"];

const sweepBambooHR: Sweeper = async slug => {
  const data = await getJson<{ result?: Array<{
    id: string; jobOpeningName: string; departmentLabel?: string; employmentStatusLabel?: string;
    location?: { city?: string | null; state?: string | null }; atsLocation?: { country?: string | null; city?: string | null; state?: string | null };
    isRemote?: boolean | null; locationType?: string;
  }> }>(`https://${slug}.bamboohr.com/careers/list`);
  return (data.result ?? []).map(j => {
    const city = j.location?.city ?? j.atsLocation?.city ?? undefined;
    const state = j.location?.state ?? j.atsLocation?.state ?? undefined;
    // locationType: "0" on-site, "1" remote, "2" hybrid.
    const remote = !!j.isRemote || j.locationType === "1";
    const location = [city, state, j.atsLocation?.country].filter(Boolean).join(", ");
    return {
      board: "bamboohr",
      externalId: `${slug}:${j.id}`,
      title: j.jobOpeningName,
      companyName: titleCaseSlug(slug),
      companyUrl: `https://${slug}.bamboohr.com/careers`,
      location: [location, remote ? "Remote" : j.locationType === "2" ? "Hybrid" : ""].filter(Boolean).join(" · ") || "Unspecified",
      country: j.atsLocation?.country ?? undefined,
      city: city ?? undefined,
      remote,
      url: `https://${slug}.bamboohr.com/careers/${j.id}`,
      description: [j.jobOpeningName, j.departmentLabel, j.employmentStatusLabel, location].filter(Boolean).join(" · "),
      employmentType: j.employmentStatusLabel,
      tags: j.departmentLabel ? [j.departmentLabel] : [],
    };
  });
};

const PERSONIO_SLUGS = ["personio", "tado", "1komma5grad", "thermondo", "join", "ottonova"];

const sweepPersonio: Sweeper = async slug => {
  const xml = await getText(`https://${slug}.jobs.personio.de/xml`, "application/xml");
  return (xml.match(/<position>[\s\S]*?<\/position>/g) ?? []).map(pos => {
    const tag = (t: string) => decodeEntities(rssTag(pos, t));
    const id = tag("id");
    const office = tag("office");
    const descriptions = [...pos.matchAll(/<jobDescription>\s*<name>([\s\S]*?)<\/name>\s*<value>([\s\S]*?)<\/value>/g)]
      .map(m => `${decodeEntities(m[1]!.trim())}\n${htmlToText(m[2]!.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, ""))}`);
    const salary = pos.match(/<salaryInformation>([\s\S]*?)<\/salaryInformation>/)?.[1] ?? "";
    const yearly = !salary || /<type>yearly<\/type>/.test(salary);
    return {
      board: "personio",
      externalId: id,
      title: tag("name"),
      companyName: tag("subcompany") || titleCaseSlug(slug),
      companyUrl: `https://${slug}.jobs.personio.de`,
      location: office || "Unspecified",
      remote: isRemoteText(office),
      url: `https://${slug}.jobs.personio.de/job/${id}`,
      description: descriptions.join("\n\n") || [tag("name"), tag("department"), office].filter(Boolean).join(" · "),
      employmentType: `${tag("employmentType")} ${tag("schedule")}`.replace(/_/g, " ").trim(),
      tags: [tag("department"), tag("recruitingCategory"), ...tag("keywords").split(",").map(k => k.trim())].filter(t => t && t.length <= 30),
      salaryMin: yearly ? positive(Number(rssTag(salary, "min"))) : undefined,
      salaryMax: yearly ? positive(Number(rssTag(salary, "max"))) : undefined,
      salaryCurrency: yearly ? rssTag(salary, "currencyCode") || undefined : undefined,
      postedAt: toDate(tag("createdAt")),
      experienceLevel: tag("seniority").replace(/-/g, " ") || levelFromYears(Number(tag("yearsOfExperience").match(/\d+/)?.[0])),
    };
  });
};

const BREEZY_SLUGS = ["breezy", "remote"];

const sweepBreezy: Sweeper = async slug => {
  const data = await getJson<Array<{
    id: string; name: string; url: string; published_date?: string; type?: { id?: string; name?: string };
    location?: { country?: { name?: string; id?: string }; city?: string; is_remote?: boolean; name?: string };
    department?: string; salary?: string; company?: { name?: string };
  }>>(`https://${slug}.breezy.hr/json`);
  return data.map(j => {
    const location = j.location?.name ?? "";
    const pay = j.salary ? salaryFromText(j.salary) : undefined;
    return {
      board: "breezy",
      externalId: j.id,
      title: j.name,
      companyName: j.company?.name || titleCaseSlug(slug),
      companyUrl: `https://${slug}.breezy.hr`,
      location: [location, j.location?.is_remote ? "Remote" : ""].filter(Boolean).join(" · ") || "Unspecified",
      country: j.location?.country?.name ?? countryFromCode(j.location?.country?.id),
      city: j.location?.city,
      remote: !!j.location?.is_remote,
      url: j.url,
      description: [j.name, j.department, location, j.salary].filter(Boolean).join(" · "),
      employmentType: j.type?.id,
      tags: j.department ? [j.department] : [],
      salaryMin: pay?.min,
      salaryMax: pay?.max,
      salaryCurrency: pay?.currency,
      postedAt: toDate(j.published_date),
    };
  });
};

const RIPPLING_SLUGS = ["rippling"];

const sweepRippling: Sweeper = async slug => {
  const data = await getJson<Array<{ uuid: string; name: string; department?: { label?: string }; url: string; workLocation?: { label?: string } }>>(
    `https://api.rippling.com/platform/api/ats/v1/board/${slug}/jobs`);
  return data.map(j => {
    const location = j.workLocation?.label ?? "";
    return {
      board: "rippling",
      externalId: j.uuid,
      title: j.name.trim(),
      companyName: titleCaseSlug(slug),
      companyUrl: `https://ats.rippling.com/${slug}/jobs`,
      location: location || "Unspecified",
      remote: isRemoteText(location),
      url: j.url,
      description: [j.name.trim(), j.department?.label, location].filter(Boolean).join(" · "),
      tags: j.department?.label ? [j.department.label] : [],
    };
  });
};

const GEM_SLUGS = ["gem", "retool", "arc", "tropic"];

const sweepGem: Sweeper = async slug => {
  const data = await getJson<Array<{
    id: string; title: string; absolute_url: string; content_plain?: string; employment_type?: string; first_published_at?: string;
    location?: { name?: string }; location_type?: string; departments?: Array<{ name?: string }>;
  }>>(`https://api.gem.com/job_board/v0/${slug}/job_posts/`);
  return data.map(j => {
    const location = j.location?.name ?? "";
    return {
      board: "gemjobs",
      externalId: j.id,
      title: j.title,
      companyName: titleCaseSlug(slug),
      companyUrl: `https://jobs.gem.com/${slug}`,
      location: [location, j.location_type === "hybrid" ? "Hybrid" : j.location_type === "remote" ? "Remote" : ""].filter(Boolean).join(" · ") || "Unspecified",
      remote: j.location_type === "remote" || isRemoteText(location),
      url: j.absolute_url,
      description: j.content_plain ?? "",
      employmentType: j.employment_type,
      tags: (j.departments ?? []).map(d => d.name).filter((t): t is string => !!t),
      postedAt: toDate(j.first_published_at),
    };
  });
};

// ─── Key-gated APIs (listed always, enabled once their env vars are set) ──

const env = (k: string) => process.env[k] ?? "";

async function fetchAdzuna({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  const country = (env("ADZUNA_COUNTRY") || "in").toLowerCase();
  type Resp = { results?: Array<{
    id: string; title: string; description?: string; redirect_url: string; created?: string; company?: { display_name?: string };
    location?: { display_name?: string; area?: string[] }; salary_min?: number; salary_max?: number; salary_is_predicted?: string | number;
    contract_time?: string; contract_type?: string; category?: { label?: string };
  }> };
  return fetchPages("adzuna", pagesFor(limit, 50, 4), 2, async page => {
    const params = new URLSearchParams({ app_id: env("ADZUNA_APP_ID"), app_key: env("ADZUNA_APP_KEY"), results_per_page: "50" });
    if (keywords) params.set("what_or", keywords.replace(/,/g, " "));
    const data = await getJson<Resp>(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`);
    return (data.results ?? []).map(j => {
      const predicted = String(j.salary_is_predicted) === "1";
      return {
        board: "adzuna",
        externalId: j.id,
        title: htmlToText(j.title),
        companyName: j.company?.display_name ?? "Unknown",
        location: j.location?.display_name ?? "Unspecified",
        country: j.location?.area?.[0] ?? countryFromCode(country),
        city: j.location?.area?.at(-1),
        remote: isRemoteText(j.title, j.location?.display_name),
        url: j.redirect_url,
        description: htmlToText(j.description),
        employmentType: [j.contract_time, j.contract_type].filter(Boolean).join(" ").replace(/_/g, " "),
        tags: j.category?.label ? [j.category.label] : [],
        // Adzuna estimates salaries it wasn't given; only advertised figures are kept.
        salaryMin: predicted ? undefined : positive(j.salary_min),
        salaryMax: predicted ? undefined : positive(j.salary_max),
        salaryCurrency: predicted ? undefined : ({ in: "INR", gb: "GBP", us: "USD", de: "EUR", fr: "EUR", nl: "EUR", ca: "CAD", au: "AUD" } as Record<string, string>)[country],
        postedAt: toDate(j.created),
      };
    });
  });
}

async function fetchJooble({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  type Resp = { jobs?: Array<{ id: number | string; title: string; location?: string; snippet?: string; salary?: string; type?: string; link: string; company?: string; updated?: string }> };
  return fetchPages("jooble", pagesFor(limit, 20, 5), 2, async page => {
    const data = await postJson<Resp>(`https://jooble.org/api/${env("JOOBLE_API_KEY")}`,
      { keywords: keywords ?? "", location: env("JOOBLE_LOCATION"), page: String(page) });
    return (data.jobs ?? []).map(j => {
      const pay = j.salary ? salaryFromText(j.salary) : undefined;
      return {
        board: "jooble",
        externalId: String(j.id),
        title: htmlToText(j.title),
        companyName: j.company || "Unknown",
        location: j.location || "Unspecified",
        remote: isRemoteText(j.title, j.location),
        url: j.link,
        description: htmlToText(j.snippet),
        employmentType: j.type,
        tags: [],
        salaryMin: pay?.min,
        salaryMax: pay?.max,
        salaryCurrency: pay?.currency,
        postedAt: toDate(j.updated),
      };
    });
  });
}

async function fetchReed({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  type Resp = { results?: Array<{
    jobId: number; employerName?: string; jobTitle: string; locationName?: string; minimumSalary?: number | null;
    maximumSalary?: number | null; currency?: string | null; date?: string; jobDescription?: string; jobUrl: string;
  }> };
  const auth = `Basic ${Buffer.from(`${env("REED_API_KEY")}:`).toString("base64")}`;
  return fetchPages("reed", pagesFor(limit, 100, 3).map(p => (p - 1) * 100), 2, async skip => {
    const params = new URLSearchParams({ resultsToTake: "100", resultsToSkip: String(skip) });
    if (keywords) params.set("keywords", keywords.replace(/,/g, " "));
    const data = await getJson<Resp>(`https://www.reed.co.uk/api/1.0/search?${params}`, { headers: { Authorization: auth } });
    return (data.results ?? []).map(j => {
      // Reed dates are dd/mm/yyyy.
      const [d, m, y] = (j.date ?? "").split("/");
      return {
        board: "reed",
        externalId: String(j.jobId),
        title: j.jobTitle,
        companyName: j.employerName ?? "Unknown",
        location: j.locationName ?? "Unspecified",
        country: "United Kingdom",
        city: j.locationName,
        remote: isRemoteText(j.jobTitle, j.locationName),
        url: j.jobUrl,
        description: htmlToText(j.jobDescription),
        tags: [],
        salaryMin: positive(j.minimumSalary),
        salaryMax: positive(j.maximumSalary),
        salaryCurrency: positive(j.minimumSalary) || positive(j.maximumSalary) ? j.currency || "GBP" : undefined,
        postedAt: y ? toDate(`${y}-${m}-${d}`) : undefined,
      };
    });
  });
}

async function fetchUSAJobs({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  type Item = { MatchedObjectId: string; MatchedObjectDescriptor: {
    PositionTitle: string; OrganizationName?: string; PositionURI: string; PositionLocationDisplay?: string;
    PositionLocation?: Array<{ CityName?: string; CountryCode?: string }>; PublicationStartDate?: string;
    PositionSchedule?: Array<{ Name?: string }>; PositionRemuneration?: Array<{ MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }>;
    UserArea?: { Details?: { JobSummary?: string; LowGrade?: string; TeleworkEligible?: boolean } }; QualificationSummary?: string;
  } };
  const params = new URLSearchParams({ ResultsPerPage: String(Math.min(500, limit)) });
  if (keywords) params.set("Keyword", keywords.replace(/,/g, " "));
  const data = await getJson<{ SearchResult?: { SearchResultItems?: Item[] } }>(`https://data.usajobs.gov/api/search?${params}`, {
    headers: { "Authorization-Key": env("USAJOBS_API_KEY"), "User-Agent": env("USAJOBS_EMAIL") },
  });
  return (data.SearchResult?.SearchResultItems ?? []).map(({ MatchedObjectId, MatchedObjectDescriptor: j }) => {
    const pay = j.PositionRemuneration?.[0];
    const annual = pay?.RateIntervalCode === "PA";
    const location = j.PositionLocationDisplay ?? "United States";
    return {
      board: "usajobs",
      externalId: MatchedObjectId,
      title: j.PositionTitle,
      companyName: j.OrganizationName ?? "US Federal Government",
      location,
      country: "United States",
      city: j.PositionLocation?.[0]?.CityName,
      remote: isRemoteText(location) || !!j.UserArea?.Details?.TeleworkEligible && /remote/i.test(location),
      url: j.PositionURI,
      description: [j.UserArea?.Details?.JobSummary, j.QualificationSummary].filter(Boolean).join("\n\n"),
      employmentType: j.PositionSchedule?.[0]?.Name,
      tags: [],
      salaryMin: annual ? positive(Number(pay?.MinimumRange)) : undefined,
      salaryMax: annual ? positive(Number(pay?.MaximumRange)) : undefined,
      salaryCurrency: annual ? "USD" : undefined,
      postedAt: toDate(j.PublicationStartDate),
    };
  });
}

async function fetchCareerjet({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  type Resp = { type?: string; jobs?: Array<{ title: string; company?: string; locations?: string; salary?: string; date?: string; description?: string; url: string }> };
  return fetchPages("careerjet", pagesFor(limit, 50, 3), 2, async page => {
    const params = new URLSearchParams({
      affid: env("CAREERJET_AFFID"), locale_code: env("CAREERJET_LOCALE") || "en_IN", keywords: (keywords ?? "").replace(/,/g, " "),
      pagesize: "50", page: String(page), user_ip: "127.0.0.1", user_agent: "Huntly/1.0", url: "http://localhost/",
    });
    const data = await getJson<Resp>(`http://public.api.careerjet.net/search?${params}`);
    return (data.jobs ?? []).map(j => {
      const pay = j.salary ? salaryFromText(j.salary) : undefined;
      return {
        board: "careerjet",
        externalId: j.url,
        title: htmlToText(j.title),
        companyName: j.company || "Unknown",
        location: j.locations || "Unspecified",
        remote: isRemoteText(j.title, j.locations),
        url: j.url,
        description: htmlToText(j.description),
        tags: [],
        salaryMin: pay?.min,
        salaryMax: pay?.max,
        salaryCurrency: pay?.currency,
        postedAt: toDate(j.date),
      };
    });
  });
}

async function fetchFindwork({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  type Resp = { next?: string | null; results?: Array<{
    id: number; role: string; company_name?: string; location?: string | null; remote?: boolean; url: string; text?: string;
    date_posted?: string; employment_type?: string | null; keywords?: string[];
  }> };
  const out: BoardJob[] = [];
  let url: string | null = `https://findwork.dev/api/jobs/?${new URLSearchParams(keywords ? { search: keywords.replace(/,/g, " ") } : {})}`;
  while (url && out.length < limit) {
    const data: Resp | null = await nextPage(getJson<Resp>(url, { headers: { Authorization: `Token ${env("FINDWORK_API_KEY")}` } }), out.length, "findwork");
    if (!data) break;
    for (const j of data.results ?? []) {
      out.push({
        board: "findwork",
        externalId: String(j.id),
        title: j.role,
        companyName: j.company_name ?? "Unknown",
        location: j.location || (j.remote ? "Remote" : "Unspecified"),
        remote: !!j.remote,
        url: j.url,
        description: htmlToText(j.text),
        employmentType: j.employment_type ?? undefined,
        tags: j.keywords ?? [],
        postedAt: toDate(j.date_posted),
      });
    }
    url = data.next ?? null;
  }
  return out;
}

// ─── Registry ───────────────────────────────────────────────────

export const EXTRA_SOURCES: Record<string, BoardSource> = {
  jobspresso: { label: "Jobspresso", fetch: fetchJobspresso },
  authenticjobs: { label: "Authentic Jobs", fetch: fetchAuthenticJobs },
  nodesk: { label: "NoDesk", fetch: fetchNoDesk },
  justremote: { label: "JustRemote", fetch: fetchJustRemote },
  remote100k: { label: "Remote100K", fetch: fetchRemote100k },
  remoteleaf: { label: "RemoteLeaf", fetch: fetchRemoteLeaf },
  landingjobs: { label: "Landing.jobs", fetch: fetchLandingJobs },
  hackernews: { label: "Hacker News jobs", fetch: fetchHackerNewsJobs },
  ycombinator: { label: "Y Combinator jobs", fetch: fetchYCombinator },
  simplifyinternships: { label: "Simplify internships (GitHub)", fetch: simplifyBoard("simplifyinternships", "Summer2026-Internships", "internship") },
  simplifynewgrad: { label: "Simplify new grad (GitHub)", fetch: simplifyBoard("simplifynewgrad", "New-Grad-Positions", "newgrad") },
  internshala: { label: "Internshala", fetch: fetchInternshala },
  cutshort: { label: "Cutshort", fetch: fetchCutshort },
  workday: { label: "Workday companies", fetch: atsSweep("workday", WORKDAY_TENANTS.map(t => t[0]), sweepWorkday) },
  teamtailor: { label: "Teamtailor companies", fetch: atsSweep("teamtailor", TEAMTAILOR_SLUGS, sweepTeamtailor) },
  bamboohr: { label: "BambooHR companies", fetch: atsSweep("bamboohr", BAMBOOHR_SLUGS, sweepBambooHR) },
  personio: { label: "Personio companies", fetch: atsSweep("personio", PERSONIO_SLUGS, sweepPersonio) },
  breezy: { label: "Breezy HR companies", fetch: atsSweep("breezy", BREEZY_SLUGS, sweepBreezy) },
  rippling: { label: "Rippling companies", fetch: atsSweep("rippling", RIPPLING_SLUGS, sweepRippling) },
  gemjobs: { label: "Gem companies", fetch: atsSweep("gemjobs", GEM_SLUGS, sweepGem) },
  adzuna: { label: "Adzuna", fetch: fetchAdzuna, needsKey: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"] },
  jooble: { label: "Jooble", fetch: fetchJooble, needsKey: ["JOOBLE_API_KEY"] },
  reed: { label: "Reed.co.uk", fetch: fetchReed, needsKey: ["REED_API_KEY"] },
  usajobs: { label: "USAJOBS", fetch: fetchUSAJobs, needsKey: ["USAJOBS_API_KEY", "USAJOBS_EMAIL"] },
  careerjet: { label: "Careerjet", fetch: fetchCareerjet, needsKey: ["CAREERJET_AFFID"] },
  findwork: { label: "Findwork", fetch: fetchFindwork, needsKey: ["FINDWORK_API_KEY"] },
};
