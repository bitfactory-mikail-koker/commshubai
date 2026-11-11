export const PERMISSION_KEYS = [
  "content.view",
  "content.create",
  "content.edit",
  "content.review",
  "content.approve",
  "content.publish",
  "agents.manage",
  "integrations.manage",
  "brand.manage",
  "users.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, { label: string; description: string }> = {
  "content.view": { label: "Content bekijken", description: "Contentitems en gepubliceerde stukken inzien" },
  "content.create": { label: "Content aanmaken", description: "Contentitems, interviews en nieuwsbrieven aanmaken" },
  "content.edit": { label: "Content bewerken", description: "Content bewerken en indienen ter review" },
  "content.review": { label: "Content reviewen", description: "Content beoordelen en wijzigingen vragen" },
  "content.approve": { label: "Content goedkeuren", description: "Definitief goedkeuren of afwijzen" },
  "content.publish": { label: "Content publiceren", description: "Goedgekeurde content inplannen en publiceren" },
  "agents.manage": { label: "Agents beheren", description: "AI-agents configureren, pauzeren en starten" },
  "integrations.manage": { label: "Integraties beheren", description: "Koppelingen instellen en verbinden" },
  "brand.manage": { label: "Merkrichtlijnen beheren", description: "Merkrichtlijnen en tone of voice bewerken" },
  "users.manage": { label: "Gebruikers beheren", description: "Gebruikers uitnodigen en rollen beheren" },
};

export const ROLE_LABELS: Record<string, { label: string; description: string }> = {
  administrator: { label: "Beheerder", description: "Volledige toegang tot alle instellingen en content" },
  chief_editor: { label: "Hoofdredacteur", description: "Leidt het redactieproces en geeft eindgoedkeuring" },
  editor: { label: "Redacteur", description: "Maakt en bewerkt content" },
  reviewer: { label: "Reviewer", description: "Beoordeelt content en vraagt wijzigingen" },
  marketing_manager: { label: "Marketingmanager", description: "Verantwoordelijk voor externe communicatie en publicatie" },
  employee: { label: "Medewerker", description: "Leest gepubliceerde content en levert informatie aan" },
};

export function roleLabel(key: string | null | undefined): string {
  if (!key) return "Onbekend";
  return ROLE_LABELS[key]?.label ?? key;
}
