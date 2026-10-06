/**
 * Discovery Query Generator
 * Generates targeted search queries from user preferences
 */

export interface QueryGeneratorConfig {
  roles: string[];
  locations: string[];
  experience: string[];
  skills?: string[];
  companyType?: string;
}

export interface GeneratedQuery {
  query: string;
  role: string;
  location: string;
  intent: string;
}

export class QueryGenerator {
  generate(config: QueryGeneratorConfig): GeneratedQuery[] {
    const queries: GeneratedQuery[] = [];
    const seen = new Set<string>();

    for (const role of config.roles) {
      for (const location of config.locations) {
        // Pattern 1: Direct career page search
        const q1 = `"${role}" ${location} careers`;
        if (!seen.has(q1)) {
          queries.push({ query: q1, role, location, intent: "career_page" });
          seen.add(q1);
        }

        // Pattern 2: Job posting search
        const q2 = `"${role}" ${location} jobs 2024 OR 2025`;
        if (!seen.has(q2)) {
          queries.push({ query: q2, role, location, intent: "job_board" });
          seen.add(q2);
        }

        // Pattern 3: Intern-specific with inurl
        if (role.toLowerCase().includes("intern")) {
          const q3 = `"${role}" ${location} inurl:careers OR inurl:jobs`;
          if (!seen.has(q3)) {
            queries.push({ query: q3, role, location, intent: "ats_inurl" });
            seen.add(q3);
          }
        }
      }

      // Pattern 4: India-wide without specific city
      const q4 = `"${role}" India site:greenhouse.io OR site:lever.co OR site:ashbyhq.com`;
      if (!seen.has(q4)) {
        queries.push({ query: q4, role, location: "India", intent: "ats_direct" });
        seen.add(q4);
      }

      // Pattern 5: Startup-focused
      const q5 = `"${role}" India startup careers`;
      if (!seen.has(q5)) {
        queries.push({ query: q5, role, location: "India", intent: "startup" });
        seen.add(q5);
      }
    }

    // Remove duplicate location variants (Bengaluru/Bangalore)
    // Keep a max of ~50 queries to avoid API abuse
    return queries.slice(0, 50);
  }

  generateATSQueries(config: QueryGeneratorConfig): GeneratedQuery[] {
    const atsSites = [
      "site:greenhouse.io",
      "site:lever.co",
      "site:ashbyhq.com",
      "site:jobs.workday.com",
      "site:smartrecruiters.com",
      "site:workable.com",
    ];

    const queries: GeneratedQuery[] = [];

    for (const role of config.roles.slice(0, 5)) {
      for (const atsSite of atsSites) {
        const q = `"${role}" India ${atsSite}`;
        queries.push({ query: q, role, location: "India", intent: "ats_search" });
      }
    }

    return queries;
  }
}
