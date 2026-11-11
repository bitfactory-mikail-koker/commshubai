/**
 * The message the bot posts when it starts following a channel and repeats
 * every so often. Composed from the same parts, in the same order, as
 * `channelExplanation` in src/lib/redactie/rhythms.ts, so the preview on this
 * screen reads exactly like the message itself.
 */
export type ExplanationRule = { emoji: string; goal: string; action: string; enabled: boolean };

export function explanationText(input: {
  botName: string;
  contactPerson: string;
  expectation: string;
  followMode: string;
  rules: ExplanationRule[];
}): string {
  const rules = input.rules.filter((rule) => rule.enabled);
  const pick = rules.filter((rule) => rule.action !== "exclude");
  const exclude = rules.find((rule) => rule.action === "exclude");
  const expectation = input.expectation.trim().replace(/\.$/, "");
  return [
    `Ik ben de ${input.botName}, de bot van de redactie.`,
    expectation ? `Ik volg dit kanaal om ${expectation.charAt(0).toLowerCase()}${expectation.slice(1)}.` : "Ik volg dit kanaal voor de redactie.",
    input.followMode === "emoji_only"
      ? "Ik lees hier niet mee: ik reageer alleen op een bericht waar iemand een emoji bij zet."
      : "Ik lees hier mee en leg wat nieuws lijkt voor aan de redactie.",
    pick.length
      ? `Zet ${pick.map((rule) => `${rule.emoji} (${rule.goal.toLowerCase()})`).join(", ")} bij een bericht dat ik moet oppakken${
          exclude ? ` en ${exclude.emoji} bij een bericht dat ik moet laten liggen` : ""
        }.`
      : "",
    "Ik publiceer niets zonder akkoord van de betrokkenen.",
    input.contactPerson ? `Vragen? ${input.contactPerson}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
