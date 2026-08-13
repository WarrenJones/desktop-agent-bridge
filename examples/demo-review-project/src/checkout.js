export function checkoutTotal({ subtotal, membershipCredit, shipping }) {
  return Math.max(0, subtotal + shipping - membershipCredit);
}
