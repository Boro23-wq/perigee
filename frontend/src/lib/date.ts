// The client sends the local date explicitly. The phone knows what day it
// is for the user, the server doesn't guess.
export function localDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date());
}
