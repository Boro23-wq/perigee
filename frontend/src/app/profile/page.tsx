"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { Bell, Calendar, Camera } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/Skeleton";
import { Accordion } from "@/components/Accordion";
import {
  MacroTargetFields,
  type MacroTargetValues,
} from "@/components/MacroTargetFields";
import { api } from "@/lib/api";
import {
  getCurrentPushSubscription,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

type Profile = {
  display_name: string | null;
  daily_calorie_budget: number;
  weight_goal_lbs: number | null;
  goal_date: string | null;
  height_in: number | null;
  avatar_url: string | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  fiber_target_g: number | null;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [calorieBudget, setCalorieBudget] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [macros, setMacros] = useState<MacroTargetValues>({
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [notificationsOn, setNotificationsOn] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  useEffect(() => {
    if (!pushSupported()) return;
    getCurrentPushSubscription().then((sub) => setNotificationsOn(!!sub));
  }, []);

  async function handleToggleNotifications() {
    setNotificationsBusy(true);
    setNotificationsError("");
    try {
      if (notificationsOn) {
        await unsubscribeFromPush();
        setNotificationsOn(false);
      } else {
        await subscribeToPush();
        setNotificationsOn(true);
      }
    } catch (err) {
      setNotificationsError(
        err instanceof Error ? err.message : "Failed to update notifications",
      );
    } finally {
      setNotificationsBusy(false);
    }
  }

  useEffect(() => {
    api.get("/api/me").then((data: Profile) => {
      setProfile(data);
      setDisplayName(data.display_name ?? "");
      setFeet(data.height_in ? String(Math.floor(data.height_in / 12)) : "");
      setInches(data.height_in ? String(Math.round(data.height_in % 12)) : "");
      setCalorieBudget(String(data.daily_calorie_budget));
      setGoalWeight(
        data.weight_goal_lbs != null ? String(data.weight_goal_lbs) : "",
      );
      setGoalDate(data.goal_date ?? "");
      setMacros({
        protein:
          data.protein_target_g != null ? String(data.protein_target_g) : "",
        carbs: data.carbs_target_g != null ? String(data.carbs_target_g) : "",
        fat: data.fat_target_g != null ? String(data.fat_target_g) : "",
        fiber: data.fiber_target_g != null ? String(data.fiber_target_g) : "",
      });
    });
  }, []);

  async function handleAvatarSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarUploading(true);
    setAvatarError("");

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 512,
        useWebWorker: true,
      });
      const contentType = compressed.type || "image/jpeg";

      const { path, upload_url } = await api.post("/api/me/avatar/upload-url", {
        content_type: contentType,
      });

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: compressed,
      });
      if (!putRes.ok) throw new Error("Photo upload failed");

      const updated = await api.patch("/api/me", { avatar_path: path });
      setProfile(updated);
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "Failed to upload photo",
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const heightIn =
        feet || inches
          ? Number(feet || 0) * 12 + Number(inches || 0)
          : undefined;

      const updated = await api.patch("/api/me", {
        display_name: displayName || undefined,
        height_in: heightIn,
        daily_calorie_budget: calorieBudget ? Number(calorieBudget) : undefined,
        weight_goal_lbs: goalWeight ? Number(goalWeight) : undefined,
        goal_date: goalDate || undefined,
        protein_target_g: macros.protein ? Number(macros.protein) : undefined,
        carbs_target_g: macros.carbs ? Number(macros.carbs) : undefined,
        fat_target_g: macros.fat ? Number(macros.fat) : undefined,
        fiber_target_g: macros.fiber ? Number(macros.fiber) : undefined,
      });
      setProfile(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Update your measurements and goals.
        </p>

        {!profile ? (
          <div className="mt-7 flex flex-col gap-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
        ) : (
          <>
            <section className="mt-7">
              <h2 className="label-xs">Photo</h2>
              <div className="mt-3 flex items-center gap-4">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label="Upload profile photo"
                  className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2 disabled:opacity-60"
                >
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-medium text-muted">
                      {(displayName || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                    <Camera
                      size={18}
                      className="text-transparent transition-colors group-hover:text-white"
                    />
                  </div>
                </button>
                <div>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="text-[13px] font-medium text-accent hover:opacity-90 disabled:opacity-50"
                  >
                    {avatarUploading ? "Uploading…" : "Change photo"}
                  </button>
                  {avatarError && (
                    <p className="mt-1 text-[13px] text-danger">
                      {avatarError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {pushSupported() && (
              <section className="mt-7">
                <h2 className="label-xs">Notifications</h2>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface p-4 shadow-soft">
                  <div className="flex items-center gap-3">
                    <Bell size={16} className="text-muted" />
                    <div>
                      <p className="text-[13px] font-medium">
                        Reminders &amp; partner pokes
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Morning weigh-in and evening logging nudges.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleNotifications}
                    disabled={notificationsBusy}
                    role="switch"
                    aria-checked={notificationsOn}
                    style={{ width: "44px", height: "24px" }}
                    className={`relative shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                      notificationsOn ? "bg-accent" : "bg-surface-2"
                    }`}
                  >
                    <span
                      style={{
                        width: "20px",
                        height: "20px",
                        top: "2px",
                        left: "2px",
                      }}
                      className={`absolute rounded-full bg-white shadow transition-transform ${
                        notificationsOn ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                {notificationsError && (
                  <p className="mt-2 text-[13px] text-danger">
                    {notificationsError}
                  </p>
                )}
              </section>
            )}

            <section className="mt-7">
              <h2 className="label-xs">Details</h2>
              <form
                onSubmit={handleSubmit}
                className="mt-3 flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label
                      htmlFor="displayName"
                      className="text-[11px] font-medium uppercase tracking-wide text-muted"
                    >
                      Name
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-muted">
                      Height
                    </label>
                    <div className="flex gap-2">
                      <div className="flex flex-1 items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={8}
                          value={feet}
                          onChange={(e) => setFeet(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                        />
                        <span className="text-[13px] text-muted">ft</span>
                      </div>
                      <div className="flex flex-1 items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={11}
                          value={inches}
                          onChange={(e) => setInches(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                        />
                        <span className="text-[13px] text-muted">in</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="calorieBudget"
                      className="text-[11px] font-medium uppercase tracking-wide text-muted"
                    >
                      Daily calorie budget
                    </label>
                    <input
                      id="calorieBudget"
                      type="number"
                      min={800}
                      max={10000}
                      value={calorieBudget}
                      onChange={(e) => setCalorieBudget(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="goalWeight"
                      className="text-[11px] font-medium uppercase tracking-wide text-muted"
                    >
                      Goal weight (lbs)
                    </label>
                    <input
                      id="goalWeight"
                      type="number"
                      min={0}
                      step="0.1"
                      value={goalWeight}
                      onChange={(e) => setGoalWeight(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="goalDate"
                      className="text-[11px] font-medium uppercase tracking-wide text-muted"
                    >
                      Goal date
                    </label>
                    <div className="relative">
                      <input
                        id="goalDate"
                        type="date"
                        value={goalDate}
                        onChange={(e) => setGoalDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 pr-9 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
                      />
                      <Calendar
                        size={13}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                      />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-2">
                  To log a new weigh-in, use the{" "}
                  <Link href="/weight" className="text-accent hover:opacity-90">
                    weight page
                  </Link>
                  .
                </p>

                <Accordion
                  title="Advanced: macro targets"
                  subtitle="Protein, carbs, fat, fiber (optional)"
                >
                  <MacroTargetFields
                    values={macros}
                    onChange={(key, value) =>
                      setMacros((m) => ({ ...m, [key]: value }))
                    }
                  />
                </Accordion>

                {error && <p className="text-[13px] text-danger">{error}</p>}
                {saved && !error && (
                  <p className="text-[13px] text-accent">Saved.</p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-1 self-start rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
