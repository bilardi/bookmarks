import type { PreSignUpTriggerEvent } from "aws-lambda";

import { isInvited } from "../repository/invites";

export const NOT_INVITED = "not-invited";

// Cognito calls this before creating a user, and with Google that is the first
// sign-in. Throwing is how a trigger refuses: the user is not created, and the
// browser goes back to the callback with the message in error_description.
export function makePreSignUp(curatorEmail: string) {
  return async function preSignUp(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
    const email = String(event.request.userAttributes.email ?? "").toLowerCase();
    const curator = curatorEmail !== "" && email === curatorEmail.toLowerCase();
    if (email === "" || !(curator || (await isInvited(email)))) throw new Error(NOT_INVITED);
    return event;
  };
}
