import type { IssueSummary } from "@prisma/client";
import { Urgency, RecommendedRoute } from "@prisma/client";
import type Anthropic from "@anthropic-ai/sdk";

import { anthropic } from "./buddy.js";
import { db } from "./db.js";
import { env } from "./env.js";

// =============================================================================
// Triage tool definition
// =============================================================================
//
// Anthropic's tool-use feature is the cleanest way to force structured JSON
// output. We define a tool with the exact schema we want and force Claude
// to call it; the model returns a tool_use content block whose `input` is
// a typed object matching our schema.

const SUMMARY_TOOL = {
  name: "submit_issue_summary",
  description:
    "Record the structured triage summary for this support session. The summary is consumed by routing logic and (later) by human technicians.",
  input_schema: {
    type: "object" as const,
    properties: {
      problem: {
        type: "string",
        description:
          "One concise sentence describing what's wrong, written from the senior's perspective. Plain English, no jargon.",
      },
      goal: {
        type: "string",
        description:
          "What the senior is trying to accomplish or wants to happen. One short sentence.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "3–6 short lowercase tags. Use kebab-case. Examples: wifi, password, email, scam-detected, virus-popup, hacked-account, printer, slow-computer.",
      },
      complexity: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "0–100. 0–40: simple AI-guided fix the senior can do themselves (Wi-Fi reconnect, app sign-in, settings change). 40–70: moderate, AI tries but may need to escalate. 70–100: human territory (security incidents, hacked accounts, data recovery, hardware failures, anything where a wrong step could make things worse).",
      },
      urgency: {
        type: "string",
        enum: ["low", "medium", "high"],
        description:
          'low: nothing time-sensitive. medium: should be resolved today. high: scam in progress, hacked account, locked out of essential service, or anything causing the senior visible distress.',
      },
      recommendRoute: {
        type: "string",
        enum: ["ai", "ai_with_human_fallback", "human"],
        description:
          'ai: Buddy can guide the senior through the fix. ai_with_human_fallback: Buddy starts but bring a human in if it stalls. human: hand straight to a human technician.',
      },
    },
    required: [
      "problem",
      "goal",
      "tags",
      "complexity",
      "urgency",
      "recommendRoute",
    ],
  },
} satisfies Anthropic.Messages.Tool;

const SUMMARIZE_SYSTEM_PROMPT = `You are a tech support triage agent for TechBuddy. Your job is to read a conversation between a senior and Buddy (an AI assistant) and produce a structured summary by calling the submit_issue_summary tool.

Rules:
- The user role in the messages is the senior. The assistant role is Buddy.
- Be concise. The summary will be read by other AI agents and (later) by human technicians.
- Lean conservative on complexity scoring. When in doubt, score higher and recommend more human involvement, not less.
- ALWAYS treat scam detection as urgency: high. Add a "scam-detected" tag. recommendRoute should be at least ai_with_human_fallback.
- Account-recovery, hacked accounts, data loss, suspicious bank/email activity → complexity ≥ 70, recommendRoute: human.
- Routine issues (Wi-Fi reconnect, app sign-in, font size change, settings tweaks) → complexity ≤ 40, recommendRoute: ai.
- Use the submit_issue_summary tool. Do not respond with prose — only call the tool.`;

// =============================================================================
// Types
// =============================================================================

export type SummaryWireFields = {
  problem: string;
  goal: string;
  tags: string[];
  complexity: number;
  urgency: "low" | "medium" | "high";
  recommendRoute: "ai" | "ai_with_human_fallback" | "human";
};

type ChatMessageWire = {
  role: "user" | "assistant";
  content: string;
};

// =============================================================================
// Anthropic call
// =============================================================================

/**
 * Render the conversation as a single labeled transcript. The summarizer
 * sees the whole conversation as one block of input data — never as a
 * conversation it's participating in. That keeps it cleanly stateless and
 * avoids "must end with user message" issues when forcing tool use.
 */
function formatTranscript(messages: ChatMessageWire[]): string {
  return messages
    .map((m) => {
      const speaker = m.role === "user" ? "Senior" : "Buddy";
      return `${speaker}: ${m.content}`;
    })
    .join("\n\n");
}

/**
 * Run the summarization tool call against Claude. Returns the validated tool
 * input or throws if the model didn't comply.
 */
export async function summarizeMessages(args: {
  messages: ChatMessageWire[];
  contextLines?: string[];
}): Promise<SummaryWireFields> {
  const transcript = formatTranscript(args.messages);
  const contextBlock =
    args.contextLines && args.contextLines.length > 0
      ? `Context about this session:\n${args.contextLines.join("\n")}\n\n`
      : "";

  const userPrompt = `${contextBlock}Below is the conversation between a senior and Buddy. Read it and produce the structured summary by calling the submit_issue_summary tool.\n\n--- TRANSCRIPT START ---\n\n${transcript}\n\n--- TRANSCRIPT END ---`;

  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: SUMMARIZE_SYSTEM_PROMPT,
    tools: [SUMMARY_TOOL],
    tool_choice: { type: "tool", name: SUMMARY_TOOL.name },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Claude did not return a tool_use block for summarization");
  }
  // The Anthropic SDK types tool input as `unknown` — we trust the tool schema
  // here, but cast through `unknown` to keep TypeScript happy.
  return toolUse.input as unknown as SummaryWireFields;
}

// =============================================================================
// DB helpers
// =============================================================================

function urgencyToEnum(u: SummaryWireFields["urgency"]): Urgency {
  return u.toUpperCase() as Urgency;
}

function routeToEnum(
  r: SummaryWireFields["recommendRoute"]
): RecommendedRoute {
  return r.toUpperCase() as RecommendedRoute;
}

/**
 * Pull the conversation for a session, run the summarizer, and upsert the
 * IssueSummary row. Returns the saved record (or null if there's not enough
 * conversation to summarize yet).
 *
 * Used by both the manual POST /v1/sessions/:id/summarize endpoint and the
 * fire-and-forget trigger inside the chat handler.
 */
export async function summarizeAndSave(
  sessionId: string
): Promise<IssueSummary | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      messages: {
        where: { role: { in: ["USER", "ASSISTANT"] } },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      },
    },
  });
  if (!session) return null;
  if (session.messages.length < 2) return null;

  const wireMessages: ChatMessageWire[] = session.messages.map((m) => ({
    role: m.role.toLowerCase() as "user" | "assistant",
    content: m.content,
  }));

  const contextLines: string[] = [];
  if (session.device) {
    contextLines.push(
      `The senior picked their ${session.device.toLowerCase()} as the device they're asking about.`
    );
  }

  const fields = await summarizeMessages({
    messages: wireMessages,
    contextLines,
  });

  const messageCount = session.messages.length;

  return db.issueSummary.upsert({
    where: { sessionId },
    update: {
      problem: fields.problem,
      goal: fields.goal,
      tags: fields.tags,
      complexity: fields.complexity,
      urgency: urgencyToEnum(fields.urgency),
      recommendRoute: routeToEnum(fields.recommendRoute),
      // Image attachment tracking lands when we persist photos. Keep it
      // honest at false for now.
      imageAttached: false,
      messageCount,
    },
    create: {
      sessionId,
      problem: fields.problem,
      goal: fields.goal,
      tags: fields.tags,
      complexity: fields.complexity,
      urgency: urgencyToEnum(fields.urgency),
      recommendRoute: routeToEnum(fields.recommendRoute),
      imageAttached: false,
      messageCount,
    },
  });
}

// =============================================================================
// Wire serialization
// =============================================================================

export type SummaryWire = SummaryWireFields & {
  id: string;
  sessionId: string;
  imageAttached: boolean;
  messageCount: number;
  generatedAt: string;
  updatedAt: string;
};

export function serializeSummary(s: IssueSummary): SummaryWire {
  return {
    id: s.id,
    sessionId: s.sessionId,
    problem: s.problem,
    goal: s.goal,
    tags: s.tags,
    complexity: s.complexity,
    urgency: s.urgency.toLowerCase() as SummaryWireFields["urgency"],
    recommendRoute:
      s.recommendRoute.toLowerCase() as SummaryWireFields["recommendRoute"],
    imageAttached: s.imageAttached,
    messageCount: s.messageCount,
    generatedAt: s.generatedAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
