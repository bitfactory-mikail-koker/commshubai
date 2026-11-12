import {
  Bot,
  FolderKanban,
  Inbox,
  KanbanSquare,
  Mail,
  MessageSquare,
  MessagesSquare,
  Mic,
  Newspaper,
  Share2,
  User,
  type LucideIcon,
} from "lucide-react";
import { SearchKind } from "@/lib/search/kinds";

export const SEARCH_KIND_ICONS: Record<SearchKind, LucideIcon> = {
  [SearchKind.Signal]: Inbox,
  [SearchKind.Topic]: KanbanSquare,
  [SearchKind.Article]: Newspaper,
  [SearchKind.Interview]: Mic,
  [SearchKind.Transcript]: MessagesSquare,
  [SearchKind.Newsletter]: Mail,
  [SearchKind.SocialPost]: Share2,
  [SearchKind.Project]: FolderKanban,
  [SearchKind.Person]: User,
  [SearchKind.Source]: Bot,
  [SearchKind.Comment]: MessageSquare,
};
