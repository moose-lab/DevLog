import { test } from "node:test";
import assert from "node:assert/strict";
import { HUMAN_REPORT_SKILL } from "../report-skill";

test("HUMAN_REPORT_SKILL defines the required human report sections", () => {
  assert.equal(HUMAN_REPORT_SKILL.name, "human-report");
  assert.equal(HUMAN_REPORT_SKILL.version, 1);

  const sectionIds = HUMAN_REPORT_SKILL.sections.map((section) => section.id);

  assert.deepEqual(sectionIds, [
    "status",
    "executive_summary",
    "completed_outcomes",
    "in_progress",
    "risks_and_blockers",
    "next_priorities",
    "evidence",
  ]);
});

test("HUMAN_REPORT_SKILL keeps machine detail and raw formats out of the primary frontend output", () => {
  const appendixOnlyRules = HUMAN_REPORT_SKILL.cleaningRules
    .filter((rule) => rule.destination === "appendix")
    .map((rule) => rule.id);

  assert.ok(appendixOnlyRules.includes("machine_runtime_detail"));
  assert.ok(appendixOnlyRules.includes("raw_session_prompts"));
  assert.deepEqual(HUMAN_REPORT_SKILL.qualityGate.frontendOutputFormats, ["html"]);
  assert.equal(HUMAN_REPORT_SKILL.qualityGate.backendArtifactFormat, "json");
  assert.equal(HUMAN_REPORT_SKILL.qualityGate.markdownOutputAllowed, false);
});
