import { customAlphabet, nanoid } from "nanoid";

/** Alfabet tanpa karakter mirip (0/O, 1/l/I). TSD §5. */
export const SESSION_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export const SESSION_ID_LENGTH = 10;
export const ACCESS_TOKEN_LENGTH = 32;

const sessionIdGen = customAlphabet(SESSION_ID_ALPHABET, SESSION_ID_LENGTH);

/** ID sesi, dibuat di booth. */
export const newSessionId = (): string => sessionIdGen();

/** Client token & live token (nanoid 32). */
export const newAccessToken = (): string => nanoid(ACCESS_TOKEN_LENGTH);

export const SESSION_ID_PATTERN = new RegExp(`^[${SESSION_ID_ALPHABET}]{${SESSION_ID_LENGTH}}$`);
