import type { Metadata } from "next";
import { AgentWorkspace } from "../_components/agent-workspace";

export const metadata: Metadata = { title: "Intern bureau" };

export default function InternalCommunicationsPage() {
  return <AgentWorkspace kind="internal" />;
}
