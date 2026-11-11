import type { Metadata } from "next";
import { AgentWorkspace } from "../_components/agent-workspace";

export const metadata: Metadata = { title: "Extern bureau" };

export default function ExternalCommunicationsPage() {
  return <AgentWorkspace kind="external" />;
}
