/**
 * "Make order" on a chat: open the register for this customer.
 *
 * The sale is saved waiting and its summary goes to them in Messenger to
 * confirm (`pos-tender.tsx`). Two questions may come first, as alerts: a sale
 * already on the counter (replace it?), and, for a store-wide account at a
 * store with branches, which branch the order is for (the register would
 * refuse the first dish and leave them nowhere to go). The order then waits
 * on the register while they open the branch.
 *
 * Every side effect is handed in, so the flow is tested without a screen.
 */

export type ChatOrderDestination = "/(main)/pos" | "/(main)/portfolio";

export interface ChatOrderCustomer {
  sessionId: string;
  /** How the app names them ("Ana C."). */
  name: string;
  firstName: string | null;
  lastName: string | null;
}

/** The register slice "Make order" touches. */
export interface ChatOrderRegister {
  lines: readonly unknown[];
  editContext: unknown;
  reset: () => void;
  setChat: (chat: { sessionId: string; name: string }) => void;
  setCustomerName: (name: string) => void;
}

export interface AlertButton {
  text: string;
  style?: "cancel" | "destructive" | "default";
  onPress?: () => void;
}

export interface StartChatOrderDeps {
  register: () => ChatOrderRegister;
  needsBranch: () => boolean;
  alert: (title: string, message: string, buttons: AlertButton[]) => void;
  navigate: (href: ChatOrderDestination) => void;
}

export function startChatOrder(customer: ChatOrderCustomer, deps: StartChatOrderDeps): void {
  const { name } = customer;

  const begin = (href: ChatOrderDestination) => {
    const register = deps.register();
    register.reset();
    register.setChat({ sessionId: customer.sessionId, name });
    // The Facebook name is a start; the cashier can change it on the register.
    const facebookName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
    if (facebookName) register.setCustomerName(facebookName);
    deps.navigate(href);
  };

  const start = () => {
    if (deps.needsBranch()) {
      deps.alert("Which branch is this order for?", `Open the branch, then go to POS. ${name}'s order stays ready on the register.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Choose branch", onPress: () => begin("/(main)/portfolio") },
      ]);
      return;
    }
    begin("/(main)/pos");
  };

  const register = deps.register();
  if (register.lines.length > 0 || register.editContext) {
    deps.alert("Clear the register?", `A sale is already on the counter. Start ${name}'s order instead?`, [
      { text: "Keep the sale", style: "cancel" },
      { text: "Start this order", style: "destructive", onPress: start },
    ]);
    return;
  }
  start();
}
