export type HumanReportSectionId =
  | "status"
  | "executive_summary"
  | "completed_outcomes"
  | "in_progress"
  | "risks_and_blockers"
  | "next_priorities"
  | "evidence";

export type HumanReportEvidenceDestination =
  | "primary"
  | "secondary"
  | "appendix";

export interface HumanReportSectionDefinition {
  id: HumanReportSectionId;
  label: string;
  purpose: string;
  emptyState: string;
}

export interface HumanReportCleaningRule {
  id: string;
  description: string;
  destination: HumanReportEvidenceDestination;
}

export interface HumanReportQualityGate {
  primaryAudience: "project_manager";
  frontendOutputFormats: ["html"];
  backendArtifactFormat: "json";
  markdownOutputAllowed: false;
  requiresStatusReason: true;
  requiresEvidenceAppendix: true;
}

export interface HumanReportSkill {
  name: "human-report";
  version: 1;
  sections: HumanReportSectionDefinition[];
  cleaningRules: HumanReportCleaningRule[];
  qualityGate: HumanReportQualityGate;
}

export const HUMAN_REPORT_SKILL: HumanReportSkill = {
  name: "human-report",
  version: 1,
  sections: [
    {
      id: "status",
      label: "Status",
      purpose: "State whether the project is on track, at risk, blocked, or inactive.",
      emptyState: "No status can be inferred without period activity.",
    },
    {
      id: "executive_summary",
      label: "Executive Summary",
      purpose: "Summarize the period in a concise human-readable paragraph.",
      emptyState: "No recorded work for this period.",
    },
    {
      id: "completed_outcomes",
      label: "Completed Outcomes",
      purpose: "Promote finished work and meaningful outcomes over raw task churn.",
      emptyState: "No completed outcomes recorded.",
    },
    {
      id: "in_progress",
      label: "In Progress",
      purpose: "Show work touched during the period that still needs follow-through.",
      emptyState: "No in-progress work recorded.",
    },
    {
      id: "risks_and_blockers",
      label: "Risks And Blockers",
      purpose: "Highlight failed, blocked, or risky work that needs attention.",
      emptyState: "No risks or blockers recorded.",
    },
    {
      id: "next_priorities",
      label: "Next Priorities",
      purpose: "Turn open work and risks into the next visible actions.",
      emptyState: "No next priorities inferred.",
    },
    {
      id: "evidence",
      label: "Evidence",
      purpose: "Keep metrics, task records, sessions, and prompts available as supporting context.",
      emptyState: "No supporting evidence recorded.",
    },
  ],
  cleaningRules: [
    {
      id: "completed_tasks_as_outcomes",
      description: "Promote completed period tasks into outcome evidence.",
      destination: "primary",
    },
    {
      id: "touched_open_tasks_as_progress",
      description: "Keep touched review, running, todo, and queued tasks as progress evidence.",
      destination: "primary",
    },
    {
      id: "blocked_or_failed_work_as_risk",
      description: "Promote blocked tasks, failed tasks, and failed sessions into risk evidence.",
      destination: "primary",
    },
    {
      id: "machine_runtime_detail",
      description: "Keep process ids, runtime minutes, exit codes, and command detail out of the main narrative.",
      destination: "appendix",
    },
    {
      id: "raw_session_prompts",
      description: "Keep raw session prompts as supporting evidence unless they explain a risk or decision.",
      destination: "appendix",
    },
    {
      id: "aggregate_metrics",
      description: "Use metrics as compact supporting context after the human report sections.",
      destination: "secondary",
    },
  ],
  qualityGate: {
    primaryAudience: "project_manager",
    frontendOutputFormats: ["html"],
    backendArtifactFormat: "json",
    markdownOutputAllowed: false,
    requiresStatusReason: true,
    requiresEvidenceAppendix: true,
  },
};
