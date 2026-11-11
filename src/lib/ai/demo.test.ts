import { describe, expect, it } from "vitest";
import { validateBrand } from "@/lib/agents/brand-validation";
import { DemoProvider } from "@/lib/ai/demo";
import type { BrandContext, SourceMaterial } from "@/lib/ai/types";
import { SCENARIO_ANSWERS, SCENARIO_MESSAGE } from "@/lib/demo/feed";

const provider = new DemoProvider();
const brand: BrandContext = {
  organizationName: "Noordlicht Digital",
  personality: "",
  writingStyle: "",
  sentenceStructure: "",
  terminology: [],
  wordsToAvoid: ["innovatief"],
  toneInternal: "",
  toneExternal: "",
  toneSocial: "",
  policies: "",
  boilerplate: "Noordlicht Digital is een digitaal bureau uit Utrecht.",
  writingExamples: [],
};
const message: SourceMaterial = {
  id: "m1",
  source: "slack",
  channel: SCENARIO_MESSAGE.channel,
  author: SCENARIO_MESSAGE.authorName,
  body: SCENARIO_MESSAGE.body,
  occurredAt: new Date().toISOString(),
  metadata: SCENARIO_MESSAGE.metadata,
};

describe("DemoProvider", () => {
  it("detects the scenario message as a customer case for the external agent", async () => {
    const analysis = await provider.analyzeMessage({ message, organizationName: "Noordlicht Digital", knownPeople: ["Tim Hoekstra"] });
    expect(analysis.newsworthy).toBe(true);
    expect(analysis.category).toBe("customer_case");
    expect(analysis.suggestedAgent).toBe("external");
    expect(analysis.entities.customer).toBe("Veldhuis Zorggroep");
    expect(analysis.relevanceScore).toBeGreaterThanOrEqual(75);
    expect(analysis.missingInformation).toContain("Toestemming van de klant voor externe publicatie");
    expect(analysis.confidentiality).toBe("needs_permission");
  });

  it("does not treat small talk as a signal", async () => {
    const analysis = await provider.analyzeMessage({
      message: { ...message, body: "Iemand zin om vrijdag mee te lunchen bij de nieuwe Italiaan?", metadata: {} },
      organizationName: "Noordlicht Digital",
      knownPeople: [],
    });
    expect(analysis.newsworthy).toBe(false);
  });

  it("marks confidential messages as confidential", async () => {
    const analysis = await provider.analyzeMessage({
      message: { ...message, body: "Vertrouwelijk, nog niet delen: de directie voert gesprekken over een overname van een bureau in Zwolle.", metadata: {} },
      organizationName: "Noordlicht Digital",
      knownPeople: [],
    });
    expect(analysis.confidentiality).toBe("confidential");
  });

  it("never marks external permission as granted without explicit consent", async () => {
    const analysis = await provider.analyzeMessage({ message, organizationName: "Noordlicht Digital", knownPeople: [] });
    const evaluation = await provider.evaluateStory({
      agentKind: "external",
      organizationName: "Noordlicht Digital",
      signal: { ...analysis },
      sources: [message],
      people: [{ id: "p1", name: "Tim Hoekstra", jobTitle: "Projectleider", department: null }],
    });
    expect(evaluation.contentType).toBe("customer_case");
    expect(evaluation.externalPermission).toBe("unknown");
    expect(evaluation.stakeholders[0]?.name).toBe("Tim Hoekstra");
  });

  it("walks through an interview and stops when all questions are answered", async () => {
    const interview = {
      title: "Klantcase",
      purpose: "klantcase",
      kind: "customer_case" as const,
      intervieweeName: "Tim Hoekstra",
      intervieweeRole: "Projectleider",
      context: "",
      customer: "Veldhuis Zorggroep",
      project: "Cliëntenportaal",
    };
    const questions = await provider.generateInterviewQuestions({ interview, brand, count: 7 });
    expect(questions).toHaveLength(7);

    const transcript: { role: "agent" | "interviewee"; content: string; questionId?: string | null }[] = [];
    let done = false;
    for (let i = 0; i < 20 && !done; i++) {
      const turn = await provider.nextInterviewTurn({ interview, questions, transcript });
      transcript.push({ role: "agent", content: turn.message, questionId: turn.questionId });
      done = turn.done;
      if (!done) transcript.push({ role: "interviewee", content: SCENARIO_ANSWERS[Math.min(i, SCENARIO_ANSWERS.length - 1)] });
    }
    expect(done).toBe(true);
    expect(transcript.filter((t) => t.role === "interviewee")).toHaveLength(7);
  });

  it("writes a draft that only contains traceable numbers and quotes", async () => {
    const interview = {
      title: "Klantcase",
      purpose: "klantcase",
      kind: "customer_case" as const,
      intervieweeName: "Tim Hoekstra",
      intervieweeRole: "Projectleider",
      context: "",
      customer: "Veldhuis Zorggroep",
      project: "Cliëntenportaal",
    };
    const questions = await provider.generateInterviewQuestions({ interview, brand, count: 7 });
    const qa = questions.map((q, i) => ({ question: q.text, topic: q.topic, answer: SCENARIO_ANSWERS[i] }));
    const content = await provider.generateContent({
      contentType: "customer_case",
      classification: "external",
      channel: "website",
      audience: "Klanten",
      brief: { title: "Klantcase: Veldhuis Zorggroep", angle: "Het cliëntenportaal is live gegaan.", customer: "Veldhuis Zorggroep", project: "Cliëntenportaal" },
      sources: [message],
      interview: { intervieweeName: "Tim Hoekstra", intervieweeRole: "Projectleider", qa },
      brand,
    });
    expect(content.bodyHtml).toContain("<h2>");
    expect(content.bodyHtml).toContain("Tim Hoekstra");

    const check = validateBrand({
      html: content.bodyHtml,
      title: content.title,
      wordsToAvoid: brand.wordsToAvoid,
      terminology: [],
      classification: "external",
      sourceTexts: [message.body, ...qa.map((x) => x.answer), brand.boilerplate],
    });
    expect(check.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("leaves explicit placeholders when there is no interview", async () => {
    const content = await provider.generateContent({
      contentType: "internal_update",
      classification: "internal",
      channel: "intranet",
      audience: null,
      brief: { title: "Update", angle: "Er is iets gebeurd." },
      sources: [],
      interview: null,
      brand,
    });
    expect(content.bodyHtml).toContain("[AANVULLEN");
    expect(content.openQuestions.length).toBeGreaterThan(0);
  });
});
