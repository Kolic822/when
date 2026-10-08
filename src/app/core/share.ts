/**
 * Hands a message to the phone's share sheet (WhatsApp, Messages, …); where there is
 * none, the message goes to the clipboard instead.
 */
export const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export async function shareOrCopy(data: {
  title: string;
  text: string;
  url: string;
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (canShare) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
      /* fall through to the clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(`${data.text} ${data.url}`.trim());
    return 'copied';
  } catch {
    return 'failed';
  }
}
