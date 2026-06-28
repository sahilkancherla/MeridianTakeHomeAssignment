/**
 * Per-user app settings (review defaults), stored in the app_settings table and
 * scoped to the owner by RLS. Appearance/theme lives in localStorage (see theme.ts),
 * since it's a device preference, not shared state.
 */
import { supabase } from './supabase';

export type AppSettings = {
  reviewModel: string;
  autoEscalate: boolean;
  blockSubmitWithOpenComments: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  reviewModel: 'claude-sonnet-4-5',
  autoEscalate: true,
  blockSubmitWithOpenComments: true,
};

type Row = {
  review_model: string;
  auto_escalate: boolean;
  block_submit_with_open_comments: boolean;
};

const fromRow = (r: Row): AppSettings => ({
  reviewModel: r.review_model,
  autoEscalate: r.auto_escalate,
  blockSubmitWithOpenComments: r.block_submit_with_open_comments,
});

export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('review_model, auto_escalate, block_submit_with_open_comments')
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : DEFAULT_SETTINGS;
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not authenticated');

  const current = await getAppSettings();
  const next = { ...current, ...patch };
  const { data, error } = await supabase
    .from('app_settings')
    .upsert(
      {
        user_id: auth.user.id,
        review_model: next.reviewModel,
        auto_escalate: next.autoEscalate,
        block_submit_with_open_comments: next.blockSubmitWithOpenComments,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('review_model, auto_escalate, block_submit_with_open_comments')
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}
