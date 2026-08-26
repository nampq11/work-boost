export function splitMessage(text: string, maxLength = 4096): string[] {
  if (!Number.isSafeInteger(maxLength) || maxLength <= 0) {
    throw new RangeError('maxLength must be a positive integer');
  }

  const messages: string[] = [];
  while (text.length > maxLength) {
    const splitAt = text.lastIndexOf('\n', maxLength);
    let cutAt = splitAt > 0 ? splitAt : maxLength;
    // Never split inside an HTML tag: back up to before the dangling '<'.
    // Fall back to a hard cut when the tag itself exceeds maxLength.
    const adjusted = avoidSplittingTag(text, cutAt);
    if (adjusted > 0) cutAt = adjusted;
    messages.push(text.slice(0, cutAt));
    text = text.slice(cutAt).trim();
  }
  if (text) messages.push(text);
  return messages;
}

function avoidSplittingTag(text: string, splitAt: number): number {
  const lastOpen = text.lastIndexOf('<', splitAt - 1);
  if (lastOpen === -1 || text.indexOf('>', lastOpen) < splitAt) return splitAt;
  return lastOpen;
}
