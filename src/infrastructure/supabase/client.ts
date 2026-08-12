import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env";

export const supabase = createClient(
  clientEnv.supabaseUrl,
  clientEnv.supabasePublishableKey,
);
