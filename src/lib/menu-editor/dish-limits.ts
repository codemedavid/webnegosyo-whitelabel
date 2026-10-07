/**
 * Dish field limits shared by the editor (client) and the server schema, so the
 * counter the owner sees and the rule the save enforces cannot drift apart.
 *
 * The description cap sits well above the longest description already stored
 * (1,616 characters) so no existing dish is refused on its next edit.
 */
export const DISH_NAME_MIN = 2
export const DISH_DESCRIPTION_MAX = 2000
/** Past this the storefront card truncates; the counter turns amber, nothing is refused. */
export const DISH_DESCRIPTION_CARD_LENGTH = 140
