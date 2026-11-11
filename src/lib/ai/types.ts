import type {
  AgentKind,
  Classification,
  Confidentiality,
  ContentType,
  ExternalPermission,
  InterviewKind,
  InterviewQuestion,
  InterviewSummary,
  SignalAudience,
  SignalCategory,
  SignalEntities,
  SourceKind,
  TermRule,
} from "@/lib/types";

/** Brand & tone of voice settings handed to every generation call. */
export type BrandContext = {
  organizationName: string;
  personality: string;
  writingStyle: string;
  sentenceStructure: string;
  terminology: TermRule[];
  wordsToAvoid: string[];
  toneInternal: string;
  toneExternal: string;
  toneSocial: string;
  policies: string;
  boilerplate: string;
  writingExamples: string[];
};

/** A piece of authorized source material (a message, ticket, deal, e-mail). */
export type SourceMaterial = {
  id: string;
  source: SourceKind;
  channel?: string | null;
  author?: string | null;
  title?: string | null;
  body: string;
  occurredAt: string;
  url?: string | null;
  metadata?: Record<string, unknown>;
};

export type SignalAnalysis = {
  newsworthy: boolean;
  title: string;
  summary: string;
  category: SignalCategory;
  audience: SignalAudience;
  suggestedAgent: AgentKind;
  relevanceScore: number;
  scoreRationale: string;
  missingInformation: string[];
  suggestedAction: string;
  entities: SignalEntities;
  confidentiality: Confidentiality;
};

export type SignalBrief = {
  title: string;
  summary: string;
  category: SignalCategory;
  audience: SignalAudience;
  relevanceScore: number;
  entities: SignalEntities;
  confidentiality: Confidentiality;
  missingInformation: string[];
};

export type PersonBrief = { id: string; name: string; jobTitle: string | null; department: string | null };

export type StoryEvaluation = {
  title: string;
  angle: string;
  contentType: ContentType;
  classification: Classification;
  priority: number;
  stakeholders: { name: string; role: string; reason: string }[];
  externalPermission: ExternalPermission;
  /** Internal agent only: is this also a story for the outside world? */
  alsoInterestingExternally: boolean;
  externalPitch: string;
};

export type InterviewBrief = {
  title: string;
  purpose: string;
  kind: InterviewKind;
  intervieweeName: string;
  intervieweeRole: string | null;
  context: string;
  customer?: string | null;
  project?: string | null;
};

export type TranscriptEntry = { role: "agent" | "interviewee"; content: string; questionId?: string | null };

export type InterviewTurn = { message: string; done: boolean; questionId: string | null };

export type InterviewMaterial = {
  intervieweeName: string;
  intervieweeRole: string | null;
  qa: { question: string; topic?: string; answer: string }[];
  summary?: InterviewSummary | null;
};

export type ContentRequest = {
  contentType: ContentType;
  classification: Classification;
  channel: string | null;
  audience: string | null;
  brief: {
    title: string;
    angle: string;
    customer?: string | null;
    project?: string | null;
  };
  sources: SourceMaterial[];
  interview?: InterviewMaterial | null;
  /** Further interviews for the same piece (a customer case: the DM plus one or two team members). */
  moreInterviews?: InterviewMaterial[];
  brand: BrandContext;
  instructions?: string | null;
};

export type GeneratedContent = {
  title: string;
  subtitle: string;
  bodyHtml: string;
  excerpt: string;
  tags: string[];
  /** Facts the writer could not find in the material; shown to the editor. */
  openQuestions: string[];
};

export type NewsletterFraming = { subject: string; introHtml: string; outroHtml: string };

/** What to do with a tip that came in by direct message, form or mail. */
export type TipTriage = {
  outcome: "new_proposal" | "addition" | "rubric" | "nothing";
  /** For "addition": the open topic it belongs to. */
  topicId: string | null;
  /** For "rubric": the fixed section it fits in. */
  rubric: string | null;
  reason: string;
  /** Short answer to the sender, in Dutch. */
  reply: string;
};

export type Revision = {
  title: string;
  bodyHtml: string;
  /** False when the request could not be carried out; the text is then unchanged. */
  applied: boolean;
  /** What was changed, or why nothing was. */
  note: string;
};

export type MdUpdateDraft = {
  themes: { theme: string; passages: { speakerId: string; text: string }[] }[];
};

export type SocialVariant = "short" | "quote" | "story";

export interface AIProvider {
  /** "claude" when the Claude API is configured, otherwise "demo". */
  readonly id: "claude" | "demo";
  readonly model: string;
  /** The model that judges incoming messages and tips (cheap and fast). */
  readonly triageModel: string;

  analyzeMessage(input: {
    message: SourceMaterial;
    organizationName: string;
    knownPeople: string[];
  }): Promise<SignalAnalysis>;

  evaluateStory(input: {
    agentKind: AgentKind;
    organizationName: string;
    signal: SignalBrief;
    sources: SourceMaterial[];
    people: PersonBrief[];
  }): Promise<StoryEvaluation>;

  generateInterviewQuestions(input: {
    interview: InterviewBrief;
    brand: BrandContext;
    count: number;
  }): Promise<InterviewQuestion[]>;

  nextInterviewTurn(input: {
    interview: InterviewBrief;
    questions: InterviewQuestion[];
    transcript: TranscriptEntry[];
  }): Promise<InterviewTurn>;

  summarizeInterview(input: {
    interview: InterviewBrief;
    questions: InterviewQuestion[];
    transcript: TranscriptEntry[];
  }): Promise<InterviewSummary>;

  generateContent(input: ContentRequest): Promise<GeneratedContent>;

  generateSocialPost(input: {
    platform: string;
    article: { title: string; excerpt: string; bodyText: string; tags: string[] };
    brand: BrandContext;
    variant?: SocialVariant;
    /** Write in the first person, in this colleague's name. They approve and post it themselves. */
    inNameOf?: string | null;
  }): Promise<{ body: string }>;

  triageTip(input: {
    text: string;
    subject?: string | null;
    senderName: string;
    organizationName: string;
    openTopics: { id: string; title: string; summary: string }[];
    rubrics: string[];
  }): Promise<TipTriage>;

  /** Carries out a change someone asked for in plain language. Never adds facts. */
  reviseContent(input: {
    title: string;
    bodyHtml: string;
    instruction: string;
    requestedBy: string;
    classification: Classification;
    brand: BrandContext;
  }): Promise<Revision>;

  /** Orders the answers of the MDs by theme. Each passage is based on one person's own answers. */
  composeMdUpdate(input: {
    periodLabel: string;
    contributions: { speakerId: string; speakerName: string; qa: { question: string; topic?: string; answer: string }[] }[];
    brand: BrandContext;
  }): Promise<MdUpdateDraft>;

  generateNewsletterFraming(input: {
    kind: AgentKind;
    monthLabel: string;
    items: { title: string; summary: string; section: string }[];
    brand: BrandContext;
  }): Promise<NewsletterFraming>;

  answerInfoRequest(input: {
    question: string;
    sources: SourceMaterial[];
    organizationName: string;
  }): Promise<{ answer: string; found: boolean }>;
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AIError";
  }
}
