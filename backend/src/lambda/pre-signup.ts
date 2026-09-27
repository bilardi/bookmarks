import { makePreSignUp } from "../handlers/preSignUp";

export const handler = makePreSignUp(process.env.CURATOR_EMAIL ?? "");
