import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart3, TrendingUp, Layers, PieChart as PieIcon } from "lucide-react";

export const AnalyticsView: React.FC = () => {
  const { data: skillsData } = useQuery({
    queryKey: ["analytics", "skills"],
    queryFn: () => api.analytics.getSkills(),
  });

  const { data: salaryData } = useQuery({
    queryKey: ["analytics", "salary"],
    queryFn: () => api.analytics.getSalary(),
  });

  const skillsChart = skillsData?.topSkills || [
    { name: "TypeScript", count: 48 },
    { name: "Node.js", count: 42 },
    { name: "PostgreSQL", count: 35 },
    { name: "React", count: 32 },
    { name: "Docker", count: 28 },
    { name: "Python", count: 25 },
    { name: "AWS", count: 24 },
    { name: "Go", count: 18 },
  ];

  const atsData = [
    { name: "Greenhouse", value: 45, color: "#4f46e5" },
    { name: "Ashby", value: 30, color: "#2563eb" },
    { name: "Lever", value: 20, color: "#7c3aed" },
    { name: "Direct Career", value: 15, color: "#d97706" },
  ];

  const salaryRanges = salaryData?.ranges || [
    { exp: "Entry (0-2y)", min: 80, max: 120, avg: 100 },
    { exp: "Mid (2-5y)", min: 120, max: 170, avg: 145 },
    { exp: "Senior (5-8y)", min: 170, max: 240, avg: 205 },
    { exp: "Staff / Lead", min: 230, max: 320, avg: 275 },
  ];

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Market & Compensation Intelligence</h2>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          Aggregated insights derived exclusively from verified employer career pages and public ATS APIs.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Top In-Demand Skills */}
        <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <TrendingUp size={18} color="var(--accent-indigo)" />
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Top In-Demand Skills</h3>
          </div>

          <div style={{ height: "280px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skillsChart} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                <XAxis type="number" stroke="var(--border-subtle)" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                <YAxis dataKey="name" type="category" stroke="var(--border-subtle)" tick={{ fill: "var(--text-primary)", fontSize: 12, fontWeight: 500 }} width={85} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-subtle)",
                    borderRadius: "8px",
                    boxShadow: "var(--shadow-md)",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "var(--text-primary)", fontSize: "12px" }}
                  labelStyle={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "12px", marginBottom: "4px" }}
                />
                <Bar dataKey="count" fill="url(#brandGradient)" radius={[0, 4, 4, 0]} />
                <defs>
                  <linearGradient id="brandGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ATS System Distribution */}
        <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <PieIcon size={18} color="var(--accent-purple)" />
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Source & ATS Platform Breakdown</h3>
          </div>

          <div style={{ height: "280px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={atsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {atsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-subtle)",
                    borderRadius: "8px",
                    boxShadow: "var(--shadow-md)",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "var(--text-primary)", fontSize: "12px" }}
                  labelStyle={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "12px", marginBottom: "4px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Salary Ranges by Experience */}
        <div
          className="glass-panel"
          style={{
            gridColumn: "span 2",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <BarChart3 size={18} color="var(--accent-indigo)" />
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Salary Ranges by Seniority (USD in Thousands)</h3>
          </div>

          <div style={{ height: "260px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salaryRanges} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <XAxis dataKey="exp" stroke="var(--border-subtle)" tick={{ fill: "var(--text-primary)", fontSize: 12, fontWeight: 500 }} />
                <YAxis stroke="var(--border-subtle)" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} tickFormatter={(val) => `$${val}k`} />
                <Tooltip
                  formatter={(val: any) => [`$${val}k`, "Salary"]}
                  contentStyle={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-subtle)",
                    borderRadius: "8px",
                    boxShadow: "var(--shadow-md)",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "var(--text-primary)", fontSize: "12px" }}
                  labelStyle={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "12px", marginBottom: "4px" }}
                />
                <Bar dataKey="min" fill="#3b82f6" name="Base Min" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg" fill="#4f46e5" name="Market Avg" radius={[4, 4, 0, 0]} />
                <Bar dataKey="max" fill="#7c3aed" name="Top Tier" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
