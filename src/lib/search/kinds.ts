import {
  CONTENT_STATUS_META,
  INTERVIEW_STATUS_META,
  NEWSLETTER_STATUS_META,
  OPPORTUNITY_STATUS_META,
  SIGNAL_STATUS_META,
  SOCIAL_STATUS_META,
  SOURCE_META,
  type Tone,
} from "@/lib/constants";

export enum SearchKind {
  Signal = "signal",
  Topic = "topic",
  Article = "article",
  Interview = "interview",
  Transcript = "transcript",
  Newsletter = "newsletter",
  SocialPost = "social_post",
  Project = "project",
  Person = "person",
  Source = "source",
  Comment = "comment",
}

export enum CommentTarget {
  Article = "article",
  Newsletter = "newsletter",
  Signal = "signal",
  Interview = "interview",
}

export type SearchHitRef = {
  id: string;
  parentId: string | null;
  status: string | null;
};

export type StatusMeta = Record<string, { label: string; tone: Tone }>;

const SOURCE_STATUS_META: StatusMeta = Object.fromEntries(
  Object.entries(SOURCE_META).map(([source, meta]) => [source, { label: meta.label, tone: "neutral" as Tone }]),
);

type SearchKindDefinition = {
  label: string;
  plural: string;
  statusMeta: StatusMeta | null;
  href: (hit: SearchHitRef) => string | null;
};

function commentHref(hit: SearchHitRef): string | null {
  if (!hit.parentId) return null;
  switch (hit.status) {
    case CommentTarget.Article:
      return `/editorial/${hit.parentId}`;
    case CommentTarget.Newsletter:
      return `/newsletters/${hit.parentId}`;
    case CommentTarget.Signal:
      return `/inbox/${hit.parentId}`;
    case CommentTarget.Interview:
      return `/interviews/${hit.parentId}`;
    default:
      return null;
  }
}

export const SEARCH_KINDS: Record<SearchKind, SearchKindDefinition> = {
  [SearchKind.Signal]: {
    label: "Signaal",
    plural: "Signalen",
    statusMeta: SIGNAL_STATUS_META,
    href: (hit) => `/inbox/${hit.id}`,
  },
  [SearchKind.Topic]: {
    label: "Onderwerp",
    plural: "Onderwerpen",
    statusMeta: OPPORTUNITY_STATUS_META,
    href: (hit) => (hit.parentId ? `/inbox/${hit.parentId}` : "/topics"),
  },
  [SearchKind.Article]: {
    label: "Stuk",
    plural: "Stukken",
    statusMeta: CONTENT_STATUS_META,
    href: (hit) => `/editorial/${hit.id}`,
  },
  [SearchKind.Interview]: {
    label: "Interview",
    plural: "Interviews",
    statusMeta: INTERVIEW_STATUS_META,
    href: (hit) => `/interviews/${hit.id}`,
  },
  [SearchKind.Transcript]: {
    label: "Interviewantwoord",
    plural: "Interviewantwoorden",
    statusMeta: {
      agent: { label: "Vraag", tone: "neutral" },
      interviewee: { label: "Antwoord", tone: "neutral" },
    },
    href: (hit) => (hit.parentId ? `/interviews/${hit.parentId}` : null),
  },
  [SearchKind.Newsletter]: {
    label: "Editie",
    plural: "Edities",
    statusMeta: NEWSLETTER_STATUS_META,
    href: (hit) => `/newsletters/${hit.id}`,
  },
  [SearchKind.SocialPost]: {
    label: "Social post",
    plural: "Social posts",
    statusMeta: SOCIAL_STATUS_META,
    href: (hit) => `/preview/social_post/${hit.id}`,
  },
  [SearchKind.Project]: {
    label: "Project",
    plural: "Projecten",
    statusMeta: null,
    href: () => "/projects",
  },
  [SearchKind.Person]: {
    label: "Persoon",
    plural: "Mensen",
    statusMeta: null,
    href: () => "/team",
  },
  [SearchKind.Source]: {
    label: "Bronbericht",
    plural: "Berichten uit bronnen",
    statusMeta: SOURCE_STATUS_META,
    href: (hit) => (hit.parentId ? `/inbox/${hit.parentId}` : null),
  },
  [SearchKind.Comment]: {
    label: "Opmerking",
    plural: "Opmerkingen",
    statusMeta: null,
    href: commentHref,
  },
};

export const SEARCH_KIND_ORDER: SearchKind[] = Object.values(SearchKind);

export function parseSearchKind(value: string | null | undefined): SearchKind | null {
  return SEARCH_KIND_ORDER.find((kind) => kind === value) ?? null;
}
