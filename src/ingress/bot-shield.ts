export interface BotShieldInput {
  revisedById?: string;
  historyComment?: string;
  botId: string;
}

export function isBotEcho(input: BotShieldInput): { isEcho: boolean; reason?: string } {
  if (input.revisedById && input.revisedById.toLowerCase() === input.botId.toLowerCase()) {
    return { isEcho: true, reason: 'Actor matches ADO_BOT_ID' };
  }

  if (input.historyComment && input.historyComment.includes('[automated-agent]')) {
    return { isEcho: true, reason: 'History comment contains [automated-agent] marker' };
  }

  return { isEcho: false };
}
