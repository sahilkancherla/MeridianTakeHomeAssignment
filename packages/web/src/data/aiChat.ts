/**
 * Typed client for the AI canvas-editing endpoint (whiteboard-spec §8.7).
 * In dev, same-origin `/api/chat` is proxied to the FastAPI server (services/api) by
 * Vite; in production it resolves against VITE_API_BASE_URL (see apiBase.ts). Either
 * way the browser never sees ANTHROPIC_API_KEY.
 */
import type { ChatRequest, ChatResponse } from '@meridian/spec';
import { apiUrl } from './apiBase';

export async function postChat(body: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Chat failed (${res.status})`);
  }
  return (await res.json()) as ChatResponse;
}
