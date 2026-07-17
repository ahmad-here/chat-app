/** Domain types, mirroring the data model in docs/requirements.md §4.
 *
 * These describe the shape the UI consumes. Persistence types (MongoDB
 * documents, ObjectId) are deliberately not modelled here — the UI should not
 * depend on the storage layer, and the ODM-vs-raw-driver question is still open
 * (docs/architecture.md §9). Ids are plain strings at this boundary. */

/** Who authored a message. `assistant` is the AI, not a user. */
export type MessageRole = "user" | "assistant";

export interface User {
  id: string;
  name: string;
  /** Optional per the data model; the UI falls back to initials. */
  image?: string;
}

export interface Conversation {
  id: string;
  title: string;
  participantIds: string[];
  /** ISO 8601. Drives conversation-list ordering. */
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  /** The authoring user's id. Absent when `role` is `assistant`. */
  authorId?: string;
  role: MessageRole;
  /** Markdown source. Must be sanitized before rendering — see
   *  docs/ui-guidelines.md §7. Currently rendered as plain text. */
  content: string;
  /** ISO 8601. Ordering key. */
  createdAt: string;
}
