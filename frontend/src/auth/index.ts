// One interface, two implementations: the build says which environment it is for,
// and nothing else in the application knows about the difference.
import * as cognito from "./cognito";
import * as dev from "./dev";

export const isCognito = import.meta.env.VITE_AUTH === "cognito";

const impl = isCognito ? cognito : dev;

export const currentUser = impl.currentUser;
export const authHeaders = impl.authHeaders;
export const startSession = impl.startSession;
export const hasSession = impl.hasSession;
export const refusal = impl.refusal;
export const login = impl.login;
export const logout = impl.logout;
export type { CurrentUser } from "./dev";
