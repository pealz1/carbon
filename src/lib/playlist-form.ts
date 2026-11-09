// Create/edit playlist form rules. Spotify's own apps cap names at 100 and descriptions at 300.
import type { PlaylistFields } from "$lib/spotify/endpoints";

export const PLAYLIST_LIMITS = { name: 100, description: 300 } as const;

export type PlaylistDraft = PlaylistFields;

export interface PlaylistProblems {
  name?: string;
  description?: string;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

export function playlistProblems(draft: PlaylistDraft): PlaylistProblems {
  const problems: PlaylistProblems = {};
  const name = draft.name.trim();
  if (!name) problems.name = "Give your playlist a name.";
  else if ([...name].length > PLAYLIST_LIMITS.name) problems.name = `Names can be up to ${PLAYLIST_LIMITS.name} characters.`;
  else if (CONTROL.test(name)) problems.name = "That name has characters Spotify won't accept.";
  const description = draft.description.trim();
  if ([...description].length > PLAYLIST_LIMITS.description) {
    problems.description = `Descriptions can be up to ${PLAYLIST_LIMITS.description} characters.`;
  } else if (/[\r\n]/.test(description) || CONTROL.test(description)) {
    problems.description = "Descriptions have to fit on one line.";
  }
  return problems;
}

export const isValid = (draft: PlaylistDraft): boolean => Object.keys(playlistProblems(draft)).length === 0;

/** What Spotify receives: trimmed text, and collaborative playlists are always private. */
export function toFields(draft: PlaylistDraft): PlaylistFields {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    public: draft.collaborative ? false : draft.public,
    collaborative: draft.collaborative,
  };
}
