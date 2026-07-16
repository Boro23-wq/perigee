import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

async function request(path: string, options: RequestInit = {}) {
  const supabase = createClient();

  let session: { access_token: string } | null = null;
  try {
    const result = await supabase.auth.getSession();
    session = result.data.session;
  } catch (err) {
    throw new Error(
      `[${path} get-session] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let headers: Headers;
  try {
    headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch (err) {
    throw new Error(
      `[${path} build-headers tokenLen=${session?.access_token?.length ?? "null"}] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error(
      `[${path} fetch] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body: unknown) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body: unknown) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: (path: string, body: unknown) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string, body?: unknown) =>
    request(path, {
      method: "DELETE",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
};
